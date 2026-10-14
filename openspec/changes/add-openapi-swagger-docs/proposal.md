## Why

CampusClaw 后端已有完整的 API 路由（auth、admin、classes、materials、kbs、skills、agents、agentMessages），但缺少任何形式的接口文档。前端开发者和测试人员需要手动阅读源码才能知道有哪些接口、入参出参格式、是否需要登录、错误码含义等。这导致对接效率低下、容易出错。需要一套标准的 OpenAPI 描述和可交互的 Swagger UI 来解决这个问题。

## What Changes

- 引入 OpenAPI 3.0 规范，为所有现有 API 端点生成标准描述，包含：
  - 路径、HTTP 方法、路由参数和查询参数
  - 请求体 Schema（JSON body、multipart 文件上传）
  - 成功响应和错误响应 Schema
  - 每个端点的认证要求（是否需要 Bearer JWT、需要哪些角色）
  - 所有可能的错误码（BAD_REQUEST、INVALID_CREDENTIALS、NOT_FOUND、CONFLICT、FORBIDDEN、INDEXING、SERVICE_UNAVAILABLE、LLM_ERROR 等）
- 在 Express 中挂载 Swagger UI 页面（如 `/api-docs`），浏览器可打开并交互试调主要接口
- 提供 OpenAPI JSON/YAML 端点（如 `/openapi.json`）供外部工具消费
- 文件上传端点（materials 和 kbs documents）要描述 multipart/form-data
- SSE 流式端点（agent chat）要标注为 text/event-stream 响应

## Capabilities

### New Capabilities

- `api/openapi-spec`: 提供 OpenAPI 3.0 描述文件（JSON 格式），覆盖所有 API 端点的路径、参数、请求体、响应、错误码、认证要求
- `api/swagger-ui`: 提供可交互的 Swagger UI 页面，浏览器可打开查看文档并试调主要接口

### Modified Capabilities

无——本次是纯新增文档能力，不改变任何现有 API 的行为或契约。

## Impact

- **代码**：`backend/src/` 下新增 OpenAPI 文档生成模块和 Swagger UI 挂载逻辑；修改 `server.ts` 注册新路由
- **依赖**：新增 Swagger/OpenAPI 相关 npm 包（如 `swagger-jsdoc` + `swagger-ui-express`，或 `express-openapi-validator` 等）
- **运行时**：Swagger UI 会额外暴露 2 个 HTTP 路径（文档 JSON + UI 页面）
- **无破坏性变更**：不修改任何现有 API 的请求/响应格式或业务逻辑