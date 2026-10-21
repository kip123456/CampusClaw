## Purpose

为 CampusClaw 后端提供一套 Python 编写的接口自动化测试框架，支持按 URL 路径组织用例、共享 fixture、SQLite 数据库一致性校验、以及一键运行并生成 HTML 报告。

## ADDED Requirements

### Requirement: 用例按 URL 路径组织
测试用例 SHALL 按 URL 路径在目录树中组织：`apitest/cases/<http-method>/<http-path>.py`，其中 `<http-path>` 的路径段对应 API 路由。每个 HTTP 接口对应一个 Python 文件，文件名固定为其 HTTP 方法名。

#### Scenario: POST /api/auth/login 的用例文件位置
- **WHEN** 需要为 `POST /api/auth/login` 接口编写测试
- **THEN** 用例文件 MUST 位于 `apitest/cases/api/auth/login/POST.py`

#### Scenario: GET /api/classes/:classId/skills 的用例文件位置
- **WHEN** 需要为带路径参数的 `GET /api/classes/:classId/skills` 接口编写测试
- **THEN** 用例文件 MUST 位于 `apitest/cases/api/classes/{classId}/skills/GET.py`

### Requirement: 共享基建提供 HTTP 客户端和鉴权
框架 SHALL 提供共享的 HTTP 客户端封装，支持：
- 自动拼接 `BASE_URL`
- 自动注入 `Authorization: Bearer <token>` 请求头
- 便捷方法 (`get`, `post`, `put`, `delete`, `request`)
- 每个测试可独立登录获取 token，无需手动解析 JWT

#### Scenario: 用例代码发送带鉴权的 POST 请求
- **WHEN** 测试脚本调用 `client.post('/api/auth/login', json={...})` 且已登录
- **THEN** 请求 MUST 自动携带 `Authorization` 请求头

#### Scenario: 未登录时请求被拦截
- **WHEN** 测试脚本未调用登录 fixture 就向受保护接口发送请求
- **THEN** HTTP 客户端 SHALL 抛出明确的错误提示，而不是静默发送 401

### Requirement: 共享基建提供 SQLite 查询能力
框架 SHALL 提供共享的 DB 连接工具，使测试代码能够直接查询 SQLite 数据库，对比接口返回值与数据库实际存储是否一致。

#### Scenario: 断言创建技能后数据库中新增了一行
- **WHEN** 测试脚本通过 `POST /api/classes/:classId/skills` 创建一个技能
- **THEN** 测试 MUST 能通过 `db.query("SELECT * FROM skills WHERE id = ?", [skillId])` 查到该记录，且字段与 API 响应一致

#### Scenario: 断言删除技能后数据库中对应行已不存在
- **WHEN** 测试脚本通过 `DELETE /api/classes/:classId/skills/:skillId` 删除一个技能
- **THEN** 测试 MUST 能通过 DB 查询确认 `skills` 表中已无该 `skillId`

### Requirement: 一键运行入口
框架 SHALL 提供 `apitest/run_all.py` 作为一键运行入口。

#### Scenario: 执行全部用例
- **WHEN** 用户运行 `python apitest/run_all.py`
- **THEN** 脚本 MUST 以 pytest 执行 `apitest/cases/` 下所有用例，并在控制台打印汇总

#### Scenario: 指定运行某个目录
- **WHEN** 用户运行 `python apitest/run_all.py --filter auth`
- **THEN** 脚本 MUST 只执行路径包含 `auth` 的用例文件

### Requirement: 生成 HTML 测试报告
每次运行测试后，框架 SHALL 在 `apitest/reports/` 目录生成带时间戳的 HTML 报告文件（如 `report_20261014_153000.html`）。

#### Scenario: 运行完成后报告文件存在
- **WHEN** `python apitest/run_all.py` 执行完毕
- **THEN** `apitest/reports/report_*.html` MUST 存在，且可在浏览器中打开查看通过/失败详情和断言信息

#### Scenario: 报告目录不入库
- **WHEN** 查看 `.gitignore`
- **THEN** MUST 包含 `apitest/reports/` 和 `apitest/.pytest_cache/`

### Requirement: 环境配置可覆盖
框架 SHALL 从 `apitest/config.py` 读取 `BASE_URL` 和 `DB_PATH`，并允许通过环境变量 `APITEST_BASE_URL` / `APITEST_DB_PATH` 覆盖。

#### Scenario: 使用默认配置
- **WHEN** 未设置任何环境变量
- **THEN** `BASE_URL` SHALL 为 `http://127.0.0.1:3000`，`DB_PATH` SHALL 指向 `backend/data/campusclaw.db`

#### Scenario: 通过环境变量覆盖
- **WHEN** 设置 `APITEST_BASE_URL=http://192.168.1.10:3000`
- **THEN** 所有 HTTP 请求 MUST 发往该地址