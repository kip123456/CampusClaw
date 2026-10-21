## Context

backend/ 使用 Express 4 + TypeScript（`"type": "commonjs"`），Dockerfile 为 node:20-alpine 多阶段（builder 执行 `tsc` → runtime 拷贝 `dist/` + 生产依赖）。docker-compose.yml 目前有 `chromadb`、`backend`、`frontend` 三个 service，互相通过内部 compose 网络按 service 名解析。

本 change 与 backend、frontend 平级新增 `mcp-server/` 目录，独立构建、独立运行，共享仓库和 compose 编排。backend 对 mcp-server 的客户端集成不在本次范围内。

## Goals / Non-Goals

**Goals:**
- mcp-server 独立可构建（npm run build + node dist）
- 与 backend 风格一致的工程结构（Express + TS + commonjs）
- 生产可用的 Dockerfile + compose 注册
- 严格遵守 MCP 协议的 HTTP 上 JSON-RPC 2.0 表现
- Bearer token 认证：令牌不进 Git、不进镜像层、不进前端
- 启动时 fail-fast：`MCP_AUTH_TOKEN` 缺失直接退出

**Non-Goals:**
- backend 集成（下一轮 change）
- mcp 客户端（下一轮 change）
- 工具定义持久化（当前硬编码在 `src/tools/` 下）
- SSE / streamable HTTP server push（本轮只需 HTTP POST 同步响应，SDK 的 streamable-http transport 内部实现即可）
- 工具目录热加载 / 远程动态注册

## Decisions

### D1: 使用官方 `@modelcontextprotocol/sdk`

**选择**：`@modelcontextprotocol/sdk`（npm 包，提供 `Server`、`StdioServerTransport`、`StreamableHTTPServerTransport` 等）。

**替代方案**：手写 JSON-RPC 2.0（约 150-200 行）。

**理由**：
- MCP 协议虽短但有大量边角（`initialize` 必须返回 `protocolVersion`，`tools/list` 支持 `cursor` 分页，`tools/call` 的 `content` 数组支持 `text/image/embeddedResource` 三种元素类型）
- SDK 提供 TS 类型、协议版本协商、错误码构造，减少遗漏协议细节的风险
- 40k+ 周下载，活跃维护
- mcp-server 是独立镜像，多一个依赖不影响 backend/frontend 大小

### D2: Express 4 作为 HTTP 框架

**选择**：与 backend 保持一致，Express 4 + `express.json()` body parser。

**替代方案**：原生 Node `http` 模块、fastify。

**理由**：工程风格统一，无认知切换成本。原生 http 需要自己写 body 解析，fastify 引入新依赖。

### D3: 工具注册集中在 `src/tools/index.ts`

**选择**：每个工具独立文件（`calculate.ts`、`convertUnit.ts`），`index.ts` 统一 `export const tools = [...]` 数组；`server.ts` 在启动时 `for (const t of tools) { server.tool(t.name, t.description, t.inputSchema, t.handler); }` 注册。

**理由**：新增工具只需加一个文件 + 在 `index.ts` 数组里加一项；不引入 loader 模式。

### D4: convertUnit 用硬编码转换系数

**选择**：手写 `toBase` / `fromBase` 函数，以 SI 基本单位为中间（长度 → m、重量 → kg、温度 → celsius、面积 → m²）。

**替代方案**：`convert-units` npm 包。

**理由**：示范工具只有几十个单位，手写约 60 行，比引入一个 1MB+ 的依赖更合适。温度转换不能简单用系数乘除，需要单独逻辑。

### D5: 认证中间件位置在 Express 层，不在 SDK transport 层

**选择**：`server.ts` 里 Express app 在 `/mcp` 路由前挂载 `authMiddleware`；通过后再交给 SDK 的 `StreamableHTTPServerTransport`。

**理由**：SDK 的 transport 只负责 JSON-RPC 协议解析，不关心 HTTP 安全层；Express 中间件是标准位置。

### D6: docker-compose 中 `MCP_AUTH_TOKEN` 必须用户显式提供，无默认

**选择**：`MCP_AUTH_TOKEN: ${MCP_AUTH_TOKEN}`，不在 env 变量里写 fallback（如 `:-dev-secret`）。

**理由**：与 proposal 中"不进 Git、不进镜像层、不进前端"的承诺一致。backend 的 `JWT_SECRET` 有 fallback 是因为 backend 本身是开发态就需要启动；MCP 认证不应有开发期绕过。

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| `@modelcontextprotocol/sdk` 未来版本可能有 breaking change | package.json 中锁定具体版本（用 `^` 但在 lockfile 固定），引入时做一次版本核对 |
| 温度转换边界值（绝对零度以下、NaN） | 工具 handler 里显式校验，返回 `isError: true` 和友好文本，不抛异常 |
| `MCP_AUTH_TOKEN` 在 `docker compose up` 时被忽略（用户忘记 export） | mcp-server 进程启动时 fail-fast + 打印明确日志；同时 compose 会显示 container exited |
| SDK 的 `StreamableHTTPServerTransport` 在某些旧 Node 版本行为不同 | Dockerfile 固定 `node:20-alpine`，与 backend 相同 |
| 示范工具过于简单，后续扩展需要重构 | 工具注册机制（D3）已考虑新增工具的路径，重构成本低 |