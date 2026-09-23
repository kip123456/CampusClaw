## Why

当前项目只能在本地开发模式下运行（`npm run dev`），没有容器化部署方案。这导致：
1. 新环境搭建成本高（需要手动装 Node.js、npm 依赖、目录结构）
2. 前端/后端进程需要分别启动和管理
3. 无法一键部署到服务器或云环境
4. 本地文件存储（SQLite + 上传文件）在容器重建时会丢失

需要一套完整的 Docker 部署方案，实现从源码到运行实例的一键启动。

## What Changes

- 新增 `backend/Dockerfile`：后端多阶段构建（编译 TypeScript → 运行 Node）
- 新增 `frontend/Dockerfile`：前端多阶段构建（Vite build → Nginx 托管静态文件 + `/api` 反向代理）
- 新增根目录 `docker-compose.yml`：编排 backend + frontend 两个服务，暴露统一端口
- 新增 `.dockerignore`（backend 和 frontend 各一份）：排除 node_modules、dist、data 等
- 新增 Nginx 配置文件：生产环境下前端静态文件服务 + `/api` 反向代理到 backend
- 新增 `docker-compose.override.yml`：本地开发便捷启动

## Capabilities

### New Capabilities

（无——本变更为纯基础设施/工具链变更，不涉及应用层行为变化）

### Modified Capabilities

（无）

## Impact

- **新增文件**：backend/Dockerfile、backend/.dockerignore、frontend/Dockerfile、frontend/.dockerignore、frontend/nginx.conf、docker-compose.yml、docker-compose.override.yml
- **环境变量**：backend 容器内需要传递 JWT_SECRET、ADMIN_INITIAL_PASSWORD、SQLITE_PATH、STORAGE_ROOT、PORT；frontend 容器需要后端 API 地址
- **数据持久化**：SQLite DB 和上传文件通过 docker volume 挂载，避免容器重建丢失
- **端口**：前端容器暴露 80（Nginx），后端容器内部 3000 仅在 compose 内部网络可达，对外只暴露前端入口
- **无 breaking changes**：不修改任何现有源代码文件（package.json、tsconfig、vite.config.ts 等均不变）