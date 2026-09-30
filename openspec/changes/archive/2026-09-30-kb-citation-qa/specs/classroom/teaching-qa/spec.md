## Purpose
为班级教师提供基于知识库检索结果的 RAG 问答能力：选定实时知识库后发起问答，后端先检索相关 chunk 再调用 LLM 生成回答，回答可携带内联引用和片段级溯源信息（文件名 + 文件内位置 + 片段内容），使教师能够验证和引用知识库条目。

## ADDED Requirements

### Requirement: 教师发起知识问答
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs/qa` 发起知识问答。请求 body MUST 包含 `kbIds: string[]`（至少 1 个）和 `question: string`，可选 `topK: number`（默认 5，上限 15）。系统 MUST 先执行向量检索（复用现有 chunk 检索逻辑），将检索到的 topK chunks 作为上下文，构造 prompt 调用外部 LLM Chat Completions 端点。LLM 调用 MUST 遵循特定的 system prompt，要求模型基于提供的知识库片段回答，并在回答中使用 `[1]`、`[2]` 等标记引用片段（模型可以自主选择是否引用）。

#### Scenario: 教师成功发起问答
- **WHEN** 班级教师提供 question 和一个或多个属于该班的 kbIds
- **THEN** 系统先检索 topK chunks，再调用 LLM 生成回答，返回 HTTP 200

#### Scenario: LLM 未配置时问答失败
- **WHEN** LLM_BASE_URL 或 LLM_MODEL 环境变量未设置
- **THEN** 系统返回 HTTP 503 Service Unavailable，body 包含明确的配置缺失提示

#### Scenario: kbIds 中包含不属于该班的知识库
- **WHEN** 请求的 kbIds 里有任意一个不属于指定 classId
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: student 尝试发起问答
- **WHEN** 学生用户访问问答接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: question 为空或缺省
- **WHEN** 请求的 question 为空字符串或不存在
- **THEN** 系统返回 HTTP 400 Bad Request

### Requirement: 问答响应包含引用片段与溯源
问答接口响应体 MUST 同时返回 answer 文本和 citations 数组。answer 文本中 MAY 包含模型插入的内联引用标记（如 `[1]`、`[2]`）。citations 数组中的每个元素 MUST 包含：`id`（与 answer 中的引用标记数字对应）、`chunk`（被引用的知识库片段原文）、`documentId`、`originalName`、`chunkIndex`、`startOffset`（可为 null）、`endOffset`（可为 null）。后端返回的 citations 数组 MUST 始终包含 topK 全部检索到的 chunks（id 从 1..topK 连续编号），不在后端过滤。前端渲染时 MAY 根据 answer 中实际出现的 `[N]` 标记过滤 citations 展示：answer 无 `[N]` 标记时整块引用面板隐去，answer 部分引用时只渲染被引用的 citation 卡片。

#### Scenario: 回答包含引用
- **WHEN** LLM 在回答中引用了检索到的片段
- **THEN** answer 文本中出现 `[N]` 格式标记，citations 数组包含对应的引用片段，每条带完整溯源（documentId + originalName + chunkIndex + startOffset + endOffset）

#### Scenario: 回答不包含引用（前端隐去引用面板）
- **WHEN** LLM 自主选择不引用任何片段，answer 文本中无 `[N]` 标记
- **THEN** 后端 citations 数组仍包含 topK 全部 chunks（不会过滤），前端渲染时从 answer 中提取不到任何引用 id，整块"引用的知识库片段"面板不渲染，教师只看到 answer 文本

#### Scenario: 引用标记可映射回 citations 数组
- **WHEN** answer 文本中出现 `[1]`、`[3]` 等标记
- **THEN** citations 数组中 MUST 存在对应 id=1 和 id=3 的条目

#### Scenario: 历史文档的引用片段位置信息缺失
- **WHEN** 被引用的 chunk 来自旧索引文档（metadata 中没有 startOffset/endOffset）
- **THEN** citations 中该条目的 startOffset 和 endOffset 为 null

### Requirement: 问答 prompt 约束模型引用行为
系统构造的 prompt MUST 明确指示 LLM：只能基于提供的知识库片段回答；不确定时诚实说明"知识库中没有相关内容"；允许但不强制引用；引用时使用 `[N]` 标记对应上下文的第 N 段。系统 MUST 将检索到的每个 chunk 编号（1..topK）后拼入 prompt。

#### Scenario: LLM 被告知引用规则
- **WHEN** 系统构造问答 prompt
- **THEN** prompt MUST 包含：对每个 chunk 的编号文本、引用格式说明、不确定时的处理规则

#### Scenario: 检索结果为空时模型应如实说明
- **WHEN** 向量检索未返回任何 chunk
- **THEN** prompt MUST 明确告知模型"知识库中未找到相关内容"，模型应据此生成回答