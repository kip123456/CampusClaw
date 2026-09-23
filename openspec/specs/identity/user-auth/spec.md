## Purpose

提供 CampusClaw 平台的统一账户与认证能力：以「学校 + 学号」作为全局唯一登录标识，支持 admin 创建新账户、所有角色登录、以及自主修改密码。

## ADDED Requirements

### Requirement: 账户创建（仅 admin）
系统 MUST 仅允许 role 为 admin 的已认证用户创建新的 teacher 或 student 账户。创建时 `(school, studentId)` 组合 MUST 唯一。

#### Scenario: admin 成功创建账户
- **WHEN** 认证的 admin 用户发送 `POST /api/admin/users`，请求体包含唯一的 school + studentId 和合法的 password、role、name
- **THEN** 系统创建新用户并返回 HTTP 201，响应体包含 userId、school、studentId、role、name

#### Scenario: 非 admin 尝试创建账户
- **WHEN** 非 admin 用户发送 `POST /api/admin/users`
- **THEN** 系统返回 HTTP 403 Forbidden

#### Scenario: school + studentId 已存在
- **WHEN** admin 发送创建请求，其中 `(school, studentId)` 与已有用户冲突
- **THEN** 系统返回 HTTP 409 Conflict

#### Scenario: 缺少必填字段
- **WHEN** admin 发送的请求体缺少 school、studentId、password、role 或 name 中任一字段
- **THEN** 系统返回 HTTP 400 Bad Request

### Requirement: 默认 admin 账户
系统 MUST 在首次启动时自动创建一个 admin 账户，其 school 和 studentId 均为字符串 `"admin"`，密码从环境变量 `ADMIN_INITIAL_PASSWORD` 读取。

#### Scenario: 首次启动自动创建 admin
- **WHEN** 系统首次启动且数据库为空
- **THEN** 系统自动创建 role=admin、school="admin"、studentId="admin" 的用户，密码哈希存储

#### Scenario: 数据库已有用户时不重复创建
- **WHEN** 系统启动时数据库已存在至少一条用户记录
- **THEN** 系统跳过默认 admin 创建步骤

### Requirement: 登录
系统 MUST 支持通过 `POST /api/auth/login` 以 school + studentId + password 三元组登录。密码校验 MUST 使用 bcrypt 哈希比对。登录成功返回 JWT access token。

#### Scenario: 成功登录
- **WHEN** 用户提供的 school、studentId 精确匹配且 password 哈希正确
- **THEN** 系统返回 HTTP 200，包含 token 和用户基本信息（userId、school、studentId、role、name）

#### Scenario: 学号不存在
- **WHEN** 提供的 school + studentId 在系统中不存在
- **THEN** 系统返回 HTTP 401 Unauthorized

#### Scenario: 密码错误
- **WHEN** school + studentId 存在但密码不匹配
- **THEN** 系统返回 HTTP 401 Unauthorized

#### Scenario: 缺少字段
- **WHEN** 请求体缺少 school、studentId 或 password
- **THEN** 系统返回 HTTP 400 Bad Request

### Requirement: 修改密码
系统 MUST 允许任意已登录用户修改自己的密码（包括 admin）。修改时 MUST 校验旧密码正确。

#### Scenario: 成功修改密码
- **WHEN** 已认证用户发送 `POST /api/auth/change-password` 且 oldPassword 正确
- **THEN** 系统更新密码哈希并返回 HTTP 200

#### Scenario: 旧密码错误
- **WHEN** oldPassword 与存储的哈希不匹配
- **THEN** 系统返回 HTTP 400 并提示旧密码不正确

#### Scenario: 未认证用户访问
- **WHEN** 未携带有效 token 的请求访问修改密码接口
- **THEN** 系统返回 HTTP 401 Unauthorized

### Requirement: JWT 鉴权中间件
系统 MUST 提供统一的 JWT 校验中间件，对所有需要认证的端点验证 token 有效性，并将用户信息注入请求上下文。Token 过期或无效 MUST 返回 HTTP 401。

#### Scenario: 有效 token 通过
- **WHEN** 请求携带有效且未过期的 JWT
- **THEN** 后续处理函数可获取 userId、school、studentId、role、name

#### Scenario: 过期或伪造 token
- **WHEN** 请求携带过期或非法签名的 JWT
- **THEN** 系统返回 HTTP 401 Unauthorized