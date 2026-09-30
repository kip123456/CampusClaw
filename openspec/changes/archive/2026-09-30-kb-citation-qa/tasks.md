## 1. Chunk Offset 基础层

- [x] 1.1 修改 `backend/src/lib/chunk.ts` 的 Chunk 接口新增 startOffset / endOffset 字段，chunkText 切分循环中以 `start`（文本指针位置）追踪，将 `{ text, index, startOffset: start, endOffset: start + piece.length }` 作为 Chunk 返回；验证：用一段已知文本（如 "ABCDEFGHIJKLMNOP" chunkSize=5）调用 chunkText，打印每个 chunk 的 startOffset/endOffset，确认与 slice 位置一致
- [x] 1.2 在 chunk.ts 中导出 ChunkWithOffset 或直接复用 Chunk 接口（因 Chunk 本就是 chunkText 内部返回类型，修改后 ChunkInput 接口和 indexer.ts 可直接读取 offset 字段）；验证：TypeScript 编译 backend 无错误

## 2. Chroma Metadata 改造

- [x] 2.1 修改 `backend/src/lib/chroma.ts` 的 `ChunkInput` 接口，新增可选 startOffset / endOffset；upsertChunks 的 metadatas 构造逻辑读取这两个字段写入 metadata 对象；验证：metadata 对象条件展开（undefined 时不含该字段，避免 Chroma 不接受 null 类型）
- [x] 2.2 修改 `QueryResult` 接口新增 startOffset（number | null）/ endOffset（number | null）；queryChunks 中从 metadata 读取这两个字段（旧向量无则返回 null）；验证：meta?.startOffset ?? null 降级

## 3. Indexer 透传 Offset

- [x] 3.1 修改 `backend/src/lib/indexer.ts`，indexDocument / reindexDocument 中 `chunkText` 返回结果直接传给 `upsertChunks`（ChunkInput 现在带 offset），无需额外映射；验证：chunkText Chunk 接口匹配 ChunkInput，自动透传

## 4. Query API 扩展

- [x] 4.1 修改 `backend/src/routes/kbs.ts` 的 POST /kbs/query 路由，`withOriginals` 映射中新增 startOffset / endOffset 字段（从 QueryResult 透传）；验证：TS 编译通过，返回体结构扩展

## 5. LLM 配置模块

- [x] 5.1 修改 `backend/src/config.ts`，新增 llmBaseUrl / llmModel / llmApiKey 字段，从 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY 环境变量读取；缺失时在启动时打印 warn（参考 embedBaseUrl 的 warn 模式，不 exit）；验证：配置文件新增 3 字段 + warn 日志，TypeScript 编译通过
- [x] 5.2 创建 `backend/src/lib/llm.ts`，封装 OpenAI 兼容 Chat Completions 调用：fetch `{llmBaseUrl}/chat/completions`，Authorization Bearer，AbortController 30s 超时，返回 `{ content: string }`；配置缺失时抛出明确错误；验证：isLLMConfigured + chat 函数结构完整

## 6. RAG QA 核心逻辑

- [x] 6.1 创建 `backend/src/lib/qa.ts`，导出 `answerWithRAG` 函数：入参 question + kbIds + classId + topK，步骤为 (a) embedSingle(question) → (b) queryChunks(kbIds, classId, topK) → (c) 构造 system+user prompt（每个 chunk 编号 1..topK）→ (d) 调用 llm.chat → (e) 组装 citations 数组；验证：完整 RAG 流水线，citation id 从 1 开始编号
- [x] 6.2 实现 prompt 构造函数：system prompt 要求模型只基于提供片段回答、引用时用 [N] 标记、不确定时诚实说明；user prompt 按 `## 知识库片段\n\n[1] ...\n[2] ...\n\n## 问题\n${question}` 格式拼装；验证：buildPrompt 函数，检索为空时告知"知识库中没有检索到相关片段"

## 7. QA API 路由

- [x] 7.1 在 `backend/src/routes/kbs.ts` 新增 `POST /api/classes/:classId/kbs/qa` 路由：guardClassMember + guardTeacher（仅教师），body 校验 kbIds/question/topK（同 query 路由校验逻辑），调用 answerWithRAG，响应体 `{ answer: string, citations: [...] }`；LLM 未配置返回 503 + 明确提示；验证：TS 编译通过，路由保护 + 校验 + 错误处理完整

## 8. 前端类型与 UI

- [x] 8.1 修改 `frontend/src/types.ts`：QueryResult 接口新增 startOffset（number | null）/ endOffset（number | null）；新增 Citation 接口（id / chunk / documentId / originalName / chunkIndex / startOffset / endOffset）；新增 QAResponse 接口（answer: string / citations: Citation[]）；验证：TypeScript 编译 frontend 无错误
- [x] 8.2 在 `ClassDetailPage.tsx` 向量检索区域旁新增问答面板（Tab 切换 qaMode），复用 selectedKbIds state；新增 qaInput/qaLoading/qaResult/qaError/expandedCitation state；验证：UI 出现 Tab 切换 + 问答输入框 + 发送按钮
- [x] 8.3 实现问答发送逻辑：调用 api.post('/classes/${classId}/kbs/qa', { kbIds, question, topK })，answer 文本渲染（[N] 高亮 + 可点击展开），citations 面板展示（文件名、chunkIndex、offset 范围、chunk 原文可折叠展开）；验证：renderAnswerWithCitations 正则解析 + expandable citation cards
- [x] 8.4 检索结果（handleQuery）渲染补充 offset 显示：在 chunk 原文旁显示 "位置: 第 X-Y 字符"，offset 为 null 时显示 "位置: 未知（旧索引文档，重新索引可补齐）"；验证：query result map 中新增 offset 显示行 + chunk index 显示

## 9. 端到端验证

- [x] 9.1 后端启动无报错，自动跳过 Chroma 新 metadata 字段的"迁移"（无需迁移，offset 缺省为 null）；验证：后端正常启动，curl query 对旧索引文档返回 startOffset: null / endOffset: null
- [x] 9.2 新上传文档 → 触发索引 → curl query 该文档 → 确认 startOffset/endOffset 非 null 且与 chunkText 计算值一致；验证：chunkText 调用日志和 query 结果对比
- [x] 9.3 配置 LLM 环境变量 → curl POST /qa 成功返回 answer + citations；模拟 LLM 超时返回 503 或 500；验证：answer 文本出现 [N] 标记时 citations 有对应条目
- [x] 9.4 不配置 LLM → curl POST /qa 返回 503 且 body 有明确提示；验证：HTTP 503 + 消息体
- [x] 9.5 前端 TypeScript 编译通过，后端 TypeScript 编译通过；验证：两个 tsc --noEmit 无错误