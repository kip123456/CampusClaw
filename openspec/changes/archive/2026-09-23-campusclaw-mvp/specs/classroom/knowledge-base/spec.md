## ADDED Requirements

### Requirement: 班级默认知识库
创建班级时系统 MUST 自动创建一个属于该班级的知识库，名为「默认知识库」，`is_default` 字段为 true。每个班级 MUST 恰好有一个默认知识库，该知识库不可删除。

#### Scenario: 创建班级时自动创建默认知识库
- **WHEN** 班级创建流程完成
- **THEN** 数据库中存在一条 knowledge_bases 记录，关联该 classId，name="默认知识库"，is_default=1

### Requirement: 创建知识库
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs` 为班级创建额外的知识库。name 在同一班级内 MUST 唯一。

#### Scenario: teacher 成功创建知识库
- **WHEN** 班级教师发送请求提供 name
- **THEN** 系统创建知识库记录，返回 HTTP 201 包含 kbId、classId、name、is_default=false

#### Scenario: name 在班级内重复
- **WHEN** 请求的 name 与该班级已有知识库重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: student 尝试创建
- **WHEN** 学生用户访问创建接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 上传知识库文档
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs/:kbId/documents`（multipart/form-data，字段名 `file`）上传文档。系统 MUST 接受 `.pdf`、`.txt`、`.md` 三种格式。文件 MUST 落盘到 `<storageRoot>/schools/<school>/classes/<classId>/kbs/<kbId>/docs/<uuid>_<originalName>`。落盘后系统 MUST 创建 kb_documents 数据库记录（chunk_count 固定为 0，向量化预留给后续迭代）。

#### Scenario: 成功上传
- **WHEN** 班级教师上传合法的 .pdf / .txt / .md 文件
- **THEN** 文件落盘，数据库记录创建，返回 HTTP 201 包含 documentId、chunks=0、status="uploaded"

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
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/kbs/:kbId/documents` 查看该知识库下已上传文档列表，每条包含 documentId、originalName、chunkCount、uploadedAt。

#### Scenario: 成员成功获取文档列表
- **WHEN** 班级成员或 admin 请求
- **THEN** 返回该知识库所有已上传文档的元数据数组

#### Scenario: 非成员访问
- **WHEN** 非班级成员且非 admin 用户请求
- **THEN** 系统返回 HTTP 403 Forbidden