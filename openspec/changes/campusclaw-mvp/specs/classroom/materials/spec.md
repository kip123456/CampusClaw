## Purpose

管理每个班级的教学资料（PDF 文件）。教师可上传，所有班级成员可查看和下载。资料按学校 + 班级分层存储在本地磁盘。

## ADDED Requirements

### Requirement: 上传教学资料
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/materials`（multipart/form-data，字段名 `file`）上传 PDF 教学资料。系统 MUST 校验文件类型，仅接受 `.pdf` 扩展名或 MIME 为 `application/pdf` 的文件。文件 MUST 存储到本地磁盘 `<storageRoot>/schools/<school>/classes/<classId>/materials/<uuid>_<originalName>` 路径下。数据库 MUST 记录 fileId（UUID）、原始文件名、文件大小、上传者 userId、上传时间戳。

#### Scenario: teacher 成功上传 PDF
- **WHEN** 班级教师上传一个合法 PDF 文件
- **THEN** 文件落盘到正确路径，创建数据库记录，返回 HTTP 201 包含 fileId、originalName、size、uploadedAt

#### Scenario: 非 PDF 文件被拒绝
- **WHEN** 上传文件扩展名不是 .pdf 或 MIME 不匹配
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: student 尝试上传
- **WHEN** 学生用户访问上传接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: 非班级教师尝试上传
- **WHEN** 既非该班级教师也非 admin 的用户访问上传接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 列出教学资料
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/materials` 查看该班级已上传的教学资料列表，每条包含 fileId、originalName、size、uploadedBy、uploadedAt。

#### Scenario: 成员成功获取列表
- **WHEN** 班级成员或 admin 请求资料列表
- **THEN** 返回该班级所有资料的元数据数组

#### Scenario: 非成员访问
- **WHEN** 非班级成员且非 admin 用户请求资料列表
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 下载教学资料
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/materials/:fileId` 下载指定资料。系统 MUST 返回文件流，`Content-Type` 为 `application/pdf`，`Content-Disposition` 包含原始文件名。

#### Scenario: 成功下载
- **WHEN** 班级成员或 admin 下载存在的文件
- **THEN** 系统返回文件流，HTTP 200

#### Scenario: 文件不存在
- **WHEN** 指定的 fileId 在数据库或磁盘上不存在
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: 非成员访问
- **WHEN** 非班级成员且非 admin 用户下载文件
- **THEN** 系统返回 HTTP 403 Forbidden