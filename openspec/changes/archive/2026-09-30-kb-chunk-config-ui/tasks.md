## 1. 数据库 Schema 与迁移

- [x] 1.1 在 schema.ts 的 CREATE TABLE 语句中为 knowledge_bases 添加 chunk_size/chunk_overlap、为 kb_documents 添加 chunk_size/chunk_overlap、为 index_tasks 添加 chunk_size/chunk_overlap —— 验证：查看 schemaStatements 数组确认三表都有新列
- [x] 1.2 在 initSchema() 末尾添加三表新列的 PRAGMA + ALTER TABLE 迁移逻辑（与现有 status/indexed_at 迁移 pattern 一致），已有列不重复添加 —— 验证：重启服务后所有已有 KB 的 chunk_size/chunk_overlap 被设为 1500/50，index_tasks 和 kb_documents 的新列为 NULL

## 2. 后端核心逻辑改造

- [x] 2.1 提取 chunk 参数校验函数 `validateChunkConfig(size, overlap)` 到独立模块（如 lib/chunk.ts 或新文件），校验 chunkSize 100-10000、chunkOverlap 0-1000、chunkOverlap < chunkSize，返回 normalized 值或抛出 CustomError(400) —— 验证：手动传入边界值（99、10001、-1、1001、overlap>=size）都返回 400
- [x] 2.2 修改 `enqueueIndexTask()` 接受可选的 chunkSize/chunkOverlap 参数，写入 index_tasks 对应列；index-all 场景不传覆盖值（让 worker 从 KB 读） —— 验证：INSERT 语句包含新列，不传时写 NULL
- [x] 2.3 修改 `indexDocument()` 接受 chunkSize/chunkOverlap 参数，显式传给 `chunkText()`；索引成功后将实际使用的 chunkSize/chunkOverlap 写入 kb_documents —— 验证：传不同 chunkSize 会产生不同 chunkCount，kb_documents 表记录实际值
- [x] 2.4 修改 `index-worker.ts` 中 index 任务查询语句 JOIN kb_documents/kb OR 直接查 index_tasks 新列，若任务携带 chunk 配置则优先使用，否则从 KB 默认值读取，传给 indexDocument() —— 验证：索引触发时不传覆盖值用 KB 默认，传覆盖值用覆盖值

## 3. 后端 API 路由改造

- [x] 3.1 修改 `POST /api/classes/:classId/kbs`：解析可选 chunkSize/chunkOverlap，调用校验函数，未传时用默认 1500/50，INSERT 时写入新列，返回体包含 chunkSize/chunkOverlap —— 验证：用 curl POST 传 {name:"test"} 返回 chunkSize=1500；传 {name:"test",chunkSize=2000} 返回 chunkSize=2000
- [x] 3.2 修改 `GET /api/classes/:classId/kbs`：SQL SELECT 新增 chunk_size/chunk_overlap，前端字段名映射为 chunkSize/chunkOverlap —— 验证：curl GET 返回的每条 KB 记录都包含这两个字段
- [x] 3.3 修改 `GET /api/classes/:classId/kbs/:kbId/documents`：SQL SELECT 新增 chunk_size/chunk_overlap，前端字段名映射为 chunkSize/chunkOverlap —— 验证：已索引文档返回实际值，未索引返回 null
- [x] 3.4 修改 `POST /api/classes/:classId/kbs/:kbId/documents/:docId/index`：解析可选 chunkSize/chunkOverlap，调用校验函数，传给 enqueueIndexTask —— 验证：curl POST 传覆盖值后查 index_tasks 新列有值
- [x] 3.5 修改 `POST /api/classes/:classId/kbs/:kbId/index-all`：保持用 KB 默认值（不传覆盖值给 enqueueIndexTask）— 验证：批量索引时 index_tasks 新列为 NULL，worker 从 KB 读取

## 4. 前端类型与 UI

- [x] 4.1 更新 frontend/src/types.ts：KnowledgeBase 接口加 chunkSize/chunkOverlap（required）、KBDocument 接口加 chunkSize/chunkOverlap（number | null）— 验证：TypeScript 编译无报错
- [x] 4.2 创建 KB 表单增加 chunk 配置输入：在 ClassDetailPage.tsx 新建 KB 区域，name 下方添加 chunkSize（默认 1500，min 100 max 10000，step 100）和 chunkOverlap（默认 50，min 0 max 1000，step 10）的数字输入框，附范围提示文案 —— 验证：创建 KB 时两个新输入框可见且值被正确发送到后端
- [x] 4.3 索引按钮旁增加 chunk 覆盖面板：为每个文档的"开始索引/重新索引"按钮添加一个小弹出面板（默认收起），预填该 KB 当前 chunkSize/chunkOverlap，用户可修改后点击索引 —— 验证：点击索引前可以看到并修改覆盖值
- [x] 4.4 批量索引入口：在文档列表的"索引全部"按钮旁边显示当前 KB 的默认 chunk 配置提示（只读）— 验证：批量索引区域可见 KB 当前默认配置
- [x] 4.5 文档列表展示 chunk 配置：在每个文档的 chunkCount 旁边显示实际使用的 chunkSize/chunkOverlap（如 "12 chunks · 1500/50"），未索引或历史数据（chunk_size 为 null）时显示 "- -" —— 验证：已索引文档展示实际值

## 5. 端到端验证

- [ ] 5.1 启动后端，自动迁移成功（查看启动日志确认 ALTER TABLE 输出无报错）— 验证：控制台无迁移错误
- [ ] 5.2 通过前端创建两个 KB：一个用默认配置，一个用 chunkSize=800/chunkOverlap=30 —— 验证：GET /kbs 接口两个 KB 返回不同配置值
- [ ] 5.3 分别在两个 KB 上传相同测试文档，分别触发索引（第一个用默认，第二个用覆盖）— 验证：两个 KB 的同一份文档产出不同 chunkCount，kb_documents 记录各自配置
- [ ] 5.4 查询向量检索 —— 验证：检索流程不受 chunk 配置变更影响