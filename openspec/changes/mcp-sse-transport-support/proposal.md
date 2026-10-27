## Why

当前后端 MCP 客户端仅支持 HTTP Streamable Transport（直接 POST JSON-RPC 到 `/mcp` 端点），无法接入大量采用 SSE（Server-Sent Events）传输协议的外部 MCP Server（如某些主流第三方 MCP 服务）。SSE 传输是 MCP 规范认可的传输方式之一，支持服务端主动推送通知，覆盖面更广。

## What Changes

- MCP Server 注册接口允许用户选择 `transport` 字段（`'http'` 或 `'sse'`），不再强制默认为 `'http'`
- 数据库 `mcp_servers.transport` 字段 CHECK 约束扩展为支持 `'sse'`
- `mcp-client.ts` 新增 SSE 传输分支实现：建立 SSE 连接、解析 endpoint 事件、通过 endpoint URL 发送 JSON-RPC、从 SSE 流读取响应
- `connect()`、`listTools()`、`callTool()` 根据 `transport` 字段路由到不同的传输实现
- Agent Loop 调用 SSE 类型 MCP 工具时自动使用 SSE 传输

## Capabilities

### New Capabilities

<!-- 无新 capability，行为扩展已存在于 mcp-client -->

### Modified Capabilities

- `infrastructure/mcp-client`: 扩展 transport 支持范围从仅 `'http'` 到 `'http'` 和 `'sse'`，增加 SSE 传输协议完整实现（连接建立、endpoint 协商、请求/响应通道）

## Impact

- **数据库 schema**: `mcp_servers.transport` CHECK 约束需扩展
- **`backend/src/lib/mcp-client.ts`**: 主要改动，需新增 SSE 连接管理和事件流解析逻辑
- **`backend/src/routes/mcpServers.ts`**: 注册接口需接受并校验 `transport` 字段
- **`backend/src/db/schema.ts`**: transport CHECK 约束变更
- **依赖**: Node.js 内置 `fetch` 的 SSE 支持（ReadableStream + `text/event-stream` 解析），或引入轻量 SSE 客户端