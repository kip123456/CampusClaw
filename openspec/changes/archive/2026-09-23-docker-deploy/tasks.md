## 1. Backend Dockerfile

- [x] 1.1 创建 `backend/.dockerignore`：排除 `node_modules/`、`dist/`、`data/`、`.env`、`*.log`，验证文件内容
- [x] 1.2 创建 `backend/Dockerfile`（多阶段构建）：
  - 第一阶段（builder）：`node:20-alpine`，安装 `python3 make g++`（better-sqlite3 原生编译），`COPY package*.json` + `npm ci`，`COPY .` + `npm run build`
  - 第二阶段（runtime）：`node:20-alpine`，只复制 `dist/`、`package*.json`、`npm ci --omit=dev`，设置 `ENV NODE_ENV=production`，`WORKDIR /app`，`EXPOSE 3000`，`CMD ["node", "dist/server.js"]`
  - 验证：`docker build -t campusclaw-backend ./backend` 成功，`docker run --rm campusclaw-backend node -e "require('./dist/server')"` 不报模块缺失

## 2. Frontend Dockerfile + Nginx

- [x] 2.1 创建 `frontend/.dockerignore`：排除 `node_modules/`、`dist/`、`.env`，验证文件内容
- [x] 2.2 创建 `frontend/nginx.conf`：
  - `server { listen 80; server_name _; }`
  - `/` → `root /usr/share/nginx/html; index index.html; try_files $uri $uri/ /index.html`（SPA fallback）
  - `/api/` → `proxy_pass http://backend:3000/api/; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr`（反向代理到 backend 容器）
  - 验证：文件语法正确（`nginx -t` 可通过）
- [x] 2.3 创建 `frontend/Dockerfile`（多阶段构建）：
  - 第一阶段（builder）：`node:20-alpine`，`COPY package*.json` + `npm ci`，`COPY .` + `npm run build`
  - 第二阶段（runtime）：`nginx:1.27-alpine`，`COPY --from=builder dist/ /usr/share/nginx/html/`，`COPY nginx.conf /etc/nginx/conf.d/default.conf`
  - 验证：`docker build -t campusclaw-frontend ./frontend` 成功，`docker run --rm -p 8080:80 campusclaw-frontend curl -s http://localhost/ | head -5` 返回 HTML

## 3. Docker Compose 编排

- [x] 3.1 创建根目录 `docker-compose.yml`：
  - `services.backend`：`build: ./backend`，`environment:` 包含 `NODE_ENV=production`、`JWT_SECRET`、`ADMIN_INITIAL_PASSWORD`、`SQLITE_PATH=/app/data/campusclaw.db`、`STORAGE_ROOT=/app/data`、`PORT=3000`，`volumes: [campusclaw-data:/app/data]`，**无 ports**（内部网络）
  - `services.frontend`：`build: ./frontend`，`depends_on: backend`，`ports: ["8080:80"]`
  - `volumes.campusclaw-data:` named volume 定义
  - 使用 `${VAR:-default}` 格式支持 `.env` 文件覆盖
  - 验证：`docker compose config` 输出合法 YAML

- [x] 3.2 创建根目录 `.env.example`：列出所有可配置变量及其默认值/说明（JWT_SECRET、ADMIN_INITIAL_PASSWORD、PORT 映射等），作为部署参考模板
- [x] 3.3 创建根目录 `.gitignore` 新增 `.env` 排除规则（如果尚未排除）

## 4. 端到端验证

- [x] 4.1 完整启动：`docker compose build && docker compose up -d`，验证两个容器都处于 `running` 状态（`docker compose ps`）
- [x] 4.2 健康检查：`curl http://localhost:8080/api/health` 返回 `{"status":"ok"...}`，确认 Nginx → backend 代理链路通
- [x] 4.3 前端可访问：浏览器打开 `http://localhost:8080` 看到登录页（SPA HTML + JS 正常加载）
- [x] 4.4 登录和核心流程：admin 登录 → 创建 teacher → teacher 创建班级 → 上传 PDF → 全部无报错
- [x] 4.5 数据持久化验证：`docker compose down` → `docker compose up -d` → 之前创建的班级/用户/上传文件仍然存在
- [x] 4.6 清理：`docker compose down -v` 确认 volume 被正确清理（用于确认命名 volume 存在）