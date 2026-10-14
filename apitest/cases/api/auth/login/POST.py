import pytest


def test_admin_login_success(http_client, db, config):
    r = http_client.post(
        "/api/auth/login",
        json={
            "school": config["ADMIN_SCHOOL"],
            "studentId": config["ADMIN_STUDENT_ID"],
            "password": config["ADMIN_PASSWORD"],
        },
    )
    assert r["status"] == 200, r["text"]
    body = r["body"]
    assert body["token"], "token should not be empty"
    user = body["user"]
    assert user["studentId"] == config["ADMIN_STUDENT_ID"]
    assert user["role"] == "admin"

    row = db.fetchone(
        "SELECT id, school, student_id, role FROM users WHERE school = ? AND student_id = ?",
        (config["ADMIN_SCHOOL"], config["ADMIN_STUDENT_ID"]),
    )
    assert row is not None, "admin user must exist in DB"
    assert row["role"] == "admin"


def test_login_wrong_password(http_client, config):
    r = http_client.post(
        "/api/auth/login",
        json={
            "school": config["ADMIN_SCHOOL"],
            "studentId": config["ADMIN_STUDENT_ID"],
            "password": "wrongpassword",
        },
    )
    assert r["status"] == 401, r["text"]
    body = r["body"]
    assert body.get("error") == "INVALID_CREDENTIALS"


def test_login_missing_fields(http_client, config):
    r = http_client.post(
        "/api/auth/login",
        json={
            "school": config["ADMIN_SCHOOL"],
            "studentId": config["ADMIN_STUDENT_ID"],
        },
    )
    assert r["status"] == 400, r["text"]
    body = r["body"]
    assert body.get("error") == "BAD_REQUEST"


def test_login_nonexistent_user(http_client):
    r = http_client.post(
        "/api/auth/login",
        json={
            "school": "NopeSchool",
            "studentId": "nobody_zzzzz",
            "password": "whatever",
        },
    )
    assert r["status"] == 401, r["text"]
    body = r["body"]
    assert body.get("error") == "INVALID_CREDENTIALS"