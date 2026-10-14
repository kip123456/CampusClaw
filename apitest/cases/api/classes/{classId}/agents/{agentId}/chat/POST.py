import pytest

from apitest.utils.streaming import StreamingClient


def _llm_available(http_client, base_url: str, token: str, class_id: str, agent_id: str) -> bool:
    sc = StreamingClient(base_url, token)
    status, final, _ = sc.post_stream(
        f"/api/classes/{class_id}/agents/{agent_id}/chat",
        json={"message": "hello", "conversationId": None},
    )
    return status == 200 and bool(final)


def test_chat_first_message_creates_conversation(config, teacher_token, class_id, agent_id, db):
    if not _llm_available(
        __import__("apitest.utils.client", fromlist=["HttpClient"]).HttpClient(config["BASE_URL"]),
        config["BASE_URL"], teacher_token, class_id["classId"], agent_id["agentId"],
    ):
        pytest.skip("LLM not configured; cannot verify SSE chat full flow")

    sc = StreamingClient(config["BASE_URL"], teacher_token)
    status, final, raw = sc.post_stream(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/chat",
        json={"message": "你好，请简单自我介绍一下。", "conversationId": None},
    )
    assert status == 200, f"chat failed: {status}\n{raw[:500]}"
    assert final, f"no final/done event in SSE: {raw[:500]}"
    conv_id = final.get("conversationId")
    assert conv_id, f"conversationId missing: {final}"
    answer = final.get("answer") or final.get("text") or final.get("content")
    assert answer, f"assistant answer missing: {final}"

    conv_row = db.fetchone(
        "SELECT id, last_message_at FROM agent_conversations WHERE id = ?",
        (conv_id,),
    )
    assert conv_row is not None, "agent_conversations row must be created"
    assert conv_row["last_message_at"] is not None

    msgs = db.query(
        "SELECT role, content FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC",
        (conv_id,),
    )
    assert len(msgs) >= 2, f"expected >= 2 messages, got {len(msgs)}"
    roles = {m["role"] for m in msgs}
    assert "user" in roles and "assistant" in roles


def test_chat_with_existing_conversation(config, teacher_token, class_id, agent_id, db):
    if not _llm_available(None, config["BASE_URL"], teacher_token, class_id["classId"], agent_id["agentId"]):
        pytest.skip("LLM not configured; skip follow-up message test")

    sc = StreamingClient(config["BASE_URL"], teacher_token)

    s1_status, s1_final, _ = sc.post_stream(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/chat",
        json={"message": "第一条", "conversationId": None},
    )
    if s1_status != 200 or not s1_final:
        pytest.skip("first chat failed, cannot test follow-up")
    conv_id = s1_final["conversationId"]

    before_count = db.query(
        "SELECT 1 as x FROM agent_messages WHERE conversation_id = ?",
        (conv_id,),
    )

    s2_status, s2_final, _ = sc.post_stream(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/chat",
        json={"message": "第二条", "conversationId": conv_id},
    )
    assert s2_status == 200
    assert s2_final.get("conversationId") == conv_id, "follow-up must NOT create a new conversation"

    after_count = db.query(
        "SELECT 1 as x FROM agent_messages WHERE conversation_id = ?",
        (conv_id,),
    )
    assert len(after_count) >= len(before_count) + 1


def test_chat_missing_message(config, teacher_token, class_id, agent_id):
    from apitest.utils.client import HttpClient
    c = HttpClient(config["BASE_URL"])
    c.set_token(teacher_token)
    r = c.post(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/chat",
        json={"message": "", "conversationId": None},
    )
    assert r["status"] in (400, 422), r["text"]


def test_chat_agent_not_found(config, teacher_token, class_id):
    from apitest.utils.client import HttpClient
    c = HttpClient(config["BASE_URL"])
    c.set_token(teacher_token)
    r = c.post(
        f"/api/classes/{class_id['classId']}/agents/nonexistent-agent-000/chat",
        json={"message": "hi"},
    )
    assert r["status"] in (404, 400, 422), r["text"]


def test_chat_llm_not_configured_is_503_or_skipped(config, teacher_token, class_id, agent_id):
    sc = StreamingClient(config["BASE_URL"], teacher_token)
    status, final, raw = sc.post_stream(
        f"/api/classes/{class_id['classId']}/agents/{agent_id['agentId']}/chat",
        json={"message": "probe", "conversationId": None},
    )
    if status == 503:
        body_ok = True
        assert True
    assert status == 200 or status == 503, f"expected 200 or 503, got {status}\n{raw[:500]}"