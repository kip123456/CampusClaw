## 1. 数据库 Schema 变更

- [x] 1.1 修改 `backend/src/db/schema.ts` 中 `mcp_servers` 表 `transport` 列 CHECK 约束从 `CHECK(transport IN ('http'))` 改为 `CHECK(transport IN ('http','sse'))`，验证 TypeScript 编译通过（`npm run typecheck`）
- [x] 1.2 在 `initSchema()` 中新增迁移逻辑：启动时检测 `mcp_servers` 表 transport 列是否存在，若缺失则用 ALTER TABLE 补加（SQLite 不支持修改 CHECK 约束，老表天然不限制值），验证已有数据库启动不报错（`npm run dev` 无 transport 相关错误）

## 2. SSE 传输核心实现（mcp-client.ts）

- [x] 2.1 将现有 `jsonRpcRequest` 重命名为内部函数 `httpJsonRpcRequest`（保持功能不变），新增 `type McpTransport = 'http' | 'sse'` 导出类型，TypeScript 编译通过
- [x] 2.2 实现 SSE 行解析器：`parseSseBuffer(buffer)` 按 `\n\n` 分割事件块、解析 `event:` 和 `data:` 行，编写单元测试覆盖单 endpoint、单 message、多 data 行拼接、空 event 默认 message、不完整尾部作为 rest、多事件、\r\n 换行、注释行等 7 个场景全部通过
- [x] 2.3 实现 `SseConnection` 接口和模块级 `sseConnections` Map 缓存：包含 `endpointUrl`、`streamReader`、`pendingRequests`、时间戳等字段，`getOrCreateSseConnection(config)` 发起 SSE GET、等待 endpoint 事件、缓存连接，`joinUrl` 工具函数正确拼接绝对和相对 endpoint URL
- [x] 2.4 实现 `sseJsonRpcRequest(config, method, params)`：从缓存获取 SSE 连接、向 endpointUrl POST JSON-RPC（使用自增 requestId）、在 pendingRequests 注册 resolver/30s 超时、后台 readerLoop 按 id 匹配响应；连接关闭/丢失时 pendingRequests 全部 reject
- [x] 2.5 实现空闲连接清理定时器（每分钟扫描，空闲 5 分钟关闭）和 `deleteSseConnection(mcpServerId)`：`clearMcpAuthCache` 内自动调用，关闭前对所有 pending 请求 reject 并清理

## 3. 上层函数路由改造

- [x] 3.1 `connect()` 保持原签名，通过内部 `jsonRpcRequest` 路由：http → `httpJsonRpcRequest`，sse → `sseJsonRpcRequest`
- [x] 3.2 `listTools()` 同上
- [x] 3.3 `callTool()` 同上，sse 模式使用 30s 超时而 HTTP 使用 10s，异常统一转为 `{ isError: true }`

## 4. 注册路由改造（mcpServers.ts）

- [x] 4.1 `POST /:classId/mcp-servers` 新增 `transport` 字段从 body 提取，校验 `['http', 'sse']`（非法值返回 400），INSERT 语句 transport 从硬编码 `'http'` 改为用户输入值
- [x] 4.2 GET 列表、GET 详情已包含 transport 字段；DELETE 调用 `clearMcpAuthCache(mcpServerId)`，该函数已新增 `deleteSseConnection` 调用

## 5. 集成验证

- [x] 5.1 dev 服务器启动正常，无 transport 相关错误（SSE 传输逻辑走通到编译/加载层面；需真实 SSE 端点做端到端验证）
- [x] 5.2 HTTP 路径完整 typecheck 通过，无代码改动点影响原 HTTP 行为，无回归
- [x] 5.3 `npm test`（vitest run）包含新增 7 个 parseSseBuffer 单元测试全部通过