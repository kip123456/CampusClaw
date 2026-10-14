def test_list_conversations_after_chat(config, teacher_token, class_id, agent_id, db):
    from apitest.utils.client import HttpClient
    from apitest.utils.streaming import StreamingClient

    sc = StreamingClient(config["BASE_URL"], teacher_token)
    status, final, _ = sc.post_stream(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/chat",
        json={"message": "conv-list probe", "conversationId": None},
    )
    if status != 200 or not final:
        __import__("pytest").skip("LLM not configured; cannot list conversations")
    conv_id = final["conversationId"]

    c = HttpClient(config["BASE_URL"])
    c.set_token(teacher_token)
    r = c.get(f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/conversations")
    assert r["status"] == 200, r["text"]
    body = r["body"]
    data = body if isinstance(body, list) else body.get("conversations", body.get("data", []))
    ids = {item.get("conversationId") or item.get("id") for item in data}
    assert conv_id in ids, f"conversation {conv_id} missing from list: {ids}"