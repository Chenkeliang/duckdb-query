"""/api/ai/agent-chat SSE 集成:事件序列、响应头、经全中间件栈透传、错误码。"""

import json
import uuid
from unittest.mock import patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

import routers.ai as ai_router
from core.database.duckdb_engine import with_duckdb_connection
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_ai_settings_in_db():
    from core.database.duckdb_pool import with_system_connection
    from core.services.ai_config import _AI_SETTINGS_KEY

    def _clear():
        with with_system_connection() as conn:
            conn.execute(
                "DELETE FROM system_app_settings WHERE key = ?", [_AI_SETTINGS_KEY]
            )

    _clear()
    yield
    _clear()


def _enable_ai(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    monkeypatch.setattr(
        ai_router.ai_config, "ai_settings_path", lambda: tmp_path / "ai.json"
    )
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})


def _read_events(resp):
    events = []
    name = None
    for line in resp.iter_lines():
        if line.startswith("event: "):
            name = line[7:]
        elif line.startswith("data: ") and name:
            events.append({"event": name, **json.loads(line[6:])})
            name = None
    return events


def test_agent_chat_streams_full_sequence(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)
    t = f"agent_route_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {t}(id INTEGER, status VARCHAR)")
        con.execute(f"INSERT INTO {t} VALUES (1,'paid'),(2,'paid')")
    try:
        good = f"SELECT count(*) AS n FROM {t} WHERE status='paid'"
        replies = [
            json.dumps({"action": "run_query", "args": {"sql": good}}),
            json.dumps({"action": "final", "answer": "已支付 2 笔",
                        "sql": good, "evidence": ["t1"]}),
        ]

        async def fake_async(**kwargs):
            return replies.pop(0)

        with patch(
            "core.services.llm_service.llm_client.complete_async",
            side_effect=fake_async,
        ):
            with client.stream("POST", "/api/ai/agent-chat", json={
                "messages": [{"role": "user", "content": "已支付几笔"}],
                "tables": [t], "locale": "zh",
            }) as resp:
                assert resp.status_code == 200
                assert resp.headers["content-type"].startswith("text/event-stream")
                assert resp.headers.get("x-accel-buffering") == "no"
                events = _read_events(resp)
        names = [e["event"] for e in events]
        assert names == [
            "run_started", "tool_started", "tool_completed", "answer", "done",
        ]
        answer = events[3]
        assert answer["termination_reason"] == "completed"
        assert answer["evidence"] == ["t1"]
        # 最终 SQL 真实执行断言值(AGENTS §10)
        with with_duckdb_connection() as con:
            assert con.execute(answer["sql"]).fetchone()[0] == 2
        run_ids = {e["run_id"] for e in events}
        assert len(run_ids) == 1
    finally:
        with with_duckdb_connection() as con:
            con.execute(f"DROP TABLE IF EXISTS {t}")


def test_agent_chat_disabled_returns_400_before_stream(tmp_path, monkeypatch):
    monkeypatch.setattr(
        ai_router.ai_config, "ai_settings_path", lambda: tmp_path / "ai.json"
    )
    resp = client.post("/api/ai/agent-chat", json={
        "messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_disabled"


def test_agent_runs_endpoint_lists_recorded(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)

    async def fake_async(**kwargs):
        return json.dumps({"action": "final", "answer": "ok", "sql": None,
                           "evidence": []})

    with patch(
        "core.services.llm_service.llm_client.complete_async",
        side_effect=fake_async,
    ):
        with client.stream("POST", "/api/ai/agent-chat", json={
            "messages": [{"role": "user", "content": "hi"}]}) as resp:
            events = _read_events(resp)
    run_id = events[0]["run_id"]
    listed = client.get("/api/ai/agent-runs?limit=50")
    assert listed.status_code == 200
    items = listed.json()["data"]["items"]
    assert any(i["run_id"] == run_id and i["termination_reason"] == "completed"
               for i in items)
