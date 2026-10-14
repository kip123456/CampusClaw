## 1. 数据库 Schema 与迁移

- [x] 1.1 在 `backend/src/db/schema.ts` 中新增 `skills`、`agents`、`agent_kbs`、`agent_skills`、`agent_conversations`、`agent_messages` 六张表的 CREATE TABLE 语句，写入 `schemaStatements` 数组末尾
- [x] 1.2 在 `initSchema()` 末尾新增迁移逻辑：逐表检查必需列是否存在，缺失则 `ALTER TABLE` 补齐（skills 无迁移必需，agents 需 visibility 列已有 CHECK，agent_messages 需 citations 列检查）
- [x] 1.3 执行 `npm run build` 然后启动服务器验证新表自动创建、旧数据不受影响

## 2. LLM 流式调用支持

- [x] 2.1 在 `backend/src/lib/llm.ts` 中新增 `chatStream(messages, signal?)` 函数：发起 stream=true 的 chat completions 请求，手动解析 SSE 流，同时提供 `AsyncIterable<string>`（delta 粒度）和最终完整 answer 的 Promise 接口；支持 AbortSignal
- [x] 2.2 用 LLM 网关做一次手动 curl 或简单 Node 脚本验证流式端点可用、delta.content 能正确解析；确认异常情况（delta.content 为 null、[DONE] 事件、连接中断）都有 try-catch 覆盖
- [x] 2.3 确认原有 `chat()` 函数完全不变（类型签名、错误行为、超时逻辑），跑一遍现有 `/kbs/qa` 非流式端点确保回归通过

## 3. RAG 逻辑抽取与重构

- [x] 3.1 从 `backend/src/lib/qa.ts` 的 `buildPrompt()` 和 `answerWithRAG()` 中抽取共享逻辑：新增 `buildRAGPrompt(chunks, question, options)` 导出函数（options 包含 systemPrompt 覆盖、skillPrompts 注入、自定义引用约束文案等）
- [x] 3.2 新增 `answerWithRAGStream()` 导出函数：复用共享检索 + prompt 构造逻辑 + 调用 llm.chatStream，返回同时包含 `AsyncIterable<{type: 'message', content: string}>` 事件流和最终 `Promise<QAResult>` 的对象
- [x] 3.3 将现有 `answerWithRAG()` 改为调用共享的 `buildRAGPrompt()` + 原有的非流式 `chat()`，功能保持完全一致（接口签名不变）；跑一遍现有 `/kbs/qa` 端点验证无回归

## 4. Skills 路由实现

- [x] 4.1 新建 `backend/src/routes/skills.ts`：实现创建（POST /:classId/skills）、列表（GET /:classId/skills）、详情（GET /:classId/skills/:skillId，教师含 prompt、学生不含）、更新（PUT /:classId/skills/:skillId）、删除（DELETE /:classId/skills/:skillId）五个端点；权限组合 guardClassMember / guardClassTeacher；name 唯一性校验；prompt 长度 4000 上限
- [x] 4.2 在 `server.ts` 中 import skillsRouter 并挂载到 `/api/classes`；重启后用 curl 验证各端点的 200/201/400/403/404/409 响应正确

## 5. Agents 路由实现

- [x] 5.1 新建 `backend/src/routes/agents.ts`：实现创建（POST /:classId/agents）、列表（GET /:classId/agents，学生只看 visibility="all"）、详情（GET /:classId/agents/:agentId，教师含 systemPrompt/kbIds/skillIds，学生不含）、更新（PUT /:classId/agents/:agentId，事务中先清旧关联再写新关联）、删除（DELETE /:classId/agents/:agentId，级联清 agent_kbs 和 agent_skills）五个端点；权限 guardClassMember / guardClassTeacher；visibility="teachers" 时学生请求返回 404（而非 403）
- [x] 5.2 在 `server.ts` 中 import agentsRouter 并挂载到 `/api/classes`；重启后用 curl 验证各端点的响应和事务原子性（更新 kbIds 中途出错不保留脏数据）

## 6. Agent QA 流式问答与对话历史

- [x] 6.1 新建 `backend/src/routes/agentMessages.ts`：实现 SSE chat 端点 `POST /:classId/agents/:agentId/chat`；执行完整 RAG 流程（收集 agent 绑定的 kbIds → 向量化 → 检索 → 构造 prompt → 流式调用 LLM → SSE 推送 message/done 事件）；agent 权限/visibility 二次校验；citations 包含所有 topK chunks
- [x] 6.2 在同一文件实现对话历史查询：`GET /:classId/agents/:agentId/conversations`（按当前用户过滤）和 `GET /:classId/agents/:agentId/conversations/:conversationId/messages`（按当前用户 + conversationId 校验）
- [x] 6.3 在 chat 端点中集成对话持久化：新对话自动创建 conversation 记录；user message 立即写入；流式完成后（成功或 error）写入 assistant message（含 citations JSON）；客户端断连时在 `res.on('close')` 中 abort LLM 并补存 assistant message
- [x] 6.4 在 `server.ts` 中 import agentMessagesRouter 并挂载到 `/api/classes`；用 curl + `--no-buffer` 模式验证 SSE 输出格式正确、done 事件包含完整 citations、断连后 conversation/messages 记录仍保留

## 7. 集成验证

- [x] 7.1 端到端走一遍完整流程：admin 创建班级 → 教师创建知识库 + 上传文档 + 索引 → 教师创建 skill → 教师创建 agent（绑定 KB + skill）→ 学生通过 agent 发起流式问答（curl 观察 SSE message/done 事件）→ 学生查看自己的对话历史 → 教师删除 skill 验证 agent_skills 关联自动清除
- [x] 7.2 执行完整构建 `npm run build` 确认无 TypeScript 错误，编译产物正常输出到 dist/
- [x] 7.3 回归测试：原有 `/kbs/qa` 非流式接口、`/kbs/query` 向量检索接口、班级成员管理接口均不受影响