## ADDED Requirements

### Requirement: 手动触发文档向量索引
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs/:kbId/documents/:docId/index` 手动对单个已上传文档发起向量索引。系统 MUST 校验该文档存在且属于指定的 kbId 和 classId。已处于 `indexing` 状态的文档 MUST 返回 HTTP 409 Conflict 避免重复触发。索引流程 MUST 异步执行，接口在任务入队后立即返回 HTTP 202 Accepted。

#### Scenario: 成功发起单文档索引
- **WHEN** 班级教师对一个 status="uploaded" 或 status="failed" 的文档发送索引请求
- **THEN** 系统将索引任务写入持久化队列，将文档状态置为 "indexing"，返回 HTTP 202 包含 taskId

#### Scenario: 文档正在索引中，重复触发
- **WHEN** 文档当前 status="indexing" 时再次发送索引请求
- **THEN** 系统返回 HTTP 409 Conflict，body 包含当前状态和已有 taskId

#### Scenario: 一次性索引 KB 下所有待索引文档
- **WHEN** 班级教师对知识库发送 `POST /api/classes/:classId/kbs/:kbId/index-all`
- **THEN** 系统扫描该知识库下所有 status != "ready" 的文档，为每个文档创建索引任务，返回 HTTP 202 包含已入队的 taskId 列表

#### Scenario: 非教师尝试触发索引
- **WHEN** 学生用户访问索引接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: 文档或知识库不存在
- **WHEN** 指定的 docId 或 kbId 在数据库中不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 异步索引队列与状态流转
系统 MUST 使用 SQLite 持久化的索引队列来保证进程重启后任务不丢失。队列 MUST 有且仅有一个活跃 worker 消费任务，串行执行以控制资源占用。索引流程 MUST 经历：读取文档 → 提取纯文本（PDF/TXT/MD）→ 文本分块 → 嵌入向量化 → upsert 到向量数据库。成功时文档状态置为 "ready" 并记录 `indexed_at`；失败时置为 "failed" 并记录 `error_message`。文档列表接口 MUST 返回 status 字段让前端反映状态。

#### Scenario: 索引成功完成
- **WHEN** 队列 worker 成功完成某文档的全部分块嵌入和 upsert
- **THEN** kb_documents 记录 status="ready"，chunk_count 更新为实际分块数，indexed_at 设为当前时间，队列任务标记为完成

#### Scenario: 索引过程中出错
- **WHEN** 索引流程的任何步骤抛出异常（文件损坏、嵌入失败、向量库连接断开等）
- **THEN** kb_documents 记录 status="failed"，error_message 包含错误摘要，队列任务标记为 failed（不自动重试）

#### Scenario: 进程重启后队列恢复
- **WHEN** 服务进程启动
- **THEN** worker 扫描队列中所有 pending 的任务，将对应文档状态重置为 "uploaded" 或保持 "indexing" 后重新入队并开始消费

#### Scenario: 文档列表反映状态
- **WHEN** 任何用户调用 `GET /api/classes/:classId/kbs/:kbId/documents`
- **THEN** 返回的每条文档 MUST 包含 status（"uploaded" | "indexing" | "ready" | "failed"）、indexedAt（可为 null）、chunkCount

### Requirement: 知识库向量检索（多 KB 批量）
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `POST /api/classes/:classId/kbs/query` 在指定知识库集合中进行向量相似度检索。请求 body MUST 包含 `kbIds: string[]`（至少 1 个）和 `query: string`，可选 `topK: number`（默认 5，上限 20）。系统 MUST 校验所有 kbIds 都属于指定 classId。检索返回的每条结果 MUST 包含匹配片段文本、相似度距离、来源 documentId、来源 originalName（文档级溯源）、chunkIndex。

#### Scenario: 班级成员成功检索
- **WHEN** 班级成员（teacher 或 student）提供 query 和一个或多个属于该班的 kbIds
- **THEN** 系统返回 HTTP 200，body 为结果数组，每条包含 chunk、distance、documentId、originalName、chunkIndex

#### Scenario: 多个知识库混合检索
- **WHEN** 请求体 kbIds 包含 2 个或以上属于该班的知识库
- **THEN** 系统在所有指定知识库的向量联合空间中检索，按距离排序返回 topK 条，不论来源 KB

#### Scenario: kbIds 中包含不属于该班的知识库
- **WHEN** 请求的 kbIds 里有任意一个不属于指定 classId
- **THEN** 系统返回 HTTP 400 Bad Request，body 包含无效 kbId 列表

#### Scenario: kbIds 为空或缺省
- **WHEN** 请求的 kbIds 为空数组或不存在
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: topK 超出上限
- **WHEN** 请求的 topK > 20
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: 检索结果必须溯源到文档
- **WHEN** 系统返回检索结果
- **THEN** 每条结果 MUST 附带 originalName 字段（来自 kb_documents.original_name），使调用方能定位来源文档

#### Scenario: 非班级成员尝试检索
- **WHEN** 非班级成员且非 admin 用户访问检索接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 文档删除与重新索引时清理向量
删除已索引文档时系统 MUST 同步清除向量数据库中该文档的全部向量。对已就绪文档触发重新索引时，系统 MUST 先清除旧向量再执行新的索引流水线。

#### Scenario: 删除已索引文档时清理向量
- **WHEN** 教师删除一个 status="ready" 的知识库文档
- **THEN** 系统先删除向量库中 documentId 匹配的全部 chunks，再删除数据库记录，最后返回 HTTP 200

#### Scenario: 重新索引已就绪文档
- **WHEN** 教师对一个 status="ready" 的文档再次触发索引
- **THEN** 系统先清除旧向量，再重新执行完整索引流水线，成功后 chunk_count 和 indexed_at 被刷新

### Requirement: 知识库文档删除
班级教师成员（或 admin）MUST 能够通过 `DELETE /api/classes/:classId/kbs/:kbId/documents/:docId` 删除指定文档。默认知识库不可删除的约束继续适用于知识库本身（而不是文档）。删除时若文档已索引（status="ready"），系统 MUST 同步清除向量库中的对应向量。

#### Scenario: 成功删除已就绪文档
- **WHEN** 班级教师指定了存在且属于该知识库的 docId，且文档 status="ready"
- **THEN** 系统清除向量库中 documentId 匹配的全部向量，删除 kb_documents 记录，返回 HTTP 200

#### Scenario: 成功删除未索引文档
- **WHEN** 班级教师指定了存在且属于该知识库的 docId，且文档 status="uploaded" 或 "failed"
- **THEN** 系统仅删除 kb_documents 记录，返回 HTTP 200

#### Scenario: 文档正在索引中
- **WHEN** 文档 status="indexing" 时尝试删除
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: 非教师尝试删除
- **WHEN** 学生用户访问删除接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: 文档不存在或不属于该 KB
- **WHEN** 指定的 docId 在数据库中不存在或不属于该 kbId / classId
- **THEN** 系统返回 HTTP 404 Not Found

## MODIFIED Requirements

### Requirement: 上传知识库文档
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs/:kbId/documents`（multipart/form-data，字段名 `file`）上传文档。系统 MUST 接受 `.pdf`、`.txt`、`.md` 三种格式。文件 MUST 落盘到 `<storageRoot>/schools/<school>/classes/<classId>/kbs/<kbId>/docs/<uuid>_<originalName>`。落盘后系统 MUST 创建 kb_documents 数据库记录，chunk_count 固定为 0，status="uploaded"。向量化索引 MUST 由教师后续手动触发（见"手动触发文档向量索引" requirement）。

#### Scenario: 成功上传
- **WHEN** 班级教师上传合法的 .pdf / .txt / .md 文件
- **THEN** 文件落盘，数据库记录创建（chunk_count=0，status="uploaded"），返回 HTTP 201 包含 documentId、chunkCount=0、status="uploaded"

#### Scenario: 不支持的文件格式
- **WHEN** 上传非 .pdf/.txt/.md 文件
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: student 尝试上传
- **WHEN** 学生用户访问上传接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: 知识库不存在
- **WHEN** 指定的 kbId 在数据库中不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 列出知识库文档
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/kbs/:kbId/documents` 查看该知识库下已上传文档列表。每条记录 MUST 包含 documentId、originalName、chunkCount、uploadedAt、status（"uploaded" | "indexing" | "ready" | "failed"）、indexedAt（可为 null）。

#### Scenario: 成员成功获取文档列表
- **WHEN** 班级成员或 admin 请求
- **THEN** 返回该知识库所有已上传文档的元数据数组，每条包含 status 和 indexedAt

#### Scenario: 非成员访问
- **WHEN** 非班级成员且非 admin 用户请求
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 向量查询接口废弃
原 `POST /api/classes/:classId/kbs/:kbId/query` 单 KB 向量查询路由已被新的 `POST /api/classes/:classId/kbs/query`（支持多 KB 批量）替代。旧路由 MUST 返回 HTTP 410 Gone，响应体 MUST 指明新的接口路径。

#### Scenario: 客户端调用旧路由
- **WHEN** 客户端向旧的 `/:kbId/query` 路径发送请求
- **THEN** 系统返回 HTTP 410 Gone，body 包含 message 提示使用 `/classes/:classId/kbs/query`