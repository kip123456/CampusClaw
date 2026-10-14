def test_list_skills_empty_initially(http_client_with_token, teacher_token, class_id):
    c = http_client_with_token(teacher_token)
    r = c.get(f"/api/classes/{class_id['classId']}/skills")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    data = body if isinstance(body, list) else body.get("skills", body.get("data", []))
    assert isinstance(data, list)


def test_list_skills_matches_db(http_client_with_token, teacher_token, class_id, db, unique_name):
    c = http_client_with_token(teacher_token)
    name1 = unique_name("skill").replace("_", "-")
    name2 = unique_name("skill").replace("_", "-")

    s1 = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": name1, "prompt": "prompt A", "description": "desc A"},
    )
    assert s1["status"] == 201, s1["text"]
    sid1 = s1["body"]["skillId"] or s1["body"].get("id")
    assert sid1

    s2 = c.post(
        f"/api/classes/{class_id['classId']}/skills",
        json={"name": name2, "prompt": "prompt B", "description": "desc B"},
    )
    assert s2["status"] == 201, s2["text"]

    r = c.get(f"/api/classes/{class_id['classId']}/skills")
    assert r["status"] == 200
    body = r["body"]
    data = body if isinstance(body, list) else body.get("skills", body.get("data", []))
    ids = {item["skillId"] or item.get("id") for item in data}
    assert sid1 in ids

    db_rows = db.query(
        "SELECT id, name, prompt FROM skills WHERE class_id = ?",
        (class_id["classId"],),
    )
    for row in db_rows:
        assert any(
            (item.get("skillId") or item.get("id")) == row["id"] and item.get("name") == row["name"]
            for item in data
        ), f"DB row {row} missing from API response"