## Context

当前 CampusClaw 项目前后端分离，均为 TypeScript 项目：
- **backend/**：Express + TypeScript + better-sqlite3，编译输出 `dist/`，`npm start` 运行 `node dist/server.js`
- **frontend/**：Vite + React + TypeScript，`npm run build` 输出到 `dist/` 静态文件
- 前端 `vite.config.ts` 在 dev 模式通过 proxy 把 `/api` 转发到 `localhost:3000`，生产构建后前端静态文件**没有后端代理**
- 后端依赖本地文件系统存储 SQLite DB（`SQLITE_PATH=./data/campusclaw.db`）和上传文件（`STORAGE_ROOT=./data`）
- 无任何 Dockerfile、docker-compose 或 Nginx 配置

## Goals / Non-Goals

**Goals:**
- 一条命令 `docker compose up` 启动完整服务
- 前端静态文件由 Nginx 托管，Nginx 同时反向代理 `/api` 到后端容器（解决生产环境无 proxy 的问题）
- 数据持久化：SQLite DB 和上传文件通过 Docker volume 挂载，容器重建不丢失数据
- 后端多阶段构建：编译阶段 Node + devDependencies，运行阶段纯 Node + 生产依赖，镜像尽量小
- 前端多阶段构建：build 阶段 Node，运行阶段纯 Nginx + 静态文件，镜像只有几 MB

**Non-Goals:**
- 不做 CI/CD（GitHub Actions 等）——后续迭代
- 不做 SSL/TLS 证书自动管理
- 不做后端多实例负载均衡（单实例足够 MVP）
- 不替换 SQLite 为 PostgreSQL（后续迭代再考虑）
- 不修改任何现有源代码

## Decisions

### 决策 1：前端反向代理放在 Nginx，而不是前端运行时注入 API 地址

**选择**：Nginx 配置 `/api/` → `http://backend:3000/api/` 的反向代理

**替代方案**：前端用 `VITE_API_BASE_URL` 环境变量，运行时根据环境决定 API 地址
- 前端 `api.ts` 已经写死 `baseURL: '/api'`（相对路径），这意味着：只要前端被一个配置了 `/api` proxy 的服务器托管，就能正常工作，**完全不需要改前端代码**

**理由**：
1. 零前端代码改动——符合 Non-Goals 中"不修改任何现有源代码"
2. 相对路径让前端构建产物与部署解耦，同一个 `dist/` 可以被任何有 `/api` proxy 的服务器托管
3. Nginx proxy_pass 一行搞定，没有跨域问题（同 origin）

### 决策 2：数据持久化用 named volume，不用 bind mount

**选择**：在 docker-compose.yml 里定义 `campusclaw-data` named volume，挂载到 backend 容器内 `/app/data`

**替代方案 1**：bind mount（`./data:/app/data`）
- 开发时方便（宿主直接看文件），但生产环境不推荐——Windows/macOS 文件系统性能差，且宿主目录结构会泄露到容器

**替代方案 2**：SQLite 直接存容器内
- 容器重建数据丢失，不可接受

**理由**：named volume 由 Docker 管理，跨平台一致，备份只需 `docker run --volumes-from` 或 `docker cp`。MVP 阶段简单可靠。

### 决策 3：backend 用 `node:20-alpine` 作为基础镜像

**选择**：编译阶段和运行阶段都用 `node:20-alpine`

**替代方案**：编译用 `node:20-slim`，运行用 distroless
- `node:20-alpine` 虽然比 distroless 大，但有 npm、shell 方便调试；better-sqlite3 需要 native build 工具链（alpine 有 musl libc，better-sqlite3 预编译包支持）

**理由**：alpine 足够小（~180MB vs slim ~450MB），且有 shell 方便 `docker exec` 调试。后续可换 distroless 进一步缩小。

### 决策 4：前端 Nginx 用 `nginx:alpine`

**选择**：第二阶段用 `nginx:1.27-alpine`

**替代方案**：Caddy、Apache
- Nginx 反代 Node 是标准套路，alpine 版 ~10MB，静态文件直接 `cp dist/ /usr/share/nginx/html/`

### 决策 5：compose 只暴露 frontend 端口，backend 内部网络

**选择**：`ports: "8080:80"` 只在 frontend service；backend 不配置 ports，仅在 compose 默认网络内部通过 service name `backend` 访问

**理由**：后端不需要对外暴露，Nginx 是唯一入口。安全且简单。

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| better-sqlite3 在 alpine 上可能因 musl libc 编译失败 | 在 Dockerfile 编译阶段装 `python3 make g++` 用原生编译；或换 `node:20-slim`（glibc） |
| Nginx `/api` proxy 时 WebSocket 不转发 | MVP 没用 WebSocket，暂不处理；将来加 SSE/WebSocket 时再配 |
| 环境变量硬编码在 docker-compose.yml | 用 `.env` 文件 + `.gitignore` 排除，compose 用 `${VAR:-default}` |
| 单容器 SQLite 不支持并发写入（`WAL` 模式） | MVP 单实例问题不大；如果将来加第二个 backend 实例需要切 PostgreSQL |
| Windows 开发时 Docker Desktop 卷性能差 | named volume 在 Windows Docker Desktop 下比 bind mount 好，必要时用 WSL2 优化 |

## Migration Plan

首次部署步骤：
1. 安装 Docker Desktop
2. `docker compose build`（首次构建镜像）
3. `docker compose up -d`
4. 浏览器访问 `http://localhost:8080`

回滚：`docker compose down && docker compose up -d`（数据在 volume 里，不会丢）