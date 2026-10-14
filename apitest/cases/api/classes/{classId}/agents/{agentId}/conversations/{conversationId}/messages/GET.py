def test_get_messages_history(config, teacher_token, class_id, agent_id, db):
    from apitest.utils.client import HttpClient
    from apitest.utils.streaming import StreamingClient

    sc = StreamingClient(config["BASE_URL"], teacher_token)
    status, final, _ = sc.post_stream(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/chat",
        json={"message": "msg-history probe", "conversationId": None},
    )
    if status != 200 or not final:
        __import__("pytest").skip("LLM not configured; cannot fetch messages history")
    conv_id = final["conversationId"]

    c = HttpClient(config["BASE_URL"])
    c.set_token(teacher_token)
    r = c.get(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/conversations/{conv_id}/messages"
    )
    assert r["status"] == 200, r["text"]
    body = r["body"]
    data = body if isinstance(body, list) else body.get("messages", body.get("data", []))
    assert isinstance(data, list)
    assert len(data) >= 2

    db_rows = db.query(
        "SELECT role, content FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conv_id,),
    )
    assert len(db_rows) == len(data), (
        f"message count mismatch: API={len(data)}, DB={len(db_rows)}"
    )