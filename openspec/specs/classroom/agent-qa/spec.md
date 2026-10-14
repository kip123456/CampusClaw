## Purpose

让班级成员（教师和学生）能够通过智能体发起问答，问答流程复用 RAG（先检索绑定的知识库，再调用 LLM 生成回答），回答通过 SSE 流式返回以改善长回答的交互体验；每条问答的 question、answer 和 citations 持久化存储，方便后续回顾和引用。

## ADDED Requirements

### Requirement: 通过智能体发起流式问答

班级成员（teacher 和 student）以及 admin MUST 能够通过 `POST /api/classes/:classId/agents/:agentId/chat` 发起问答。请求 body MUST 包含 `message`（用户问题，必填），可选包含 `topK`（默认 5，上限 15）、`conversationId`（续接已有对话，可选）。系统 MUST 校验智能体存在、属于指定 classId、且当前用户有权访问（visibility 约束）。

问答流程 MUST 执行：读取智能体配置 → 收集所有绑定知识库的 kbIds → 对问题做向量化 → 在知识库联合空间检索 topK chunks → 以智能体的 systemPrompt + 检索到的 chunks 构造 prompt → 调用 LLM 流式 chat completions → 通过 SSE 逐步推送 answer token → 结束后在 SSE 中推送最终 citations 列表。

#### Scenario: 班级成员成功发起流式问答
- **WHEN** 班级成员通过合法智能体发送问题
- **THEN** 系统返回 HTTP 200，Content-Type 为 `text/event-stream`，逐步推送 LLM 回答

#### Scenario: 学生对教师专用智能体发起问答
- **WHEN** 学生用户对 visibility="teachers" 的智能体发起问答
- **THEN** 系统返回 HTTP 404 Not Found（与不存在一致）

#### Scenario: 智能体不存在或不属于该班级
- **WHEN** 指定的 agentId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: message 为空
- **WHEN** 请求的 message 为空字符串或不存在
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: topK 超出上限
- **WHEN** 请求的 topK > 15
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: 智能体未绑定任何知识库
- **WHEN** 智能体没有绑定任何 kbIds
- **THEN** 系统仍执行问答流程，但 prompt 中知识库片段为空，模型应如实说明"知识库中没有相关内容"（复用现有 RAG prompt 的空 KB 逻辑）

#### Scenario: LLM 未配置
- **WHEN** LLM_BASE_URL 或 LLM_MODEL 未设置
- **THEN** 系统返回 HTTP 503 Service Unavailable

### Requirement: SSE 流式协议

问答接口 MUST 使用 SSE（Server-Sent Events）协议。事件格式 MUST 为 `data: <json>\n\n`。

系统 MUST 推送以下事件类型：
- `message`：LLM 生成的增量回答片段（`{ "type": "message", "content": "..." }`）。每收到 LLM 的一个 delta token 或一段文本即推送一次。
- `done`：LLM 完成后推送的最终事件（`{ "type": "done", "answer": "完整回答文本", "citations": [...] }`）。包含完整的 answer 和引用片段列表。
- `error`：发生错误时推送（`{ "type": "error", "message": "错误描述" }`），推送后连接关闭。

在所有 message 事件推送完毕后，系统 MUST 推送一条 `done` 事件，再关闭连接。

#### Scenario: 正常流式问答的事件序列
- **WHEN** LLM 正常流式返回内容
- **THEN** SSE 输出依次为：零到多个 `message` 事件，最后一个 `done` 事件，然后连接关闭

#### Scenario: 引用片段在 done 事件中返回
- **WHEN** LLM 完成流式回答
- **THEN** `done` 事件中的 citations 数组 MUST 包含所有 topK 检索到的 chunks，结构与现有 qa.ts 的 Citation 接口一致（id、chunk、documentId、originalName、chunkIndex、startOffset、endOffset）

#### Scenario: LLM 流式中途出错
- **WHEN** LLM 流式响应过程中发生错误
- **THEN** 系统推送一条 `error` 事件后关闭连接，并将已收到的部分 answer 与 citations 一起存入对话记录（避免丢失上下文）

#### Scenario: 客户端断开连接
- **WHEN** 客户端在流式传输过程中断开
- **THEN** 服务器 MUST 检测到连接关闭并立即停止 LLM 调用（通过 abort signal），避免浪费资源。已产生的对话记录不回滚

### Requirement: 智能体问答的 prompt 构造

问答的 system prompt MUST 按以下优先级拼接：
1. 智能体自身配置的 systemPrompt（若存在）
2. 固定的 RAG 行为约束（复用现有 qa.ts 的 system prompt 中的引用规则、诚实说明规则）

若智能体配置了 systemPrompt，它 MUST 作为基础前缀，之后拼入 RAG 约束。user prompt MUST 包含编号后的知识库片段（每个片段以 `[N] chunk_text` 开头）和用户的问题。

#### Scenario: 智能体有自定义 system prompt
- **WHEN** 智能体配置了非空的 systemPrompt
- **THEN** 最终 system prompt = 智能体自定义 prompt + 换行 + 固定 RAG 约束

#### Scenario: 智能体无自定义 system prompt
- **WHEN** 智能体的 systemPrompt 为 null 或空字符串
- **THEN** 最终 system prompt = 固定 RAG 约束（与现有非流式 qa 接口完全一致）

#### Scenario: 智能体绑定了技能
- **WHEN** 智能体绑定了一个或多个技能
- **THEN** 构造 prompt 时，MUST 读取所有绑定技能的 prompt 模板，在 user prompt 中作为"可用技能"部分注入，让 LLM 了解可用的工具/能力

### Requirement: 智能体对话历史持久化

每次通过智能体发起的问答 MUST 持久化到数据库。系统 MUST 创建 conversation（对话会话）和 message（消息）两层结构。每次问答至少存储一条 user 消息和一条 assistant 消息。

assistant 消息 MUST 包含最终 answer 文本和 citations JSON。citations 以 JSON 数组形式存入数据库。

#### Scenario: 新对话自动创建
- **WHEN** 用户发起问答时未提供 conversationId
- **THEN** 系统自动创建一条 conversation 记录，第一条 message 为 user question，第二条为 assistant answer + citations

#### Scenario: 续接已有对话
- **WHEN** 用户发起问答时提供了有效的 conversationId（属于当前 agentId 和当前用户）
- **THEN** 系统在该 conversation 下追加 user 消息和 assistant 消息

#### Scenario: citations 持久化
- **WHEN** 流式回答完成
- **THEN** assistant 消息记录中 citations 字段 MUST 存储完整的 citations JSON 数组

#### Scenario: 中途断开连接后的持久化
- **WHEN** 流式传输中途客户端断开
- **THEN** 已收到的部分 answer MUST 仍存入 assistant 消息记录，citations 也存入

### Requirement: 查询智能体对话历史

班级成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/agents/:agentId/conversations` 列出自己在该智能体下的所有对话会话。每个用户 MUST 仅能看到自己发起的对话。

#### Scenario: 用户获取自己的对话列表
- **WHEN** 班级成员请求
- **THEN** 返回当前用户在该 agentId 下的 conversation 数组，每条包含 conversationId、agentId、createdAt、lastMessageAt、messageCount

#### Scenario: 用户尝试查看他人对话
- **WHEN** 非对话发起者尝试通过 conversationId 获取详情
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 查询对话消息

班级成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/agents/:agentId/conversations/:conversationId/messages` 获取某条对话的完整消息列表。每个用户 MUST 仅能获取自己发起的对话。返回消息 MUST 包含 role（`"user"` 或 `"assistant"`）、content、citations（仅 assistant 消息有）、createdAt。

#### Scenario: 用户获取自己的对话消息
- **WHEN** 用户请求自己发起的 conversation
- **THEN** 返回该对话的消息数组，按时间升序排列，assistant 消息包含 citations

#### Scenario: 用户尝试查看他人对话的消息
- **WHEN** 非发起者请求 conversation
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 流式 LLM 调用与复用

LLM 客户端 MUST 支持流式 chat completions（使用 OpenAI 兼容 SSE 协议，设置 `stream: true`）。流式调用 MUST 接受一个回调函数或返回一个异步迭代器，让上层可以按 token 推送 SSE 事件。非流式的 `chat()` 函数 MUST 保持不变，旧的 `/kbs/qa` 非流式接口继续使用它。

#### Scenario: 流式调用正常返回
- **WHEN** 上层调用流式 chat 方法
- **THEN** 方法 MUST 通过回调或迭代器按顺序产生 LLM 的 delta 内容，完整 answer 在一次 promise resolve 中返回

#### Scenario: 流式调用支持 abort
- **WHEN** 传入 AbortSignal 到流式 chat 方法
- **THEN** abort 时必须立即停止读取响应体和解析 SSE 流