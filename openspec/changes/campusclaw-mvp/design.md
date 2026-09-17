## Context

项目为纯 greenfield（`openspec/changes/archive/` 之外无任何应用代码）。后端技术栈已确定为 Node.js + Express + TypeScript + SQLite + ChromaDB；前端为 React + TypeScript + Vite；文件存储在本地磁盘。完整需求与约束见 proposal.md。

## Goals / Non-Goals

**Goals:**
- 提供清晰的后端分层结构，使数据隔离、鉴权、业务逻辑分层解耦
- 设计稳定的数据库 schema，一次性满足 MVP 所有查询需求
- 确定 ChromaDB embedding 方案（本地或外部 API），并为后续扩展留口
- 确立初始化流程与环境变量约定，使开发者 clone 后能一键启动
- 使每个 API 端点都通过中间件/守卫函数统一处理鉴权与隔离，不散落于 handler

**Non-Goals:**
- 不设计 CI/CD、K8s 部署、容器化细节（留给后续迭代）
- 不设计前端组件库选型、路由守卫实现细节（留给前端任务）
- 不设计异步任务队列（MVP 内所有处理同步完成）
- 不设计 API 文档自动化工具（可手写或用注释 + 插件）

## Decisions

### D1: 后端项目结构

选择 feature-less（按职责）目录：`routes/`、`lib/`、`db/`、`types.ts`、`server.ts`。

**理由：** 项目体量预计不大，按职责分目录比 feature-based 更直接，避免在每个 feature 下重复放置 db/storage/auth 的引用。当班级数量超过约 20 个端点时再考虑迁移到 feature-based。

**备选：** feature-based（`features/auth/`、`features/classes/`）— 优点是每个功能自包含，缺点是跨 feature 的共享代码位置模糊。

### D2: SQLite 驱动

使用 `better-sqlite3`（同步 API）。

**理由：** Node.js 生态最简洁的 SQLite 绑定，无回调/async 开销，适合 MVP 阶段。SQLite 本身单文件，无需启动额外服务。

**备选：** `sqlite3`（回调）、`sequelize` / `prisma`（ORM）— ORM 在 greenfield 阶段引入过度抽象，手写 SQL 更透明。

### D3: ChromaDB 集成方式

使用 ChromaDB 官方 `chromadb` NPM 包，以 **HTTP 客户端模式**连接本地 ChromaDB 实例。ChromaDB 独立进程运行（`chroma run --host localhost --port 8000`），不做嵌入式本地持久化。

**理由：** ChromaDB 的 JS 生态成熟度不如 Python，HTTP 客户端模式最稳定。独立进程便于后续扩展为远端 ChromaDB 服务，开发阶段仍可同机运行。

**备选：** 嵌入式 `chromadb`（Node.js 侧无正式支持）、Qdrant 本地模式 — 均不如 HTTP 客户端稳妥。

### D4: Embedding 方案

MVP 采用 `@xenova/transformers` 本地加载 `all-MiniLM-L6-v2` 模型，零外部依赖。代码中封装 `lib/embed.ts` 模块对外暴露 `embed(text: string | string[])` 函数。模块内部可切换到 API 调用（如 Ollama、OpenAI Embeddings），但 MVP 不实现此分支。

**理由：** 本地方案最快落地，模型轻量（~23MB），语义检索效果够用。切 API 的需求在生产化时自然出现。

**备选：** `@xenova/transformers` 之外调用远端 API — 引入网络依赖与 API key 管理复杂度。

### D5: 文件存储路径

`<STORAGE_ROOT>/schools/<school>/classes/<classId>/...`。`STORAGE_ROOT` 环境变量默认值为 `./data`。

**理由：** 以 school 为顶层目录天然对齐隔离契约，classId 用 UUID 避免文件名冲突，`uuid_originalName` 格式避免同名覆盖同时保留原始名供下载时展示。

**备选：** 扁平目录 + 元数据映射表 — 文件系统层面隔离弱一层。

### D6: API 错误处理

统一错误格式 `{ "error": "CODE", "message": "human readable" }` + Express 全局错误处理中间件。路由 handler 内部 `throw` 自定义错误（带 HTTP 状态码 + error code），由顶层中间件捕获并序列化。

**理由：** 与 proposal 中约定的错误响应结构一致。Express 4/5 的 error-handling 中间件模式成熟，无需引入专用框架。

### D7: JWT 方案

使用 `jsonwebtoken` 库签发 HS256 JWT，payload 为 `{ userId, school, studentId, role, name }`，有效期 7 天。密钥由 `JWT_SECRET` 环境变量提供。无 refresh token（MVP）。

**理由：** HS256 + 单密钥满足当前单体后端需求，无需 RS256 的非对称密钥管理复杂度。7 天有效期足以覆盖典型使用场景。

**备选：** RS256、session + Redis — 过度设计。

### D8: SQLite 数据库文件位置

SQLite 数据库是单文件 `campusclaw.db`，存放在 `./data/campusclaw.db`。路径由 `SQLITE_PATH` 环境变量配置，默认值 `./data/campusclaw.db`。与 D5 的 `STORAGE_ROOT=./data` 共享同一个 `./data/` 根目录，使部署时只需迁移 `./data/` 一个目录即可同时保留关系数据和文件存储。

**理由：** SQLite 本身单文件，无需额外目录；与 STORAGE_ROOT 共享根目录方便整体备份/迁移。

**备选：** 单独路径如 `./db/campusclaw.db` — 增加运维心智负担。

## 数据库 Schema（SQLite，UTF-8）

所有表均使用 SQLite 类型亲和性（TEXT / INTEGER / REAL / BLOB），不严格声明长度。主键统一为 UUID v4（TEXT 存储）。时间戳统一用 **Unix epoch 毫秒整数**（INTEGER），在应用层 `Date.now()` 生成，不在 SQLite 层用 `CURRENT_TIMESTAMP` 字符串。

### users

| 字段 | SQLite 类型 | 约束 | 说明 |
|------|-------------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| school | TEXT | NOT NULL | 隔离键，admin 用户值为 "admin" |
| student_id | TEXT | NOT NULL | 学号，admin 用户值为 "admin" |
| role | TEXT | NOT NULL, CHECK(role IN ('admin','teacher','student')) | 角色 |
| name | TEXT | NOT NULL | 显示名 |
| password_hash | TEXT | NOT NULL | bcrypt 哈希 |
| created_at | INTEGER | NOT NULL | 注册时 epoch ms |

**唯一约束**: `UNIQUE(school, student_id)` — 整个系统内联合唯一

### classes

| 字段 | SQLite 类型 | 约束 | 说明 |
|------|-------------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| school | TEXT | NOT NULL | 隔离键，取创建者的 school |
| name | TEXT | NOT NULL | 班级显示名 |
| description | TEXT | | 可空 |
| creator_id | TEXT | REFERENCES users(id) | 创建者 userId（admin 创建时也会写） |
| created_at | INTEGER | NOT NULL | 创建时 epoch ms |

**索引**: `CREATE INDEX idx_classes_school ON classes(school)`

### class_teachers（多对多）

| 字段 | SQLite 类型 | 约束 |
|------|-------------|------|
| class_id | TEXT | REFERENCES classes(id) ON DELETE CASCADE |
| user_id | TEXT | REFERENCES users(id) ON DELETE CASCADE |

**主键**: `(class_id, user_id)` — SQLite 支持复合 PRIMARY KEY

### class_students（多对多）

| 字段 | SQLite 类型 | 约束 |
|------|-------------|------|
| class_id | TEXT | REFERENCES classes(id) ON DELETE CASCADE |
| user_id | TEXT | REFERENCES users(id) ON DELETE CASCADE |

**主键**: `(class_id, user_id)`

### knowledge_bases

| 字段 | SQLite 类型 | 约束 | 说明 |
|------|-------------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| class_id | TEXT | NOT NULL, REFERENCES classes(id) ON DELETE CASCADE | |
| name | TEXT | NOT NULL | |
| is_default | INTEGER | NOT NULL, CHECK(is_default IN (0,1)) | 每 class 恰好一个默认 KB |
| created_at | INTEGER | NOT NULL | |

**唯一约束**: `UNIQUE(class_id, name)` — 同班内 KB 名不可重复
**唯一约束**: `UNIQUE(class_id, is_default)` WHERE is_default=1 — 保证每 class 至多一个默认 KB（SQLite 3.8.3+ 支持部分唯一索引）

### kb_documents

| 字段 | SQLite 类型 | 约束 | 说明 |
|------|-------------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| kb_id | TEXT | NOT NULL, REFERENCES knowledge_bases(id) ON DELETE CASCADE | |
| original_name | TEXT | NOT NULL | 用户上传的原始文件名 |
| stored_path | TEXT | NOT NULL | 磁盘绝对或相对路径 |
| mime | TEXT | | 可空 |
| chunk_count | INTEGER | NOT NULL DEFAULT 0 | 解析后 chunk 数 |
| indexed_at | INTEGER | NOT NULL | 向量化完成时间 epoch ms |

**索引**: `CREATE INDEX idx_kb_docs_kb ON kb_documents(kb_id)`

### materials

| 字段 | SQLite 类型 | 约束 | 说明 |
|------|-------------|------|------|
| id | TEXT | PRIMARY KEY | UUID v4 |
| class_id | TEXT | NOT NULL, REFERENCES classes(id) ON DELETE CASCADE | |
| original_name | TEXT | NOT NULL | |
| stored_path | TEXT | NOT NULL | |
| size | INTEGER | NOT NULL | 字节数 |
| uploaded_by | TEXT | REFERENCES users(id) | 上传者 userId |
| uploaded_at | INTEGER | NOT NULL | |

**索引**: `CREATE INDEX idx_materials_class ON materials(class_id)`

### school 归属的间接查询约定

`materials`、`knowledge_bases`、`kb_documents`、`class_teachers`、`class_students` 五张表本身没有 school 字段，它们的 school 归属通过 JOIN classes.school 获得。所有这些表在查时都要 JOIN classes 表才能完成隔离守卫。因此**高频查询建议预先准备好带 school 的 view 或在应用层封装 JOIN 查询**，避免每次散写。

**示例 JOIN（用于隔离守卫）**:
```sql
SELECT c.school FROM materials m
  JOIN classes c ON c.id = m.class_id
WHERE m.id = ?
```

## ChromaDB 约定

- **运行方式**: ChromaDB 作为独立 HTTP 进程，地址由 `CHROMA_URL` 环境变量配置（默认 `http://localhost:8000`）
- **Collection**: MVP 只用一个 collection（名字如 `campusclaw-kbs`），不同 KB 通过 **metadata 过滤** 隔离，不在 ChromaDB 层面建多个 collection
- **每条文档（chunk）的 metadata**:
  ```json
  { "kbId": "<kb_uuid>", "documentId": "<doc_uuid>", "school": "<school_code>", "chunkIndex": 42 }
  ```
- **查询流程**: query 文本先 embed → 在 ChromaDB collection 里 search → `WHERE metadata.kbId = ? AND metadata.school = ? LIMIT topK`
- **Embedding 维度**: 384（`all-MiniLM-L6-v2` 输出）
- **持久化**: ChromaDB 自身有持久化机制（默认 `./chroma_storage/`），不在应用层手动管理

## 完整环境变量清单

| 变量 | 默认值 | 是否必需 | 说明 |
|------|--------|---------|------|
| `JWT_SECRET` | — | ✅ | HS256 密钥，至少 32 字节随机串 |
| `ADMIN_INITIAL_PASSWORD` | — | ✅ | 首次启动时 admin 账户密码 |
| `STORAGE_ROOT` | `./data` | 否 | 文件存储根目录 |
| `SQLITE_PATH` | `./data/campusclaw.db` | 否 | SQLite 数据库文件路径 |
| `CHROMA_URL` | `http://localhost:8000` | 否 | ChromaDB HTTP 地址 |
| `PORT` | `3000` | 否 | Express 监听端口 |

## Risks / Trade-offs

| 风险/权衡 | 缓解策略 |
|-----------|---------|
| ChromaDB HTTP 模式多一个依赖进程，首次部署需要额外启动步骤 | README 明确列出启动顺序（ChromaDB → 后端 → 前端）；Docker Compose 一键启动（后续任务） |
| `@xenova/transformers` 模型首次加载较慢（数秒） | 在应用启动时预热一次（调用 embed.ts 空函数），避免首个请求卡顿 |
| SQLite 单写限制，后续并发提升需要切换 | MVP 阶段并发可忽略；迁移 PostgreSQL 的任务在非 goals 之外，等真正需要时评估 |
| bcrypt 加盐轮次默认 10，慢但安全 | 保持默认，登录响应时间实测在可接受范围（<100ms） |
| pdfjs-dist 在 Node 环境下体积较大 | 用动态 import 或单独的 worker 进程处理，避免阻塞主事件循环 |

## Open Questions

（无。所有可影响 specs、设计或任务分解的未知已在讨论阶段决定并记录。）