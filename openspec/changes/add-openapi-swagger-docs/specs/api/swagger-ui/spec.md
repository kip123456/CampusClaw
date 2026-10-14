## Purpose

提供一个浏览器可访问的交互式 API 文档页面，让开发者和测试人员能直观查看接口说明并直接在页面上发送请求试调。

## ADDED Requirements

### Requirement: Swagger UI 页面可访问

系统 SHALL 挂载 Swagger UI Express 中间件到 `/api-docs` 路径。浏览器访问 `http://localhost:<port>/api-docs/`（带末尾斜杠）时 SHALL 返回完整的 Swagger UI 页面。

#### Scenario: 打开 Swagger UI 页面

- **WHEN** 浏览器访问 `/api-docs/`
- **THEN** 返回 HTTP 200，页面展示 Swagger UI 的交互式 API 文档界面

#### Scenario: Swagger UI 引用 OpenAPI JSON

- **WHEN** 打开 Swagger UI 页面
- **THEN** UI 自动从 `/openapi.json` 加载 OpenAPI 文档内容

### Requirement: Swagger UI 可试调带认证的接口

Swagger UI SHALL 配置 Authorize 按钮，允许用户填入 Bearer Token，之后试调需要认证的接口时会自动附带 Authorization header。

#### Scenario: 在 UI 中设置 Bearer Token

- **WHEN** 用户点击 Swagger UI 的 Authorize 按钮，输入 JWT token（格式如 `Bearer <token>` 或仅 token）并确认
- **THEN** 之后试调任何需要认证的端点时，请求会自动包含正确的 Authorization header

#### Scenario: 不带 token 试调受保护接口

- **WHEN** 未设置 token 就试调 GET `/api/classes/me/classes`
- **THEN** 请求返回 401 NO_TOKEN 错误

### Requirement: 页面中接口按 tag 分组展示

Swagger UI SHALL 按资源域对接口分组（tag），例如：Auth、Admin、Classes、Materials、KnowledgeBases、Skills、Agents、AgentMessages、Health。

#### Scenario: 接口分组清晰

- **WHEN** 打开 Swagger UI
- **THEN** 左侧接口列表按 tag 分组，每组名称对应一个资源域

### Requirement: Swagger UI 与 OpenAPI JSON 端点不影响现有功能

新增的 `/api-docs` 和 `/openapi.json` 路径 SHALL 不影响任何现有 API 的行为，包括 404 处理和错误处理中间件。

#### Scenario: 现有接口不受影响

- **WHEN** 新增 Swagger 相关中间件后测试所有现有 API 端点
- **THEN** 请求/响应行为与之前完全一致