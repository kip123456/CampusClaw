## Purpose

首批接口测试用例集合，覆盖登录、检索、技能 CRUD、创建会话并发送消息四大场景，验证 HTTP 响应正确性与 SQLite 数据库落库一致性。

## ADDED Requirements

### Requirement: 登录接口测试
MUST 覆盖 `POST /api/auth/login` 的以下场景：
- 使用正确的 `school`/`studentId`/`password` 登录，返回 200 和有效 JWT token，且响应体 user 字段与 `users` 表对应行一致
- 使用错误密码登录，返回 401 `INVALID_CREDENTIALS`
- 缺少必填字段，返回 400 `BAD_REQUEST`

#### Scenario: 管理员登录成功
- **WHEN** 以默认 admin 账号 (`school=admin`, `studentId=admin`, `password=admin123`) 调用登录接口
- **THEN** 返回 HTTP 200，响应包含 `token` 和 `user` 对象，且 DB 中存在匹配的 `users` 记录

#### Scenario: 密码错误返回 401
- **WHEN** 使用正确 school/studentId 但错误 password 调用登录接口
- **THEN** 返回 HTTP 401，`error` 字段为 `INVALID_CREDENTIALS`

### Requirement: 检索接口测试
MUST 覆盖 `GET /api/classes/me/classes` 及班级内资源的列表查询（技能列表、agents 列表、materials 列表、KB 文档列表、会话列表、消息列表）。

#### Scenario: 登录后获取我的班级列表
- **WHEN** 教师账号调用 `GET /api/classes/me/classes`
- **THEN** 返回 200，JSON 包含 `asTeacher` 和 `asStudent` 两个数组，且 DB 中 `class_teachers`/`class_students` 的关联关系与返回值一致

#### Scenario: 技能列表与 DB 一致
- **WHEN** 教师调用 `GET /api/classes/:classId/skills`
- **THEN** 返回数组长度等于 DB `skills` 表中该 `class_id` 的记录数，且每条记录的 `skillId`、`name`、`description` 与 DB 一致

### Requirement: 技能 CRUD 测试
MUST 覆盖 `POST`/`GET`/`GET by id`/`PUT`/`DELETE /api/classes/:classId/skills` 的完整生命周期。

#### Scenario: 创建技能后 DB 有对应记录
- **WHEN** 教师通过 POST 新建技能 `name=测试技能`
- **THEN** 返回 HTTP 201，响应 `skillId` 非空；DB `skills` 表中存在该 id 的记录，且 `prompt` 字段与提交值完全一致

#### Scenario: 重复名称创建返回 409
- **WHEN** 在同一班级创建已存在名称的技能
- **THEN** 返回 HTTP 409，`error` 为 `CONFLICT`，DB 中原有记录未被修改

#### Scenario: 更新技能后 DB 字段同步
- **WHEN** 通过 PUT 更新技能的 `prompt` 字段
- **THEN** 返回 200，DB 中该 `skillId` 对应行的 `prompt` 字段已更新为新值

#### Scenario: 删除技能后 DB 中无此记录
- **WHEN** 通过 DELETE 删除一个技能
- **THEN** 返回 200 `{success: true}`，DB 查询 `SELECT * FROM skills WHERE id = ?` 返回空集；同时 `agent_skills` 关联表不再有该 `skillId`

#### Scenario: 学生无法创建技能
- **WHEN** 学生账号尝试 POST 创建技能
- **THEN** 返回 403 或 404

### Requirement: 创建会话并发送消息测试
MUST 覆盖从创建 agent、到发起 `POST /api/classes/:classId/agents/:agentId/chat` 发送消息、再到 `GET /conversations` 和 `GET /conversations/:id/messages` 拉取历史的完整链路。

#### Scenario: 发送第一条消息后 DB 落库
- **WHEN** 用户对 agent 发起 chat 请求（无 conversationId）
- **THEN** 返回 200 且 `text/event-stream`，流式响应 `done` 事件包含 `conversationId`；DB 中：
  - `agent_conversations` 表新增一行，`last_message_at` 已设置
  - `agent_messages` 表至少有两行（role=user 和 role=assistant），且 `citations` 字段格式正确

#### Scenario: 拉取会话列表包含新建会话
- **WHEN** 调用 `GET /conversations`
- **THEN** 返回的数组包含上一步创建的 `conversationId`，且 `messageCount >= 2`

#### Scenario: 拉取消息历史与 DB 一致
- **WHEN** 调用 `GET /conversations/:id/messages`
- **THEN** 返回的消息条数等于 DB 中该 conversation 下的记录数，且 `content` 字段与 DB 一致

#### Scenario: 无 LLM 配置时 chat 返回 503
- **WHEN** 后端未配置 `LLM_BASE_URL` 和 `LLM_MODEL`
- **THEN** chat 接口返回 503 `SERVICE_UNAVAILABLE`，且 DB 不落库任何 agent_conversations / agent_messages 记录

### Requirement: 跨用例数据隔离
各用例 MUST 通过独立的测试账号、独立班级和动态生成的名称，避免相互污染。用例运行前可调用 admin 接口创建临时用户，运行后不强制清理（以便失败时排查），但后续运行 SHALL 容忍已存在的同名资源。

#### Scenario: 用例之间互不影响
- **WHEN** 运行 `skills/POST.py` 和 `skills/GET.py` 两个用例
- **THEN** 每个用例使用自己创建的资源 ID，不依赖另一个用例的执行顺序或遗留数据