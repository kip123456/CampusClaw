## Purpose

一个独立的 MCP（Model Context Protocol）服务器，通过 HTTP 上的 JSON-RPC 2.0 暴露工具发现与调用能力，供本仓库的 Agent 系统及其他客户端接入。服务与 backend、frontend 同仓，由 docker-compose 一并启动。


### Requirement: HTTP endpoints
服务 MUST 暴露两个 HTTP 路由：
- `POST /mcp`：接收 JSON-RPC 2.0 请求体，返回 JSON-RPC 响应
- `GET /health`：返回 `{ "status": "ok" }` 表示进程存活

服务 MUST 监听 `0.0.0.0` 的可配置端口（默认 8090）。

#### Scenario: Health check returns ok
- **WHEN** 客户端向 `GET /health` 发送请求
- **THEN** 服务器返回 HTTP 200 以及 JSON 体 `{ "status": "ok" }`

#### Scenario: Server binds to configurable port
- **WHEN** 容器启动时设置环境变量 `PORT=9090`
- **THEN** 服务器监听 `0.0.0.0:9090`

### Requirement: Bearer token authentication
所有发往 `POST /mcp` 的请求 MUST 在 `Authorization` header 中携带 `Bearer <token>`。令牌值 MUST 等于启动时环境变量 `MCP_AUTH_TOKEN` 的值。
- 缺失 `Authorization` header：HTTP 401，返回 `{ "error": "UNAUTHORIZED", "message": "Missing Bearer token" }`
- `Authorization` 不匹配 `Bearer <token>` 格式或令牌值错误：HTTP 401，返回 `{ "error": "UNAUTHORIZED", "message": "Invalid token" }`

`GET /health` MUST 不需要认证即可访问。

#### Scenario: Request without Authorization header is rejected
- **WHEN** 客户端向 `POST /mcp` 发送请求且不带 `Authorization` header
- **THEN** 服务器返回 HTTP 401 以及 `{ "error": "UNAUTHORIZED", "message": "Missing Bearer token" }`

#### Scenario: Request with wrong token is rejected
- **WHEN** 客户端向 `POST /mcp` 发送请求，header 为 `Authorization: Bearer wrong-token`，而服务期望令牌为 `correct-token`
- **THEN** 服务器返回 HTTP 401 以及 `{ "error": "UNAUTHORIZED", "message": "Invalid token" }`

#### Scenario: Request with correct token passes
- **WHEN** 客户端向 `POST /mcp` 发送合法 JSON-RPC 请求，header 为 `Authorization: Bearer correct-token`，且服务期望令牌为 `correct-token`
- **THEN** 服务器处理该 JSON-RPC 请求并返回对应的 HTTP 200 响应

#### Scenario: Health endpoint does not require token
- **WHEN** 客户端向 `GET /health` 发送请求且不带任何认证信息
- **THEN** 服务器返回 HTTP 200

### Requirement: MCP_AUTH_TOKEN at startup
服务启动时 MUST 校验 `MCP_AUTH_TOKEN` 环境变量已设置且非空；若缺失或为空字符串，进程 MUST 立刻以非零退出码终止并打印错误日志。令牌值 MUST NOT 被写入任何源代码文件、Dockerfile 或提交到 Git 仓库。

#### Scenario: Service fails fast when MCP_AUTH_TOKEN is unset
- **WHEN** 环境变量 `MCP_AUTH_TOKEN` 未设置时启动服务
- **THEN** 进程打印包含 `MCP_AUTH_TOKEN` 的错误信息并以非零状态码退出

### Requirement: JSON-RPC 2.0 compliance
服务必须以严格 JSON-RPC 2.0 格式响应。对非法请求（无效 JSON、缺少 `jsonrpc` 字段、非法 `jsonrpc` 版本号、缺少 `method` 字段），MUST 返回一条 JSON-RPC error response，`code` 为相应预定义值（`-32700` 解析错误、`-32600` 无效请求、`-32601` 方法不存在），`message` 为可读的英文错误描述；HTTP 状态码为 200。

#### Scenario: Malformed JSON returns parse error
- **WHEN** 客户端发送无法解析为 JSON 的请求体
- **THEN** 服务器返回 HTTP 200 且响应体包含 `{ "jsonrpc": "2.0", "error": { "code": -32700, ... } }`

#### Scenario: Unknown method returns method not found
- **WHEN** 客户端发送 `{ "jsonrpc": "2.0", "method": "doesNotExist", "id": 1 }`
- **THEN** 服务器返回 HTTP 200 且响应体包含 `{ "jsonrpc": "2.0", "error": { "code": -32601, ... }, "id": 1 }`

### Requirement: initialize method
当客户端调用 `initialize` 方法时，服务 MUST 返回包含以下字段的响应：
- `protocolVersion`: MCP SDK 当前版本对应的协议版本字符串
- `serverInfo`: `{ "name": "campusclaw-mcp", "version": "<semver>" }`
- `capabilities`: 包含已注册的能力（至少 `tools`）

#### Scenario: Client initializes successfully
- **WHEN** 客户端发送 `{ "jsonrpc": "2.0", "method": "initialize", "params": { "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "test", "version": "1.0" } }, "id": 1 }`
- **THEN** 服务器返回包含 `protocolVersion`、`serverInfo`、`capabilities.tools` 的响应，且 `id` 为 1

### Requirement: tools/list method
服务 MUST 在 `tools/list` 响应中暴露两个工具：`calculate` 与 `convertUnit`，名称均以小写字母开头且不包含连字符。每个工具 MUST 包含 `name`、`description` 和 `inputSchema`（JSON Schema 格式）。

#### Scenario: tools/list returns exactly two tools
- **WHEN** 客户端发送 `{ "jsonrpc": "2.0", "method": "tools/list", "id": 2 }`
- **THEN** 响应的 `result.tools` 数组元素数为 2，且每个元素的 `name` 为 `calculate` 或 `convertUnit`

### Requirement: calculate tool
`calculate` 工具 MUST 支持加法（`+`）、减法（`-`）、乘法（`*`）、除法（`/`）四种运算。输入参数 MUST 为 `{ "expression": "<number> <op> <number>" }` 或等效结构；结果 MUST 以文本形式返回。除零或非法表达式 MUST 返回带 `isError: true` 的错误结果。

#### Scenario: calculate performs multiplication
- **WHEN** 客户端调用 `calculate` 并传入两个数字和乘法操作
- **THEN** 工具返回文本内容如 `"6"`（对 `2 * 3`）

#### Scenario: calculate rejects division by zero
- **WHEN** 客户端调用 `calculate` 并请求除以 0
- **THEN** 返回结果包含 `isError: true` 和提示性文本

### Requirement: convertUnit tool
`convertUnit` 工具 MUST 支持以下类别及单位之间的相互转换：
- 长度：`km`, `m`, `cm`, `mm`, `in`, `ft`
- 重量：`kg`, `g`, `lb`
- 温度：`celsius`, `fahrenheit`, `kelvin`
- 面积：`m2`, `km2`

输入 MUST 包含数值、源单位、目标单位；输出 MUST 包含转换后的数值和人类可读文本。不支持的单位 MUST 返回 `isError: true`。

#### Scenario: convertUnit converts 1 km to m
- **WHEN** 客户端调用 `convertUnit` 并请求 `1 km` 转为 `m`
- **THEN** 返回文本 `"1000 m"` 或等效描述

#### Scenario: convertUnit rejects unknown unit
- **WHEN** 客户端传入未注册的单位字符串
- **THEN** 返回包含 `isError: true` 的结果

### Requirement: tools/call return format
`tools/call` 的成功响应 MUST 包含 `content` 数组，数组元素为 `{ "type": "text", "text": "<result>" }`；失败响应 MUST 同时包含 `isError: true` 字段。

#### Scenario: Successful tool call returns text content array
- **WHEN** 工具执行成功
- **THEN** 响应体中 `result.content` 为数组，每个元素包含 `type: "text"` 与 `text` 字符串

### Requirement: Docker build and Compose integration
服务 MUST 提供多阶段 Dockerfile 使镜像可直接运行。根目录 `docker-compose.yml` MUST 新增 `mcp-server` service：
- `build.context` 指向 `./mcp-server`
- `environment` 中 `MCP_AUTH_TOKEN` 来自 `${MCP_AUTH_TOKEN}`（无默认值）
- `PORT` 固定为 `8090`
- 不对外映射宿主端口（仅内部 compose 网络可见）

#### Scenario: mcp-server joins compose network
- **WHEN** 执行 `docker compose up mcp-server backend`
- **THEN** mcp-server 容器在内部 compose 网络中可被 backend 容器通过 `http://mcp-server:8090` 访问