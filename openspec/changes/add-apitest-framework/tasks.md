## 1. 环境准备与目录结构

- [x] 1.1 `pip install pytest pytest-html` — 已验证可导入 pytest/pytest-html
- [x] 1.2 创建 `apitest/` 目录骨架：`apitest/__init__.py`、`apitest/cases/`、`apitest/reports/.gitkeep`、`apitest/utils/`
- [x] 1.3 在根目录 `.gitignore` 追加 `apitest/reports/` 和 `apitest/.pytest_cache/`

## 2. 共享基建

- [x] 2.1 创建 `apitest/config.py`，定义 BASE_URL / DB_PATH / admin 账号 / TEST_SCHOOL，支持环境变量覆盖
- [x] 2.2 创建 `apitest/utils/client.py`，HttpClient 封装（urllib，无额外依赖），提供 get/post/put/delete/request
- [x] 2.3 创建 `apitest/utils/db.py`，Database 封装（sqlite3 + WAL + foreign_keys），提供 query/fetchone
- [x] 2.4 创建 `apitest/conftest.py`，session 级 fixture：config / db / admin_token / teacher_token / student_token / class_id / agent_id / autouse skip_if_backend_down
- [x] 2.5 创建 conftest 辅助 fixture：http_client / http_client_with_token / unique_name / llm_configured

## 3. 运行入口

- [x] 3.1 创建 `apitest/run_all.py`，argparse 支持 --filter --report --base-url --db-path --no-html，内部调 pytest.main() 生成带时间戳的 HTML 报告
- [x] 3.2 创建根目录 `pytest.ini`，设置 testpaths / python_files / python_classes / python_functions

## 4. 登录接口用例

- [x] 4.1 创建 `apitest/cases/api/auth/login/POST.py`，包含 4 个用例：admin_login_success / wrong_password / missing_fields / nonexistent_user，登录成功断言 DB 中 users 表存在匹配行

## 5. 检索接口用例

- [x] 5.1 创建 `apitest/cases/api/classes/me/classes/GET.py`：teacher 和 student 视角各 1 个用例，校验 DB class_teachers / class_students 关联
- [x] 5.2 创建 `apitest/cases/api/classes/{classId}/skills/GET.py`：空列表 + 创建后列表与 DB 字段一致 2 个用例
- [x] 5.3 创建 `apitest/cases/api/classes/{classId}/agents/GET.py`：初始空 + 创建后 DB 一致 2 个用例

## 6. 技能 CRUD 用例

- [x] 6.1 创建 `apitest/cases/api/classes/{classId}/skills/POST.py`：创建成功 DB 落库 / 重复名 409 / student 403 / prompt 过长 4 个用例
- [x] 6.2 创建 `apitest/cases/api/classes/{classId}/skills/{skillId}/GET.py`：按 id 获取 + 不存在 404 共 2 个用例
- [x] 6.3 创建 `apitest/cases/api/classes/{classId}/skills/{skillId}/PUT.py`：改 prompt DB 同步 / 重名 409 / 不存在 404 共 3 个用例
- [x] 6.4 创建 `apitest/cases/api/classes/{classId}/skills/{skillId}/DELETE.py`：删除后 skills + agent_skills 都清空 / 不存在 404 共 2 个用例

## 7. 创建会话并发送消息用例

- [x] 7.1 创建 `apitest/cases/api/classes/{classId}/agents/{agentId}/chat/POST.py`（+ 新增 `apitest/utils/streaming.py`）：首次 chat 建会话 + DB agent_conversations / agent_messages 落库、已有 conversationId 追加消息、空 message 400、agent 不存在 404、LLM 未配置 503 校验共 5 个用例
- [x] 7.2 创建 `apitest/cases/api/classes/{classId}/agents/{agentId}/conversations/GET.py`：chat 后列出会话包含新建 id，1 个用例
- [x] 7.3 创建 `apitest/cases/api/classes/{classId}/agents/{agentId}/conversations/{conversationId}/messages/GET.py`：拉取消息条数与 DB agent_messages 一致，1 个用例

## 8. 端到端验证

- [x] 8.1 后端启动后运行 `python apitest/run_all.py`，控制台 24 passed / 4 skipped，HTML 报告生成到 `apitest/reports/report_*.html`
- [x] 8.2 临时注入故意失败用例，报告正确标红该用例并显示 AssertionError traceback（验证后已删除临时文件）
- [x] 8.3 后端未启动时 autouse fixture `skip_if_backend_down` 会让所有用例 skip，退出码 0（fixture 已实现）
- [x] 8.4 `git status` 确认 `apitest/reports/` 和 `apitest/.pytest_cache/` 不出现在未跟踪文件列表，仅 `apitest/` 目录本身和各源码文件出现