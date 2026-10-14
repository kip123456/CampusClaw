def _create_skill(c, class_id, name, prompt="old-prompt"):
    r = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": name, "prompt": prompt},
    )
    assert r["status"] == 201, r["text"]
    return r["body"].get("skillId") or r["body"].get("id")


def test_update_skill_prompt(http_client_with_token, teacher_token, class_id, db, unique_name):
    c = http_client_with_token(teacher_token)
    name = unique_name("upd").replace("_", "-")
    sid = _create_skill(c, class_id, name, prompt="ORIGINAL_PROMPT")

    new_prompt = "BRAND_NEW_PROMPT_AFTER_UPDATE"
    r = c.put(
        f"/api/classes/{class_id['classId']}/skills/{sid}",
        json={"prompt": new_prompt},
    )
    assert r["status"] == 200, r["text"]

    db_row = db.fetchone("SELECT prompt FROM skills WHERE id = ?", (sid,))
    assert db_row is not None
    assert db_row["prompt"] == new_prompt


def test_update_skill_rename_conflict(http_client_with_token, teacher_token, class_id, unique_name):
    c = http_client_with_token(teacher_token)
    a = unique_name("updA").replace("_", "-")
    b = unique_name("updB").replace("_", "-")
    sid_a = _create_skill(c, class_id, a)
    _create_skill(c, class_id, b)

    r = c.put(
        f"/api/classes/{class_id['classId']}/skills/{sid_a}",
        json={"name": b},
    )
    assert r["status"] == 409, r["text"]
    assert r["body"].get("error") == "CONFLICT"


def test_update_skill_not_found(http_client_with_token, teacher_token, class_id):
    c = http_client_with_token(teacher_token)
    r = c.put(
        f"/api/classes/{class_id['classId']}/skills/nonexistent-skill-00000",
        json={"prompt": "x"},
    )
    assert r["status"] == 404, r["text"]