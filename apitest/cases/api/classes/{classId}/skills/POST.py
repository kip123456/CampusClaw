def test_create_skill_success(http_client_with_token, teacher_token, class_id, db, unique_name):
    c = http_client_with_token(teacher_token)
    name = unique_name("skill").replace("_", "-")
    prompt = "你是一个专业的技能助手，请按模板回答。"
    desc = "自动化测试创建"

    r = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": name, "prompt": prompt, "description": desc},
    )
    assert r["status"] == 201, r["text"]
    body = r["body"]
    sid = body.get("skillId") or body.get("id")
    assert sid, "response must contain skill id"

    db_row = db.fetchone(
        "SELECT id, name, prompt, description, class_id FROM skills WHERE id = ?",
        (sid,),
    )
    assert db_row is not None
    assert db_row["name"] == name
    assert db_row["prompt"] == prompt
    assert db_row["description"] == desc
    assert db_row["class_id"] == class_id["classId"]


def test_create_skill_duplicate_name(http_client_with_token, teacher_token, class_id, db, unique_name):
    c = http_client_with_token(teacher_token)
    name = unique_name("dup").replace("_", "-")
    first = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": name, "prompt": "prompt-x", "description": "first"},
    )
    assert first["status"] == 201, first["text"]
    sid = first["body"].get("skillId") or first["body"].get("id")

    before = db.fetchone("SELECT prompt FROM skills WHERE id = ?", (sid,))

    second = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": name, "prompt": "NEW-prompt", "description": "second"},
    )
    assert second["status"] == 409, second["text"]
    assert second["body"].get("error") == "CONFLICT"

    after = db.fetchone("SELECT prompt FROM skills WHERE id = ?", (sid,))
    assert after["prompt"] == before["prompt"], "original record must NOT be modified"


def test_create_skill_student_forbidden(http_client_with_token, student_token, class_id, unique_name):
    c = http_client_with_token(student_token)
    r = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": unique_name("skill").replace("_", "-"), "prompt": "x"},
    )
    assert r["status"] in (403, 404, 401), r["text"]


def test_create_skill_prompt_too_long(http_client_with_token, teacher_token, class_id, unique_name):
    c = http_client_with_token(teacher_token)
    prompt = "A" * 5000
    r = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": unique_name("long").replace("_", "-"), "prompt": prompt},
    )
    assert r["status"] in (400, 422), r["text"]