## Context

后端是 Node.js (Express) + SQLite (better-sqlite3)，API 路由集中在 `backend/src/routes/*.ts`，数据库 schema 定义在 `backend/src/db/schema.ts`，默认 DB 路径 `backend/data/campusclaw.db`。现无任何 Python 测试基础设施。Python 3.12 环境已有 `requests` 和 `httpx`，但未安装 pytest/pytest-html。后端启动需设置 `JWT_SECRET` 和 `ADMIN_INITIAL_PASSWORD`（默认 admin/admin123），LLM 未配置时 chat 接口返回 503。

## Goals / Non-Goals

**Goals:**
- 目录结构清晰：`apitest/cases/api/<path>/<METHOD>.py` 一接口一文件
- 共享 fixture：登录用户、班级、agent、技能的创建/清理
- DB 断言工具：直接查 SQLite 表，校验 API 响应与落库一致性
- HTML 报告：pytest 运行 + pytest-html 自动生成
- 一键入口：`python apitest/run_all.py` 零配置跑通

**Non-Goals:**
- 不引入容器化 / Testcontainers / 独立测试数据库（直接连开发库）
- 不替代后端已有的 vitest 单元测试
- 不做 SSE/流式接口的 chunk 级校验（只校验 done 事件和 DB 落库）
- 不支持并发执行（用例间有数据依赖，顺序串行即可）

## Decisions

### D1: 测试框架选型 — pytest + requests + pytest-html，不做自研
**选择**：pytest 作为测试框架，`requests` 作为 HTTP 客户端，`pytest-html` 生成报告。
**理由**：项目已装 requests；pytest fixture 体系天然适合登录上下文、DB 连接、临时资源的共享；pytest-html 一条命令就能出 HTML 报告，无需自研。
**备选**：
- 自研 runner（类似现有 e2e-test.cjs）→ 放弃，缺少参数化、fixture、报告、skip 等成熟能力
- `unittest` → 放弃，fixture 体系弱，断言语法冗长
- `httpx` → 也能用，但 requests 更通用；httpx 的同步 API 和 requests 等价，异步接口（SSE）用 requests + 手动解析即可
- `allure` → 报告虽好但需额外服务，pytest-html 轻量够用

### D2: DB 连接方式 — Python 标准库 sqlite3 直接连同一份 DB 文件
**选择**：`import sqlite3` 打开 `backend/data/campusclaw.db`（Windows 下是 WAL 模式），只读不写。
**理由**：后端使用 better-sqlite3 WAL 模式，Python sqlite3 原生支持 WAL 读取；测试只 SELECT，不会阻塞后端写入（WAL 支持并发读）；零依赖。
**备选**：
- 通过 HTTP 管理接口间接获取数据 → 放弃，很多内部字段（如 password_hash）不会暴露，无法做一致性校验
- 开第二个 DB 文件 → 放弃，增加部署复杂度，还要清空/同步数据

### D3: 资源创建策略 — admin 接口先创建临时 teacher/student，再串联后续场景
**选择**：`conftest.py` 的 `teacher_token` fixture 内部调用 `POST /api/admin/users` 创建临时 teacher（唯一 studentId 如 `apitest_t_<timestamp>`），自动创建班级；`student_token` 同理。用例用这些 fixture 而不是复用种子 admin 账号，避免污染正式数据。
**备选**：
- 用 seeds 里的固定账号 → 放弃，多开发者并行跑测试会数据冲突
- 每个用例自己创建 → 放弃，大量重复代码，conftest fixture 更简洁

### D4: run_all.py 实现 — 薄封装，调用 pytest.main 并自动创建 reports/ 目录
**选择**：`run_all.py` 内部做三件事：① 解析 `--filter`/`--report` 参数；② 确保 `apitest/reports/` 存在；③ 调 `pytest.main()` 传 `-v --html=... --self-contained-html apitest/cases/`。
**理由**：保持极简，所有测试发现/断言逻辑交给 pytest；run_all.py 只做入口和路径处理。
**备选**：
- 用 subprocess 调命令行 pytest → 不如 pytest.main 灵活，不好处理返回码和报告路径

### D5: 带路径参数的 URL 组织 — 用占位符名 `{classId}` 作为目录段
**选择**：文件路径如 `apitest/cases/api/classes/{classId}/skills/GET.py`，测试代码内部由 fixture 注入真实 classId。
**理由**：保持文件路径与 API 路由文本一致，一眼能看懂；用 `{classId}` 明确表示这是路径变量而非字面量。
**备选**：
- 用双下划线 `__classId__` 或圆括号 `(classId)` → 不如花括号醒目，也不符合常见 OpenAPI 风格

## Risks / Trade-offs

- **[风险] WAL 模式下 Python sqlite3 读到旧快照** → 后端写入后 Python 端立即 SELECT，WAL 保证新读能看到最新 commit；实测可行。若偶发读不到，可在断言前加 50ms 延迟或使用 `PRAGMA read_uncommitted = ON`。
- **[风险] 用例失败后遗留资源导致下次运行冲突** → 用例资源名带时间戳/随机后缀，冲突概率极低；遇到 409 可在 fixture 里 catch 后重试创建。
- **[风险] 后端未启动或 LLM 未配置导致 chat 用例全挂** → 用例开头通过 fixture 检查 `GET /api/health`，不通过就 skip；LLM 未配置时 chat 用例用 `@pytest.mark.skipif` 条件跳过或走 503 校验分支。
- **[风险] Windows 路径过长** → `apitest/cases/api/classes/{classId}/skills/POST.py` 路径不算极端；如遇 MAX_PATH 限制，可在项目根启用长路径或缩短目录前缀（如 `apitest/cases/` 直接映射到 `/api/` 以下）。