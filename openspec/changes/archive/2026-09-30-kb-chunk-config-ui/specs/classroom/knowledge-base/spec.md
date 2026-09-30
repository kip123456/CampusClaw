## MODIFIED Requirements

### Requirement: 创建知识库
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs` 为班级创建额外的知识库。name 在同一班级内 MUST 唯一。请求 body 可选包含 `chunkSize`（默认 1500，范围 100-10000）和 `chunkOverlap`（默认 50，范围 0-1000），作为该知识库下所有文档的默认 chunk 划分参数。创建时提供的 chunkSize 和 chunkOverlap MUST 写入 knowledge_bases 表的新字段。

#### Scenario: teacher 成功创建知识库
- **WHEN** 班级教师发送请求提供 name
- **THEN** 系统创建知识库记录，返回 HTTP 201 包含 kbId、classId、name、is_default=false、chunkSize、chunkOverlap

#### Scenario: teacher 使用默认 chunk 配置创建知识库
- **WHEN** 班级教师发送请求仅提供 name，未提供 chunkSize 和 chunkOverlap
- **THEN** 系统创建知识库记录，chunkSize 默认 1500、chunkOverlap 默认 50，返回 HTTP 201

#### Scenario: teacher 自定义 chunk 配置创建知识库
- **WHEN** 班级教师发送请求提供 name、chunkSize=2000、chunkOverlap=100
- **THEN** 系统创建知识库记录并持久化指定值，返回 HTTP 201

#### Scenario: chunk 参数超出合法范围
- **WHEN** 请求的 chunkSize < 100 或 > 10000，或 chunkOverlap < 0 或 > 1000
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: name 在班级内重复
- **WHEN** 请求的 name 与该班级已有知识库重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: student 尝试创建
- **WHEN** 学生用户访问创建接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 手动触发文档向量索引
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs/:kbId/documents/:docId/index` 手动对单个已上传文档发起向量索引。系统 MUST 校验该文档存在且属于指定的 kbId 和 classId。已处于 `indexing` 状态的文档 MUST 返回 HTTP 409 Conflict 避免重复触发。索引流程 MUST 异步执行，接口在任务入队后立即返回 HTTP 202 Accepted。请求 body 可选包含 `chunkSize` 和 `chunkOverlap`，覆盖知识库的默认配置；未提供时使用知识库的 chunkSize/chunkOverlap。实际使用的 chunk 配置 MUST 持久化到 kb_documents 表。

#### Scenario: 成功发起单文档索引
- **WHEN** 班级教师对一个 status="uploaded" 或 status="failed" 的文档发送索引请求
- **THEN** 系统将索引任务写入持久化队列，将文档状态置为 "indexing"，返回 HTTP 202 包含 taskId

#### Scenario: 成功发起单文档索引（使用 KB 默认配置）
- **WHEN** 班级教师发送索引请求，未提供 chunkSize/chunkOverlap
- **THEN** 系统将索引任务写入队列，使用 KB 的 chunkSize/chunkOverlap，返回 HTTP 202

#### Scenario: 成功发起单文档索引（覆盖 KB 默认配置）
- **WHEN** 班级教师发送索引请求并提供 chunkSize=800、chunkOverlap=0
- **THEN** 系统将覆盖值随索引任务一起入队，worker 执行时使用覆盖值并将其持久化到 kb_documents.chunk_size / chunk_overlap

#### Scenario: 一次性索引 KB 下所有待索引文档
- **WHEN** 班级教师对知识库发送 `POST /api/classes/:classId/kbs/:kbId/index-all`
- **THEN** 系统扫描该知识库下所有 status != "ready" 的文档，为每个文档创建索引任务，返回 HTTP 202 包含已入队的 taskId 列表

#### Scenario: 一次性索引 KB 下所有待索引文档（使用 KB 默认配置）
- **WHEN** 班级教师对知识库发送 `POST /api/classes/:classId/kbs/:kbId/index-all`
- **THEN** 每个任务使用 KB 的默认 chunk 配置（覆盖值为 NULL），worker 执行时从 KB 读取

#### Scenario: 文档正在索引中，重复触发
- **WHEN** 文档当前 status="indexing" 时再次发送索引请求
- **THEN** 系统返回 HTTP 409 Conflict，body 包含当前状态和已有 taskId

#### Scenario: 非教师尝试触发索引
- **WHEN** 学生用户访问索引接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: 文档或知识库不存在
- **WHEN** 指定的 docId 或 kbId 在数据库中不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 列出知识库文档
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/kbs/:kbId/documents` 查看该知识库下已上传文档列表。每条记录 MUST 包含 documentId、originalName、chunkCount、uploadedAt、status（"uploaded" | "indexing" | "ready" | "failed"）、indexedAt（可为 null）、chunkSize（可为 null，未索引时为 null）、chunkOverlap（可为 null，未索引时为 null）。

#### Scenario: 成员成功获取文档列表
- **WHEN** 班级成员或 admin 请求
- **THEN** 返回该知识库所有已上传文档的元数据数组，每条包含 status、indexedAt、chunkSize、chunkOverlap

#### Scenario: 未索引文档的 chunk 配置为空
- **WHEN** 文档 status="uploaded" 尚未经过索引
- **THEN** 该文档的 chunkSize 和 chunkOverlap 字段返回 null

#### Scenario: 非成员访问
- **WHEN** 非班级成员且非 admin 用户请求
- **THEN** 系统返回 HTTP 403 Forbidden

## ADDED Requirements

### Requirement: 知识库 chunk 配置持久化
knowledge_bases 表 MUST 包含 `chunk_size`（INTEGER NOT NULL DEFAULT 1500）和 `chunk_overlap`（INTEGER NOT NULL DEFAULT 50）列。kb_documents 表 MUST 包含 `chunk_size`（INTEGER）和 `chunk_overlap`（INTEGER）列，记录该文档最后一次索引实际使用的参数值。数据库迁移 MUST 在启动时自动为已有表添加缺失的列（带默认值），保证向后兼容。

#### Scenario: 新创建的 KB 继承默认 chunk 配置
- **WHEN** 系统为一个班级自动创建默认知识库
- **THEN** 该 KB 的 chunk_size=1500、chunk_overlap=50

#### Scenario: 服务启动时自动迁移
- **WHEN** 服务启动检测到 knowledge_bases 表缺少 chunk_size 或 chunk_overlap 列
- **THEN** 系统执行 ALTER TABLE 语句添加缺失列并设置 DEFAULT 值，所有已有 KB 获得默认值

#### Scenario: 文档索引后记录实际配置
- **WHEN** 一个文档完成索引（任意 chunk 配置）
- **THEN** kb_documents 表中该文档的 chunk_size 和 chunk_overlap 被更新为实际使用的值

### Requirement: 知识库信息接口返回 chunk 配置
`GET /api/classes/:classId/kbs` 返回的知识库列表中，每条记录 MUST 包含 `chunkSize` 和 `chunkOverlap` 字段。

#### Scenario: 返回 KB 列表包含 chunk 配置
- **WHEN** 班级成员请求知识库列表
- **THEN** 每条 KB 记录包含 chunkSize 和 chunkOverlap

### Requirement: KB chunk 参数校验
系统 MUST 对 chunkSize 和 chunkOverlap 进行校验：chunkSize 范围 100-10000（字符数），chunkOverlap 范围 0-1000。chunkOverlap MUST 小于 chunkSize。不满足条件时返回 HTTP 400。

#### Scenario: chunkSize 过小
- **WHEN** 请求的 chunkSize=50
- **THEN** 返回 HTTP 400

#### Scenario: chunkOverlap >= chunkSize
- **WHEN** 请求 chunkSize=1000、chunkOverlap=1000 或更大
- **THEN** 返回 HTTP 400

#### Scenario: 合法的边界值
- **WHEN** 请求 chunkSize=100、chunkOverlap=0
- **THEN** 系统接受该配置

#### Scenario: 合法的上限值
- **WHEN** 请求 chunkSize=10000、chunkOverlap=1000
- **THEN** 系统接受该配置