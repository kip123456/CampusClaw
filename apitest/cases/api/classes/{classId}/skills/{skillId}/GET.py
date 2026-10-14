def _create_skill(c, class_id, name_suffix, prompt="p", description="d"):
    r = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": f"GET-case-{name_suffix}", "prompt": prompt, "description": description},
    )
    assert r["status"] == 201, r["text"]
    return r["body"].get("skillId") or r["body"].get("id")


def test_get_skill_by_id(http_client_with_token, teacher_token, class_id, db):
    c = http_client_with_token(teacher_token)
    sid = _create_skill(c, class_id, "X1", prompt="THE_PROMPT_X1", description="DESC_X1")

    r = c.get(f"/api/classes/{class_id['classId']}/skills/{sid}")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    prompt_field = body.get("prompt") or body.get("systemPrompt")
    assert prompt_field == "THE_PROMPT_X1", f"prompt mismatch: {body}"

    db_row = db.fetchone(
        "SELECT prompt, description FROM skills WHERE id = ?", (sid,),
    )
    assert db_row is not None
    assert db_row["prompt"] == "THE_PROMPT_X1"
    assert db_row["description"] == "DESC_X1"


def test_get_nonexistent_skill(http_client_with_token, teacher_token, class_id):
    c = http_client_with_token(teacher_token)
    r = c.get(f"/api/classes/{class_id['classId']}/skills/nonexistent-skill-00000")
    assert r["status"] == 404, r["text"]