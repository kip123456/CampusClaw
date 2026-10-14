## 1. 依赖与挂载

- [x] 1.1 在 `backend/package.json` 中添加 `swagger-ui-express` 依赖并执行 `npm install`，验证安装成功（无报错）
- [x] 1.2 在 `backend/src/` 下新建 `lib/openapi.ts` 文件骨架，导出 OpenAPI 文档常量对象和 helper 函数，验证 TypeScript 编译通过 (`npm run typecheck`)
- [x] 1.3 修改 `backend/src/server.ts`，在业务路由和 404 中间件之前挂载 `/openapi.json`（返回 JSON）和 `/api-docs`（Swagger UI）两个端点，验证启动后浏览器能打开 Swagger UI 页面

## 2. OpenAPI 基础结构

- [x] 2.1 在 `openapi.ts` 中定义 OpenAPI 3.0.3 的基础字段：`openapi`、`info`（title、version、description）、`servers`（指向本地默认端口）
- [x] 2.2 定义 `components/securitySchemes`：`bearerAuth` (type: http, scheme: bearer, bearerFormat: JWT)，以及全局 `security` 字段为空（表示大部分端点需认证但也有公开的）
- [x] 2.3 定义 `components/schemas` 中的统一 Schema：`ErrorResponse`、`Pagination`（如有）、以及公共对象类型（User、Class、Material、KnowledgeBase、KBDocument、Agent、Skill、Conversation 等）

## 3. 所有端点的 path item 定义

- [x] 3.1 Health + Auth 端点：`GET /api/health`（公开）、`POST /api/auth/login`（公开）、`POST /api/auth/change-password`（auth），验证每个端点的 request/response/security 描述正确
- [x] 3.2 Admin 端点：`POST /api/admin/users`（admin role），验证 schema 和错误响应覆盖 BAD_REQUEST / CONFLICT
- [x] 3.3 Classes 端点：`GET /api/classes/me/classes`（auth）、`POST /api/classes/`（teacher/admin）、`POST /api/classes/:classId/teachers`、`POST /api/classes/:classId/students`、`GET /api/classes/:classId/members`，验证路径参数、请求体和角色权限标注
- [x] 3.4 Materials 端点：`POST /api/classes/:classId/materials`（multipart/form-data + teacher）、`GET /api/classes/:classId/materials`、`GET /api/classes/:classId/materials/:fileId`（download）、`DELETE /api/classes/:classId/materials/:fileId`（teacher），验证 multipart 描述和 file download 响应
- [x] 3.5 KnowledgeBases 端点：KB CRUD、documents upload（multipart）、documents list、index 触发（单个和批量）、document delete、`POST /api/classes/:classId/kbs/query`、`POST /api/classes/:classId/kbs/qa`（teacher），验证 multipart 和各角色权限
- [x] 3.6 Skills 端点：完整 CRUD（POST/GET list/GET one/PUT/DELETE），验证 teacher 写、所有成员读的权限标注
- [x] 3.7 Agents 端点：完整 CRUD，验证 systemPrompt 仅 teacher 可见、visibility 字段含义
- [x] 3.8 AgentMessages 端点：`POST /api/classes/:classId/agents/:agentId/chat`（SSE text/event-stream）、`GET .../conversations`、`GET .../conversations/:conversationId/messages`，验证 SSE Content-Type 和事件流描述
- [x] 3.9 为每个端点补充完整的错误响应：覆盖 BAD_REQUEST / INVALID_CREDENTIALS / NO_TOKEN / NO_AUTH / FORBIDDEN / NOT_FOUND / CONFLICT / SCHOOL_MISMATCH / CLASS_NOT_FOUND / UPLOAD_ERROR / NO_FILE / INDEXING / FILE_MISSING / SERVICE_UNAVAILABLE / LLM_ERROR / INTERNAL_ERROR 中该端点可能触发的错误

## 4. Swagger UI 体验优化

- [x] 4.1 为 Swagger UI 配置 Authorize 按钮，填入 token 后自动附带 Bearer header；测试在 UI 中 Authorize 后试调 `GET /api/classes/me/classes` 能成功返回
- [x] 4.2 为每个 operation 添加清晰的 summary 和 description（中文），说明功能和注意事项（如 SSE 是流式、QA 接口需要 LLM 配置、文件上传格式限制等）
- [x] 4.3 添加 tag 分组：Health、Auth、Admin、Classes、Materials、KnowledgeBases、Skills、Agents、AgentMessages，验证 Swagger UI 左侧接口列表按组展示
- [x] 4.4 为需要特定角色的端点添加 `x-roles` OpenAPI extension 字段（如 `x-roles: ["admin"]` 或 `x-roles: ["teacher", "admin"]`），便于前端 UI 高亮展示

## 5. 验证与收尾

- [x] 5.1 启动后端服务器 (`npm run dev`)，访问 `/openapi.json` 和 `/api-docs/`，验证页面可打开、JSON 合法、所有端点在 UI 中可见
- [x] 5.2 在 Swagger UI 中试调一个公开接口（`GET /api/health`）和一个认证接口（先 login 拿到 token，再 Authorize，然后调 `GET /api/classes/me/classes`），验证请求正确发送和响应正确展示
- [x] 5.3 运行 `npm run typecheck` 确保 TypeScript 无类型错误；运行 `npm test` 确保现有测试不被破坏
- [x] 5.4 最终验证：打开浏览器访问 `/api-docs/`，逐项检查所有 30+ 个端点的文档——路径、参数、请求体、响应、错误码、认证标注都完整