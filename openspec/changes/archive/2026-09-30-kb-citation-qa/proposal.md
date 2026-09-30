## Why

当前知识库向量检索只能返回文档级溯源（documentId + originalName），教师看到检索结果后无法定位到源文件中的具体位置，难以信任和引用。同时，系统缺少教师端的"知识库问答"能力——教师需要一个简单的 RAG 问答入口，能在选定实时知识库后先检索、再基于检索结果让 AI 生成回答，并且回答中可以选择是否引用知识库片段，被引用的片段必须携带完整溯源信息（内容 + 文件名 + 文件内位置）。

## What Changes

- **溯源增强**：chunk 切分时记录每个 chunk 在源文本中的字符偏移范围（startOffset / endOffset），向量数据库 metadata 新增这两个字段，检索接口返回 offset 信息，使前端能展示"第 X-Y 字符"或"第 N 行附近"
- **重新索引触发**：已有文档因新 metadata 字段缺失，需要在下次重新索引时自动补齐 offset（对已索引但 offset 为 null 的历史数据降级显示为"未知位置"）
- **新增教师端 RAG 问答接口**：`POST /api/classes/:classId/kbs/qa`，教师选定 KB 集合后发起问答，后端先检索 topK chunks，再调用 LLM 生成回答，回答支持可选的内联引用（AI 自主选择引用哪些片段），响应体同时返回 answer 文本和 citations 数组（每个 citation 包含 chunk 文本、文件名、chunk 偏移范围）
- **前端问答 UI**：在现有向量检索区域旁增加一个"知识问答"面板，复用 KB 多选，问答输入框 + 发送按钮，回答区域支持 inline 引用标记（如 [1]、[2] 上标），并可点击展开查看该引用对应的知识库片段和溯源

## Capabilities

### New Capabilities
- `classroom/teaching-qa`: 教师端基于知识库检索结果的 RAG 问答功能，支持可选内联引用和片段溯源

### Modified Capabilities
- `classroom/knowledge-base`: 向量检索结果的 chunk 溯源从文档级（documentId + originalName）增强为位置级（新增 startOffset / endOffset 字段），`GET /kbs/query` 返回值扩展

## Impact

- **后端**：`lib/chunk.ts`（chunkText 返回结构加 offset）、`lib/chroma.ts`（ChunkInput / upsertChunks / QueryResult 加 offset metadata）、`lib/indexer.ts`（透传 offset 到 upsert）、`lib/index-worker.ts`（重索引兼容）、新增 `lib/qa.ts`（RAG 问答逻辑）、新增 qa 路由
- **API**：`POST /api/classes/:classId/kbs/query` 响应新增字段（非 breaking 扩展）；新增 `POST /api/classes/:classId/kbs/qa`
- **前端**：types.ts QueryResult 加 offset 字段；ClassDetailPage.tsx 问答面板 UI 新组件
- **向量库 schema**：Chroma collection metadata 新增 startOffset / endOffset（自动迁移，旧 chunk 查询返回 null）
- **外部依赖**：复用现有 EMBED_* 配置；需要 LLM Chat Completions 端点（环境变量新增 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY）