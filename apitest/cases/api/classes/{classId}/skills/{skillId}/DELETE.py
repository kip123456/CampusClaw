def _create_skill(c, class_id, name_suffix):
    r = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": f"DEL-case-{name_suffix}", "prompt": "to-be-deleted"},
    )
    assert r["status"] == 201, r["text"]
    return r["body"].get("skillId") or r["body"].get("id")


def test_delete_skill_success(http_client_with_token, teacher_token, class_id, db):
    c = http_client_with_token(teacher_token)
    sid = _create_skill(c, class_id, "D1")

    before = db.fetchone("SELECT 1 as present FROM skills WHERE id = ?", (sid,))
    assert before is not None

    r = c.delete(f"/api/classes/{class_id['classId']}/skills/{sid}")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    assert body.get("success") is True or body.get("deleted") is True, body

    after = db.fetchone("SELECT 1 as present FROM skills WHERE id = ?", (sid,))
    assert after is None, "skill must be removed from DB"

    rels = db.query("SELECT 1 as rel FROM agent_skills WHERE skill_id = ?", (sid,))
    assert len(rels) == 0, "agent_skills association must also be cleared"


def test_delete_skill_not_found(http_client_with_token, teacher_token, class_id):
    c = http_client_with_token(teacher_token)
    r = c.delete(f"/api/classes/{class_id['classId']}/skills/nonexistent-skill-00000")
    assert r["status"] == 404, r["text"]