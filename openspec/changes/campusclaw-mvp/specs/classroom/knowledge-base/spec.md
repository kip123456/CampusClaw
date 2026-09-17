## Purpose

为每个班级提供向量化知识库能力。创建班级时自动建立一个默认知识库，教师可额外创建。上传的文档经文本解析、分块、嵌入后写入 ChromaDB，支持后续语义检索。

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

### Requirement: 上传文档到知识库并向量化
班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/kbs/:kbId/documents`（multipart/form-data，字段名 `file`）上传文档。系统 MUST 接受 `.pdf`、`.txt`、`.md` 三种格式。文件 MUST 落盘到 `<storageRoot>/schools/<school>/classes/<classId>/kbs/<kbId>/docs/<uuid>_<originalName>`。落盘后系统 MUST 依次执行：解析文本 → 按固定长度窗口 + overlap 分块 → 对每个 chunk 计算 embedding → 写入 ChromaDB（每条带 metadata: kbId, documentId, school, chunkIndex）→ 更新 kb_documents.chunk_count。

#### Scenario: 成功上传并处理
- **WHEN** 班级教师上传合法的 .pdf / .txt / .md 文件
- **THEN** 文件落盘，文本解析分块完成，向量写入 ChromaDB，数据库记录 chunk_count，返回 HTTP 201 包含 documentId、chunks、status="indexed"

#### Scenario: 不支持的文件格式
- **WHEN** 上传非 .pdf/.txt/.md 文件
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: student 尝试上传
- **WHEN** 学生用户访问上传接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: 知识库不存在
- **WHEN** 指定的 kbId 在数据库中不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: PDF 为空或无法提取文本
- **WHEN** PDF 文件不含可提取文本（如扫描版图片）
- **THEN** 系统仍保存文件，但 chunk_count 为 0，返回成功响应并附带提示

### Requirement: 列出知识库文档
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/kbs/:kbId/documents` 查看该知识库下已上传文档列表，每条包含 documentId、originalName、chunkCount、indexedAt。

#### Scenario: 成员成功获取文档列表
- **WHEN** 班级成员或 admin 请求
- **THEN** 返回该知识库所有已索引文档的元数据数组

#### Scenario: 非成员访问
- **WHEN** 非班级成员且非 admin 用户请求
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 向量检索接口
班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `POST /api/classes/:classId/kbs/:kbId/query` 对知识库执行向量检索。请求体包含 query（自然语言字符串）和可选 topK。系统 MUST 将 query 嵌入后在 ChromaDB 中检索最近邻，返回最相关的 chunk 数组，每项包含 chunk 文本、distance、documentId。

#### Scenario: 成功检索
- **WHEN** 班级成员或 admin 发送有效的 query
- **THEN** 系统返回 topK 个最相关 chunk，按 distance 升序排列，HTTP 200

#### Scenario: 知识库为空
- **WHEN** 目标知识库尚未索引任何文档
- **THEN** 返回空结果数组，HTTP 200

#### Scenario: 非成员访问
- **WHEN** 非班级成员且非 admin 用户访问检索接口
- **THEN** 系统返回 HTTP 403 Forbidden