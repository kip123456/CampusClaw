## MODIFIED Requirements

### Requirement: MCP Server 注册

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/mcp-servers` 注册外部 MCP Server。请求 body MUST 包含以下字段：

- `name`（必填，班级内唯一的显示名）
- `url`（必填，MCP endpoint 完整 URL，如 `https://mcp.notion.com/mcp`）
- `transport`（可选，值为 `'http'` 或 `'sse'`，默认为 `'http'`）
- `authType`（必填，值为 `'none'`、`'bearer'`、`'api_key'` 或 `'basic'`）
- `authConfig`（可选，JSON 对象，存放认证凭据）

authType 为不同值时 authConfig 的期望格式：
- `'none'`：authConfig MUST 为空或不存在
- `'bearer'`：authConfig MUST 包含 `{ token: string }`
- `'api_key'`：authConfig MUST 包含 `{ headerName: string, value: string }`
- `'basic'`：authConfig MUST 包含 `{ username: string, password: string }`

transport 字段指定与 MCP Server 通信的传输协议：
- `'http'`：HTTP Streamable Transport，直接向 url POST JSON-RPC 请求
- `'sse'`：SSE（Server-Sent Events）传输，先建立 SSE 连接协商 endpoint，再通过 endpoint 发送 JSON-RPC

注册成功后系统 MUST 向数据库 `mcp_servers` 表写入记录，authConfig MUST 加密存储。

#### Scenario: 教师成功注册 HTTP 类型 MCP Server
- **WHEN** 班级教师提供有效的 url、auth 配置，且 transport 未指定或为 'http'
- **THEN** 系统加密存储认证信息，transport 字段存为 'http'，返回 HTTP 201 包含 mcpServerId、name、url、transport、authType（authConfig 不回显或只回显脱敏版本）

#### Scenario: 教师成功注册 SSE 类型 MCP Server
- **WHEN** 班级教师提供有效的 url、auth 配置，且 transport 指定为 'sse'
- **THEN** 系统加密存储认证信息，transport 字段存为 'sse'，返回 HTTP 201 包含 mcpServerId、name、url、transport、authType

#### Scenario: url 格式无效
- **WHEN** url 不是合法的 HTTP/HTTPS URL
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: transport 值非法
- **WHEN** transport 字段值不是 'http' 或 'sse'
- **THEN** 系统返回 HTTP 400 Bad Request，说明 "transport must be 'http' or 'sse'"

#### Scenario: 认证配置缺失必要字段
- **WHEN** authType='bearer' 但 authConfig 中没有 token 字段
- **THEN** 系统返回 HTTP 400 Bad Request，说明 "Missing required authConfig field: token"

#### Scenario: name 在班级内重复
- **WHEN** name 与该班级已有 mcp_servers 重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: 学生尝试注册
- **WHEN** 学生用户访问注册接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 传输协议支持范围

后端对外部 MCP Server 的接入 MUST 支持两种传输协议：`'http'`（HTTP Streamable Transport）和 `'sse'`（Server-Sent Events Transport）。所有 mcp_servers 记录的 transport 列 MUST 接受 `'http'` 或 `'sse'` 值。其他传输类型（如 `'stdio'`）不在本次变更范围内。

#### Scenario: 数据库接受 sse 作为合法 transport
- **WHEN** 注册 SSE 类型 MCP Server
- **THEN** mcp_servers 表 transport 列值为 'sse'，不触发 CHECK 约束错误

#### Scenario: Agent Loop 拒绝未知传输类型
- **WHEN** 数据库中存在 transport='stdio' 的 mcp_server 记录（来自未知途径）
- **THEN** Agent Loop 调用该 server 的 tool 时 MUST 返回错误说明 "Unsupported MCP transport: stdio"

## ADDED Requirements

### Requirement: SSE 连接建立与 endpoint 协商

当后端作为 MCP 客户端与 transport='sse' 的 MCP Server 通信时，系统 MUST 先建立 SSE 连接：

1. 向用户注册时提供的 url 发送 GET 请求，设置 `Accept: text/event-stream` header
2. 使用正确的认证头（按 authType 配置生成）
3. 解析返回的 SSE 事件流，等待服务器发送 `endpoint` 事件（`event: endpoint`）
4. 从 endpoint 事件的 `data` 字段中提取后续发送 JSON-RPC 请求的 URL（endpoint URL 可能是绝对路径或相对路径）
5. endpoint URL 提取成功后，SSE 连接保持打开，作为接收服务器响应和通知的通道
6. 如果在 10 秒内未能建立 SSE 连接或未收到 endpoint 事件，MUST 视为连接失败

#### Scenario: 成功建立 SSE 连接并获取 endpoint
- **WHEN** 后端向 SSE 类型 MCP Server 的 url 发起 SSE GET 请求
- **THEN** 服务器返回 `Content-Type: text/event-stream` 响应，随后推送一个 `event: endpoint` 事件，data 字段包含用于后续 POST 的 URL

#### Scenario: SSE 连接超时未收到 endpoint
- **WHEN** 后端发起 SSE 连接，但在 10 秒内未收到 endpoint 事件
- **THEN** 连接被关闭，调用方收到错误 "SSE connection timeout: endpoint event not received"

#### Scenario: SSE 端点拒绝连接
- **WHEN** SSE GET 请求返回 HTTP 4xx 或 5xx
- **THEN** 调用方收到包含状态码和响应体的错误信息

#### Scenario: endpoint URL 为相对路径
- **WHEN** endpoint 事件的 data 字段是相对路径如 `/mcp/message?sessionId=xxx`
- **THEN** 后端 MUST 将其与原始 SSE url 的 origin 拼接成完整 URL

### Requirement: SSE 传输下的 JSON-RPC 请求/响应流程

在 SSE 传输模式下，系统 MUST 按以下流程发送和接收 JSON-RPC 消息：

1. **发送请求**：向协商得到的 endpoint URL POST JSON-RPC 2.0 请求体，请求头 MUST 包含 `Content-Type: application/json` 和正确的认证信息
2. **接收响应**：响应不会通过 POST 请求的 HTTP 响应返回，而是通过之前保持的 SSE 连接推送回来
3. SSE 连接上的数据事件（`event: message`）的 `data` 字段为 JSON-RPC 响应 JSON
4. 系统 MUST 从 data 字段中解析出 JSON-RPC 响应，匹配请求 id 后返回给调用方
5. 单次请求的响应 MUST 在 30 秒内到达，否则视为超时

#### Scenario: SSE 模式下 tools/call 请求成功
- **WHEN** 后端向 endpoint URL POST 一个 tools/call JSON-RPC 请求
- **THEN** 请求的 HTTP 响应体可能为空或仅表示接受，实际的 JSON-RPC 响应通过 SSE 连接的 `event: message` 事件推回，data 字段包含完整的 JSON-RPC 响应

#### Scenario: SSE 模式下请求超时
- **WHEN** 后端 POST 请求后，30 秒内 SSE 连接未推回匹配 id 的响应
- **THEN** 系统返回超时错误，SSE 连接保持（可继续用于后续请求）

#### Scenario: SSE 连接意外断开
- **WHEN** 正在等待 SSE 响应时连接意外关闭
- **THEN** 当前正在等待的请求 MUST 返回错误 "SSE connection lost"，后续请求需要重新建立 SSE 连接

### Requirement: SSE 连接生命周期管理

系统 MUST 管理 SSE 连接的生命周期以支持多次 JSON-RPC 请求复用同一连接：

1. **连接缓存**：每个 mcpServerId 维护一个 SSE 连接实例，首次需要时建立，后续请求复用
2. **空闲超时**：SSE 连接空闲（无请求）超过 5 分钟后 MUST 自动关闭，释放资源
3. **重连机制**：如果 SSE 连接已关闭或断开，下一次请求 MUST 自动重新建立连接并重新协商 endpoint
4. **测试接口**：连通性测试（test）调用 `connect()` 时 MUST 建立 SSE 连接、发送 initialize 请求、收到响应后关闭连接（或缓存短暂时间）

#### Scenario: 多次调用复用同一 SSE 连接
- **WHEN** Agent Loop 在同一轮对话中多次调用同一 SSE 类型 MCP Server 的工具
- **THEN** 系统只建立一次 SSE 连接，后续调用复用该连接的 endpoint URL

#### Scenario: 空闲超时后自动关闭
- **WHEN** 一个 SSE 连接空闲超过 5 分钟
- **THEN** 连接被关闭，相关资源被释放

#### Scenario: 连接断开后自动重连
- **WHEN** SSE 连接意外断开，下一次请求到来
- **THEN** 系统自动重新发起 SSE GET 请求、协商 endpoint，然后发送请求