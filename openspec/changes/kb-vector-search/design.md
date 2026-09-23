## Context

现有后端已搭建好向量化流水线的全部零件但未串联：`backend/src/lib/chroma.ts` 中的 ChromaDB 客户端、`upsertChunks`/`queryChunks`/`deleteDocumentChunks` 函数；`lib/chunk.ts` 的分块器；`lib/embed.ts` 的 all-MiniLM-L6-v2 嵌入器；`lib/pdf-extract.ts` 的 PDF 文本提取。`routes/kbs.ts` 中 `/:kbId/query` 路由返回 501。

SQLite 表 `kb_documents` 目前只有 id/kb_id/original_name/stored_path/mime/chunk_count/uploaded_at，缺状态字段。Chroma collection 名为 `campusclaw-kbs`，metadata 为 `{kbId, documentId, school, chunkIndex}`。

前端 `ClassDetailPage.tsx` 已画好检索 UI 骨架（知识库 tab 下有"向量检索"输入框和结果列表），但调用的是旧的单 KB 路由。前端技术栈：React + Vite + TypeScript + React Router + axios。

## Goals / Non-Goals

**Goals:**
- 打通上传 → 手动触发 → 异步索引 → 向量查询的完整闭环
- 支持多知识库批量查询 + 文档级溯源（originalName）
- 进程重启后索引任务不丢（SQLite 持久化队列）
- 前端知识库 tab 展示文档状态、索引按钮、多选 KB 检索、结果溯源
- 复用已有的 ChromaDB collection 和嵌入模型，零新增 npm 依赖

**Non-Goals:**
- RAG 问答注入（后续迭代复用查询接口的结果即可）
- 混合检索（关键词 + 向量），MVP 纯向量
- 页码级溯源 / 原文跳转（当前 PDF 分块不保留页码）
- 自动索引（MVP 手动触发即可）
- ChromaDB 换成更强的向量库（Qdrant / Milvus 等），当前规模 Chroma 足够
- 多 worker 并发消费队列（单 worker 控制资源即可）

## Decisions

### 决策 1：新增 `index_tasks` SQLite 队列表，单 worker 消费

**方案：** 新建 `index_tasks` 表：
```sql
CREATE TABLE index_tasks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  kb_id TEXT NOT NULL,
  class_id TEXT NOT NULL,
  school TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','done','failed')),
  error_message TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
```
Node.js 启动时起一个后台 worker 用 `while(true)` + `setImmediate` 循环 poll（用 `FOR UPDATE` 行锁抢占），拿到 pending 任务后串行执行索引。

**备选：**
- A. 内存队列（进程内数组）— 重启丢任务，简单但不符合 MVP 对健壮性的基本预期
- B. BullMQ + Redis — 功能强但新增 Redis 依赖，不符合"零新增 npm 包"约束
- C. SQLite 轮询（选中）— 项目已用 better-sqlite3，零额外依赖，重启可恢复

### 决策 2：文档状态字段直接加到 `kb_documents` 表

新增列：
```sql
ALTER TABLE kb_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','indexing','ready','failed'));
ALTER TABLE kb_documents ADD COLUMN indexed_at INTEGER;
ALTER TABLE kb_documents ADD COLUMN error_message TEXT;
```
同步更新 `db/schema.ts` 中的建表语句（新库用）和在 `initSchema` 里加 `ALTER TABLE`（老库迁移）。

### 决策 3：Chroma metadata 扩展 `classId`

当前 Chroma upsert 时 metadata 只写 `{kbId, documentId, school, chunkIndex}`，检索过滤 `{kbId, school}`。加上 `classId` 作为安全冗余 — 虽然 kbId 唯一绑定 classId，但多一层 where 条件是零成本防御性编程。旧数据没有 classId 字段，查询时用 `$contains` 不匹配旧数据的场景不会出现（因为旧路由废弃了）。

### 决策 4：检索接口改 `POST /classes/:classId/kbs/query`，body 接受 `kbIds[]`

旧路由 `/:kbId/query` 返回 HTTP 410 Gone。新路由直接从 body 取多个 kbId，后端校验全部属于指定 classId 后在 Chroma 里用 `{kbId: {$in: [...]}}` 过滤（ChromaDB 的 `where` 支持 `$in` 操作符）。

topK 默认 5，上限硬编码 20。结果按 distance 升序（Chroma 默认语义：distance 越小越相似）。

### 决策 5：文本提取统一用 `lib/pdf-extract.ts`（PDF）+ 原生 readFile（TXT/MD）

已有的 `pdf-extract.ts` 处理 PDF，TXT/MD 直接 `fs.readFileSync(doc.storedPath, 'utf-8')`。后续统一把三种格式走一个 extractor 函数，返回 string 喂给 `chunkText`。

### 决策 6：队列 worker 的生命周期管理

worker 在 `server.ts` 启动时用 `startIndexWorker()` 启动一个 Promise（不 await，后台跑）。进程收到 SIGINT/SIGTERM 时调用 `stopIndexWorker()` 设一个 `running = false` 标志，当前正在处理的任务跑完后退出，未开始的 pending 任务保留在表里下次恢复。

### 决策 7：前端 KB 检索改多选

前端知识库 tab 的检索区从"单选一个 activeKb"改为"checkbox 多选"，或者简单用按住 Ctrl 点选。文档列表每行显示一个状态标签（彩色：uploaded=灰、indexing=蓝 loading、ready=绿、failed=红）。教师可见的行右侧多一个"开始索引"按钮（uploaded/failed 时显示，ready 时显示"重新索引"）。

## Risks / Trade-offs

**[SQLite 队列轮询延迟]** → 用 `setImmediate` 而非 `setTimeout`，空闲时 CPU 占用可忽略（查不到 pending 就 sleep 500ms）

**[ChromaDB `$in` 支持待确认]** → ChromaDB JS 客户端确实支持 `where: { kbId: { $in: ['a','b'] } }`，已查文档。如果单 KB 场景仍走普通 where。

**[嵌入模型首次加载慢]** → `embed.ts` 已有 `warmupEmbed()` 函数，server 启动时调用一次即可。

**[大文档索引耗时]** → MVP 场景文档规模小（课程课件级别），单 Worker 串行足够。后续如果需要可以改成 `Promise` 并发多个任务（加一个并发度上限）。

**[进程 crash 时正在处理的任务]** → 任务表里的状态还是 `processing`，重启后扫描 `processing` 状态的任务把它们重置回 `pending` 重新入队。

**[前端重新索引时的按钮状态]** → 触发索引后立即把本地状态设为 indexing（乐观更新），定时刷新文档列表获取真实状态。