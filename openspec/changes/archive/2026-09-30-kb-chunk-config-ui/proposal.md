## Why

当前知识库文档入库时的 chunk 划分参数（chunk size、overlap）在后端硬编码为 1500 / 50，教师无法根据文档类型或检索效果需求调整切分策略。不同学科、不同格式的文档对 chunk 粒度的敏感程度差异很大——比如数学公式密集的讲义需要更大的 chunk 来保留上下文，而短段落的文学材料可以用更小的 chunk 提升检索精度。将 chunk 配置暴露到 UI 能让教师直接控制入库质量。

## What Changes

- 在知识库（knowledge_bases）层级新增 `chunk_size` 和 `chunk_overlap` 字段，作为该 KB 所有文档的默认切分参数
- 在文档索引触发（单文档 / 批量）时，允许前端传入可选的 chunk 配置覆盖 KB 默认值
- 文档记录（kb_documents）持久化其实际使用的 chunk_size / chunk_overlap，便于回溯和重新索引
- 后端 `chunkText` 函数从固定常量改为参数驱动，indexer 和 index-worker 从上下文读取配置
- 前端知识库界面：创建/编辑 KB 时可设置默认 chunk 配置；触发索引时显示可调整的 chunk 参数输入框
- 文档列表展示每条记录使用的 chunk 配置

## Capabilities

### New Capabilities

（无全新能力，本变更在现有 knowledge-base 能力上扩展行为）

### Modified Capabilities

- `classroom/knowledge-base`: 新增 KB 级 chunk 配置字段、文档级 chunk 配置持久化、索引接口接受可选 chunk 参数、前端暴露配置 UI

## Impact

- **数据库**：knowledge_bases 表新增 `chunk_size` / `chunk_overlap` 列；kb_documents 表新增 `chunk_size` / `chunk_overlap` 列
- **后端 API**：`POST /kbs` 和 KB 编辑接口接受 chunk 参数；`POST /documents/:docId/index` 和 `POST /index-all` 接受可选 chunk 覆盖参数；文档列表接口返回实际使用的 chunk 配置
- **后端逻辑**：`chunkText()` 改为参数驱动；`indexer.ts` / `index-worker.ts` 从 KB 或请求中读取配置
- **前端**：`ClassDetailPage.tsx` 知识库区域增加 chunk 配置表单；`types.ts` 新增字段
- **向量数据**：已有文档不会自动重切，只有重新索引时才按新配置切分（符合现有 reindex 覆盖语义）