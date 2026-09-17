## 1. 项目初始化与基础设施

- [ ] 1.1 后端项目脚手架：创建 `backend/package.json`、`tsconfig.json`、`src/server.ts` 空入口，添加依赖（express、better-sqlite3、chromadb、jsonwebtoken、bcrypt、multer、pdfjs-dist、@xenova/transformers、dotenv、uuid、cors、zod 或手写校验），验证 `npm install` 成功、`npx tsc --noEmit` 通过
- [ ] 1.2 环境变量配置：创建 `.env.example`，列出 JWT_SECRET、ADMIN_INITIAL_PASSWORD、STORAGE_ROOT（默认 ./data）、SQLITE_PATH（默认 ./data/campusclaw.db）、CHROMA_URL（默认 http://localhost:8000），编写 `src/config.ts` 加载并校验必需变量，验证启动时缺少变量有明确报错
- [ ] 1.3 SQLite schema 初始化：编写 `src/db/schema.ts`（含建表 SQL + `CREATE TABLE IF NOT EXISTS`）和 `src/db/index.ts`（better-sqlite3 连接单例），表结构覆盖 users、classes、class_teachers、class_students、knowledge_bases、kb_documents、materials（字段和约束见 design.md），验证首次运行后 `campusclaw.db` 存在且表已创建
- [ ] 1.4 ChromaDB 集成：安装/启动 ChromaDB 本地实例（`chroma run --port 8000`），编写 `src/lib/chroma.ts` 封装客户端、collection 获取/创建、upsert、query 方法，验证 ChromaDB 健康检查 `GET /api/v2/heartbeat` 返回 OK、collection 可正常 upsert 和 query
- [ ] 1.5 Express 基础中间件与错误处理：编写 CORS 中间件、JSON body 解析、全局错误处理中间件（捕获自定义错误 → 统一 `{ error, message }` JSON）、404 兜底，编写 `src/types.ts` 共享类型（User、Class、Material、KnowledgeBase、KBDocument、CustomError），验证 Express 服务启动后 `GET /api/health` 返回 200
- [ ] 1.6 UUID 工具与日志中间件：在 config.ts 或独立文件导出 UUID 生成器封装，编写请求日志中间件（method、path、status、duration），验证控制台能看到请求日志

## 2. 鉴权与用户

- [ ] 2.1 bcrypt 密码封装：编写 `src/lib/password.ts` 提供 `hash(password)` 和 `verify(password, hash)`，用 Jest / Vitest 单元测试哈希不可逆、比对正确/错误场景
- [ ] 2.2 JWT 签发与校验：编写 `src/lib/auth.ts` 提供 `sign(payload)`（HS256、7 天有效期）和 `verify(token)`（返回 payload 或抛错），单元测试过期、篡改、正确签名三种场景
- [ ] 2.3 JWT 中间件：编写 Express 中间件解析 Authorization header 的 Bearer token，注入 `req.user` 上下文，验证有效 token 通过调用下一个 handler、过期/伪造 token 返回 401
- [ ] 2.4 启动时自动创建默认 admin：编写 `src/db/seed.ts` 检查 users 表是否为空，为空时插入 admin（school="admin", studentId="admin", role="admin", name="admin", 密码来自 ADMIN_INITIAL_PASSWORD），并在 server.ts 启动时调用；验证空 DB 首次启动后 admin 账户存在，非空 DB 启动时跳过
- [ ] 2.5 POST `/api/auth/login`：编写路由 handler，校验 school + studentId 存在、bcrypt 密码匹配，成功返回 `{ token, user: {...} }`，失败返回 401；验证 admin 能登录、错误密码返回 401、不存在的学号返回 401、缺少字段返回 400
- [ ] 2.6 POST `/api/auth/change-password`：编写路由 handler，校验 oldPassword 正确后替换密码哈希，返回 200；验证改密后新密码生效、旧密码错误返回 400、未登录返回 401
- [ ] 2.7 POST `/api/admin/users`（仅 admin）：编写路由 + admin role 守卫 handler，创建 teacher/student 账户，校验 `(school, studentId)` 唯一，返回 201；验证 admin 能创建、非 admin 返回 403、唯一约束冲突返回 409

## 3. 数据隔离守卫

- [ ] 3.1 guardSchool 中间件：编写中间件，从路径参数 / body / 查询中提取目标 school（或通过 classId JOIN 查询），与 `req.user.school` 比对；admin 跳过此检查；不一致时返回 403；单元测试覆盖 teacher 跨学校访问、admin 跨学校访问
- [ ] 3.2 guardClassMember 守卫函数：编写同步函数，检查 userId 是否在 `class_teachers` 或 `class_students` 中，返回布尔值；单元测试覆盖四种情况：teacher 是成员、student 是成员、非成员、admin （admin 豁免）
- [ ] 3.3 统一在所有需要隔离的路由上组合使用 authMiddleware + guardSchool + guardClassMember（对写操作额外检查 teacher 权限），确保每个端点的路由定义清晰展示守卫链

## 4. 班级管理

- [ ] 4.1 POST `/api/classes`（teacher 创建）：编写路由 handler（auth + role=teacher 或 admin + guardSchool），创建 class 记录，**自动在同一个 handler 中创建默认知识库**（is_default=1、name="默认知识库"），返回 201 含 classId 和 defaultKbId；验证 teacher 可创建、student 返回 403、admin 可指定任意 school
- [ ] 4.2 POST `/api/classes/:classId/teachers`（邀请教师）：auth + guardClassMember（teacher 或 admin）+ guardSchool + 校验目标存在且 role=teacher + 唯一约束，返回 200；验证成功添加、已存在返回 409、目标 role 为 student 返回 400、school 不匹配返回 403
- [ ] 4.3 POST `/api/classes/:classId/students`（添加学生）：同 4.2 的守卫链，校验 role=student；验证成功、角色错误返回 400、重复返回 409
- [ ] 4.4 GET `/api/classes/:classId/members`：auth + guardClassMember，一次查询返回 teachers 和 students 两个数组，每人项含 userId、school、studentId、name；验证成员可获取、非成员返回 403
- [ ] 4.5 GET `/api/me/classes`：auth 中间件即可（无需 guardSchool，因为只查自己的关系），分别从 class_teachers 和 class_students JOIN classes 查询，返回 `{ asTeacher: [...], asStudent: [...] }`；验证 teacher/student/admin 都能获取各自所在班级

## 5. 教学资料

- [ ] 5.1 `src/lib/storage.ts` 文件存储封装：提供 `resolvePath(school, classId, ...parts)` 拼接完整路径、`saveFile(storagePath, uuid, originalName, buffer)` 写入磁盘、`deleteFile(fullPath)` 删除、`ensureDir` 递归创建目录；单元测试验证路径格式正确（`<STORAGE_ROOT>/schools/<school>/classes/<classId>/...`）、saveFile 后文件真实存在
- [ ] 5.2 上传 PDF（multer + 文件校验）：编写 multer 中间件，限制 `.pdf` 扩展名且 MIME 为 `application/pdf`，单文件最大 50MB；路由 handler（auth + guardClassMember teacher 或 admin + guardSchool）接收 buffer，调用 storage 落盘，插入 materials 记录，返回 201；验证合法 PDF 上传成功、非 PDF 返回 400、student 返回 403
- [ ] 5.3 GET `/api/classes/:classId/materials`（列表）：auth + guardClassMember + guardSchool，查询 materials 表返回元数据数组；验证 teacher/student/admin 均可获取
- [ ] 5.4 GET `/api/classes/:classId/materials/:fileId`（下载）：auth + guardClassMember + guardSchool，查询 materials 记录，检查磁盘文件存在，返回 `res.download(fullPath, originalName, { headers: { 'Content-Type': 'application/pdf' } })`；验证文件存在时返回流、不存在返回 404、非成员返回 403

## 6. 知识库与向量化

- [ ] 6.1 ChromaDB 封装完善：在 lib/chroma.ts 中实现 `upsertChunks(kbId, documentId, school, chunks: Array<{ text, index }>)`（metadata 包含 kbId、documentId、school、chunkIndex）和 `queryChunks(kbId, school, queryEmbedding, topK)`；验证 upsert 后 query 能检索回相关 chunk，school metadata 过滤生效
- [ ] 6.2 PDF 文本提取：编写 `src/lib/pdf-extract.ts`，封装 pdfjs-dist 的 Node 端调用（动态 import 或创建 worker），输入 PDF buffer 输出纯文本字符串；单元测试用一个小型 fixture PDF 验证提取结果非空
- [ ] 6.3 文本分块：编写 `src/lib/chunk.ts`，实现按固定字符数窗口切分（默认 1500 字符 + 50 overlap），边界处保持段落完整（可选）；单元测试验证输入长文本后输出 chunk 数正确、首尾字符覆盖原文、overlap 存在
- [ ] 6.4 Embedding 封装：编写 `src/lib/embed.ts`，加载 `@xenova/transformers` 的 `all-MiniLM-L6-v2` 模型，提供 `embed(text: string | string[]): number[][]`；在 `server.ts` 启动时预热一次避免首请求卡顿；单元测试验证单文本和批量文本均返回正确维度向量（384）
- [ ] 6.5 POST `/api/classes/:classId/kbs`（创建额外知识库）：auth + guardClassMember teacher 或 admin + guardSchool + 校验 `(classId, name)` 唯一；验证同名返回 409、默认知识库不能被此接口创建（name="默认知识库" 时拒绝或直接返回已存在的 id）
- [ ] 6.6 POST `/api/classes/:classId/kbs/:kbId/documents`（上传文档 + 向量化）：auth + guardClassMember teacher 或 admin + guardSchool，multer 接受 `.pdf/.txt/.md`；handler 依次：落盘 → 按扩展名选择 pdf-extract / 直接读取 → chunk 分块 → embed 批量 → chroma upsert → 写 kb_documents 记录 → 返回 201；验证 PDF 文本提取、txt/md 直接读取、不支持格式返回 400、空 PDF chunk_count=0 仍返回成功
- [ ] 6.7 GET `/api/classes/:classId/kbs/:kbId/documents`（列表）：auth + guardClassMember + guardSchool + 校验 kb 属于 class；验证成员可获取、文档元数据包含 chunkCount
- [ ] 6.8 POST `/api/classes/:classId/kbs/:kbId/query`（向量检索）：auth + guardClassMember + guardSchool，请求体 `{ query, topK? }`；流程：embed query → chroma query（metadata 过滤 kbId + school）→ 返回 topK 结果 `{ chunk, distance, documentId }`；验证知识库为空返回空数组、检索结果按 distance 升序

## 7. 前端

- [ ] 7.1 Vite + React + TS 脚手架：创建 `frontend/` 目录，`npm create vite@latest . -- --template react-ts`，安装依赖（axios、react-router-dom），验证 `npm run dev` 启动成功、`npm run build` 无类型错误
- [ ] 7.2 登录页：实现输入表单（school + studentId + password），axios POST `/api/auth/login`，成功后 token + 用户信息存 localStorage 并跳转；统一 axios 实例拦截 401 自动跳登录页；验证登录成功/失败反馈、刷新后保持登录态
- [ ] 7.3 我的班级列表页：`GET /api/me/classes`，分两个 tab 展示"我管理的班级"和"我加入的班级"；点击班级卡片进入详情页；验证 teacher/student 看到的内容不同
- [ ] 7.4 班级详情页（materials tab）：列表展示教学资料，teacher 可上传（multipart/form-data），所有成员可点击下载；验证上传后列表刷新、下载触发浏览器保存
- [ ] 7.5 班级详情页（kbs tab）：左侧 KB 列表（默认 KB 不可删），点击切换；teacher 可创建新 KB；选中 KB 后右侧展示文档列表，teacher 可上传文档，所有成员可点击触发向量检索面板（输入 query → 调用 query 接口 → 展示 topK 结果）；验证完整交互链路

## 8. 端到端验证

- [ ] 8.1 冒烟测试：按顺序执行 — (1) ChromaDB 启动 (2) 后端启动（自动创建 admin） (3) admin 登录 (4) admin 创建一所学校 "TestUni" 的 teacher "t001" 和 student "s001" (5) t001 登录创建班级 "高等数学" (6) t001 上传一份 PDF 教学资料 (7) t001 上传一份 .txt 文档到默认知识库 (8) s001 登录查看班级 → 能看到资料和知识库文档 (9) s001 打开资料能下载 (10) s001 在知识库输入 query → 能得到检索结果
- [ ] 8.2 隔离渗透测试：执行 — (1) admin 再创建一所学校 "OtherU" 的 teacher "t002" (2) t002 登录后直接请求 TestUni 班级的资料列表 API → 必须返回 403 (3) t002 尝试向 TestUni 班级添加学生 → 必须返回 403 (4) 用 t002 的 token 直接 GET TestUni 班级的 KB query → 必须返回 403
- [ ] 8.3 TypeScript 类型检查：在 backend/ 和 frontend/ 分别运行 `npx tsc --noEmit`，确保无类型错误