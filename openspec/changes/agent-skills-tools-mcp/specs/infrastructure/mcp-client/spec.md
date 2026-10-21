## Purpose

为班级教师提供注册和消费外部 MCP Server 的能力。后端作为 MCP 客户端通过 HTTP JSON-RPC 2.0 协议与外部 MCP Server 通信，支持连通性测试、工具发现（tools/list）和工具调用（tools/call）。发现的工具可批量导入为班级 tools 记录，供 Agent 在 ReAct 循环中调用。

## ADDED Requirements

### Requirement: MCP Server 注册

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/mcp-servers` 注册外部 MCP Server。请求 body MUST 包含以下字段：

- `name`（必填，班级内唯一的显示名）
- `url`（必填，MCP endpoint 完整 URL，如 `https://mcp.notion.com/mcp`）
- `authType`（必填，值为 `'none'`、`'bearer'`、`'api_key'` 或 `'basic'`）
- `authConfig`（可选，JSON 对象，存放认证凭据）

authType 为不同值时 authConfig 的期望格式：
- `'none'`：authConfig MUST 为空或不存在
- `'bearer'`：authConfig MUST 包含 `{ token: string }`
- `'api_key'`：authConfig MUST 包含 `{ headerName: string, value: string }`
- `'basic'`：authConfig MUST 包含 `{ username: string, password: string }`

注册成功后系统 MUST 向数据库 `mcp_servers` 表写入记录，authConfig MUST 加密存储。

#### Scenario: 教师成功注册 MCP Server
- **WHEN** 班级教师提供有效的 url 和 auth 配置
- **THEN** 系统加密存储认证信息，返回 HTTP 201 包含 mcpServerId、name、url、authType（authConfig 不回显或只回显脱敏版本）

#### Scenario: url 格式无效
- **WHEN** url 不是合法的 HTTP/HTTPS URL
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: 认证配置缺失必要字段
- **WHEN** authType='bearer' 但 authConfig 中没有 token 字段
- **THEN** 系统返回 HTTP 400 Bad Request，说明 "Missing required authConfig field: token"

#### Scenario: name 在班级内重复
- **WHEN** name 与该班级已有 mcp_servers 重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: 学生尝试注册
- **WHEN** 学生用户访问注册接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: MCP Server 连通性测试

班级教师成员（或 admin）MUST 能够通过 `GET /api/classes/:classId/mcp-servers/:mcpServerId/test` 测试已注册 MCP Server 的连通性。系统 MUST 向目标 URL 发送 MCP `initialize` 方法请求（JSON-RPC 2.0 格式），携带正确的认证信息，并期望在 10 秒内收到合法 JSON-RPC 响应。

成功时系统返回 HTTP 200 包含 `{ success: true, serverInfo: { name, version }, capabilities: {...} }`。失败时返回 HTTP 200 包含 `{ success: false, error: "<具体错误描述>" }`。

#### Scenario: MCP Server 正常响应 initialize
- **WHEN** 目标 MCP Server 对 initialize 请求返回合法的 JSON-RPC 响应
- **THEN** 返回 HTTP 200，success=true，附带 serverInfo 和 capabilities

#### Scenario: MCP Server 不可达
- **WHEN** 目标 URL 在 10 秒内无响应或返回非 JSON-RPC 格式
- **THEN** 返回 HTTP 200，success=false，error 字段包含超时或解析错误的描述

#### Scenario: 认证失败
- **WHEN** MCP Server 返回 HTTP 401 或 MCP error code -32001
- **THEN** 返回 HTTP 200，success=false，error 字段说明认证失败

#### Scenario: mcpServerId 不存在或不属于该班级
- **WHEN** 指定的 mcpServerId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 从 MCP Server 批量导入工具

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/mcp-servers/:mcpServerId/import` 从已注册的 MCP Server 批量导入工具。系统 MUST 按以下顺序执行：

1. 向目标 URL 发送 MCP `tools/list` 方法请求
2. 解析响应中的 tools 数组
3. 对每个 tool，检查其 name 是否与该班级现有 tools 表冲突
4. 为每个不冲突的 tool 创建一条 tool 记录，设置 `source='mcp'`、`mcp_server_id` 为当前 mcpServerId、`mcp_tool_name` 为远端工具名、`input_schema_json` 为远端的 inputSchema
5. 返回导入结果

请求 body MAY 包含可选的 `toolNamesFilter: string[]` 字段，指定只导入列表中的工具。

#### Scenario: 成功批量导入
- **WHEN** tools/list 返回 5 个工具，其中 3 个在班级内无冲突
- **THEN** 系统创建 3 条 tool 记录，返回 HTTP 200 包含 `{ importedCount: 3, skippedCount: 2, skippedNames: ["name1", "name2"] }`

#### Scenario: 指定筛选导入
- **WHEN** tools/list 返回 5 个工具，请求体 toolNamesFilter 为 `["toolA", "toolC"]`，两者都无冲突
- **THEN** 只导入 toolA 和 toolC，返回 importedCount=2

#### Scenario: tools/list 调用失败
- **WHEN** MCP Server 对 tools/list 响应超时或返回错误
- **THEN** 系统返回 HTTP 502 Bad Gateway，不执行任何导入

#### Scenario: 全部工具名称冲突
- **WHEN** tools/list 返回的所有工具名称在班级内已存在
- **THEN** 系统不创建任何 tool 记录，返回 HTTP 200 包含 importedCount=0 和全部 skippedNames

#### Scenario: 学生尝试导入
- **WHEN** 学生用户访问导入接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: Agent Loop 中的 MCP 工具调用

当 Agent Loop 执行一个 source='mcp' 的 tool 时，系统 MUST 按 MCP 协议发送 JSON-RPC `tools/call` 请求到目标 mcp_server 的 url，请求体格式为：

```json
{
  "jsonrpc": "2.0",
  "id": "<唯一请求 ID>",
  "method": "tools/call",
  "params": {
    "name": "<远端 mcp_tool_name>",
    "arguments": { ... 从 LLM tool_call 解析的参数对象 ... }
  }
}
```

请求 MUST 携带正确的认证头（按 auth_type 配置生成：bearer 用 `Authorization: Bearer <token>`、api_key 用自定义 header、basic 用 `Authorization: Basic <base64>`）。

成功时解析响应的 `result.content[0].text` 作为 tool 结果喂回 LLM。失败（HTTP 错误、JSON-RPC error、超时 30 秒）时返回 `isError: true` 附带错误描述。

#### Scenario: MCP 工具调用成功
- **WHEN** Agent Loop 调用一个 source='mcp' 的 tool，远端返回合法的 tools/call 响应
- **THEN** 系统从 result.content 数组中提取文本内容作为 tool 执行结果

#### Scenario: MCP 工具调用超时
- **WHEN** 远端 MCP Server 在 30 秒内未响应
- **THEN** 系统返回 `isError: true` 和超时说明，不影响 Agent Loop 继续

#### Scenario: MCP 返回 isError=true
- **WHEN** 远端 tools/call 响应的 result 中 `isError: true`
- **THEN** 系统将整个 result 作为 tool 结果喂回 LLM，让 LLM 决定下一步

### Requirement: MCP Server 列表 API

班级教师成员（或 admin）MUST 能够通过 `GET /api/classes/:classId/mcp-servers` 查看该班级下的所有 MCP Server 注册记录。返回结果 MUST 包含 mcpServerId、name、url、authType（脱敏，不回显 token）、status、lastError、createdAt。

学生 MAY 通过该接口查看列表（只读，不能发起 test/import 操作）。

#### Scenario: 教师获取 MCP Server 列表
- **WHEN** 班级教师请求
- **THEN** 返回该班级所有 MCP Server 数组，每条包含脱敏后的元信息

#### Scenario: 学生获取 MCP Server 列表
- **WHEN** 学生用户请求
- **THEN** 返回与教师相同的列表，authConfig 字段脱敏为空或省略

#### Scenario: 非班级成员访问
- **WHEN** 非班级成员且非 admin 用户请求
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 删除 MCP Server

班级教师成员（或 admin）MUST 能够通过 `DELETE /api/classes/:classId/mcp-servers/:mcpServerId` 删除 MCP Server 注册。删除前系统 MUST 检查是否有 source='mcp' 的 tools 记录引用该 mcpServerId；如果有，MUST 同时删除所有引用的 tools（级联），并解除所有 agent_tools 绑定。

#### Scenario: 教师删除 MCP Server
- **WHEN** 班级教师指定有效的 mcpServerId
- **THEN** 系统删除 mcp_servers 记录、级联删除引用的 tools、级联解除 agent_tools 绑定，返回 HTTP 200

#### Scenario: mcpServerId 不存在或不属于该班级
- **WHEN** 指定的 mcpServerId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 仅支持 HTTP 传输

后端对外部 MCP Server 的接入 MUST 仅支持 HTTP/S Streamable Transport（MCP 主流方向）。stdio 传输方式不在本次变更范围内。所有 mcp_servers 记录的 transport 列默认为 `'http'` 且在注册时不可修改。

#### Scenario: 注册时自动设置 transport 为 http
- **WHEN** 教师注册一个外部 MCP Server
- **THEN** transport 字段自动设为 'http'，请求体中不接受 transport 参数

#### Scenario: Agent Loop 拒绝非 http 传输
- **WHEN** 数据库中存在 transport='stdio' 的 mcp_server 记录（来自未知途径）
- **THEN** Agent Loop 调用该 server 的 tool 时 MUST 返回错误说明 "Unsupported MCP transport: stdio"