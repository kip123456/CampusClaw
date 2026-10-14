## Context

后端为 Express 4 + TypeScript 项目，所有 API 路由通过独立的 Router 文件定义（auth.ts、admin.ts、classes.ts、materials.ts、kbs.ts、skills.ts、agents.ts、agentMessages.ts）并在 server.ts 中统一挂载到 `/api/*`。项目目前没有任何 API 文档。

## Goals / Non-Goals

**Goals:**

- 提供可机读的 OpenAPI 3.0 JSON 描述，覆盖所有现有端点
- 提供浏览器可交互的 Swagger UI 页面
- 完整标注每个端点的路径、入参、出参、错误码、认证要求（Bearer JWT + 角色）
- 文件上传（multipart）和 SSE 流式端点也要正确描述

**Non-Goals:**

- 不做请求参数的自动校验（不引入 express-openapi-validator 这类会拦截请求的中间件）
- 不改动任何现有 API 的请求/响应格式
- 不生成 SDK 或客户端代码
- 不为前端项目（如果有的话）生成类型定义

## Decisions

### 1. OpenAPI 文档生成方式：代码中手动定义 + 少量注释辅助

**选择**：采用手写 TypeScript 定义的方式（一个集中的 `openapi.ts` 文件），配合 `swagger-jsdoc` 从 JSDoc 注释补充部分描述，或直接用纯 TS 对象手写整个 OpenAPI 文档结构。

**备选方案及取舍**：

- **A. 纯 swagger-jsdoc（从 JSDoc 注释生成）**：优点是路由文件里加注释即可，不破坏现有代码；缺点是 Express 复杂的参数校验逻辑、角色守卫、错误码无法自动提取，仍需大量人工注释。由于本项目每个端点的 schema 差异大（multipart、SSE、不同角色权限），纯注释方式信息会缺失严重。
- **B. 手写完整 OpenAPI 文档对象（纯 TS）**：优点是对每个端点的 schema、错误、认证可以 100% 精确描述；缺点是路由变更时需要手动同步文档。考虑到当前路由数量约 30 个，且项目还在早期，手写是可控且最准确的方案。
- **C. express-openapi-validator（声明式 + 校验中间件）**：优点是同时做文档 + 请求校验；缺点是会改变运行时行为（自动 400 校验），且与现有手动 CustomError 体系冲突。项目明确 Non-Goals 不做自动校验，排除。

**结论**：方案 B（手写完整 OpenAPI 对象）。新建 `backend/src/lib/openapi.ts` 导出一个 OpenAPI 文档对象常量，集中维护所有端点的 path item 定义。

### 2. 依赖选择

```
swagger-ui-express     # ^5.0.0，提供 swagger UI 静态资源和 Express 中间件
```

不引入 swagger-jsdoc，因为决定纯手写。

### 3. 挂载路径

- `GET /openapi.json` —— 返回 JSON 格式的 OpenAPI 文档
- `GET /api-docs/` —— Swagger UI 页面（SwaggerUI Express 默认路径）

这两个路径在 server.ts 中 **在业务路由之前、404 处理之前** 挂载，确保不会被业务中间件拦截（特别是 authMiddleware）。

### 4. 认证标注策略

在 OpenAPI components.securitySchemes 中定义：

```yaml
securitySchemes:
  bearerAuth:
    type: http
    scheme: bearer
    bearerFormat: JWT
```

在每个需要登录的 path item 上添加 `security: [{ bearerAuth: [] }]`。对于需要特定角色（admin / teacher / teacher+admin）的端点，用 OpenAPI 扩展字段 `x-roles: ["admin"]` 或在 operation description 中说明，同时保留 `security` 字段表示需要 JWT。

### 5. 文件上传和 SSE 的描述

- **multipart/form-data**：用 OpenAPI multipart media type，schema type: string, format: binary
- **SSE (text/event-stream)**：responses 200 的 content 设置为 text/event-stream，description 说明事件流格式

### 6. 错误 Schema 复用

在 components.schemas 中统一定义：

- `ErrorResponse`：`{ error: string, message: string }`
- 各端点的成功响应 Schema 也集中在 components.schemas

## Risks / Trade-offs

- **[文档与路由不同步]** → 在设计和任务中明确要求：新增或修改路由时必须同步修改 openapi.ts。可以考虑在未来添加一个简单的测试（如列出 routes 数量 vs paths 数量）来做 sanity check，但本期不强制。
- **[SSE 端点在 Swagger UI 中试调体验有限]** → Swagger UI 对 SSE 支持一般，只能看到原始事件流。这是 Swagger UI 本身的限制，标注清楚即可。
- **[文件上传试调需要手动选择文件]** → Swagger UI 原生支持 multipart 上传，没问题。