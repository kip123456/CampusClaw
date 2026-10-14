## Why

当前 CampusClaw 已具备知识库 RAG 问答能力，但教师只能以固定的系统提示词手动选择知识库发起问答，学生被完全排除在问答流程之外，也无法为特定教学场景（如"批改作文"、"出题"、"知识点讲解"）预设专用的技能和智能体。引入技能系统和可配置的对话智能体后，教师可以为班级创建场景化的 AI 助手，学生也能在教师授权下使用智能体进行自主学习和问答，同时流式体验改善长回答的交互感受。

## What Changes

- 新增"班级技能"概念：教师可为班级创建、编辑、删除技能，技能是一段结构化的工具定义（含名称、描述、可执行的 LLM Prompt 模板），智能体可绑定一个或多个技能
- 新增"对话智能体"概念：教师可为班级创建智能体，每个智能体可配置 system prompt、绑定若干知识库和若干技能、设置可见范围（全部成员或仅教师）
- 新增智能体问答接口：班级成员（教师和学生）可通过智能体发起问答，问答流程复用现有 RAG 能力（先检索知识库、构造带引用标记的 prompt），回答通过 SSE 流式返回
- 问答历史持久化：每条智能体问答（question + answer + citations）存入数据库，便于后续回顾
- 扩展现有的 LLM 调用支持流式输出（SSE），保留非流式接口兼容旧调用方

## Capabilities

### New Capabilities

- `classroom/skills`: 班级技能的 CRUD 管理，教师为班级创建技能供智能体绑定使用
- `classroom/agents`: 对话智能体的 CRUD 管理，配置 system prompt、绑定知识库和技能、可见范围
- `classroom/agent-qa`: 通过智能体发起问答，流式 SSE 回答，复用 RAG 流程并在最终结果中列出知识库引用；问答历史持久化

### Modified Capabilities

- `classroom/teaching-qa`: 原 `POST /api/classes/:classId/kbs/qa` 为非流式、仅教师使用的旧接口。新增的智能体问答为流式并开放给学生使用，旧接口保持不变，内部可选择性复用新的流式实现的核心 RAG 逻辑

## Impact

- **数据库**：新增 `skills`、`agent_skills`、`agents`、`agent_kbs`、`agent_conversations`、`agent_messages` 表；数据库迁移在启动时自动执行
- **LLM 客户端** (`backend/src/lib/llm.ts`)：新增流式 chat completions 方法，使用 OpenAI 兼容 SSE 协议
- **QA 库** (`backend/src/lib/qa.ts`)：抽取通用的 RAG 检索 + prompt 构造逻辑，支持传入自定义 system prompt（智能体配置），新增流式版本
- **新增路由**：skills 路由、agents 路由、agent-messages（SSE）路由；全部挂载到 `/api/classes/:classId/agents` 和 `/api/classes/:classId/skills`
- **现有路由影响**：`/kbs/qa` 非流式接口保持不变，但可内部改为调用共享的 RAG 逻辑
- **SSE 依赖**：Node.js 原生可写流，无需新增第三方依赖