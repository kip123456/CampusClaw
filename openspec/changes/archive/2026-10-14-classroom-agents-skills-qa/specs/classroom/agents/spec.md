## Purpose

为班级教师提供对话智能体管理能力：每个智能体可配置 system prompt、绑定若干知识库和技能、设置可见范围，班级成员可使用智能体进行问答。智能体是场景化 AI 助手的核心实体，教师通过配置将知识库和技能组合为特定教学场景的助手。

## ADDED Requirements

### Requirement: 创建班级智能体

班级教师成员（或 admin）MUST 能够通过 `POST /api/classes/:classId/agents` 为班级创建智能体。请求 body MUST 包含 `name`（必填，班级内唯一），可选包含 `description`（智能体描述）、`systemPrompt`（智能体的 system prompt，最长 4000 字符）、`kbIds`（绑定的知识库 ID 数组，默认空数组）、`skillIds`（绑定的技能 ID 数组，默认空数组）、`visibility`（`"all"` 或 `"teachers"`，默认 `"all"`）。

#### Scenario: 教师成功创建智能体（全部字段）
- **WHEN** 班级教师提供 name、systemPrompt、kbIds、skillIds、visibility
- **THEN** 系统创建智能体记录和关联记录，返回 HTTP 201 包含 agentId、classId、name、description、systemPrompt、kbIds、skillIds、visibility、createdAt

#### Scenario: 教师最小化创建智能体
- **WHEN** 班级教师仅提供 name
- **THEN** 系统创建智能体，systemPrompt 默认为 null，kbIds 和 skillIds 为空数组，visibility 为 `"all"`，返回 HTTP 201

#### Scenario: kbIds 包含不属于该班级的知识库
- **WHEN** kbIds 中有任意一个不属于指定 classId
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: skillIds 包含不属于该班级的技能
- **WHEN** skillIds 中有任意一个不属于指定 classId
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: name 在班级内重复
- **WHEN** 请求的 name 与该班级已有智能体重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: visibility 非法值
- **WHEN** visibility 不是 `"all"` 也不是 `"teachers"`
- **THEN** 系统返回 HTTP 400 Bad Request

#### Scenario: student 尝试创建
- **WHEN** 学生用户访问创建接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 列出班级智能体

班级所有成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/agents` 查看班级智能体列表。学生 MUST 仅能看到 visibility="all" 的智能体。教师和 admin MUST 能看到全部智能体。返回结果 MUST 包含 agentId、classId、name、description、visibility、createdAt，以及 kbIds 和 skillIds 数量（如 `kbCount`、`skillCount`），省略 systemPrompt 以保护 prompt 细节。

#### Scenario: 教师获取全部智能体
- **WHEN** 班级教师或 admin 请求
- **THEN** 返回该班级全部智能体数组，每条包含 kbCount、skillCount，不含 systemPrompt

#### Scenario: 学生获取可见智能体
- **WHEN** 学生用户请求
- **THEN** 仅返回 visibility="all" 的智能体

#### Scenario: 非班级成员访问
- **WHEN** 非班级成员且非 admin 用户请求
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 获取智能体详情

班级成员（teacher 和 student）以及 admin MUST 能够通过 `GET /api/classes/:classId/agents/:agentId` 获取单个智能体详情。学生 MUST NOT 能看到 visibility="teachers" 的智能体。教师和 admin MUST 能看到完整配置（含 systemPrompt、kbIds 完整列表、skillIds 完整列表）。

#### Scenario: 教师获取智能体详情
- **WHEN** 班级教师或 admin 请求
- **THEN** 返回完整智能体对象，包含 systemPrompt、kbIds、skillIds

#### Scenario: 学生获取可见智能体详情
- **WHEN** 学生请求 visibility="all" 的智能体
- **THEN** 返回完整对象，不含 systemPrompt（或 systemPrompt 为 null）

#### Scenario: 学生尝试查看教师专用智能体
- **WHEN** 学生请求 visibility="teachers" 的智能体
- **THEN** 系统返回 HTTP 404 Not Found（与不存在一致，避免泄露）

#### Scenario: 智能体不存在或不属于该班级
- **WHEN** 指定的 agentId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

### Requirement: 更新班级智能体

班级教师成员（或 admin）MUST 能够通过 `PUT /api/classes/:classId/agents/:agentId` 更新智能体的 name、description、systemPrompt、kbIds、skillIds 或 visibility。更新 kbIds 或 skillIds MUST 先清空旧关联再批量写入新关联。

#### Scenario: 教师更新智能体配置
- **WHEN** 班级教师提供新的 systemPrompt 和 kbIds
- **THEN** 系统更新智能体记录，重建关联表，返回 HTTP 200 包含更新后的完整对象

#### Scenario: 更新后 name 与其他智能体冲突
- **WHEN** 请求的 name 与该班级其他智能体重名
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: kbIds 包含非法 ID
- **WHEN** kbIds 中有不属于该班级的知识库
- **THEN** 系统返回 HTTP 400 Bad Request，且原始关联不受影响（事务回滚）

#### Scenario: student 尝试更新
- **WHEN** 学生用户访问更新接口
- **THEN** 系统返回 HTTP 403 Forbidden

### Requirement: 删除班级智能体

班级教师成员（或 admin）MUST 能够通过 `DELETE /api/classes/:classId/agents/:agentId` 删除智能体。删除 MUST 级联清除所有关联记录（agent_kbs、agent_skills、agent_conversations、agent_messages）。

#### Scenario: 教师成功删除智能体
- **WHEN** 班级教师指定存在的 agentId
- **THEN** 系统删除智能体及其全部关联数据，返回 HTTP 200

#### Scenario: agentId 不存在
- **WHEN** 指定的 agentId 不存在或不属于该 classId
- **THEN** 系统返回 HTTP 404 Not Found

#### Scenario: student 尝试删除
- **WHEN** 学生用户访问删除接口
- **THEN** 系统返回 HTTP 403 Forbidden