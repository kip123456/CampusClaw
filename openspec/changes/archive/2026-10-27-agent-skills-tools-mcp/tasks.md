## 1. 数据库 Schema 迁移与基础设施

- [x] 1.1 新建数据库 schema 迁移脚本 `backend/migrations/001_agent_refactor.sql`：创建 `tools` 表（id, class_id, name, description, input_schema_json, source, handler_key, mcp_server_id, mcp_tool_name, enabled, created_at, updated_at）、`agent_tools` 关联表（agent_id, tool_id, UNIQUE）、`mcp_servers` 表（id, class_id, name, url, transport, auth_type, auth_config_json, status, last_error, created_at）。验证：手动执行 SQL 后三张表存在且约束正确。（注：实际在 schema.ts 里以 CREATE TABLE + ALTER TABLE 方式通过 initSchema 自动迁移）
- [x] 1.2 修改 `backend/src/db/schema.ts`：更新 `initSchema()` 函数，新增 tools、agent_tools、mcp_servers 三张表的 CREATE TABLE 语句；skills 表新增 storage_path、import_source、import_url、version、triggers_json 五个列。验证：backend 启动时自动创建新表和新列。
- [x] 1.3 编写一次性数据迁移脚本 `backend/scripts/migrate-skills-folder.ts`：读取现有 skills 表所有记录，为每条生成标准 SKILL.md（YAML frontmatter + 原 prompt 列内容作为 body），写入 `storage/skills/<id>/SKILL.md`，更新 skills 表 storage_path/import_source/version/triggers_json 列值。验证：迁移后每个旧 skill 的 SKILL.md 文件存在，frontmatter 的 name 与 DB 一致。
- [x] 1.4 在 `backend/src/config.ts` 中新增 `STORAGE_SKILLS_DIR` 常量指向 `storage/skills/` 并在启动时自动创建目录。验证：backend 启动后目录存在。
- [x] 1.5 在 `backend/package.json` 的 scripts 中添加 `"migrate:skills": "tsx scripts/migrate-skills-folder.ts"` 命令。验证：运行该命令可正确迁移现有 skills。

## 2. Skill 文件夹模型与动态加载

- [x] 2.1 新建 `backend/src/lib/skill-loader.ts`：实现 SKILL.md frontmatter 解析（YAML 取 name/description/version/triggers）、完整 Markdown body 读取、按 storage_path 从磁盘加载。导出 `parseSkillFile(filePath)` 和 `loadSkillContent(storagePath)` 两个函数。验证：对一个标准 SKILL.md 文件调用 parseSkillFile 能正确返回 frontmatter 对象和 body 字符串。
- [x] 2.2 新建 `backend/src/lib/skill-selector.ts`：实现动态技能选择逻辑。维护内存技能索引（启动时读所有 skill 的 frontmatter），导出 `selectSkills(userMessage, classId, skillIds, topN)` 函数。向量检索用现有 embed.ts，相似度计算手动实现（点积除以两向量模长）。关键词触发加分 +0.2。验证：给定一组测试 skill frontmatter 和用户问题，返回得分最高的 top-3 skill id 数组。
- [x] 2.3 重构 `backend/src/routes/skills.ts`：`POST /skills` 请求体改为接收 `skillContent` 而非 prompt；创建时自动生成标准 SKILL.md 落盘；`GET /skills/:id` 返回从磁盘读取的 SKILL.md body 而非 DB 列；`PUT /skills/:id` 接受 skillContent 并重新生成 SKILL.md；删除 skill 时同时删除 storage/skills/<id>/ 目录。验证：POST 创建的 skill 对应目录和 SKILL.md 存在，GET /skills/:id 返回的 skillContent 与创建时一致。
- [x] 2.4 新增 `POST /skills/import` 端点（班级教师守卫）：接受 zip 上传；解压到临时目录；校验 SKILL.md 存在并能解析 frontmatter；移动到 `storage/skills/<new-id>/`；写入 DB。验证：上传一个标准 zip 后，skill 正确导入且能被动态选择命中。
- [x] 2.5 在 `backend/src/lib/agent-loop.ts` 中接入动态技能选择：替换原来"查 agent_skills → 全读 prompt"的逻辑，改为 `selectSkills(message, classId, allSkillIds, 3)` → 对命中的 skillId 调 `loadSkillsByIds` 加载完整内容，收集为 loadedSkills 数组注入 system prompt。验证：Agent Chat 日志中可看到只加载了 top-N skill。

## 3. LLM 客户端与 Tools 参数扩展

- [x] 3.1 修改 `backend/src/lib/llm.ts` 的 `chat()` 函数签名：第二个参数增加可选 `tools?: LLMTool[]`；如果 tools 非空则请求 body 带上 `tools` 和 `tool_choice: 'auto'`。解析 LLM 响应，如果返回 `tool_calls` 字段则从 tool_calls[].function 中提取 name 和 arguments（arguments 是 JSON 字符串需 JSON.parse）。验证：返回 ChatResult（content + toolCalls）。
- [x] 3.2 修改 `backend/src/lib/llm.ts` 的 `chatStream()` 函数：同样接受 tools 参数并在请求 body 中传递。流式响应累积 delta.content + delta.tool_calls，流式结束后返回 fullAnswer + fullToolCalls。验证：当 LLM 响应包含 tool_calls 时，chatStream.fullAnswer 应包含 tool_calls 数组。

## 4. Tool 注册与 Builtin Handlers

- [x] 4.1 新建 `backend/src/lib/tool-handlers.ts`：实现 ToolHandler 接口定义、内置工具注册 Map、`executeTool(handlerKey, args, ctx)` 统一入口、`listBuiltinToolSchemas()` 返回 LLM tools 参数格式、`getBuiltinTool(handlerKey)` 取单个 handler。
- [x] 4.2 内置 exponentiate handler：乘方运算，schema { base, exp }，返回 Math.pow(base, exp) 的字符串。
- [x] 4.3 内置 list_class_materials handler：列课程资料，可选 onlyRecent 参数，查 materials 表。
- [x] 4.4 内置 class_member_stats handler：无参数，查 class_teachers + class_students 表 count。
- [x] 4.5 内置 rag_search handler：schema { query, topK? }，调用 qa.ts 的 retrieveAndCite。
- [x] 4.6 在 agent-loop.ts 的 getAgentTools 中组装 tool handlers：builtin tool 从 getBuiltinTool(handlerKey) 取，mcp tool 存 mcpServerId + mcpToolName。executeToolCall 分发 builtin 和 mcp 两种执行路径。

## 5. Agent Loop 实现

- [x] 5.1 新建 `backend/src/lib/agent-loop.ts`：实现 runAgentLoop + streamAgentLoop。最多 5 轮 ReAct 循环。每轮：调用 chat → 检查 tool_calls → 有则执行 handler 并 append role='tool' 到 messages → 下一轮。
- [x] 5.2 citations 汇总：rag_search tool 的 toolResult 自动合并，由调用方（agentMessages.ts done 事件）使用。
- [x] 5.3 修改 `backend/src/routes/agentMessages.ts`：替换为 streamAgentLoop。SSE 事件：skill_load / tool_start / message / tool_end / done / error 全部对齐。
- [x] 5.4 清理 qa.ts 废弃 answerWithRAGStream 系列（StreamEvent, RAGStreamResult, streamRAG）。保留 answerWithRAG（kbs.ts 在用）和 retrieveAndCite（rag_search 复用）。

## 6. Tool CRUD 路由

- [x] 6.1 新建 `backend/src/routes/tools.ts`：GET /tools（班级教师列表）、GET /tools/:id（详情）、POST /tools/:id/bind（绑定 agent）、DELETE /tools/:id/bind（解绑）、DELETE /tools/:id（级联删除 agent_tools）。启动时自动初始化内置工具。
- [x] 6.2 修改 `backend/src/routes/agents.ts`：agent 列表/详情返回时额外查询 tools 数组（toolId, name, description, source）。

## 7. MCP 客户端（Phase 3）

- [x] 7.1 新建 `backend/src/lib/mcp-client.ts`：HTTP JSON-RPC 2.0 客户端。export connect(serverConfig)、listTools(serverConfig)、callTool(serverConfig, toolName, args)。auth 四种方式（none/bearer/api_key/basic）。10s 超时。
- [x] 7.2 新建 `backend/src/lib/crypto.ts`：AES-256-GCM 加密/解密，密钥从 MCP_AUTH_ENCRYPTION_KEY 环境变量读取。
- [x] 7.3 新建 `backend/src/routes/mcpServers.ts`：POST /mcp-servers（注册）、GET /mcp-servers（列表）、GET /mcp-servers/:id（详情）、GET /mcp-servers/:id/test（连通性测试）、POST /mcp-servers/:id/import（批量导入）、DELETE /mcp-servers/:id（级联删除）。auth_config_json 写入前加密、读取后解密。
- [x] 7.4 agent-loop.ts 的 executeToolCall 中：tool.source === 'mcp' 时 createMcpConfigFromDb → callMcpTool → 提取 content 作为 tool 结果。

## 8. 全链路测试与清理

- [ ] 8.1 集成测试（需要真实测试环境和 LLM 配置）
- [ ] 8.2 API 文档更新（用户未明确要求，可后续补充）
- [x] 8.3 清理代码：删除 qa.ts 中废弃的 answerWithRAGStream/StreamEvent/RAGStreamResult/streamRAG；agentMessages.ts 无旧硬编码 RAG 路径。TypeScript 编译无报错。

## 9. 前端适配与新功能 UI

- [x] 9.1 更新 `frontend/src/types.ts`：Skill interface 删除 prompt 改 skillContent；新增 version/importSource/importUrl/triggers；Agent interface 新增 tools 数组 + toolCount；新增 Tool 接口；新增 McpServer 接口；新增 SSEEvent 接口。
- [x] 9.2 ClassDetailPage Skills 表单 breaking fix：payload prompt → skillContent；startEditSkill 取值路径；UI label "Prompt" → "Skill Content (Markdown)"。
- [x] 9.3 ClassDetailPage Skills tab 新增导入功能：zip 文件上传（FormData）+ POST /skills/import。
- [x] 9.4 ClassDetailPage Agents tab 新增 toolIds 多选区：与 kbIds/skillIds 平行；startEditAgent 从 agent.tools 初始化 toolIds；toggleAgentTool 函数。
- [x] 9.5 ClassDetailPage 新增 Tools tab（教师可见）：列表展示 tools（内置/MCP source tag、handlerKey、enabled、已绑定 agent）；绑定下拉；删除按钮。
- [x] 9.6 ClassDetailPage 新增 MCP Servers tab（教师可见）：注册表单（name/url/authType/authConfig JSON）；列表显示 status badge；测试连接按钮；批量导入按钮；删除按钮。
- [x] 9.7 AgentChatPage SSE handler 扩展：新增 skill_load / tool_start / tool_end 分支；try-catch 保护不抛异常；toolLoading state。
- [x] 9.8 AgentChatPage sidebar tools 展示：🪛 tool.name tag（builtin green vs mcp blue）；toolLoading 时显示橙色 loading indicator。
- [ ] 9.9 前端整体冒烟测试（需要运行 backend + frontend dev server）