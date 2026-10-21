## Why

项目当前只有一份手写的 Node.js E2E 冒烟脚本 (`backend/scripts/e2e-test.cjs`)，无结构化测试框架：没有测试分层、没有可扩展的 fixture、没有自动化报告、也没有数据库层的数据一致性校验。随着 API 持续演进（agents/skills/agentMessages 等模块已上线），亟需一套可一键运行、能同时验证 HTTP 响应和 SQLite 数据库落库正确性的接口测试体系，用于日常回归和 CI 门禁。

## What Changes

- 新增 `apitest/` 目录，一个接口一个 Python 脚本，目录按 URL 路径组织（如 `apitest/cases/api/login/POST.py` 表示测试 `POST /api/login`）。
- 新增共享测试基建：`conftest.py`（pytest fixture）、`client.py`（HTTP 客户端 + 鉴权）、`db.py`（SQLite 连接 + 数据查询工具）、`report.py`（HTML 报告生成器，或接入 pytest-html）、`config.py`（环境配置）。
- 新增 `run_all.py`，一键执行全量用例，自动生成 HTML 测试报告（报告文件写入 `apitest/reports/`，该目录加入 `.gitignore`）。
- 新增数据断言能力：测试中除了校验 HTTP 状态码和 JSON 响应体，还能通过 SQLite 连接直接查表，核对接口返回与数据库实际数据是否一致。
- 首版覆盖至少：登录 (`POST /api/auth/login`)、检索 (`GET /api/classes/me/classes` 等)、提示词/技能 (`POST/GET/PUT/DELETE /api/classes/:classId/skills`)、创建会话并发送消息 (`POST /api/classes/:classId/agents/:agentId/chat`)。
- 在 `.gitignore` 中加入 `apitest/reports/` 和 `apitest/.pytest_cache/`。

## Capabilities

### New Capabilities
- `testing/apitest-framework`: 接口自动化测试框架的目录结构、共享基建（fixture/客户端/DB 查询）、运行入口和 HTML 报告生成能力
- `testing/apitest-cases`: 按 URL 路径组织的单接口测试用例集合，首批覆盖登录、检索、技能 CRUD、创建会话并发送消息

### Modified Capabilities

（无 spec 级行为变更；这是纯工具/测试新增，不影响生产 API 契约）

## Impact

- **代码**：新增 `apitest/` 目录（约 15~25 个 Python 文件），修改根目录 `.gitignore`
- **依赖**：Python 侧需 `requests`（已有 2.32.2）+ `pytest` + `pytest-html`（需安装）；SQLite 用 Python 标准库 `sqlite3`，无需额外依赖
- **运行方式**：后端服务需先启动（`backend/src/server.ts`，默认端口 3000），测试连接其 HTTP API 和同一份 SQLite 数据库
- **报告**：HTML 报告生成在 `apitest/reports/`，不提交到 Git
- **环境隔离**：测试脚本使用独立配置文件 `apitest/config.py`（指向测试环境的 BASE_URL 和 DB 路径），可通过环境变量覆盖