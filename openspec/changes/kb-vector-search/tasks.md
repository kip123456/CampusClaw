## 1. 数据库迁移 & Schema 更新

- [ ] 1.1 在 `backend/src/db/schema.ts` 的 `schemaStatements` 中，给 `kb_documents` CREATE TABLE 新增列：status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status IN ('uploaded','indexing','ready','failed'))、indexed_at INTEGER、error_message TEXT。验证：重新启动后端，新库自动建好表结构。
- [ ] 1.2 在 `backend/src/db/schema.ts` 新增 `index_tasks` 表 CREATE TABLE 语句（id, document_id, kb_id, class_id, school, status, error_message, created_at, started_at, finished_at），document_id FOREIGN KEY ON DELETE CASCADE，主键 id。验证：启动后新表自动创建。
- [ ] 1.3 在 `initSchema()` 后加迁移代码 — 检测 `PRAGMA table_info(kb_documents)` 是否缺 status 列，缺则执行 `ALTER TABLE ... ADD COLUMN`；对老库的 `uploaded_at` 列也做类似检查。验证：用已有测试库启动后端，ALTER TABLE 日志无报错，查询 `PRAGMA table_info(kb_documents)` 看到新列。

## 2. 索引队列基础设施

- [ ] 2.1 新建 `backend/src/lib/index-queue.ts`：封装 SQLite 队列表的操作函数 —— `enqueueIndexTask(documentId, kbId, classId, school): Promise<string>` 写入一条 status='pending' 记录并返回 taskId；`claimNextPending()` 用事务 + 行锁抢占一条 pending 记录并改为 processing；`markTaskDone(taskId, chunkCount)` / `markTaskFailed(taskId, error)` 更新任务状态和结束时间。验证：写一个最小测试脚本调用 enqueue 后 DB 里能查到新行。
- [ ] 2.2 新建 `backend/src/lib/index-worker.ts`：`startIndexWorker()` 起一个后台 Promise 循环 poll（空闲 sleep 500ms），`stopIndexWorker()` 设置 running 标志优雅退出。worker 循环体：claimNextPending → 执行索引流水线（见 task 3）→ 成功 markTaskDone 并更新文档 status='ready' + chunk_count + indexed_at；失败 markTaskFailed 并更新文档 status='failed' + error_message。启动时扫描 status='processing' 的遗留任务重置为 pending。验证：手动创建一个 task，启动 worker，观察文档从 processing 变 done。

## 3. Chroma metadata 扩展 & 索引流水线

- [ ] 3.1 修改 `backend/src/lib/chroma.ts` 的 `upsertChunks()` 函数签名，参数新增 `classId: string`；metadatas 里加上 `classId` 字段。修改 `queryChunks()` 函数，参数 `where` 允许接收 `{ kbIds: string[] }` 形式，用 Chroma 的 `$in` 操作符组装 where（当 kbIds 只有一个时走普通 where，多个时用 `$in`）。验证：写一个 chromadb 集成测试，upsert 一批带 classId 的 chunks，用多 kbId 查询能正确返回。
- [ ] 3.2 新建 `backend/src/lib/indexer.ts`：实现 `indexDocument(docRow: { id, kb_id, class_id, school, stored_path, mime })` —— 读取文件（TXT/MD 直接 readFileSync UTF-8，PDF 调 `pdf-extract.ts` 已有函数）→ 调 `chunkText()` → 调 `embedSingle()`（逐批嵌入避免显存/内存峰值）→ 调 `upsertChunks(kbId, docId, school, classId, chunks)`。验证：写一个集成脚本对测试 PDF 调用 indexDocument，查 ChromaDB 里能查到对应 chunks。
- [ ] 3.3 修改 `backend/src/lib/chroma.ts` 的 `deleteDocumentChunks()` 使其能处理有 classId metadata 的新数据（documentId 仍然是唯一 key，where={documentId} 不变，向后兼容）。验证：upsert 一批后 delete，collection.count() 减少。

## 4. 路由新增与修改（routes/kbs.ts）

- [ ] 4.1 新增 `POST /:classId/kbs/:kbId/documents/:docId/index` 路由：教师/管理员权限校验（guardClassMember + guardClassTeacher），查文档属于该 kb 和 class，校验当前 status != 'indexing'（冲突返回 409），写 index_tasks 表，更新文档 status='indexing'，返回 202 + taskId。验证：curl 上传一个 doc → 调此接口 → 看到 DB 文档变 indexing + tasks 表有新行。
- [ ] 4.2 新增 `POST /:classId/kbs/:kbId/index-all` 路由：教师/管理员权限，查该 KB 下所有 status != 'ready' 的文档，批量调用 enqueueIndexTask，返回 202 + tasks[]。验证：KB 下有 3 个 uploaded 文档时返回 3 个 taskId。
- [ ] 4.3 新增 `DELETE /:classId/kbs/:kbId/documents/:docId` 路由：教师/管理员权限，文档不存在返回 404，正在 indexing 返回 409，否则先调 `deleteDocumentChunks(docId)` 清向量再删 DB 记录，返回 200。验证：上传并索引一个文档 → 调此接口 → ChromaDB 查不到 + DB 查不到。
- [ ] 4.4 新增 `POST /:classId/kbs/query` 路由：guardClassMember 权限，body 取 `{ kbIds: string[], query: string, topK?: number }`，校验 kbIds 非空、<= 20、全部属于该 classId，查询 ChromaDB `{ kbId: { $in: kbIds } }` + classId 过滤，结果 join kb_documents 查出 original_name，返回包含 { chunk, distance, documentId, originalName, chunkIndex } 的数组。验证：用已索引文档 query 能返回带 originalName 的结果。
- [ ] 4.5 修改 `GET /:classId/kbs/:kbId/documents` 和 `POST /:classId/kbs/:kbId/documents` 的返回字段 — 新增 status、indexedAt、error_message。验证：curl 上传后立即 GET，返回的文档记录里有 status='uploaded'。
- [ ] 4.6 将旧路由 `POST /:classId/kbs/:kbId/query` 改为返回 410 Gone，body 包含 `{ error: 'GONE', message: 'Use POST /api/classes/:classId/kbs/query instead' }`。验证：旧路径 curl 收到 410。

## 5. Server 启动 & Worker 生命周期

- [ ] 5.1 在 `backend/src/server.ts` 导入 `{ startIndexWorker, stopIndexWorker }`，server listen 成功后调用 `startIndexWorker()`，注册 SIGINT/SIGTERM 处理器调用 `stopIndexWorker()` 再 `process.exit(0)`。验证：启动 server 后 Ctrl+C 能优雅退出，日志显示 worker stopped。

## 6. 前端 Types 更新

- [ ] 6.1 在 `frontend/src/types.ts` 新增/更新类型：`KBDocument` 加 status、indexedAt、errorMessage 字段；新增 `IndexTask` 类型；`QueryResult` 加 originalName 字段。验证：TypeScript 编译无类型错误。

## 7. 前端 ClassDetailPage.tsx 改造

- [ ] 7.1 文档列表每行右侧显示彩色状态徽章（uploaded=灰色、indexing=蓝色带 loading spinner、ready=绿色、failed=红色）。教师/管理员可见行右侧多一个"开始索引"按钮（uploaded/failed 显示"开始索引"，ready 显示"重新索引"，indexing 禁用）。按钮点击调 `POST /classes/${classId}/kbs/${activeKb}/documents/${d.documentId}/index`，成功后本地状态乐观更新为 indexing，同时触发 5 秒后刷新文档列表（loadDocs）。验证：上传 → 点"开始索引" → 状态徽章实时变蓝 → worker 完成后变绿。
- [ ] 7.2 文档列表底部增加 KB 级"索引全部待索引文档"按钮（仅教师/管理员可见，当 KB 下有非 ready 文档时显示）。点击调 `POST /classes/${classId}/kbs/${activeKb}/index-all`，成功后触发文档列表刷新。验证：KB 下有 3 个 uploaded 文档时能一键全部入队。
- [ ] 7.3 检索区重构：将原单选 activeKb 改为 checkbox 多选 — KB 列表侧每项前面加 checkbox（至少选一个才能检索按钮生效），顶部可加"全选 / 反选"快捷按钮。检索接口改为 `POST /classes/${classId}/kbs/query`，body 传 `{ kbIds: selectedKbIds, query, topK: 5 }`。验证：选中 2 个 KB → 搜索 → 结果包含两个 KB 的混合片段。
- [ ] 7.4 检索结果每条下方显示来源文档名（📄 originalName）。验证：搜索结果每条有文档名溯源。

## 8. 集成验证

- [ ] 8.1 端到端冒烟：创建班级 → 建 KB → 上传 .pdf → 手动单文档索引 → 等待 ready → 自然语言检索命中。用 curl 或 Postman 验证全链路。验证：检索接口返回带 originalName 的相关片段，距离 < 1.0。
- [ ] 8.2 进程重启恢复：启动 server → 触发索引（故意用一个大 PDF）→ 在 worker 处理中途 kill 进程 → 重启 server → 验证待处理任务继续被消费。验证：最终文档状态变 ready，chunk_count > 0。
- [ ] 8.3 错误路径：故意上传一个损坏的 PDF → 触发索引 → 验证文档 status 变 failed，error_message 包含错误。验证：failed 状态可重试（重试后变 ready）。