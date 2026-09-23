## Purpose

为 CampusClaw 提供班级创建、多教师协作管理、学生添加与成员查询能力。一个教师/学生可同时属于多个班级，一个班级可由多名教师共同管理。

## ADDED Requirements

### Requirement: 创建班级
系统 MUST 允许 teacher 或 admin 创建班级。创建时班级的 school MUST 取自创建者的 school（admin 可在请求中指定 school）。创建成功后系统 MUST 自动为该班级创建一个名为「默认知识库」的知识库（见 classroom/knowledge-base capability）。

#### Scenario: teacher 成功创建班级
- **WHEN** 已认证的 teacher 用户发送 `POST /api/classes` 提供 name 和可选 description
- **THEN** 系统创建班级，school 继承自该 teacher 的 school，自动创建默认知识库，返回 HTTP 201 包含 classId、school、name、memberCount=0、defaultKbId

#### Scenario: student 尝试创建班级
- **WHEN** role 为 student 的用户发送 `POST /api/classes`
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: admin 可指定任意 school 创建班级
- **WHEN** admin 发送 `POST /api/classes` 并在请求中指定 school 字段
- **THEN** 系统以指定 school 创建班级（可不同于 admin 自身的 school="admin"）

### Requirement: 邀请教师加入班级
班级中的教师成员（或 admin）MUST 能够邀请其他 teacher 角色的用户加入该班级。被邀请者的 school MUST 与班级的 school 一致（admin 例外）。已在班级中的教师不允许重复添加。

#### Scenario: 成功邀请
- **WHEN** 班级教师成员发送 `POST /api/classes/:classId/teachers` 指定 targetSchool 和 targetStudentId，且目标用户存在、role=teacher、school 匹配
- **THEN** 系统将其加入班级教师列表，返回 HTTP 200

#### Scenario: 目标用户不存在
- **WHEN** targetSchool + targetStudentId 在系统中不存在
- **THEN** 系统返回 HTTP 404

#### Scenario: 目标不是教师
- **WHEN** 目标用户 role 为 student
- **THEN** 系统返回 HTTP 400

#### Scenario: 目标 school 与班级不匹配（非 admin）
- **WHEN** 目标用户 school 与班级 school 不一致，且邀请者非 admin
- **THEN** 系统返回 HTTP 403

#### Scenario: 已在班级中
- **WHEN** 目标教师已是该班级成员
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: 邀请者非班级成员
- **WHEN** 邀请者既非该班级教师，也非 admin
- **THEN** 系统返回 HTTP 403

### Requirement: 添加学生到班级
班级中的教师成员（或 admin）MUST 能够将 student 角色的用户加入班级。被添加者的 school MUST 与班级 school 一致（admin 例外）。

#### Scenario: 成功添加学生
- **WHEN** 班级教师发送 `POST /api/classes/:classId/students` 指定 targetSchool 和 targetStudentId，目标存在、role=student、school 匹配
- **THEN** 系统将其加入班级学生列表，返回 HTTP 200

#### Scenario: 目标不是学生
- **WHEN** 目标用户 role 为 teacher
- **THEN** 系统返回 HTTP 400

#### Scenario: 已在班级中
- **WHEN** 目标学生已是该班级成员
- **THEN** 系统返回 HTTP 409 Conflict

### Requirement: 查询班级成员
班级成员（teacher 或 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/members` 获取该班级完整成员列表，教师与学生分开展示。

#### Scenario: 成员成功查询
- **WHEN** 班级成员或 admin 查询成员列表
- **THEN** 返回教师列表和学生列表，每人项包含 userId、school、studentId、name

#### Scenario: 非成员非 admin 访问
- **WHEN** 既非班级成员也非 admin 的用户访问该接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 查询我所在的班级
任何已认证用户 MUST 能够通过 `GET /api/me/classes` 获取自己作为 teacher 或 student 所属的全部班级，按加入类型分开展示。

#### Scenario: teacher 查询我所在的班级
- **WHEN** teacher 用户调用此接口
- **THEN** 返回其作为教师管理的所有班级信息列表

#### Scenario: student 查询我所在的班级
- **WHEN** student 用户调用此接口
- **THEN** 返回其作为学生加入的所有班级信息列表