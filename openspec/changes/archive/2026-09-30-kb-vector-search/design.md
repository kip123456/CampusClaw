## Context

现有后端已搭建好向量化流水线的全部零件但未串联：`backend/src/lib/chroma.ts` 中的 ChromaDB 客户端、`upsertChunks`/`queryChunks`/`deleteDocumentChunks` 函数；`lib/chunk.ts` 的分块器；`lib/embed.ts` 当前使用 all-MiniLM-L6-v2 本地嵌入器（本次迭代改为外部 OpenAI 兼容格式 API 调用）；`lib/pdf-extract.ts` 的 PDF 文本提取。`routes/kbs.ts` 中 `/:kbId/query` 路由返回 501。

SQLite 表 `kb_documents` 目前只有 id/kb_id/original_name/stored_path/mime/chunk_count/uploaded_at，缺状态字段。Chroma collection 名为 `campusclaw-kbs`，metadata 为 `{kbId, documentId, school, chunkIndex}`。

前端 `ClassDetailPage.tsx` 已画好检索 UI 骨架（知识库 tab 下有"向量检索"输入框和结果列表），但调用的是旧的单 KB 路由。前端技术栈：React + Vite + TypeScript + React Router + axios。

## Goals / Non-Goals

**Goals:**
- 打通上传 → 手动触发 → 异步索引 → 向量查询的完整闭环
- 支持多知识库批量查询 + 文档级溯源（originalName）
- 进程重启后索引任务不丢（SQLite 持久化队列）
- 前端知识库 tab 展示文档状态、索引按钮、多选 KB 检索、结果溯源
- 复用已有的 ChromaDB collection；嵌入改为外部 API 调用（OpenAI 兼容格式），通过环境变量配置；移除 @xenova/transformers 依赖

**Non-Goals:**
- RAG 问答注入（后续迭代复用查询接口的结果即可）
- 混合检索（关键词 + 向量），MVP 纯向量
- 页码级溯源 / 原文跳转（当前 PDF 分块不保留页码）
- 自动索引（MVP 手动触发即可）
- ChromaDB 换成更强的向量库（Qdrant / Milvus 等），当前规模 Chroma 足够
- 多 worker 并发消费队列（单 worker 控制资源即可）
- 本地嵌入模型运行（全部走外部 API）

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

### 决策 8：外部 OpenAI 兼容格式 Embedding API

**环境变量配置：**
| 变量 | 说明 | 默认 | 是否敏感 |
|---|---|---|---|
| `EMBED_BASE_URL` | API base URL（如 `https://api.openai.com/v1`） | 占位符 | 否 |
| `EMBED_MODEL` | 模型名（如 `text-embedding-3-small`） | 占位符 | 否 |
| `EMBED_DIM` | 向量维度（必须与模型匹配） | 2048 | 否 |
| `EMBED_API_KEY` | API key | — | **是**（不写入 .env.example） |

**API 调用格式：** `POST {EMBED_BASE_URL}/embeddings`，headers `Authorization: Bearer {EMBED_API_KEY}`，body `{ model: EMBED_MODEL, input: string | string[] }`，响应取 `data[*].embedding`。批量嵌入时单次请求传 `input: string[]` 减少 round-trip。

**embed.ts 改造：** 函数签名保持 `embed(text: string | string[]): number[][]` 和 `embedSingle(text: string): number[]` 不变，内部改为 fetch 调用。加 30s 超时（`AbortController`），非 2xx 抛错并附带响应 body，网络错误包装后上抛。删除 `warmupEmbed()` 和 `@xenova/transformers` 动态 import。

**config 加载：** `backend/src/config.ts` 读取 `process.env.EMBED_BASE_URL`、`EMBED_MODEL`、`EMBED_DIM`（parseInt），启动时校验 `EMBED_BASE_URL` 和 `EMBED_MODEL` 非空，缺失则报 warn 但不崩溃（允许运行时配置）。

**ChromaDB collection 维度：** 旧 collection `campusclaw-kbs` 用本地 all-MiniLM-L6-v2（dim=384）创建，切换到外部 API 后维度变化会导致 ChromaDB 报错。实现时需检测 collection 维度是否匹配 `EMBED_DIM`，不匹配则提示用户手动删除旧 collection 重建，或由迁移逻辑自动处理。

**备选方案：**
- A. 继续本地嵌入 — 已废弃，用户明确要求外部接口
- B. 用 Ollama 本地 OpenAI 兼容层 — 本质也是外部 API，决策 8 的接口格式天然兼容

## Risks / Trade-offs

**[SQLite 队列轮询延迟]** → 用 `setImmediate` 而非 `setTimeout`，空闲时 CPU 占用可忽略（查不到 pending 就 sleep 500ms）

**[ChromaDB `$in` 支持待确认]** → ChromaDB JS 客户端确实支持 `where: { kbId: { $in: ['a','b'] } }`，已查文档。如果单 KB 场景仍走普通 where。

**[外部 API 延迟/不可用]** → 嵌入调用加 30s 超时（`AbortController`），失败时文档状态置 failed 并记录 error_message。MVP 不做自动重试（用户手动触发"重新索引"即可）。批量嵌入时单次请求限制文本条数（如 ≤ 100 条）避免请求体过大。

**[外部 API 限流]** → MVP 场景文档规模小（课程课件级别），单 worker 串行调用天然避开限流。如果后续需要可加 token bucket 限流。

**[大文档索引耗时]** → MVP 场景文档规模小（课程课件级别），单 Worker 串行足够。后续如果需要可以改成 `Promise` 并发多个任务（加一个并发度上限）。

**[进程 crash 时正在处理的任务]** → 任务表里的状态还是 `processing`，重启后扫描 `processing` 状态的任务把它们重置回 `pending` 重新入队。

**[前端重新索引时的按钮状态]** → 触发索引后立即把本地状态设为 indexing（乐观更新），定时刷新文档列表获取真实状态。

**[ChromaDB collection 维度不匹配]** → 旧 collection 用本地模型（dim=384）创建，新模型维度不同会导致 upsert 报错。实现时在 server 启动阶段检测 collection 实际维度与 `EMBED_DIM` 是否一致，不一致则 log warn 并提示用户删除旧 collection。MVP 不做自动删除（避免误删已有数据）。