## Why

知识库文档目前只能上传存储，无法被检索利用。后端已经搭好了 ChromaDB 向量存储、嵌入模型（all-MiniLM-L6-v2）、分块器和查询函数，但索引流水线没有串联，`POST /classes/:classId/kbs/:kbId/query` 路由返回 501。前端 ClassDetailPage 已经画好了检索 UI 骨架（输入框、结果列表），只差后端接通。当前迭代先让教师/学生能用自然语言搜到知识库里的相关片段，之后同一套检索能力会接进 AI 问答做 RAG 注入。

## What Changes

- **后端：实现向量检索接口** — 废弃单 KB 的 `/:kbId/query` 路由，新增 `POST /classes/:classId/kbs/query`，body 接受 `{ kbIds: string[], query: string, topK?: number }`。返回结果附带文档名做溯源（当前只做文档级溯源）。
- **后端：实现手动异步索引触发** — 新增 `POST /classes/:classId/kbs/:kbId/documents/:docId/index`（单文档）和 `POST /classes/:classId/kbs/:kbId/index-all`（KB 下所有未索引文档）。索引流程：读取文件 → 提取文本（PDF/TXT/MD）→ 分块 → 嵌入 → upsert 到 ChromaDB，全部异步执行。
- **后端：文档状态管理** — `kb_documents` 表加 `status`（uploaded/indexing/ready/failed）、`indexed_at`、`error_message` 字段。列表接口返回状态，前端据此显示状态徽章和操作按钮。
- **后端：索引队列** — 用 SQLite 持久化队列表 `index_tasks` 存任务，Node.js 进程单 worker 消费。进程重启后队列任务可恢复。
- **后端：删除/更新时清理向量** — 已有 `deleteDocumentChunks()` 函数，接到文档删除和重新索引流程上。
- **后端：Chroma metadata 加 classId** — 安全冗余，检索过滤条件从 `{kbId, school}` 改为 `{kbId, school, classId}`。
- **前端：知识库 tab 增强** — 文档列表显示索引状态（已就绪/索引中/待索引/失败），教师可见"开始索引"按钮；检索区改为多选知识库（checkbox 或下拉多选）；搜索结果显示来源文档名。
- **BREAKING** — 旧路由 `POST /classes/:classId/kbs/:kbId/query` 行为从返回 501 改为直接废弃（返回 404 或 410），客户端应改用新的批量查询路由。

## Capabilities

### New Capabilities

（无 — 所有新行为都属于现有的 `classroom/knowledge-base` 能力延伸）

### Modified Capabilities

- `classroom/knowledge-base`: 新增 4 条 requirement：手动触发文档索引、异步索引队列、向量检索（多 KB 批量、文档级溯源）、文档索引状态管理

## Impact

- **数据库** — SQLite `kb_documents` 表加列；新增 `index_tasks` 表（队列持久化）
- **ChromaDB** — metadata schema 扩展（新增 classId）；已有向量不受影响（classId 是冗余过滤条件）
- **后端 API** — 新增 3 个接口；修改 1 个接口（documents 列表加 status）；废弃 1 个接口（旧 query 路由）
- **前端** — ClassDetailPage.tsx 的知识库 tab：文档列表加状态+索引按钮，检索区改多选 KB，结果显示文档名
- **依赖** — 无新增 npm 包；全部使用已有的 chromadb、transformers、better-sqlite3