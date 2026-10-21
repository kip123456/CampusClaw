## 1. 数据库 Schema 迁移与基础设施

- [ ] 1.1 新建数据库 schema 迁移脚本 `backend/migrations/001_agent_refactor.sql`：创建 `tools` 表（id, class_id, name, description, input_schema_json, source, handler_key, mcp_server_id, mcp_tool_name, enabled, created_at, updated_at）、`agent_tools` 关联表（agent_id, tool_id, UNIQUE）、`mcp_servers` 表（id, class_id, name, url, transport, auth_type, auth_config_json, status, last_error, created_at）。验证：手动执行 SQL 后三张表存在且约束正确。
- [ ] 1.2 修改 `backend/src/db/schema.ts`：更新 `initDatabase()` 函数，新增 tools、agent_tools、mcp_servers 三张表的 CREATE TABLE 语句；skills 表新增 storage_path、import_source、import_url、version、triggers_json 五个列；删除 skills 表的 prompt 列或 rename 为 prompt_deprecated 留过渡。验证：backend 启动时自动创建新表和新列。
- [ ] 1.3 编写一次性数据迁移脚本 `backend/scripts/migrate-skills-folder.ts`：读取现有 skills 表所有记录，为每条生成标准 SKILL.md（YAML frontmatter + 原 prompt 列内容作为 body），写入 `storage/skills/<id>/SKILL.md`，更新 skills 表 storage_path/import_source/version/triggers_json 列值。验证：迁移后每个旧 skill 的 SKILL.md 文件存在，frontmatter 的 name 与 DB 一致。
- [ ] 1.4 在 `backend/src/config.ts` 中新增 `STORAGE_SKILLS_DIR` 常量指向 `storage/skills/` 并在启动时自动创建目录。验证：backend 启动后目录存在。
- [ ] 1.5 在 `backend/package.json` 的 scripts 中添加 `"migrate:skills": "tsx scripts/migrate-skills-folder.ts"` 命令。验证：运行该命令可正确迁移现有 skills。

## 2. Skill 文件夹模型与动态加载

- [ ] 2.1 新建 `backend/src/lib/skill-loader.ts`：实现 SKILL.md frontmatter 解析（YAML 取 name/description/version/triggers）、完整 Markdown body 读取、按 storage_path 从磁盘加载。导出 `parseSkillFile(filePath)` 和 `loadSkillContent(storagePath)` 两个函数。验证：对一个标准 SKILL.md 文件调用 parseSkillFile 能正确返回 frontmatter 对象和 body 字符串。
- [ ] 2.2 新建 `backend/src/lib/skill-selector.ts`：实现动态技能选择逻辑。维护内存技能索引（启动时读所有 skill 的 frontmatter），导出 `selectSkills(userMessage, allSkillIds, topN)` 函数。向量检索用现有 embed.ts，相似度计算手动实现（点积除以两向量模长）。关键词触发加分 +0.2。验证：给定一组测试 skill frontmatter 和用户问题，返回得分最高的 top-3 skill id 数组。
- [ ] 2.3 重构 `backend/src/routes/skills.ts`：`POST /skills` 请求体改为接收 `skillContent` 而非 prompt；创建时自动生成标准 SKILL.md 落盘；`GET /skills/:id` 返回从磁盘读取的 SKILL.md body 而非 DB 列；`PUT /skills/:id` 接受 skillContent 并重新生成 SKILL.md；删除 skill 时同时删除 storage/skills/<id>/ 目录。验证：POST 创建的 skill 对应目录和 SKILL.md 存在，GET /skills/:id 返回的 skillContent 与创建时一致。
- [ ] 2.4 新增 `POST /skills/import` 端点（班级教师守卫）：接受 `{ source: 'url', location: '...' }` 或 zip 上传；下载/解压到临时目录；校验 SKILL.md 存在并能解析 frontmatter；移动到 `storage/skills/<new-id>/`；写入 DB。验证：上传一个标准 zip 后，skill 正确导入且能被动态选择命中。
- [ ] 2.5 在 `backend/src/routes/agentMessages.ts` 中接入动态技能选择：替换原来"查 agent_skills → 全读 prompt"的逻辑，改为 `selectSkills(message, allSkillIds, classId, 3)` → 对命中的 skillId 调 `loadSkillContent` 加载完整内容，收集为 loadedSkills 数组传给后续 Agent Loop。验证：Agent Chat 日志中可看到只加载了 top-N skill，且这些 skill 确实绑定了 agent。

## 3. LLM 客户端与 Tools 参数扩展

- [ ] 3.1 修改 `backend/src/lib/llm.ts` 的 `chat()` 函数签名：第二个参数增加可选 `tools?: OpenAIToolSchema[]`；如果 tools 非空则请求 body 带上 `tools` 和 `tool_choice: 'auto'`。解析 LLM 响应，如果返回 `tool_calls` 字段则从 tool_calls[].function 中提取 name 和 arguments（arguments 是 JSON 字符串需 JSON.parse）。验证：写一个单元测试 mock LLM 响应，确认 tool_calls 被正确解析。
- [ ] 3.2 修改 `backend/src/lib/llm.ts` 的 `chatStream()` 函数：同样接受 tools 参数并在请求 body 中传递。流式响应需要检测 tool_calls（tool_calls 通常出现在 streaming 的 delta 中，需要累积 tool_calls[].function.name 和 tool_calls[].function.arguments）。流式结束后如果有 tool_calls，完整收集返回。验证：当 LLM 响应包含 tool_calls 时，chatStream.fullAnswer 应包含 tool_calls 数组。

## 4. Tool 注册与 Builtin Handlers

- [ ] 4.1 新建 `backend/src/lib/tools/registry.ts`：实现 ToolHandler 接口定义（{ name, description, schema, execute(args, ctx): Promise<string> }）、registerTool() 函数、getTool(name) 函数、getAllToolSchemas() 函数（返回 OpenAI tools 参数格式数组）。registry 用 Map<string, ToolHandler> 存储。验证：导入 registry 模块后调用 registerTool + getTool 能正确存取。
- [ ] 4.2 新建 `backend/src/lib/tools/exponentiate.ts`：实现乘方运算 handler。schema: { type: object, properties: { base: { type: number }, exp: { type: number } }, required: ['base', 'exp'] }。execute 中计算 Math.pow(base, exp) 返回数值的字符串表示。验证：单元测试调用 registry.getTool('exponentiate').execute({ base: 2, exp: 10 }, mockCtx) 返回 '1024'。
- [ ] 4.3 新建 `backend/src/lib/tools/listClassMaterials.ts`：实现列课程资料 handler。schema 接受可选参数 `onlyRecent: boolean`。execute 中查询 materials 表 WHERE class_id = ctx.classId AND (onlyRecent 时上传时间在 7 天内)。返回 JSON 字符串（name, size, uploadedAt）。验证：mock DB 查询后能正确返回资料列表。
- [ ] 4.4 新建 `backend/src/lib/tools/classMemberStats.ts`：实现班级成员统计 handler。无参数。execute 中分别查询 class_teachers 和 class_students 表 WHERE class_id = ctx.classId 的 count，返回 JSON { teacherCount, studentCount }。验证：返回格式正确且数值与 DB 一致。
- [ ] 4.5 新建 `backend/src/lib/tools/ragSearch.ts`：实现知识库检索 handler。schema: { query: string, topK?: number (default 5, max 10) }。execute 中从 ctx.agentKbIds 取知识库 ID 列表，调用现有 `qa.ts` 中的 `retrieveAndCite(question, kbIds, classId, topK)`，返回 JSON 字符串数组。验证：给定有效 ctx.agentKbIds 时能正确返回 ChromaDB 检索结果。
- [ ] 4.6 修改 `backend/src/routes/agentMessages.ts`：构建 Agent Loop 上下文时，查询 agent 绑定的所有 tools → 从 DB 读取每个 tool 的 source/handler_key/input_schema_json 等字段 → 组装成 ToolHandler 数组（builtin tool 从 registry.get(handler_key) 取，mcp tool 暂时先不实现，留空或标记为 stub）。同时把 agent 绑定的 kbIds 收集好塞到 ctx.agentKbIds。验证：agent 绑定的 builtin tools 能正确组装成 ToolHandler 数组传给 Agent Loop。

## 5. Agent Loop 实现

- [ ] 5.1 新建 `backend/src/lib/agent-loop.ts`：实现 ReAct 多轮循环。核心函数签名 `async function* runAgentLoop(initialMessages, toolHandlers, ctx, options { maxTurns: 5, signal })`。每轮逻辑：1）调用 chatStream(messages, { tools: getAllToolSchemas(toolHandlers) }) → 2）检测 LLM 响应是否有 tool_calls → 3）如果没有 tool_calls，yield { type: 'final', content } 终止循环；如果有 tool_calls，对每个 call 执行 handler.execute(args, ctx) 并把结果 append 到 messages（role='tool'），yield { type: 'tool_start/tool_end' } 事件，然后 continue 下一轮。超过 maxTurns 时追加 system 消息强制收尾。验证：给定 mock LLM（先返回 tool_call 再返回最终回答），循环正确执行两轮。
- [ ] 5.2 在 `agent-loop.ts` 中实现 citations 汇总：维护一个 allCitations 数组，遍历所有 tool_call 记录，只收集 name === 'rag_search' 的工具调用结果，JSON.parse 后合并到 allCitations。暴露 `getCitations(): Citation[]` 方法给调用方。验证：rag_search 被调用两次时，allCitations 包含两次结果。
- [ ] 5.3 修改 `backend/src/routes/agentMessages.ts` 的 chat 端点：原来的 streamRAG 调用替换为 runAgentLoop。SSE 事件映射：skill_load ← 动态技能选择阶段手动 yield；tool_start ← runAgentLoop 每轮 tool 执行前；message ← runAgentLoop 内部流式 LLM delta；tool_end ← runAgentLoop 每轮 tool 执行后；done ← runAgentLoop 返回 final 后携带汇总 citations；error ← catch 异常。验证：用真实 LLM 测试一个问题触发 rag_search 时，SSE 事件序列为 tool_start → tool_end → 多个 message → done。
- [ ] 5.4 废弃 `backend/src/lib/qa.ts` 中的硬编码 retrieveAndCite 调用：`buildRAGPrompt` 函数保留但去掉知识库片段拼接逻辑（或整个函数废弃），`answerWithRAG` 和 `answerWithRAGStream` 函数标记 deprecated 或删除。retrieveAndCite 函数本身保留（ragSearch handler 复用）。验证：qa.ts 导出列表中不再有 answerWithRAGStream。

## 6. Tool CRUD 路由

- [ ] 6.1 新建 `backend/src/routes/tools.ts`：实现 `GET /tools`（班级教师可见列表）、`GET /tools/:toolId`（班级教师详情含 inputSchema）、`POST /tools/:toolId/bind`（班级教师绑定到 agent）、`DELETE /tools/:toolId/bind`（解绑）、`DELETE /tools/:toolId`（删除并级联解除 agent_tools）。所有端点复用现有 guardClassTeacher / guardClassMember 守卫。验证：创建一个 tool 并绑定到 agent 后，agent_tools 表有对应记录。
- [ ] 6.2 修改 `backend/src/routes/agents.ts`：agent 列表和详情接口返回时，额外查询 agent 绑定的 tools 数组（toolId、name、description、source）。验证：GET /agents/:agentId 返回体中包含 tools 字段。

## 7. MCP 客户端（Phase 3）

- [ ] 7.1 新建 `backend/src/lib/mcp-client.ts`：实现 HTTP JSON-RPC 2.0 客户端。导出 `connect(serverConfig)` 函数 → 发送 initialize 方法验证连通性；`listTools(serverConfig)` → 发送 tools/list 返回远端工具数组；`callTool(serverConfig, toolName, args)` → 发送 tools/call 返回 content 数组。auth 按 auth_type 生成 HTTP headers（bearer → Authorization: Bearer xxx；api_key → 自定义 header；basic → Authorization: Basic base64(username:password)）。所有请求 10s 超时，失败时返回 `{ isError: true, error: '...' }`。验证：用自建 mcp-server 测试，能正确返回 tools/list 和 tools/call 结果。
- [ ] 7.2 实现 auth_config 的加密/解密：新建 `backend/src/lib/crypto.ts`，AES-256-GCM 加密，密钥从环境变量 `MCP_AUTH_ENCRYPTION_KEY` 读取。mcp_servers 表的 auth_config_json 在写入前加密、读取后解密。启动时预加载所有 MCP server 的明文凭据到内存 Map 中供 mcp-client 使用。验证：auth_config_json 存入 DB 后是密文，mcp-client 调 MCP server 时能用正确凭据。
- [ ] 7.3 新建 `backend/src/routes/mcpServers.ts`：实现 `POST /mcp-servers`（注册，班级教师）、`GET /mcp-servers`（列表，班级成员可读）、`GET /mcp-servers/:mcpServerId`（详情）、`GET /mcp-servers/:mcpServerId/test`（连通性测试，调 mcp-client.connect + initialize）、`POST /mcp-servers/:mcpServerId/import`（批量导入，调 mcp-client.listTools → 校验 name 冲突 → 批量写入 tools 表）、`DELETE /mcp-servers/:mcpServerId`（删除并级联删除引用 tool + agent_tools）。验证：对自建 mcp-server (http://mcp-server:8090) 执行 import 后，tools 表新增两条 calculate/convertUnit 记录。
- [ ] 7.4 在 Agent Loop 的 tool 执行分发逻辑中加入 mcp source 支持：当 tool.source === 'mcp' 时，从 mcp_servers 表获取配置 → 调 mcp-client.callTool → 提取 content[0].text 作为 tool 结果。验证：agent 绑定了 MCP 导入的 calculate 工具后，"帮我算 2*3" 能触发正确的 MCP 调用。

## 8. 全链路测试与清理

- [ ] 8.1 编写集成测试：覆盖 Phase 1 到 Phase 3 的完整链路。测试场景包括：skill 动态选择（教师创建 → 绑定 → Agent Chat 命中加载）、rag_search tool 触发（知识库有内容时能查到）、exponentiate tool 触发（"算一下 2^10" 得到 1024）、MCP calculate tool 触发（"算 2*3" 得到 6）。验证：`npm test` 所有新增用例通过。
- [ ] 8.2 更新 `backend/README.md` 或 `docs/` 中的 API 文档：新增 Skill 文件夹模型说明、Tool CRUD 端点、MCP Server 管理端点、SSE 新增事件类型。验证：文档能让新开发者理解完整 Agent 系统架构。
- [ ] 8.3 清理代码：删除 qa.ts 中废弃的 answerWithRAGStream 等导出、删除 agentMessages.ts 中旧的硬编码 RAG 路径、更新 package.json 中可能不再需要的依赖。验证：TypeScript 编译无 warning，`npm run build` 成功。

## 9. 前端适配与新功能 UI

- [ ] 9.1 更新 `frontend/src/types.ts`：Skill interface 删除 `prompt?: string`，改 `skillContent?: string`；新增 Skill 的 `version?: string`、`importSource?: string`、`importUrl?: string`、`triggers?: string[]`；Agent interface 新增 `tools?: { toolId: string; name: string; description: string; source: 'builtin' | 'mcp'; handlerKey?: string }[]`；新增 Tool interface（toolId, classId, name, description, inputSchema, source, handlerKey?, mcpServerId?, mcpToolName?, enabled, createdAt）；新增 McpServer interface（mcpServerId, classId, name, url, transport, authType, status, lastError, createdAt）。验证：TypeScript 编译无 error，旧的 Skill 使用 `prompt` 字段处能被 IDE 标红提示需要改。
- [ ] 9.2 修改 `frontend/src/pages/ClassDetailPage.tsx` — Skills 表单 breaking fix：`handleCreateSkill` / `handleUpdateSkill` 的 payload 从 `{ prompt: ... }` 改为 `{ skillContent: ... }`；`startEditSkill` 取值路径从 `skill.prompt` 改为 `skill.skillContent`；UI 上把 "Prompt" label 改成 "Skill Content (Markdown)"。验证：Skill 创建/编辑表单提交后后端返回 200 且 SKILL.md 正确生成。
- [ ] 9.3 修改 `frontend/src/pages/ClassDetailPage.tsx` — Skills tab 新增「导入」功能：在 Skills 列表头部加按钮 "+ 导入技能"，点击弹出折叠区域：支持 zip 文件上传（`<input type="file" accept=".zip">`）或 URL 输入框，提交时 FormData 方式调 `POST /skills/import`。验证：上传标准 zip 后列表出现新 skill，且能被 agent 绑定。
- [ ] 9.4 修改 `frontend/src/pages/ClassDetailPage.tsx` — Agents tab 新增 tools 选择：在 `handleCreateOrUpdateAgent` 的 payload 中加入 `toolIds` 字段；agent 编辑表单新增 toolIds 多选区（与 kbIds/skillIds 平行）；`startEditAgent` 中从 agent.tools 取值初始化 toolIds Set。验证：保存 agent 后 `GET /agents/:id` 返回的 tools 数组与选择一致。
- [ ] 9.5 修改 `frontend/src/pages/ClassDetailPage.tsx` — 新增 Tools tab（班级教师可见）：tab 内列表展示 tools（toolId, name, description, source tag, handlerKey）；每行右侧显示「绑定到 Agent」下拉（选班级 agent）；删除按钮；绑定状态已绑定的 tool 显示所属 agent 名。数据从 `GET /tools` 加载，绑定调 `POST /tools/:id/bind`。验证：绑定后 agent_tools 表有记录，agent 详情 tools 字段包含该 tool。
- [ ] 9.6 修改 `frontend/src/pages/ClassDetailPage.tsx` — 新增 MCP Servers tab（班级教师可见）：注册表单（name, url, authType none/bearer/api_key/basic, authConfig JSON 或对应字段）；列表显示 status（用 statusBadge 样式：connected green / error red / 未测试 gray）；每行有「测试连接」按钮（调 `GET /mcp-servers/:id/test`，成功时 status 变绿）；「批量导入」按钮（调 `POST /mcp-servers/:id/import`，成功后刷新 Tools tab）；删除按钮。验证：对自建 mcp-server 注册 → 测试成功 → 批量导入后 Tools tab 新增 calculate/convertUnit。
- [ ] 9.7 修改 `frontend/src/pages/AgentChatPage.tsx` — SSE handler 扩展：在现有 switch/if 里新增 `skill_load` 分支（console.log 或忽略）、`tool_start` 分支（设 `toolLoading` state 为 tool name，如 `{ toolLoading: 'rag_search' }`）、`tool_end` 分支（清掉 toolLoading）。这三个事件分支**不能抛异常**（即使字段缺失也要 try-catch 掉）。验证：触发 Agent Loop 时控制台可见 skill_load log，loading indicator 出现/消失正确。
- [ ] 9.8 修改 `frontend/src/pages/AgentChatPage.tsx` — agent sidebar 展示 tools：在现有 kbs/skills tag 列表后面，加 tools 的 span tag（🪛 {tool.name}，source tag 用不同颜色区分 builtin vs mcp）；toolLoading state 时在 sidebar 显示一行「🤖 正在调用 [rag_search]...」。验证：agent 绑定多个 tool 时 sidebar 正确展示，触发 tool_call 时 loading indicator 可见。
- [ ] 9.9 前端整体冒烟测试：打开 ClassDetail → 创建 Skill → 导入 zip Skill → 创建 Agent（绑定 kb + skill + tool）→ 进 Agent Chat → 提问触发 rag_search → 看 SSE 事件序列。验证：全链路无 console error、UI 正常、功能可用。