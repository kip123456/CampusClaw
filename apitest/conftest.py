from __future__ import annotations

import os
import sys
import time
import pytest

_PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from apitest.config import (  # noqa: E402
    BASE_URL,
    DB_PATH,
    ADMIN_SCHOOL,
    ADMIN_STUDENT_ID,
    ADMIN_PASSWORD,
    TEST_SCHOOL,
)
from apitest.utils.client import HttpClient  # noqa: E402
from apitest.utils.db import Database  # noqa: E402


@pytest.fixture(scope="session")
def config():
    return {
        "BASE_URL": BASE_URL,
        "DB_PATH": DB_PATH,
        "ADMIN_SCHOOL": ADMIN_SCHOOL,
        "ADMIN_STUDENT_ID": ADMIN_STUDENT_ID,
        "ADMIN_PASSWORD": ADMIN_PASSWORD,
        "TEST_SCHOOL": TEST_SCHOOL,
    }


@pytest.fixture(scope="session")
def db(config):
    database = Database(config["DB_PATH"])
    database.connect()
    yield database
    database.close()


def _health_ok(base_url: str) -> bool:
    try:
        c = HttpClient(base_url)
        r = c.get("/api/health")
        return r["status"] == 200 and isinstance(r["body"], dict) and r["body"].get("status") == "ok"
    except Exception:
        return False


@pytest.fixture(scope="session", autouse=True)
def skip_if_backend_down(config):
    if not _health_ok(config["BASE_URL"]):
        pytest.skip(f"Backend is down at {config['BASE_URL']}")


@pytest.fixture(scope="session")
def admin_token(config):
    c = HttpClient(config["BASE_URL"])
    r = c.post(
        "/api/auth/login",
        json={
            "school": config["ADMIN_SCHOOL"],
            "studentId": config["ADMIN_STUDENT_ID"],
            "password": config["ADMIN_PASSWORD"],
        },
    )
    assert r["status"] == 200, f"admin login failed: {r['status']} {r['text']}"
    token = r["body"]["token"]
    c.set_token(token)
    return token


def _create_user_via_admin(c: HttpClient, school: str, student_id: str, password: str, role: str, name: str):
    r = c.post(
        "/api/admin/users",
        json={
            "school": school,
            "studentId": student_id,
            "password": password,
            "role": role,
            "name": name,
        },
    )
    if r["status"] == 409:
        return True
    assert r["status"] == 201, f"create {role} failed: {r['status']} {r['text']}"
    return True


@pytest.fixture(scope="session")
def teacher_token(config, admin_token):
    admin_c = HttpClient(config["BASE_URL"])
    admin_c.set_token(admin_token)
    ts = str(int(time.time() * 1000))
    student_id = f"apitest_t_{ts[-6:]}"
    password = "teacher123"
    _create_user_via_admin(
        admin_c,
        school=config["TEST_SCHOOL"],
        student_id=student_id,
        password=password,
        role="teacher",
        name="ApiTest Teacher",
    )
    login_c = HttpClient(config["BASE_URL"])
    r = login_c.post(
        "/api/auth/login",
        json={
            "school": config["TEST_SCHOOL"],
            "studentId": student_id,
            "password": password,
        },
    )
    assert r["status"] == 200, f"teacher login failed: {r['status']} {r['text']}"
    token = r["body"]["token"]
    login_c.set_token(token)
    login_c._student_id = student_id
    return token


@pytest.fixture(scope="session")
def student_token(config, admin_token):
    admin_c = HttpClient(config["BASE_URL"])
    admin_c.set_token(admin_token)
    ts = str(int(time.time() * 1000))
    student_id = f"apitest_s_{ts[-6:]}"
    password = "student123"
    _create_user_via_admin(
        admin_c,
        school=config["TEST_SCHOOL"],
        student_id=student_id,
        password=password,
        role="student",
        name="ApiTest Student",
    )
    login_c = HttpClient(config["BASE_URL"])
    r = login_c.post(
        "/api/auth/login",
        json={
            "school": config["TEST_SCHOOL"],
            "studentId": student_id,
            "password": password,
        },
    )
    assert r["status"] == 200, f"student login failed: {r['status']} {r['text']}"
    token = r["body"]["token"]
    login_c.set_token(token)
    login_c._student_id = student_id
    return token


@pytest.fixture(scope="session")
def class_id(config, teacher_token):
    c = HttpClient(config["BASE_URL"])
    c.set_token(teacher_token)
    ts = str(int(time.time() * 1000))
    name = f"ApiTestClass_{ts[-6:]}"
    r = c.post("/api/classes", json={"name": name, "description": "for apitest"})
    assert r["status"] == 201, f"create class failed: {r['status']} {r['text']}"
    result = {"classId": r["body"]["classId"], "defaultKbId": r["body"]["defaultKbId"], "name": name}

    admin_c = HttpClient(config["BASE_URL"])
    admin_c.set_token(admin_token)
    admin_c.set_token(admin_token)
    return result


@pytest.fixture(scope="session")
def class_with_student(config, admin_token, class_id):
    admin_c = HttpClient(config["BASE_URL"])
    admin_c.set_token(admin_token)
    admin_r = admin_c.post(
        "/api/auth/login",
        json={
            "school": config["ADMIN_SCHOOL"],
            "studentId": config["ADMIN_STUDENT_ID"],
            "password": config["ADMIN_PASSWORD"],
        },
    )
    assert admin_r["status"] == 200
    admin_c.set_token(admin_r["body"]["token"])

    ts = str(int(time.time() * 1000))
    s_student_id = f"apitest_cs_{ts[-6:]}"
    admin_c.post(
        "/api/admin/users",
        json={
            "school": config["TEST_SCHOOL"],
            "studentId": s_student_id,
            "password": "student123",
            "role": "student",
            "name": "Class Student",
        },
    )
    return s_student_id


@pytest.fixture(scope="session")
def agent_id(config, teacher_token, class_id):
    c = HttpClient(config["BASE_URL"])
    c.set_token(teacher_token)
    ts = str(int(time.time() * 1000))
    name = f"ApiTestAgent_{ts[-6:]}"
    r = c.post(
        f"/api/classes/{class_id['classId']}/agents",
        json={
            "name": name,
            "description": "for apitest",
            "systemPrompt": "You are a helpful assistant.",
            "visibility": "all",
        },
    )
    assert r["status"] == 201, f"create agent failed: {r['status']} {r['text']}"
    return {"agentId": r["body"]["agentId"], "classId": class_id["classId"], "name": name}


@pytest.fixture
def http_client(config):
    c = HttpClient(config["BASE_URL"])
    return c


@pytest.fixture
def http_client_with_token(config):
    c = HttpClient(config["BASE_URL"])

    def _make(token: str) -> HttpClient:
        c.set_token(token)
        return c

    return _make


@pytest.fixture
def unique_name():
    counter = {"n": 0}

    def _make(prefix: str = "item") -> str:
        counter["n"] += 1
        return f"{prefix}_{int(time.time() * 1000)}_{counter['n']}"

    return _make


@pytest.fixture(scope="session")
def llm_configured(config) -> bool:
    from apitest.utils.client import HttpClient as _HC

    c = _HC(config["BASE_URL"])
    r = c.get("/api/health")
    if r["status"] != 200:
        return False
    return True