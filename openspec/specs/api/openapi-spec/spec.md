## Purpose

为 CampusClaw 后端所有 HTTP API 提供机器可读的 OpenAPI 3.0 规范描述，使前端、测试、第三方工具能自动了解接口契约。

## ADDED Requirements

### Requirement: OpenAPI 描述端点

系统 SHALL 提供 `/openapi.json` HTTP GET 端点，返回符合 OpenAPI 3.0.3 规范的 JSON 对象，覆盖 `backend/src/routes/` 下所有路由注册的 API 端点（包括 server.ts 直接注册的 `/api/health`）。

返回的 OpenAPI 文档 SHALL 在每次服务器启动时生成并挂载，运行时按需实时响应。

#### Scenario: 获取 OpenAPI JSON 成功

- **WHEN** 客户端对 `/openapi.json` 发送 GET 请求
- **THEN** 服务器返回 HTTP 200，Content-Type 为 `application/json`，Body 是合法的 OpenAPI 3.0.3 文档，包含 `openapi`、`info`、`paths`、`components` 顶级字段

#### Scenario: 文档包含所有已注册的 API

- **WHEN** 读取 `/openapi.json` 的 paths 字段
- **THEN** 包含以下前缀下的所有已注册路由：`/api/health`、`/api/auth/login`、`/api/auth/change-password`、`/api/admin/users`、`/api/classes/*`（classes、materials、kbs、skills、agents、agentMessages 子路由）

### Requirement: 每个端点的路径和参数描述

OpenAPI 文档中的每个 path item SHALL 包含 HTTP 方法、路径参数（如 `{classId}`、`{kbId}`、`{agentId}`）、查询参数以及请求体 Schema。

#### Scenario: 路径参数正确描述

- **WHEN** 查看 `/api/classes/{classId}/kbs` 的 OpenAPI 条目
- **THEN** 存在 `classId` 路径参数，类型为 string，必填

#### Scenario: JSON 请求体 Schema

- **WHEN** 查看 POST `/api/auth/login` 的 OpenAPI 条目
- **THEN** request body content 为 `application/json`，Schema 包含 `school`、`studentId`、`password` 三个 string 必填字段

#### Scenario: 文件上传描述

- **WHEN** 查看 POST `/api/classes/{classId}/materials` 和 POST `/api/classes/{classId}/kbs/{kbId}/documents` 的 OpenAPI 条目
- **THEN** request body content 为 `multipart/form-data`，包含 `file` 字段描述文件上传

### Requirement: 每个端点的认证要求标注

OpenAPI 文档 SHALL 明确标注每个端点是否需要 Bearer JWT 认证，以及需要哪些角色（admin / teacher / student）。认证描述使用 OpenAPI 的 `security` 字段，在 components 中定义 `bearerAuth` securityScheme（type: http, scheme: bearer, bearerFormat: JWT）。

#### Scenario: 公开端点无需认证

- **WHEN** 查看 GET `/api/health` 和 POST `/api/auth/login`
- **THEN** 这两个端点没有 `security` 字段

#### Scenario: 需要 JWT 认证的端点

- **WHEN** 查看 GET `/api/classes/me/classes`
- **THEN** 存在 `security: [{ bearerAuth: [] }]`

#### Scenario: 需要特定角色的端点

- **WHEN** 查看 POST `/api/admin/users`
- **THEN** 文档中 SHALL 以 description 或 extension (`x-roles`) 标注需要 admin 角色

### Requirement: 响应体 Schema 描述

每个端点 SHALL 至少描述 2 种响应：成功响应（HTTP 200/201/202）和通用错误响应。成功响应的 Schema 应匹配实际返回字段名和类型。

#### Scenario: 成功响应描述

- **WHEN** 查看 POST `/api/auth/login` 的 responses
- **THEN** 存在 200 响应，Schema 包含 `token`(string) 和 `user`(object)，user 对象包含 `userId`、`school`、`studentId`、`role`、`name`

#### Scenario: 错误响应 Schema

- **WHEN** 查看 `/openapi.json` 的 components/schemas
- **THEN** 存在统一的 ErrorResponse Schema：包含 `error`(string) 和 `message`(string)

### Requirement: 流式响应端点描述

对于使用 Server-Sent Events（SSE）流式输出的端点（POST `/api/classes/{classId}/agents/{agentId}/chat`），OpenAPI 文档 SHALL 标明 Content-Type 为 `text/event-stream`，并在描述中说明 SSE 格式和事件类型。

#### Scenario: SSE 端点响应类型

- **WHEN** 查看 POST `/api/classes/{classId}/agents/{agentId}/chat` 的 responses
- **THEN** 200 响应的 Content-Type 包含 `text/event-stream`，且 description 说明这是流式接口

### Requirement: 所有可能的错误码覆盖

OpenAPI 文档 SHALL 通过 components/schemas 中的 ErrorResponse 和每个端点的 responses 描述，覆盖代码中 CustomError 定义的所有错误码：BAD_REQUEST、INVALID_CREDENTIALS、NO_TOKEN、NO_AUTH、FORBIDDEN、NOT_FOUND、CONFLICT、SCHOOL_MISMATCH、CLASS_NOT_FOUND、UPLOAD_ERROR、NO_FILE、INDEXING、FILE_MISSING、SERVICE_UNAVAILABLE、LLM_ERROR、INTERNAL_ERROR。

#### Scenario: 错误码在文档中可查

- **WHEN** 查看任何需要认证的端点的 responses
- **THEN** 至少包含 401（NO_TOKEN / INVALID_CREDENTIALS）、403（FORBIDDEN / SCHOOL_MISMATCH）、404（NOT_FOUND / CLASS_NOT_FOUND）、400（BAD_REQUEST）的错误响应描述