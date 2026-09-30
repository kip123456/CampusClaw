## Context

当前 chunk 划分逻辑在 `backend/src/lib/chunk.ts` 中以模块级常量（`DEFAULT_CHUNK_SIZE = 1500`、`DEFAULT_OVERLAP = 50`）硬编码。`indexDocument()` 直接调用 `chunkText(text)` 不传参数。

数据层面：
- `knowledge_bases` 表目前没有任何 chunk 相关字段
- `kb_documents` 表记录了 `chunk_count` 但不记录具体用了什么配置
- `index_tasks` 表是队列载体，目前只存了 document_id 等关联信息，没有 chunk 配置

API 层面：
- `POST /kbs` 只接受 `name`
- 索引触发（`/documents/:docId/index`、`/index-all`）没有 request body 或只做了非空校验
- `GET /kbs` 返回字段不包含 chunk 配置

前端层面：
- `ClassDetailPage.tsx` 知识库区域的上传和索引都没有 chunk 配置输入
- `types.ts` 中 `KnowledgeBase` 和 `KBDocument` 接口没有 chunk 字段

## Goals / Non-Goals

**Goals:**
- 让教师能在知识库创建时设置默认 chunkSize/chunkOverlap
- 让教师能在触发索引时临时覆盖 KB 默认值（per-doc 粒度）
- 让每个文档的实际使用配置可追溯（持久化到 kb_documents）
- 现有默认行为完全向后兼容：不传任何参数等价于 1500/50
- 数据库自动迁移，旧数据不受影响

**Non-Goals:**
- 不实现 KB 更新接口（编辑已创建的 KB 的 chunk 配置）—— 可以在后续变更中添加，当前变更聚焦创建 + 索引覆盖
- 不实现 "预览 chunk 效果" 功能
- 不修改 chunk 切分算法本身（比如引入递归切分、token 级切分）—— 只暴露参数
- 不自动重索引已有就绪文档（config 变更不触发自动更新）

## Decisions

### 1. chunk 配置传递路径：index_tasks 携带覆盖值

**决策：** 在 `index_tasks` 表新增 `chunk_size` / `chunk_overlap` 列。当前端触发索引并传入覆盖值时，覆盖值写入队列；未传则为 NULL，worker 执行时从 KB 表读取默认值。

**替代方案：** 在 index-worker 查询 KB 获取默认值，触发时只传覆盖值 —— 这要求 worker 每次都 JOIN KB 表，增加查询复杂度。而且把覆盖值持久化到队列能让每个任务的行为完全确定，即使 KB 后来改了配置也不影响已入队的任务。

**理由：** 异步队列的核心设计原则是"任务自包含"。index_tasks 应携带其执行所需的全部信息，而不是在运行时去查外部状态。这样 worker 逻辑简单，且 KB 配置在任务入队后被修改不会影响已排队的任务。

### 2. 索引触发 API 接受覆盖值方式

**决策：** `POST /documents/:docId/index` 和 `POST /index-all` 的 request body 从空体改为 `{ chunkSize?: number, chunkOverlap?: number }`。可选字段，未提供则使用 KB 默认。

**替代方案：** 用 query 参数传递 —— 语义上这是配置，用 body 更合适且可扩展。

### 3. chunkText 函数改造

**决策：** `chunkText(text, chunkSize?, overlap?)` 签名不变（默认值还是 1500/50），但 indexer 调用时显式传入。indexer 从调用方接收配置，不再依赖模块常量。

**替代方案：** 保持 chunkText 不变，在 indexer 层面读 KB 默认值后传给 chunkText —— 实际上这就是同一个方案，chunkText 签名本身已经支持参数，只是当前调用方没传。

### 4. 数据库 schema 演进

**决策：** 在 `schemaStatements` 数组的 CREATE TABLE 语句中加入新列，同时在 `initSchema()` 末尾添加 ALTER TABLE 迁移（与现有 pattern 一致）。

```sql
ALTER TABLE knowledge_bases ADD COLUMN chunk_size INTEGER NOT NULL DEFAULT 1500;
ALTER TABLE knowledge_bases ADD COLUMN chunk_overlap INTEGER NOT NULL DEFAULT 50;
ALTER TABLE kb_documents ADD COLUMN chunk_size INTEGER;
ALTER TABLE kb_documents ADD COLUMN chunk_overlap INTEGER;
ALTER TABLE index_tasks ADD COLUMN chunk_size INTEGER;
ALTER TABLE index_tasks ADD COLUMN chunk_overlap INTEGER;
```

迁移策略与现有 `status` / `indexed_at` 等列完全一致：PRAGMA 检查表列是否存在，不存在才 ALTER。

### 5. 前端 UI 设计

**决策：** 两个入口暴露 chunk 配置：
- **创建 KB 表单**：在 name 输入框下方增加 chunkSize 和 chunkOverlap 的数字输入框，带默认值显示和范围提示
- **索引触发按钮旁**：弹出一个小面板，允许临时覆盖 KB 默认值。默认显示 KB 当前配置，用户可修改后再点索引
- **文档列表**：在每个文档的 chunkCount 旁边展示其实际 chunkSize/chunkOverlap（已索引才显示）

### 6. 校验逻辑

**决策：** 后端做统一校验（创建 KB 和触发索引都走同一个校验函数）。规则：
- chunkSize: 100-10000
- chunkOverlap: 0-1000
- chunkOverlap < chunkSize

前端做即时校验（min/max 属性 + onChange 校验），后端做最终兜底。

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| 已有就绪文档的 chunk_size 字段为 NULL（因为历史上没记录） | 在文档列表接口返回时，若 chunk_size 为 NULL，前端显示 "-" 或回退显示 KB 当前默认值，并加注释说明"索引时未记录配置" |
| KB 默认值变更后，已有就绪文档不会自动按新配置重切 | 这是有意设计——重索引需要用户显式触发。文档列表展示其实际使用配置，用户可以据此判断是否需要重索引 |
| index_tasks 表新增列带来的迁移复杂性 | 与现有迁移 pattern 完全一致（PRAGMA + ALTER TABLE + 默认值），风险低 |
| 前端 UI 复杂度增加 | 两个入口都用可选展开形式，默认收起，不影响现有简洁度 |