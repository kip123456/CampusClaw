def test_list_agents_initially_empty(http_client_with_token, teacher_token, class_id):
    c = http_client_with_token(teacher_token)
    r = c.get(f"/api/classes/{class_id['classId']}/agents")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    data = body if isinstance(body, list) else body.get("agents", body.get("data", []))
    assert isinstance(data, list)


def test_list_agents_after_create(http_client_with_token, teacher_token, class_id, db, agent_id):
    c = http_client_with_token(teacher_token)
    r = c.get(f"/api/classes/{class_id['classId']}/agents")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    data = body if isinstance(body, list) else body.get("agents", body.get("data", []))
    ids = {item.get("agentId") or item.get("id") for item in data}
    assert agent_id["agentId"] in ids

    db_row = db.fetchone(
        "SELECT id, name FROM agents WHERE id = ? AND class_id = ?",
        (agent_id["agentId"], class_id["classId"]),
    )
    assert db_row is not None
    assert db_row["name"] == agent_id["name"]