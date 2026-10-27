## Context

当前后端 MCP 客户端（`backend/src/lib/mcp-client.ts`）只实现了 HTTP Streamable Transport：`jsonRpcRequest()` 函数统一向 `config.url + '/mcp'` 发送 POST 请求并同步等待 JSON 响应。数据库 `mcp_servers.transport` 列有 CHECK 约束限定为 `'http'`，注册路由硬编码 `'http'`。`McpServerConfig` 接口已预留 `transport: string` 字段但未用于分支。

需要在不破坏现有 HTTP 传输路径的前提下，增加 SSE 传输能力。

## Goals / Non-Goals

**Goals:**
- 为 MCP 客户端增加 SSE 传输实现（连接建立、endpoint 协商、请求/响应、连接管理）
- 注册接口接受 `transport` 字段（`'http'` | `'sse'`），数据库 schema 扩展
- `connect()`、`listTools()`、`callTool()` 三个公共函数根据 transport 字段透明路由
- Agent Loop 无需感知底层传输差异

**Non-Goals:**
- 不支持 stdio 传输
- 不实现 SSE 事件推送的高级处理（如 notifications 缓冲），当前只匹配请求 id 的响应
- 不做多端点负载均衡或连接池（单 mcpServerId 单连接）
- 不修改 frontend（spec 层）

## Decisions

### 决策 1：在 `mcp-client.ts` 内部按 transport 分支实现

**选择**：将现有 `jsonRpcRequest` 重命名为 `httpJsonRpcRequest`，新增 `sseJsonRpcRequest`，上层公共函数通过 `switch (config.transport)` 路由。

**替代方案**：引入 @modelcontextprotocol/sdk 作为完整 MCP 客户端实现。

**理由**：当前代码量小（mcp-client.ts 约 180 行），HTTP 路径简单可靠。引入 SDK 会增加外部依赖和 bundle 体积，且 SDK 的 API 抽象可能不贴合当前代码风格。自实现 SSE 只需处理两个场景（endpoint 事件 + message 事件），复杂度可控。

### 决策 2：使用 Node.js 原生 fetch + ReadableStream 解析 SSE

**选择**：用 Node.js 18+ 内置 `fetch()` 发起 SSE GET，读取 `res.body`（ReadableStream），用一个轻量 SSE 行解析器（按 `\n` 分割累积 buffer，解析 `event:` 和 `data:` 行）。

**替代方案**：引入 `eventsource` 或 `@microsoft/fetch-event-source` 等 npm 包。

**理由**：项目当前无 SSE 相关依赖，SSE 协议解析逻辑约 50 行，可写为内部工具函数 `parseSseEvents(stream, onEvent)`。避免新增依赖。

### 决策 3：SSE 连接缓存使用模块级 Map

**选择**：在 `mcp-client.ts` 内维护 `const sseConnections = new Map<string, SseConnection>()`，key 为 mcpServerId。

```typescript
interface SseConnection {
  endpointUrl: string;        // 协商得到的 POST endpoint
  responseStream: ReadableStream;  // SSE 响应体
  reader: ReadableStreamDefaultReader;
  pendingRequests: Map<number, { resolve, reject }>;  // 按请求 id 匹配
  createdAt: number;
  lastUsedAt: number;
}
```

后台定时器每分钟扫描空闲连接（`Date.now() - lastUsedAt > 5min`）关闭并清理。

**替代方案**：用 Redis 或外部存储（过度设计）；每次请求都新建 SSE 连接（性能差，协商开销大）。

### 决策 4：`connect()` 对 SSE 模式的处理

**选择**：`connect()` 用于连通性测试时，对 SSE 类型建立连接、发送 initialize、收到响应后，将连接留在缓存中（不要立刻关闭），因为后续 `listTools()` 很可能紧接着调用。

**理由**：测试连接后立即调用 listTools 是典型流程（import 场景），复用连接可避免两次 SSE 协商。

### 决策 5：数据库 schema 变更方式

**选择**：修改 `schema.ts` 中 `CREATE TABLE mcp_servers` 的 `transport` 列 CHECK 约束从 `CHECK(transport IN ('http'))` 改为 `CHECK(transport IN ('http','sse'))`。

由于 SQLite 不支持 ALTER TABLE 修改 CHECK 约束，已有数据库需要在应用启动时执行迁移：创建新表 → 数据迁移 → 旧表重命名 → 新表重命名。或用 `DROP TABLE` + `CREATE TABLE`（但会丢失数据）。

更安全的方案：在 `initSchema()` 中检测列的 CHECK 约束，若只允许 'http'，则执行数据迁移脚本。

## Risks / Trade-offs

- **[SSE 连接内存泄漏]** → 通过空闲超时自动关闭 + 定期清理定时器缓解；同时 `deleteSseConnection(mcpServerId)` 会在 MCP Server 被删除时显式清理
- **[SSE 流背压]** → Node.js ReadableStream 默认有缓冲，暂停/恢复由 reader 控制；若 MCP Server 快速推送大量事件，当前实现只关心匹配 id 的 message 事件，其他事件（如 notifications）被忽略
- **[并发请求顺序]** → SSE 连接上多个并发请求按请求 id 匹配各自的响应，pendingRequests Map 保证正确性；不需要请求队列，因为 HTTP POST 本身是独立的
- **[迁移脚本复杂度]** → SQLite ALTER TABLE 限制可能导致线上数据迁移需要停机维护窗口；可在首次部署新版本时手动执行迁移 SQL