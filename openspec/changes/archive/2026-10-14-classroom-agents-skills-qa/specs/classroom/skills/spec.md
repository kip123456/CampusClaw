## Purpose

为班级教师提供"技能"管理能力：技能是一段结构化的 AI 工具定义，包含名称、描述和可执行的 Prompt 模板，教师可将其创建在班级下、供对话智能体绑定使用，实现常见教学场景（如作文批改、知识点讲解）的复用。

## ADDED Requirements

### Requirement: 创建班级技能

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/skills` 为班级创建技能。请求 body MUST 包含 `name`（必填，班级内唯一）和 `prompt`（必填，技能的 Prompt 模板，最长 4000 字符），可选包含 `description`（技能描述，最长 500 字符）。name 在同一班级内 MUST 唯一。

#### Scenario: 教师成功创建技能
- **WHEN** 班级教师发送请求提供 name 和 prompt
- **THEN** 系统创建技能记录，返回 HTTP 201 包含 skillId、classId、name、prompt、description（可为 null）、createdAt

#### Scenario: 技能名称在班级内重复
- **WHEN** 请求的 name 与该班级已有技能重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: prompt 缺失
- **WHEN** 请求未提供 prompt 或 prompt 为空字符串
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: prompt 超出长度上限
- **WHEN** prompt 长度超过 4000 字符
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: student 尝试创建技能
- **WHEN** 学生用户访问创建接口
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: admin 创建技能
- **WHEN** admin 用户发送创建请求
- **THEN** 系统创建技能记录，不受班级归属限制

### Requirement: 列出班级技能

班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/skills` 查看该班级下的所有技能。返回结果 MUST 包含 skillId、classId、name、description、createdAt。返回结果 MAY 省略 prompt 字段以保护技能的 Prompt 模板细节，仅在智能体详情等特定场景下返回完整 prompt。

#### Scenario: 班级成员获取技能列表
- **WHEN** 班级成员（教师或学生）请求
- **THEN** 返回该班级所有技能的数组，每条包含 skillId、name、description、createdAt，不含 prompt

#### Scenario: 非班级成员访问
- **WHEN** 非班级成员且非 admin 用户请求
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 获取单个技能详情

班级教师成员（或 admin）MUST 能够通过 `GET /api/classes/:classId/skills/:skillId` 获取单个技能详情（含 prompt）。学生 MUST NOT 能获取 prompt 内容。

#### Scenario: 教师获取技能详情
- **WHEN** 班级教师请求
- **THEN** 返回完整技能对象，包含 prompt 字段

#### Scenario: 学生尝试获取 prompt
- **WHEN** 学生请求技能详情
- **THEN** 返回技能对象但 prompt 字段为 null 或省略

#### Scenario: 技能不存在或不属于该班级
- **WHEN** 指定的 skillId 在数据库中不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 更新班级技能

班级教师成员（或 admin）MUST 能够通过 `PUT /api/classes/:classId/skills/:skillId` 更新技能的 name、prompt 或 description。班级内 name MUST 保持唯一。

#### Scenario: 教师更新技能 prompt
- **WHEN** 班级教师提供新的 prompt
- **THEN** 系统更新记录，返回 HTTP 200 包含更新后的完整技能对象

#### Scenario: 更新后 name 与其他技能冲突
- **WHEN** 请求的 name 与该班级其他已有技能重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: skillId 不存在或不属于该班级
- **WHEN** 指定的 skillId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: student 尝试更新
- **WHEN** 学生用户访问更新接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 删除班级技能

班级教师成员（或 admin）MUST 能够通过 `DELETE /api/classes/:classId/skills/:skillId` 删除技能。若该技能已被一个或多个智能体绑定，删除 MUST 同时解除所有绑定关系（级联）。

#### Scenario: 教师成功删除未绑定技能
- **WHEN** 班级教师指定存在的 skillId
- **THEN** 系统删除技能记录，返回 HTTP 200

#### Scenario: 删除已被智能体绑定的技能
- **WHEN** 技能被一个或多个智能体绑定
- **THEN** 系统先删除所有 agent_skills 关联，再删除技能本身，返回 HTTP 200

#### Scenario: skillId 不存在
- **WHEN** 指定的 skillId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: student 尝试删除
- **WHEN** 学生用户访问删除接口
- **THEN** 系统返回 HTTP 403 Forbidden