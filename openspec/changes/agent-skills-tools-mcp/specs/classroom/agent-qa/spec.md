## ADDED Requirements

### Requirement: Agent Loop 多轮工具调用

问答流程 MUST 以 ReAct 多轮循环为核心驱动：系统首先构建 LLM 的 system + history +（动态选中的 skills）+ 用户问题，然后进入最多 5 轮的思考-执行循环。在每轮中，LLM MAY 返回纯文本最终回答（循环终止）、或返回一个或多个 `tool_calls`（循环继续）。系统执行所有 tool_call 对应的 handler（builtin 或 MCP），将执行结果包装成 `role='tool'` 的消息追加到 LLM messages 中，然后发起下一轮 LLM 调用。循环在以下任一条件下终止：1）LLM 返回纯文本无 tool_calls；2）达到 5 轮上限后强制收尾；3）用户中断。

#### Scenario: LLM 直接回答（不需要工具）
- **WHEN** 用户问题不需要查询知识库或调用任何工具
- **THEN** LLM 第一轮返回纯文本最终回答，循环 1 轮即终止

#### Scenario: LLM 需要调用单个工具
- **WHEN** 用户问题是 "帮我算一下 2 的 10 次方"
- **THEN** 第一轮 LLM 返回 tool_call 指向 exponentiate handler，执行后第二轮 LLM 收到结果，返回最终回答

#### Scenario: LLM 需要串联多个工具
- **WHEN** 用户问题需要先查知识库再查课程资料才能回答
- **THEN** LLM 可能连续发起多个 tool_calls（rag_search → list_class_materials → 再 rag_search 精查），每轮执行后继续思考直到获得足够信息输出最终回答

#### Scenario: 超过最大轮数
- **WHEN** Agent Loop 执行达到 5 轮上限仍未获得最终回答
- **THEN** 系统 MUST 追加一条 system 消息提示已用完工具调用次数，请基于已有工具结果给出最终回答，然后发起最后一轮 LLM 调用

#### Scenario: 某个工具执行失败
- **WHEN** 某个 tool_call 的 handler 抛异常或返回错误
- **THEN** 系统 MUST 将错误信息包装成 tool 结果（`isError: true`）喂回 LLM，让 LLM 决定是否尝试其他方式

### Requirement: SSE 流式协议扩展

SSE 事件类型 MUST 扩展为以下 5 种：

1. `skill_load`：动态技能选择命中并加载某个技能时推送（`{ "type": "skill_load", "skillName": "essay-grader" }`），在 LLM 第一次调用前推送。可选。
2. `tool_start`：Agent Loop 开始执行某个 tool_call 前推送（`{ "type": "tool_start", "toolName": "rag_search", "argsPreview": "{query:\"英语作文评分标准\"}" }`）。
3. `message`：LLM 生成的增量回答片段，与现有行为一致。
4. `tool_end`：tool_call 执行完成后推送（`{ "type": "tool_end", "toolName": "rag_search", "success": true, "resultPreview": "[3条片段]" }`）。
5. `done` / `error`：与现有行为一致。

SSE 事件序列的典型模式：`skill_load* → (tool_start → tool_end → (message*))* → done` 或 `skill_load* → message* → done`。

#### Scenario: LLM 调工具的完整事件序列
- **WHEN** LLM 在 Agent Loop 中调用 rag_search 后再流式输出最终回答
- **THEN** SSE 事件序列为：tool_start(rag_search) → tool_end(rag_search) → 多个 message 事件 → done

#### Scenario: 纯 LLM 回答的事件序列
- **WHEN** LLM 不需要调用任何工具直接回答
- **THEN** SSE 事件序列为：skill_load*(可选) → 多个 message 事件 → done

### Requirement: citations 来源改为 rag_search tool 结果

agent-chat 响应和持久化中的 citations 数组 MUST 从 Agent Loop 中所有 `rag_search` tool 调用的返回结果汇总而来，而不是在 prompt 构造时静态确定。如果 Agent Loop 中没有 rag_search 调用，citations MUST 为空数组。done 事件中的 citations 结构 MUST 保持向后兼容（id、chunk、documentId、originalName、chunkIndex、startOffset、endOffset）。

#### Scenario: LLM 多次调用 rag_search
- **WHEN** Agent Loop 中 LLM 先后发起了两次 rag_search 调用
- **THEN** done 事件中的 citations MUST 包含两次调用返回的所有片段，以调用先后顺序排列

#### Scenario: 没有 rag_search 调用
- **WHEN** Agent Loop 全程没有触发任何 rag_search
- **THEN** done 事件中的 citations 为空数组 `[]`

## MODIFIED Requirements

### Requirement: 通过智能体发起流式问答

班级成员（teacher 和 student）以及 admin MUST 能够通过 `POST /api/classes/:classId/agents/:agentId/chat` 发起问答。请求 body MUST 包含 `message`（用户问题，必填），可选包含 `topK`（默认 5，上限 15，作为 rag_search tool 的默认参数）、`conversationId`（续接已有对话，可选）。系统 MUST 校验智能体存在、属于指定 classId、且当前用户有权访问（visibility 约束）。

问答流程 MUST 执行：读取智能体配置（system_prompt、绑定的 skills、绑定的 tools、绑定的 kbs）→ 动态技能选择（向量检索 + triggers 关键词，见 classroom/skills delta spec）→ 加载选中的 skill 完整内容 → 构建 LLM messages 和 tools 参数 → 启动 Agent Loop（最多 5 轮 ReAct 循环）→ 每轮通过 SSE 推送 tool_start/tool_end/message 等事件 → 循环终止后推送 done 事件（包含汇总后的 citations）。

系统 MUST NOT 在 Agent Loop 启动前执行任何硬编码的知识库检索，也 MUST NOT 在 system prompt 中注入 "请仅基于知识库片段回答" 等强制 RAG 约束语。LLM 自主决定是否需要调用 rag_search tool。

#### Scenario: 班级成员成功发起流式问答
- **WHEN** 班级成员通过合法智能体发送问题
- **THEN** 系统返回 HTTP 200，Content-Type 为 `text/event-stream`，按 Agent Loop 执行过程逐步推送 SSE 事件

#### Scenario: 学生对教师专用智能体发起问答
- **WHEN** 学生用户对 visibility="teachers" 的智能体发起问答
- **THEN** 系统返回 HTTP 404 Not Found（与不存在一致）

#### Scenario: 智能体不存在或不属于该班级
- **WHEN** 指定的 agentId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: message 为空
- **WHEN** 请求的 message 为空字符串或不存在
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: LLM 未配置
- **WHEN** LLM_BASE_URL 或 LLM_MODEL 未设置
- **THEN** 系统返回 HTTP 503 Service Unavailable

### Requirement: 智能体问答的 prompt 构造

问答的 LLM messages MUST 按以下顺序构建：

1. **system 消息**：智能体自身配置的 systemPrompt（若存在）。若智能体未配置 systemPrompt，使用默认系统提示。system prompt MUST NOT 包含任何硬编码的 RAG 行为约束（如"请仅基于知识库片段回答"）。
2. **历史消息**：对话历史的所有 user 和 assistant 消息（如果提供了 conversationId）。
3. **用户问题 + 动态加载的 skills**：user 消息 MUST 包含动态选中的 skill 完整内容（按 SKILL.md 原样注入），然后是用户的原始问题。如果没有选中任何 skill，user 消息只包含用户问题。

LLM API 调用 MUST 同时传入 `tools` 参数，该参数值为 agent 绑定的所有 tool 转换后的 OpenAI 兼容 tool schema 数组（rag_search、builtin tools、MCP tools 均包含在内）。

#### Scenario: 智能体有自定义 system prompt
- **WHEN** 智能体配置了非空的 systemPrompt
- **THEN** 最终 system 消息 = 智能体自定义 prompt，不追加任何 RAG 约束语

#### Scenario: 智能体无自定义 system prompt
- **WHEN** 智能体的 systemPrompt 为 null 或空字符串
- **THEN** 最终 system 消息 = 默认为通用教学助手提示，不含 RAG 约束

#### Scenario: 动态加载了选中的 skill
- **WHEN** 动态技能选择命中了 essay-grader 技能
- **THEN** user 消息中 MUST 在用户问题之前包含完整的 essay-grader SKILL.md 内容（不含 YAML frontmatter 的 Markdown body）

### Requirement: SSE 流式协议

问答接口 MUST 使用 SSE（Server-Sent Events）协议。事件格式 MUST 为 `data: <json>\n\n`。该 Requirement 与 classroom/agent-qa 的 ADDED Requirement "SSE 流式协议扩展" 共同构成完整的事件契约，扩展事件类型定义在 ADDED 部分。

系统 MUST 推送以下事件类型：
- `skill_load`：动态技能选择命中并加载时（可选）
- `tool_start`：开始执行 tool_call 前
- `message`：LLM 生成的增量回答片段
- `tool_end`：tool_call 执行完成后
- `done`：Agent Loop 终止后的最终事件
- `error`：发生错误时

#### Scenario: 正常流式问答的事件序列
- **WHEN** Agent Loop 正常执行完成
- **THEN** SSE 输出依次为：零到多个 skill_load（可选）→ 零到多个 tool_start/tool_end 对 → 零到多个 message → 一个 done → 连接关闭

#### Scenario: 引用片段在 done 事件中返回
- **WHEN** Agent Loop 完成
- **THEN** done 事件中的 citations 数组 MUST 包含所有 rag_search tool 调用返回的片段汇总，结构与 Citation 接口一致

#### Scenario: LLM 流式中途出错
- **WHEN** LLM 流式响应过程中发生错误（非 tool 执行错误）
- **THEN** 系统推送一条 error 事件后关闭连接

#### Scenario: 客户端断开连接
- **WHEN** 客户端在流式传输过程中断开
- **THEN** 服务器 MUST 检测到连接关闭并立即停止 Agent Loop（通过 abort signal），所有后续 tool 调用 MUST 被跳过。已产生的对话记录不回滚

### Requirement: 智能体对话历史持久化

每次通过智能体发起的问答 MUST 持久化到数据库。系统 MUST 创建 conversation（对话会话）和 message（消息）两层结构。每次问答至少存储一条 user 消息和一条 assistant 消息。

assistant 消息 MUST 包含最终 answer 文本和 citations JSON。citations 以 JSON 数组形式存入数据库，来源为 Agent Loop 中 rag_search 调用的汇总。

#### Scenario: 新对话自动创建
- **WHEN** 用户发起问答时未提供 conversationId
- **THEN** 系统自动创建一条 conversation 记录，第一条 message 为 user question，第二条为 assistant answer + citations

#### Scenario: 续接已有对话
- **WHEN** 用户发起问答时提供了有效的 conversationId（属于当前 agentId 和当前用户）
- **THEN** 系统在该 conversation 下追加 user 消息和 assistant 消息

#### Scenario: citations 持久化
- **WHEN** Agent Loop 完成
- **THEN** assistant 消息记录中 citations 字段 MUST 存储从 rag_search 汇总的完整 citations JSON 数组；如果没有 rag_search 调用则存储空数组