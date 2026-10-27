## Why

当前智能体的"技能"是纯文本 Prompt 注入，没有文件夹结构、没有动态加载、没有按需触发；知识库 RAG 是每轮对话硬编码前置检索，限制了 LLM 自由度且浪费 token；系统没有 Tool 调用能力（Function Calling），LLM 无法执行可验证的操作（查资料、算乘方等）；外部 MCP Server 可以被 backend 消费、但 backend 没有客户端；整体缺少 ReAct 多轮思考循环。这些限制使得 CampusClaw Agent 的能力天花板低、扩展性差，与业界主流 AI Agent 架构（Claude Code Skills + Function Calling + MCP Protocol）存在代差。

## What Changes

- **BREAKING** Skills 从 `(id, class_id, name, prompt, description)` 纯表结构改为**文件夹 + SKILL.md frontmatter** 模型：磁盘存储 `storage/skills/<id>/{SKILL.md, scripts/, references/}`，数据库只存元信息（storage_path, version, triggers）。原有 skills 记录需要迁移脚本包装成标准 SKILL.md 并写入磁盘。
- Skills 动态加载（Claude Code 风格）：启动时只索引每个 skill 的 frontmatter，运行时向量检索 + triggers 关键词匹配选 top-3，按需读完整 SKILL.md。
- Skills 增加**外部导入**能力（班级教师专属）：`POST /skills/import` 支持从 zip 包或 HTTP URL 下载技能文件夹、校验 SKILL.md、解析 frontmatter、落盘入库。
- **BREAKING** Agent Chat 去掉硬编码前置 RAG：不再固定先 `retrieveAndCite` 再构造 prompt。改为**Agent Loop 驱动**，LLM 通过 tool calling 自主决定是否查知识库、查几次。
- 新增 `rag_search` builtin tool：把原来的 RAG 检索逻辑包装成一个可调用 tool handler，在 agent loop 中按需执行。citations 从 rag_search 的 tool 结果汇总，不再是 prompt 构造时的静态输出。
- 新增 **Tool 系统**（独立于 Skill）：`tools` 表 + `agent_tools` 关联表（agent_skills 和 agent_tools 分离）。Tool 分 builtin 和 mcp 两种 source。
- 新增 4 个 builtin tool：`rag_search`（知识库检索）、`exponentiate`（乘方运算）、`list_class_materials`（列出课程资料）、`class_member_stats`（班级人数统计）。
- LLM 客户端扩展：`chatStream()` 接受 OpenAI 兼容的 `tools` 参数，解析响应中的 `tool_calls` 字段。
- 新增 **Agent Loop** 模块：ReAct 多轮循环（最多 5 轮），LLM 思考 → 发起 tool_call → 执行 handler → 把结果喂回 LLM → 继续直到返回最终回答。
- SSE 协议扩展：新增 `tool_start`、`tool_end`、`skill_load` 三种事件类型，让前端可视化 Agent 执行过程。
- 新增 **MCP 客户端**：`mcp_servers` 表存外部 MCP server 配置（url, transport, auth_type, auth_config_json）；`mcp-client.ts` 实现 HTTP JSON-RPC 握手（initialize → tools/list）和 tools/call；Agent Loop 按 tool.source 分发 builtin handler 或 MCP 远端调用。
- 新增外部 MCP **注册/测试/批量导入** API（班级教师专属）：`POST /mcp-servers`、`GET /mcp-servers/:id/test`、`POST /mcp-servers/:id/import`（tools/list 后批量创建 tool 记录）。
- 权限约束：所有导入和绑定操作（自建 skill、导入 skill、注册 MCP、绑定 tool 到 agent）均需 `guardClassTeacher`；查看操作走 `guardClassMember`；agent_skills、agent_tools、agent_kbs 三套关联表独立管理。

## Capabilities

### New Capabilities
- `classroom/tools`: Tool 注册（builtin + mcp 两种 source）、CRUD、agent_tools 关联、4 个 builtin handler
- `infrastructure/mcp-client`: 外部 MCP server 注册、HTTP JSON-RPC 客户端、连通性测试、批量导入 tool

### Modified Capabilities
- `classroom/skills`: Skill 存储模型从纯表改为文件夹 + SKILL.md frontmatter，新增动态加载、外部导入 API，prompt 字段从 DB 读取改为磁盘读取
- `classroom/agent-qa`: 去掉硬编码前置 RAG，改为 Agent Loop 驱动，新增 tool calling 能力，SSE 事件扩展（tool_start/tool_end/skill_load），citations 来源改为 rag_search tool 结果汇总

## Impact

**后端文件变更：**
- `src/db/schema.ts` — 新增 tools、agent_tools、mcp_servers 表；skills 表重构（去掉 prompt 列，加 storage_path, version, triggers_json, import_source, import_url）
- `src/routes/skills.ts` — 重构为文件夹模型 + 动态加载，新增 import 端点
- `src/routes/agentMessages.ts` — Agent Chat 路由改为 agent loop 驱动
- `src/routes/tools.ts` — **新增** Tool CRUD + agent_tools 关联路由
- `src/routes/mcpServers.ts` — **新增** 外部 MCP 管理路由
- `src/lib/qa.ts` — 大改：去掉硬编码 retrieveAndCite、去掉 RAG 约束语、重构为接受 agent loop 输入
- `src/lib/llm.ts` — 扩展 chatStream 接受 tools 参数，解析 tool_calls 响应
- `src/lib/agent-loop.ts` — **新增** ReAct 多轮循环
- `src/lib/tools/registry.ts` — **新增** Tool handler 注册表
- `src/lib/tools/*.ts` — **新增** 4 个 builtin handler
- `src/lib/skill-loader.ts` — **新增** SKILL.md frontmatter 解析 + 按需加载
- `src/lib/skill-selector.ts` — **新增** 向量检索 + triggers 关键词路由
- `src/lib/mcp-client.ts` — **新增** HTTP JSON-RPC 客户端
- `src/middleware/guards.ts` — 无需改动，复用 guardClassTeacher / guardClassMember

**新增存储目录：**
- `storage/skills/<skill-id>/{SKILL.md, scripts/, references/}`

**API 变更：**
- `POST /api/classes/:classId/skills` — 请求体从 `{name, prompt?, description?}` 改为 `{name, description?, skillContent}`（skillContent = SKILL.md Markdown body）
- `GET /api/classes/:classId/skills/:skillId` — 返回 storage 路径下的 SKILL.md 内容而非 DB prompt 列
- **新增** `POST /api/classes/:classId/skills/import` — 从外部导入 skill 文件夹
- **新增** `GET /api/classes/:classId/tools`、`POST /api/classes/:classId/tools/:toolId/bind` — Tool 列表 + agent_tools 绑定
- **新增** `POST /api/classes/:classId/mcp-servers` — 注册外部 MCP
- **新增** `GET /api/classes/:classId/mcp-servers/:id/test` — 连通性测试
- **新增** `POST /api/classes/:classId/mcp-servers/:id/import` — 批量导入 tool

**依赖：**
- 无新 npm 依赖（现有 embed.ts / chroma.ts / llm.ts 复用）
- mcp-server 自建服务保留给 Phase 3 集成测试

**前端文件变更（breaking，必须同步部署）：**
- `src/types.ts` — Skill interface 删除 `prompt?` 改 `skillContent?`，新增 `version?`、`importSource?`、`source?`；Agent interface 新增 `tools?` 数组；新增 Tool / McpServer interface 定义
- `src/pages/ClassDetailPage.tsx` — Skills 创建/编辑表单 payload 字段从 `prompt` 改 `skillContent`；新增「导入技能」按钮（zip 上传 / URL）；Agents 编辑表单新增 toolIds 多选；新增 Tools tab（班级教师可见）：列出 tools、展示 source/handler_key、绑定到 agent 的入口；新增 MCP Servers tab（班级教师可见）：注册表单、列表、连通性测试按钮、批量导入按钮
- `src/pages/AgentChatPage.tsx` — SSE 事件处理新增 skill_load/tool_start/tool_end 分支（不能 parse error）；agent sidebar 展示绑定的 tools；tool 执行期间显示「🤖 正在调用 [xxx]」loading indicator
- 前端不引入新 npm 依赖（axios/react-router-dom 已存在）

**迁移：**
- 首次部署时需要迁移现有 skills：把 DB 中每条 skill 的 name + description + prompt 自动包装成标准 SKILL.md，写入 storage/skills/<id>/SKILL.md，删除 prompt 列
- 前后端必须**同步部署**：后端改了 Skill payload 字段名，如果前端不同步会导致 Skill 创建/编辑全部失败