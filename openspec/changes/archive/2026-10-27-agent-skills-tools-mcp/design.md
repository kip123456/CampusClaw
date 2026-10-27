## Context

当前 backend 的核心问答链路在 `qa.ts` 中硬编码了三步：`retrieveAndCite(question)` → `buildRAGPrompt(citations, question)` → `chatStream(messages)`。Skills 以纯文本 Prompt 列存数据库，无文件夹结构、无动态加载、无按需触发。LLM API 调用不支持 `tools` 参数。自建 mcp-server 作为独立服务存在于 `mcp-server/` 目录，但 backend 没有客户端消费它。

项目现有技术栈：TypeScript + Express + SQLite (better-sqlite3) + ChromaDB + OpenAI 兼容 LLM API + better-sqlite3 embed。无外部 npm 依赖需引入。

权限守卫已有成熟模式：`authMiddleware` + `guardClassTeacher` / `guardClassMember` / `requireRole`，所有新路由直接复用。

存储方面，backend 已有 `storage/` 目录（存知识库原文和分块），新 skills 文件夹模型也落在此目录下，不引入新存储位置。

## Goals / Non-Goals

**Goals:**
- Skill 从纯 DB Prompt 列迁移为文件夹 + SKILL.md frontmatter 模型，支持动态加载和外部导入
- Agent Chat 从硬编码前置 RAG 改为 Agent Loop ReAct 多轮驱动，LLM 通过 rag_search tool 自主决定查不查知识库
- Tool 系统独立于 Skill，支持 builtin handler 和 mcp source 两种来源
- LLM API 调用支持 tools 参数并解析 tool_calls 响应
- SSE 协议扩展 tool_start/tool_end/skill_load 事件让前端可视化
- 外部 MCP Server 注册/测试/批量导入，班级级别隔离，教师专属

**Non-Goals:**
- 不支持 MCP stdio 传输（Phase 3 只做 HTTP）
- 不实现 stdio 工具进程 spawn 逻辑
- 不做 skills 的 scripts/ 动态执行（Phase 1 先支持文件夹存盘，但 LLM 不能调 scripts）
- 不做 skills 的 references/ 按需懒加载（Phase 1 把 references 跟 SKILL.md 一起加载，后续可优化）
- 不实现 OAuth2 认证流程（MCP auth_type 只做 none/bearer/api_key/basic）
- 不实现 Skill 同步/版本控制（比如技能更新后自动通知所有绑定的 agent）
- 不做 LLM 路由优化（用小模型先分类再调主模型，Phase 1 只用向量检索）
- 不做前端完整重写（只改必要的 breaking payload + 新增 Tool/MCP 管理 UI）
- 前端 SSE 可视化只做最小化 loading indicator，不做完整的 Agent execution trace panel

## Decisions

### 1. Agent Loop 替代硬编码 RAG

**决定**：`qa.ts` 的 `streamRAG` generator 被废弃，代之以 `agent-loop.ts` 中的 `runAgentLoop` 函数。Agent Loop 内部首次 LLM 调用带上所有 agent 绑定的 tools（含 rag_search），后续轮次根据 LLM 返回的 tool_calls 执行 handler 并把结果喂回。

**替代方案**：在 streamRAG 内部保留 retrieveAndCite 但设为可选参数 → 否决，因为那样只是把"查不查 RAG"变成布尔开关，没有 ReAct 的多轮灵活性。

### 2. rag_search 作为 builtin tool 而非硬编码逻辑

**决定**：把 `retrieveAndCite` 包装成一个标准 Tool handler，注册到 Tool 注册表，让 LLM 在 Agent Loop 中自主决定是否调用。handler 内部需要 ctx.agentKbIds（agent 绑定的知识库列表），由 Agent Loop 在构建 ctx 时传入。

**citations 汇总**：Agent Loop 执行完毕后，遍历所有 tool_call 记录，只收集 rag_search 调用的结果，合并成 done 事件的 citations 数组。

### 3. Skill 动态选择：向量检索 + triggers 关键词

**决定**：用用户问题的 embedding 与每个 skill 的 description 做余弦相似度，加上 triggers 命中加分（每个 hit +0.2），取 top-3 得分最高的 skill。如果 agent 绑定的 skill 总数 ≤ 3 直接跳过检索全加载。

**替代方案**：
- LLM 自路由（让小模型返回 JSON 说用哪几个）→ 否决，多一次 LLM 调用延迟 + 成本，向量检索零开销够用
- 硬编码全加载 → 否决，技能多时 prompt 膨胀严重

### 4. 内部 Skill 也对齐 MCP 命名风格

**决定**：Skill 的 name 字段统一用 snake_case（小写 + 下划线），Tool 的 handler_key 也是 snake_case。与 MCP tools/list 返回的 name 格式一致。自建 API 时后端自动处理格式校验。

### 5. 自建 Skill 的最小化体验

**决定**：教师创建 Skill 只填 `name + description + skillContent`（skillContent 是纯 Markdown 指令正文），后端自动包装成标准 SKILL.md（自动生成 YAML frontmatter，version 默认 1.0.0，triggers 默认为空数组）。**不提供在线编辑 frontmatter 的 UI 字段**——如果需要自定义 triggers/version，建议教师走 import（先本地写好 SKILL.md 再 zip 上传）。

**替代方案**：提供完整的 frontmatter 表单 → 否决，MVP 阶段增加了 UI 和 API 复杂度，收益不明显。

### 6. Tool handler 注册表设计

**决定**：`src/lib/tools/registry.ts` 用 Map 存储 handler，通过模块 import 副作用在启动时注册。类似 Fastify 的 plugin 注册模式。每个 handler 是 plain object（无 class 继承）：`{ name, description, schema, execute }`。

**替代方案**：用 abstract class BaseTool → 否决，过度工程，4 个 builtin handler 不需要继承体系。

### 7. 数据库 schema 迁移策略

**决定**：首次部署时执行一次性迁移脚本：
1. 新建 tools、agent_tools、mcp_servers 三张表
2. 从 skills 表读取所有现有记录，为每条生成标准 SKILL.md 写入 `storage/skills/<id>/SKILL.md`
3. 给 skills 表新增 storage_path、version、triggers_json、import_source、import_url 列并填值
4. 删除 skills 表的 prompt 列（或先 rename 保留备份，观察一个部署周期再删）

**替代方案**：双写过渡期间同时存 DB prompt 列和磁盘 → 否决，增加维护复杂度，迁移脚本本身是一次性的，不值得双写成本。

### 8. MCP auth_config 加密

**决定**：用 Node.js 内置 `crypto` 模块 + AES-256-GCM 加密存储在 mcp_servers 表。加密密钥从环境变量 `MCP_AUTH_ENCRYPTION_KEY` 读取（32 字节 hex 字符串）。如果环境变量未设置，启动时报错终止（fail-fast）。每次启动时预加载明文凭据到内存 Map 中，避免每次 HTTP 请求都解密。

**替代方案**：直接明文存 → 否决，凭据不应明文入库。用第三方加密库（如 `@ronomon/crypto-async`）→ 否决，Node.js 内置足够，减少依赖。

### 9. Agent Loop 的 streaming 设计

**决定**：Agent Loop 内部每次 LLM 调用都走 `chatStream`，但在 tool_call 轮次中会**等待整个 tool 执行完毕后再推送下一轮 LLM 的 message 事件**。tool_start/tool_end 事件在 tool 执行前后立即推送。如果 LLM 在第二轮中又发起 tool_call，继续上述循环。这意味着中间可能有较长时间没有 message 事件（tool 执行耗时），但 SSE 连接通过 tool_start/tool_end 事件保持活跃。

**替代方案**：在 tool 执行期间持续推送心跳注释（`: tool executing... \n\n`）→ 否决，SSE spec 注释格式前端通常不处理，不如 tool_start/tool_end 有实际内容。

### 10. 前端与后端同步部署策略

**决定**：前后端**同一个 release 部署**，不做过渡期兼容。后端 Skill API 的 payload 字段从 `prompt` 改为 `skillContent` 是 breaking change，旧前端发 `prompt` 会被后端校验拒绝。同时部署可以避免中间状态的问题。

**替代方案**：后端同时接受 `prompt` 和 `skillContent`（一段时间内双字段兼容）→ 否决，增加后端校验复杂度，且过渡期会引入 confusion（前端该发哪个？）。双兼容带来的稳定性收益不如一次干净切换。

**具体做法**：
- 前端 Skill 表单 `handleCreateSkill` / `handleUpdateSkill` 的 payload 改字段名
- 前端 Skill 列表/详情的 `skill.prompt` 取值路径改成 `skill.skillContent`
- 前端新增 SSE 事件处理分支：`skill_load` 可忽略（纯 log），`tool_start` 时设置 `{ toolLoading: 'rag_search' }` state 显示 loading indicator，`tool_end` 时清除
- 前端不引入新 npm 依赖（axios 已有文件上传能力，react-router-dom 已有）

### 11. 前端 UI 增量 vs 重构

**决定**：所有新功能以"在现有页面上加 tab / 加按钮 / 加表单"的增量方式实现，不重构前端组件结构。具体：
- `ClassDetailPage` 加两个新 tab：Tools 和 MCP Servers（与 Skills/Agents/Materials/Kbs/Members 平行，班级教师可见）
- AgentChatPage 的 sidebar 已有 kbs/skills tag，增加 tools tag 即可
- Skill 创建表单增加「导入 zip / URL」区域（可折叠展开）

**替代方案**：抽离独立的 SkillManager / ToolManager 组件 → 否决，当前前端代码量小（每个页面 300-500 行），增量改动比组件拆分更快速、更不易引入回归。

## Risks / Trade-offs

**[RAG 质量下降]** → rag_search 变成 tool 后，LLM 可能忘记在合适时机调用，或调用关键词不准确。**Mitigation**：rag_search 的 tool description 要写得非常详细（"当需要查阅课程资料、教材内容、课堂讲义等时调用"），让 LLM 容易判断触发条件。agent system prompt 可额外加一句 "如果你的回答依赖知识、数据或事实，请先调用 rag_search"。

**[Agent Loop token 消耗]** → 多轮 tool_call 每轮都把历史 messages 传给 LLM，token 消耗比单轮 RAG 可能增加。**Mitigation**：设置 5 轮上限；系统只给 agent 传最近 N 轮（默认 10）对话历史；tool 结果超过 2000 tokens 时截断。

**[Agent Loop 延迟]** → 每轮 tool_call 至少增加一次 HTTP 调用延迟（如果是 MCP tool）。**Mitigation**：builtin tool handler 是同步 SQLite 查询，延迟 <10ms；MCP tool 允许 30s 超时但会早返回错误给 LLM 重试。

**[Skill 文件夹完整性脆弱性]** → 文件被手动删除或损坏后 DB 还有记录。**Mitigation**：后端启动时扫描 storage/skills/ 校验完整性，异常记录标记为 disabled；动态选择时跳过 disabled skill；后端提供健康检查 API。

**[向量检索选 skill 的准确性]** → description 短且无语义区分时向量相似度不准。**Mitigation**：triggers 关键词加分弥补；description 字段设计时引导教师写语义丰富的描述（API 文档和前端占位符提示）。

**[MCP 外部服务不稳定]** → 第三方 MCP Server 可能挂掉、限流、超时。**Mitigation**：每次 Agent Loop 中 tool_call 失败不终止循环，把错误喂回 LLM 让它决定；mcp_servers.status 字段标记 connectivity 状态，agent 可选择性跳过 disabled server 的 tool。

## Migration Plan

1. 备份 SQLite 数据库文件和 storage/skills/ 目录
2. 停止 backend 和 frontend 服务
3. 执行数据库迁移脚本：建新表 → 迁移 skills 记录到磁盘 → 给 skills 表加新列并填值 → 删除 prompt 列
4. 配置环境变量 MCP_AUTH_ENCRYPTION_KEY（如果 Phase 3 才上线 MCP，可以先不配）
5. 部署新版本 backend，启动后校验：Agent Chat 能正常工作、rag_search tool 能查知识库、旧 skills 的 SKILL.md 文件存在且可解析
6. **同步部署新版本 frontend**（与 backend 同一次 release）：前端 types.ts + ClassDetailPage.tsx + AgentChatPage.tsx 已改好 breaking payload 和新增 UI
7. 冒烟测试：Skill 创建 → Agent Chat（触发 rag_search）→ 教师导入 MCP → 批量导入 tool → agent 绑定 tool → Agent Chat 触发 tool_call

**回滚策略**：如果新版本 Agent Chat 不工作，先恢复 prompt 列（迁移脚本已 rename 而非 drop），回滚前后端代码到旧版本。skills 的磁盘文件保留，后续再做完整迁移。

## Open Questions

- rag_search 的 topK 上限是继续用请求里的值还是固定 10？spec 里写的是上限 10，但现有 agent-qa 的 topK 上限是 15。可以后续根据实际使用调整，不影响当前 spec。
- 自建 mcp-server 的 calculate 和 convertUnit 工具要不要也被导入成班级 tool？可以在 Phase 3 集成测试时处理。
- rag_search 的 tool description 具体写什么内容最能引导 LLM 正确触发？需要实际运行后调优，当前 spec 只要求 handler 行为正确。