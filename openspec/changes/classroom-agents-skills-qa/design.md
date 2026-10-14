## Context

CampusClaw 后端使用 TypeScript + Express + SQLite (better-sqlite3) + ChromaDB（内置模式）。现有 RAG 流程集中在 `backend/src/lib/qa.ts`（非流式）和 `backend/src/lib/llm.ts`（非流式 chat 函数）。数据库 schema 通过 `initSchema()` 在启动时自动建表和迁移（ALTER TABLE 补列）。路由按资源分文件，统一挂载到 `server.ts`。权限控制通过 `authMiddleware` + 组合 guard 函数（`guardClassMember`、`guardClassTeacher`、`guardSchool`）实现。

当前 LLM 调用走 OpenAI 兼容的 `/chat/completions` 端点，配置来自 `.env`（`LLM_BASE_URL`、`LLM_MODEL`、`LLM_API_KEY`）。流式响应需在同一个端点上加 `stream: true`，服务端需手动解析 SSE 流并按块推送给客户端。

## Goals / Non-Goals

**Goals:**
- 新增技能（skills）和智能体（agents）两层配置实体，均绑定到班级作用域
- 智能体问答支持流式 SSE，同时保留完整的 RAG 引用能力
- 问答历史持久化到 SQLite，支持按用户隔离的对话历史查询
- 复用现有向量检索和 RAG prompt 构造逻辑，不重复造轮子
- 数据库迁移在启动时自动执行，保证向后兼容

**Non-Goals:**
- 不实现多模态问答（图片、文件上传等仍走现有材料上传流程）
- 不实现智能体之间的相互调用或工作流编排
- 不实现 LLM 响应的服务端缓存
- 不迁移或废弃原有的 `/kbs/qa` 非流式接口（两个接口并行共存）
- 前端 UI 不在本次 change 的实现范围内

## Decisions

### D1: 数据库 schema 设计

新增 6 张表，全部使用 better-sqlite3 的 `CREATE TABLE IF NOT EXISTS` + 启动时手动检查列存在性的迁移模式（与现有 knowledge_bases/kb_documents 的迁移风格一致）：

- `skills`（id TEXT PK, class_id TEXT FK→classes, name TEXT, prompt TEXT, description TEXT, created_at INTEGER）。UNIQUE(class_id, name)
- `agents`（id TEXT PK, class_id TEXT FK→classes, name TEXT, description TEXT, system_prompt TEXT, visibility TEXT CHECK IN('all','teachers'), created_at INTEGER）。UNIQUE(class_id, name)
- `agent_kbs`（agent_id TEXT FK→agents, kb_id TEXT FK→knowledge_bases, PRIMARY KEY(agent_id, kb_id)）。级联删除
- `agent_skills`（agent_id TEXT FK→agents, skill_id TEXT FK→skills, PRIMARY KEY(agent_id, skill_id)）。级联删除（删除 skill 时自动清关联）
- `agent_conversations`（id TEXT PK, agent_id TEXT FK→agents, user_id TEXT FK→users, created_at INTEGER, last_message_at INTEGER）。索引 (agent_id, user_id)
- `agent_messages`（id TEXT PK, conversation_id TEXT FK→agent_conversations, role TEXT CHECK IN('user','assistant'), content TEXT, citations TEXT, created_at INTEGER）。citations 为 JSON 字符串，assistant 消息存储；user 消息为 NULL。索引 (conversation_id, created_at)

### D2: 流式 LLM 客户端设计

在 `backend/src/lib/llm.ts` 中新增 `chatStream(messages, options)` 函数，返回 `AsyncIterable<string>`（或同时接受 `onChunk?: (delta: string) => void` 回调 + 最终完整 answer resolve）。

实现方式：
1. 调用 OpenAI 兼容 chat completions 端点，body 加 `stream: true`
2. 读取 `res.body`（ReadableStream），按 SSE 协议逐行解析（每行 `data: {...}`，以 `\n\n` 分隔事件）
3. 解析 JSON 中 `choices[0].delta.content`，累积成完整 answer 同时按 delta 粒度推送给上层
4. 支持 `AbortSignal`，abort 时立即 `controller.abort()` + `reader.cancel()`

保留原有 `chat()` 函数完全不变。新的 `chatStream()` 独立实现，不影响旧调用方。

**替代方案**：用第三方 SSE 解析库（如 `eventsource-parser`）。选择手写解析因为 SSE 协议极简单（只需识别 `data:` 前缀和 `[DONE]` 结束标记），引入依赖不必要。

### D3: RAG 逻辑抽取与 prompt 构造

将现有 `qa.ts` 的 `answerWithRAG()` 拆为两层：
1. 共享层：`buildRAGPrompt(chunks, question, options: { systemPrompt?: string, skillPrompts?: string[] })` — 统一的 prompt 构造
2. 非流式封装：`answerWithRAG()` 保持原签名，调用共享层 + 非流式 chat
3. 流式封装：`answerWithRAGStream()` — 调用共享层 + 流式 chat，返回 `AsyncIterable<{type, content}>` 事件流

智能体 prompt 拼接规则：
- system = `(agent.systemPrompt ?? '') + '\n' + RAG固定约束`
- user = `技能描述块（若有绑定的 skills）` + `知识库片段块` + `问题`

### D4: 对话历史存储时机

在 `agent_qa.ts` 路由层处理：
- 若请求无 `conversationId` → 先创建 conversation 记录
- 将 user message 立即写入
- 启动流式调用
- 流式结束后（成功或 error）将 assistant message（含 citations）写入

这样即使客户端中途断开，user message 已持久化，assistant message 也能在收到部分内容后落盘（D5 处理这种情况）。

### D5: 客户端断连处理

Express 中通过 `req.on('close')` 监听连接关闭事件。一旦触发：
- 设置 AbortController 让 LLM 流式调用立即中止
- 将已累积的 answer 文本 + citations 存入 assistant message
- 无需额外回滚——部分 answer 对用户仍有价值

### D6: 路由组织

新增三个路由文件，都挂载到 `server.ts`：
- `backend/src/routes/skills.ts` — `/api/classes/:classId/skills` 下所有 CRUD
- `backend/src/routes/agents.ts` — `/api/classes/:classId/agents` 下 agent CRUD + visibility 过滤
- `backend/src/routes/agentMessages.ts` — `/api/classes/:classId/agents/:agentId/chat`（SSE）+ conversations/messages 查询

权限 guard 复用现有组合：教师创建/更新/删除用 `guardClassTeacher`，学生查看用 `guardClassMember`。智能体可见性（visibility="teachers"）在业务代码里二次校验（不在 guard 层，因为 guard 只校验"是否成员"，visibility 是成员内的细粒度控制）。

### D7: 技能在 prompt 中的注入方式

技能的 prompt 模板在构造智能体问答 prompt 时，以"可用技能"的形式注入 user prompt：

```
## 可用技能
- 【{skill.name}】：{skill.description}
  Prompt:
  {skill.prompt}

请在回答中灵活运用上述技能。
```

LLM 根据技能的 name/description/prompt 自主决定何时参考和使用。这比在后端做显式 function call 更轻量，也更符合现有无工具调用的 RAG 架构。

## Risks / Trade-offs

- **[风险] SSE 实现可能有兼容性问题**：不同 LLM 网关对 OpenAI 流式协议的实现细节有差异（有些不支持 `stream_options`、有些 `delta.content` 为 null 表示 tool call 而非内容）。→ 缓解：先只解析 `delta.content` 字段，遇到 null 跳过，`[DONE]` 事件作为结束标记。加充分的 try-catch 并记录原始 SSE 数据以便调试。

- **[风险] 长对话历史积累**：频繁问答会让 `agent_messages` 表增长较快。→ 缓解：SQLite 百万级记录量足够支撑（单机场景），且对话默认按用户隔离查询，不需要全表扫描。可后续考虑加按月归档。

- **[风险] 流式 Abort 处理不当可能泄漏连接**：Express 的 `req.on('close')` 在正常关闭时也会触发。→ 缓解：使用 `req.res.on('close')`（响应关闭）或标记一个 `finished` flag，只在未正常完成时 abort LLM 调用。

- **[取舍] 不实现真正的 function calling**：技能只是 prompt 注入而非后端可执行工具。如果后续需要真正的工具执行（如"查成绩"、"调课表"），需要扩展技能类型和后端路由。当前方案的优点是简单、即时可用。

- **[取舍] citations 存储为 JSON 字符串而非独立表**：对话历史主要用于查看，不做结构化查询。JSON 存储简化 schema，避免额外的 joins。如果后续需要"列出所有引用了某个文档的回答"再考虑拆表。