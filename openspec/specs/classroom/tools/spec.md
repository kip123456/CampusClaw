## Purpose

为班级提供独立于 Skill 的 Tool（工具）管理能力。Tool 是一个可由 LLM 通过 Function Calling 调用的函数，分 builtin（项目内实现的 handler）和 mcp（外部 MCP Server 暴露的工具）两种来源。班级教师可将 Tool 绑定到 Agent，Agent 在 ReAct 多轮循环中按需调用。

## ADDED Requirements

### Requirement: Tool 数据模型

系统 MUST 在数据库中维护 tools 表，包含以下列：`id`、`class_id`（NOT NULL）、`name`（班级内唯一）、`description`、`input_schema_json`（MCP inputSchema / OpenAI parameters 的 JSON Schema）、`source`（`'builtin'` 或 `'mcp'`）、`handler_key`（source='builtin' 时非空，对应内置 handler 注册表中的 key）、`mcp_server_id`（source='mcp' 时非空，关联 mcp_servers 表）、`mcp_tool_name`（source='mcp' 时非空，远端 MCP 工具名）、`enabled`（默认 true）、`created_at`、`updated_at`。

系统 MUST 额外维护 agent_tools 关联表（agent_id + tool_id），独立于现有 agent_skills 表。一个 agent 可以同时绑定多个 skills 和多个 tools，两套绑定互不影响、互不包含。

#### Scenario: tool 记录字段完整性
- **WHEN** 创建一条 source='builtin' 的 tool
- **THEN** handler_key 非空，mcp_server_id 和 mcp_tool_name 为空

#### Scenario: tool 与 agent 绑定独立
- **WHEN** agent 绑定了 2 个 skills 和 3 个 tools
- **THEN** agent_skills 表有 2 条记录，agent_tools 表有 3 条记录，互不干扰

### Requirement: 内置 Tool 注册

后端 MUST 提供一个 Tool handler 注册表，支持通过 registerTool() 注册 builtin handler。每个 handler MUST 实现统一接口：`{ name, description, schema, execute(args, ctx) }`，其中 ctx MUST 包含 classId、userId、role、agentKbIds 四个字段。Handler 的 execute 方法 MUST 返回字符串（可被序列化为 JSON 后作为 tool_call 结果喂回 LLM）。

系统 MUST 预注册 4 个 builtin handler：
1. `exponentiate`：乘方运算，接受 `{ base: number, exp: number }` 参数，返回 base^exp 的数值文本
2. `list_class_materials`：列出当前课程的资料文件，接受可选参数 `{ onlyRecent?: boolean }`（默认 false，true 时只返回最近 7 天上传的），返回文件列表 JSON
3. `class_member_stats`：班级人数统计（教师和学生各多少人），无参数，返回 JSON
4. `rag_search`：从 agent 绑定的知识库中检索片段，接受 `{ query: string, topK?: number }` 参数（topK 默认 5，上限 10），返回 JSON 数组格式的检索结果（复用 qa.ts 中 retrieveAndCite 的逻辑）

#### Scenario: builtin tool 被注册
- **WHEN** 后端启动完成
- **THEN** 注册表中 MUST 能查到 exponentiate、list_class_materials、class_member_stats、rag_search 四个 handler

#### Scenario: rag_search handler 执行时使用 agent 绑定的知识库
- **WHEN** LLM 在 Agent Loop 中调用 rag_search
- **THEN** handler MUST 从 ctx.agentKbIds 中获取知识库 ID 列表，调用 ChromaDB 检索，返回完整片段 JSON

#### Scenario: 未知 handler_key 的 tool 被调用
- **WHEN** Agent Loop 尝试调用一个 source='builtin' 但 handler_key 未在注册表中找到的 tool
- **THEN** 系统 MUST 将此作为 tool 执行错误处理，返回 `isError: true` 并附带说明，不 crash

### Requirement: 班级工具列表 API

班级教师成员（或 admin）MUST 能够通过 `GET /api/classes/:classId/tools` 查看该班级下的所有工具。返回结果 MUST 包含每个 tool 的 toolId、name、description、source、enabled、createdAt。学生 MUST NOT 能调用此接口。

#### Scenario: 教师获取工具列表
- **WHEN** 班级教师请求
- **THEN** 返回该班级所有工具数组，每条包含元信息但不暴露 input_schema 详细内容（可通过详情接口获取）

#### Scenario: 学生尝试获取工具列表
- **WHEN** 学生用户访问 tools 列表接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 获取单个工具详情

班级教师成员（或 admin）MUST 能够通过 `GET /api/classes/:classId/tools/:toolId` 获取单个工具详情，包含完整的 inputSchema（JSON Schema）和 source 相关字段（builtin 的 handler_key / mcp 的 mcp_server_id 和 mcp_tool_name）。

#### Scenario: 教师获取 tool 详情
- **WHEN** 班级教师请求有效 toolId
- **THEN** 返回完整 tool 对象，包含 inputSchema 和 source 相关字段

#### Scenario: tool 不存在或不属于该班级
- **WHEN** 指定的 toolId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: Tool 与 Agent 绑定

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/tools/:toolId/bind` 将一个 tool 绑定到指定 agent。请求 body MUST 包含 `agentId`。绑定前系统 MUST 校验 agent 存在且属于该 classId。同一个 tool MAY 被绑定到多个 agent，同一个 agent MAY 绑定多个 tools（多对多）。

#### Scenario: 教师成功绑定 tool 到 agent
- **WHEN** 班级教师请求将有效 toolId 绑定到有效 agentId
- **THEN** 系统在 agent_tools 表写入关联记录，返回 HTTP 200

#### Scenario: tool 或 agent 不属于该班级
- **WHEN** toolId 或 agentId 不存在或不属于指定 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: 重复绑定
- **WHEN** 同一个 tool 已经绑定到该 agent
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: 学生尝试绑定
- **WHEN** 学生用户访问绑定接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 解除 Tool 与 Agent 绑定

班级教师成员（或 admin）MUST 能够通过 `DELETE /api/classes/:classId/tools/:toolId/bind` 解除 tool 与 agent 的绑定。请求 body 或 query MUST 包含 `agentId`。

#### Scenario: 教师成功解除绑定
- **WHEN** tool 已绑定到指定 agent
- **THEN** 系统删除 agent_tools 中对应的关联记录，返回 HTTP 200

#### Scenario: 绑定不存在
- **WHEN** tool 与 agent 之间没有绑定关系
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 删除班级工具

班级教师成员（或 admin）MUST 能够通过 `DELETE /api/classes/:classId/tools/:toolId` 删除工具。若该工具已被一个或多个 agent 绑定，删除 MUST 同时解除所有绑定关系（级联删除 agent_tools 中的关联记录）。对于 source='mcp' 的工具，删除 MUST NOT 影响 mcp_servers 表中的原始服务器注册。

#### Scenario: 教师成功删除未绑定工具
- **WHEN** 班级教师指定存在的 toolId
- **THEN** 系统删除工具记录，返回 HTTP 200

#### Scenario: 删除已被 agent 绑定的工具
- **WHEN** 工具被一个或多个 agent 绑定
- **THEN** 系统先删除所有 agent_tools 关联，再删除工具本身，返回 HTTP 200