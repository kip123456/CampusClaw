## 1. 环境准备与目录结构

- [ ] 1.1 `pip install pytest pytest-html` — 验证 `pip show pytest pytest-html` 能看到版本号
- [ ] 1.2 创建 `apitest/` 目录骨架：`apitest/__init__.py`、`apitest/cases/`、`apitest/reports/.gitkeep`、`apitest/utils/` — 验证 `ls apitest/` 能看到四个目录/文件
- [ ] 1.3 在根目录 `.gitignore` 追加 `apitest/reports/` 和 `apitest/.pytest_cache/` — 打开 `.gitignore` 末尾能看到两行

## 2. 共享基建

- [ ] 2.1 创建 `apitest/config.py`，定义 `BASE_URL`（默认 `http://127.0.0.1:3000`，支持 `APITEST_BASE_URL` 环境变量覆盖）、`DB_PATH`（默认 `backend/data/campusclaw.db`，支持 `APITEST_DB_PATH`）、`ADMIN_SCHOOL`/`ADMIN_STUDENT_ID`/`ADMIN_PASSWORD`、默认测试学校名 `TEST_SCHOOL` — `python -c "from apitest.config import BASE_URL, DB_PATH; print(BASE_URL, DB_PATH)"` 能正常导入
- [ ] 2.2 创建 `apitest/utils/client.py`，封装 HttpClient 类：`__init__(base_url)`、`_headers(token=None)`、`get/post/put/delete` 便捷方法、`request(method, path, **kwargs)` 底层方法、未登录时调用受保护方法抛 `RuntimeError` — 单元测试 `python -c "from apitest.utils.client import HttpClient; c = HttpClient('http://127.0.0.1:3000'); c.get('/api/health')"` 返回健康检查响应
- [ ] 2.3 创建 `apitest/utils/db.py`，封装 Database 类：`connect()` / `close()`（sqlite3，设置 `journal_mode=WAL` 和 `foreign_keys=ON`）、`query(sql, params=None)` 返回 list[dict]、`fetchone(sql, params=None)` 返回 dict 或 None — `python -c "from apitest.utils.db import Database; db = Database(); db.connect(); print(db.fetchone('SELECT 1 as x')); db.close()"` 打印 `{'x': 1}`
- [ ] 2.4 创建 `apitest/conftest.py`，提供 session 级 fixture：`config`（from apitest.config）、`db`（Database 实例，session scope）、`admin_token`（调用 admin 登录接口）、`teacher_token`（admin 创建临时 teacher 并登录）、`student_token`（admin 创建临时 student 并登录）、`class_id`（teacher 创建班级并返回 classId + defaultKbId）、`agent_id`（teacher 创建 visibility=all 的 agent 并返回 agentId + classId），以及 autouse 的 `skip_if_backend_down`（health check）— 运行任意后续用例时 fixture 能自动获取有效 token
- [ ] 2.5 创建 `apitest/conftest.py` 中的辅助 fixture：`http_client(token)` 方法级，返回带 token 的 HttpClient；`unique_name(prefix)` 生成带时间戳的唯一字符串 — 在 `apitest/cases/` 下新建一个空测试文件，运行 `pytest -v apitest/cases/` 验证 fixture 能正确初始化且不报错

## 3. 运行入口

- [ ] 3.1 创建 `apitest/run_all.py`，实现：`argparse` 支持 `--filter` / `--report` / `--base-url` / `--db-path` / `--no-html` 参数；确保 `apitest/reports/` 存在；调用 `pytest.main()` 传入 `-v apitest/cases/ --html=reports/report_<timestamp>.html --self-contained-html -k <filter>`（默认不加 -k）；返回 pytest 退出码 — 运行 `python apitest/run_all.py --filter health` 能只跑健康检查类用例；`python apitest/run_all.py` 执行全量并在 reports/ 下生成 HTML
- [ ] 3.2 创建 `apitest/pytest.ini`（或在 conftest 顶部加 `pytest_configure` hook），设置 `testpaths = apitest/cases`、`python_files = *.py`、`python_classes = Test*`、`python_functions = test_*` — 直接运行 `pytest`（无 args）时也能自动发现 `apitest/cases/` 下的用例

## 4. 登录接口用例

- [ ] 4.1 创建 `apitest/cases/api/auth/login/POST.py`，包含：`test_admin_login_success`（断言 200、token 非空、user.role=='admin'，DB 对比 `users` 表）、`test_login_wrong_password`（断言 401 INVALID_CREDENTIALS）、`test_login_missing_fields`（断言 400 BAD_REQUEST）、`test_login_nonexistent_user`（断言 401 INVALID_CREDENTIALS）— `python apitest/run_all.py --filter login` 运行 4 个用例全部通过

## 5. 检索接口用例

- [ ] 5.1 创建 `apitest/cases/api/classes/me/classes/GET.py`：`test_me_classes_as_teacher`（teacher_token 调用，断言 asTeacher 数组非空，DB 验证 class_teachers 关联）、`test_me_classes_as_student`（student_token 调用，断言 asStudent 数组包含刚加入的班级，DB 验证 class_students）— 运行后 2 个用例通过
- [ ] 5.2 创建 `apitest/cases/api/classes/{classId}/skills/GET.py`：`test_list_skills_empty_initially`（新班级 skills 列表应为空）、`test_list_skills_matches_db`（先 POST 创建 2 个技能，再 GET 列表，比对每个字段与 DB）— 运行后 2 个用例通过
- [ ] 5.3 创建 `apitest/cases/api/classes/{classId}/agents/GET.py`：`test_list_agents_initially_empty`（断言空数组）、`test_list_agents_after_create`（POST 创建 agent 后 GET，断言 agentId、name、kbCount、skillCount 与 DB 一致）— 运行后 2 个用例通过

## 6. 技能 CRUD 用例

- [ ] 6.1 创建 `apitest/cases/api/classes/{classId}/skills/POST.py`：`test_create_skill_success`（断言 201、skillId 非空，DB 插入记录完整匹配 name/prompt/description/created_at）、`test_create_skill_duplicate_name`（相同 name → 409 CONFLICT，DB 原有记录不变）、`test_create_skill_student_forbidden`（student_token 调用 → 403 或 404）、`test_create_skill_prompt_too_long`（prompt 超过 4000 字 → 400 BAD_REQUEST）— 4 个用例通过
- [ ] 6.2 创建 `apitest/cases/api/classes/{classId}/skills/{skillId}/GET.py`：`test_get_skill_by_id`（teacher 调用返回 prompt 字段，DB 对比；student 调用不返回 prompt）、`test_get_nonexistent_skill`（断言 404 NOT_FOUND）— 2 个用例通过
- [ ] 6.3 创建 `apitest/cases/api/classes/{classId}/skills/{skillId}/PUT.py`：`test_update_skill_prompt`（PUT 改 prompt，DB 中该 skill 的 prompt 字段已同步）、`test_update_skill_rename_conflict`（改成已有名字 → 409 CONFLICT）、`test_update_skill_not_found`（不存在的 skillId → 404）— 3 个用例通过
- [ ] 6.4 创建 `apitest/cases/api/classes/{classId}/skills/{skillId}/DELETE.py`：`test_delete_skill_success`（DELETE 后 DB skills 表无此行，agent_skills 关联也清除）、`test_delete_skill_not_found`（不存在的 skillId → 404）— 2 个用例通过

## 7. 创建会话并发送消息用例

- [ ] 7.1 创建 `apitest/cases/api/classes/{classId}/agents/{agentId}/chat/POST.py`：`test_chat_first_message_creates_conversation`（无 conversationId 调用，断言 SSE done 事件返回 conversationId，DB agent_conversations 新增一行，agent_messages 至少 user+assistant 两行）、`test_chat_response_matches_db`（assistant content 非空，citations 格式正确，DB 中 assistant 行 content 与响应 done 事件 answer 一致）、`test_chat_with_existing_conversation`（传入已有 conversationId，断言不新建 conversation，只追加 messages）、`test_chat_missing_message`（message 为空 → 400 BAD_REQUEST）、`test_chat_agent_not_found`（不存在 agentId → 404）、`test_chat_llm_not_configured_skips_or_503`（通过 `@pytest.mark.skipif(llm_not_configured, reason='LLM not configured')` 或断言 503，根据后端 `.env` 配置动态决定）— 6 个用例（LLM 未配置时部分自动 skip）
- [ ] 7.2 创建 `apitest/cases/api/classes/{classId}/agents/{agentId}/conversations/GET.py`：`test_list_conversations_after_chat`（chat 后 GET conversations，断言数组包含 conversationId，messageCount >= 2，DB 一致）— 1 个用例通过
- [ ] 7.3 创建 `apitest/cases/api/classes/{classId}/agents/{agentId}/conversations/{conversationId}/messages/GET.py`：`test_get_messages_history`（拉取消息历史，断言条数与 DB agent_messages 表匹配，每条 content 一致）— 1 个用例通过

## 8. 端到端验证

- [ ] 8.1 后端启动后（设置 `.env` 中 `JWT_SECRET` 和 `ADMIN_INITIAL_PASSWORD`），运行 `python apitest/run_all.py`，观察控制台全量通过，`apitest/reports/report_*.html` 存在且用浏览器打开能看到详细 pass/fail 列表
- [ ] 8.2 人为制造一个失败（改后端返回 201 为 200），验证报告中该用例标红并显示 traceback
- [ ] 8.3 后端未启动时运行 `python apitest/run_all.py`，验证所有用例自动 skip 并在报告中标注 reason，整体退出码仍为 0 或可配置的跳过阈值
- [ ] 8.4 检查 `.gitignore` 生效：`git status` 中 `apitest/reports/` 和 `apitest/.pytest_cache/` 不出现在未跟踪文件列表