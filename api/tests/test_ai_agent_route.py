"""统一端点 /api/ai/agent/{stream,run} 集成:5 mode + SSE/JSON 同 runner + 错误码。"""

import json
import uuid
from unittest.mock import patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

import routers.ai as ai_router
from core.database.duckdb_engine import with_duckdb_connection
from main import app
from utils.response_helpers import MessageCode

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_ai_settings_in_db():
    from core.database.duckdb_pool import with_system_connection
    from core.services.ai_config import _AI_SETTINGS_KEY

    def _clear():
        with with_system_connection() as conn:
            conn.execute("DELETE FROM system_app_settings WHERE key = ?", [_AI_SETTINGS_KEY])

    _clear()
    yield
    _clear()


def _enable_ai(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: tmp_path / "ai.json")
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})


def _scripted(replies):
    seq = list(replies)

    async def fake_async(**kwargs):
        return seq.pop(0)

    return patch("core.services.llm_service.llm_client.complete_async", side_effect=fake_async)


def _read_events(resp):
    events, name = [], None
    for line in resp.iter_lines():
        if line.startswith("event: "):
            name = line[7:]
        elif line.startswith("data: ") and name:
            events.append({"event": name, **json.loads(line[6:])})
            name = None
    return events


def test_data_qa_stream_full_sequence(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)
    t = f"route_qa_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {t}(id INTEGER, status VARCHAR)")
        con.execute(f"INSERT INTO {t} VALUES (1,'paid'),(2,'paid')")
    try:
        good = f"SELECT count(*) AS n FROM {t} WHERE status='paid'"
        replies = [
            json.dumps({"action": "run_query", "args": {"sql": good}}),
            json.dumps({"action": "final", "result": {
                "content": "2 笔", "sql": good, "evidence": ["t1"]}}),
        ]
        with _scripted(replies):
            with client.stream("POST", "/api/ai/agent/stream", json={
                "mode": "data_qa",
                "input": {"messages": [{"role": "user", "content": "已支付几笔"}]},
                "context": {"tables": [t], "locale": "zh"},
            }) as resp:
                assert resp.status_code == 200
                assert resp.headers.get("x-accel-buffering") == "no"
                events = _read_events(resp)
        names = [e["event"] for e in events]
        assert names == ["run_started", "tool_started", "tool_completed", "answer", "done"]
        ans = events[3]
        assert ans["result"]["content"] == "2 笔"
        with with_duckdb_connection() as con:
            assert con.execute(ans["result"]["sql"]).fetchone()[0] == 2
    finally:
        with with_duckdb_connection() as con:
            con.execute(f"DROP TABLE IF EXISTS {t}")


def _run_json(mode, inp, context=None):
    return client.post("/api/ai/agent/run", json={
        "mode": mode, "input": inp, "context": context or {"locale": "zh"}})


def test_generate_sql_run(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)
    t = f"route_gen_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {t}(a INTEGER)")
        con.execute(f"INSERT INTO {t} VALUES (1),(2)")
    try:
        good = f"SELECT count(*) AS n FROM {t}"
        with _scripted([json.dumps({"action": "final", "result": {
                "sql": good, "used_tables": [t]}})]):
            resp = _run_json("generate_sql", {"question": "几行"}, {"tables": [t], "locale": "zh"})
        data = resp.json()["data"]
        assert data["termination_reason"] == "completed"
        assert data["result"]["sql"] == good
        assert data["result"]["safe"] is True
    finally:
        with with_duckdb_connection() as con:
            con.execute(f"DROP TABLE IF EXISTS {t}")


def test_repair_sql_run(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)
    t = f"route_rep_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f"CREATE TABLE {t}(a INTEGER)")
        con.execute(f"INSERT INTO {t} VALUES (5)")
    try:
        good = f"SELECT a FROM {t}"
        with _scripted([json.dumps({"action": "final", "result": {
                "explanation": "列名错", "fixed_sql": good}})]):
            resp = _run_json("repair_sql", {"sql": f"SELECT b FROM {t}", "error": "Binder"},
                             {"tables": [t], "locale": "zh"})
        data = resp.json()["data"]["result"]
        assert data["fixed_sql"] == good and data["safe"] is True
    finally:
        with with_duckdb_connection() as con:
            con.execute(f"DROP TABLE IF EXISTS {t}")


def test_explain_sql_run(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)
    with _scripted([json.dumps({"action": "final", "result": {"explanation": "数所有行"}})]):
        resp = _run_json("explain_sql", {"sql": "SELECT count(*) FROM t"})
    assert resp.json()["data"]["result"]["explanation"] == "数所有行"


def test_suggest_chart_run_and_fallback(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)
    with _scripted([json.dumps({"action": "final", "result": {
            "type": "line", "x": "d", "y": ["v"], "agg": "sum"}})]):
        resp = _run_json("suggest_chart", {
            "columns": [{"name": "d", "type": "DATE"}, {"name": "v", "type": "DOUBLE"}],
            "sample": []})
    assert resp.json()["data"]["result"]["type"] == "line"
    # 非法两次 → fallback(result=None,前端 defaultSpec)
    with _scripted([json.dumps({"action": "final", "result": {"type": "bad"}}),
                    json.dumps({"action": "final", "result": {"type": "bad2"}})]):
        resp = _run_json("suggest_chart", {"columns": [{"name": "a", "type": "INT"}], "sample": []})
    data = resp.json()["data"]
    assert data["termination_reason"] == "output_invalid" and data["result"] is None


def test_unknown_mode_400(tmp_path, monkeypatch):
    """未知 mode 是非法判别键(取值错误)→ 400 VALIDATION_ERROR,绝不是
    ai_not_configured(那只表示供应商/模型没配)。stream / run 两个 transport 都覆盖。"""
    _enable_ai(tmp_path, monkeypatch)
    for path in ("/api/ai/agent/run", "/api/ai/agent/stream"):
        resp = client.post(path, json={
            "mode": "no_such_mode", "input": {}, "context": {"locale": "zh"}})
        assert resp.status_code == 400, path
        assert resp.json()["error"]["code"] == MessageCode.VALIDATION_ERROR, path


def test_disabled_400(tmp_path, monkeypatch):
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: tmp_path / "ai.json")
    resp = _run_json("data_qa", {"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_disabled"


def test_input_validation_400(tmp_path, monkeypatch):
    """#3 严格输入契约:generate_sql 缺 question / 空 question → 400 VALIDATION_ERROR。"""
    _enable_ai(tmp_path, monkeypatch)
    assert _run_json("generate_sql", {}).status_code == 400
    assert _run_json("generate_sql", {"question": ""}).status_code == 400
    assert _run_json("generate_sql", {"question": "   "}).status_code == 400  # 空格
    assert _run_json("repair_sql", {"error": "e"}).status_code == 400  # 缺 sql
    assert _run_json("suggest_chart", {"columns": [], "sample": []}).status_code == 400
    # 残留#3:非法 role / 空 content / columns=[{}] 都要拦
    assert _run_json("data_qa", {"messages": [{"role": "system", "content": "x"}]}).status_code == 400
    assert _run_json("data_qa", {"messages": [{"role": "user", "content": "  "}]}).status_code == 400
    assert _run_json("suggest_chart", {"columns": [{}], "sample": []}).status_code == 400


def test_stream_and_run_share_runner(tmp_path, monkeypatch):
    """同一 mode+input,stream 的 answer.result 与 run 的 result 结构一致。"""
    _enable_ai(tmp_path, monkeypatch)
    reply = json.dumps({"action": "final", "result": {"explanation": "同一 runner"}})
    with _scripted([reply]):
        run_data = _run_json("explain_sql", {"sql": "SELECT 1"}).json()["data"]["result"]
    with _scripted([reply]):
        with client.stream("POST", "/api/ai/agent/stream", json={
                "mode": "explain_sql", "input": {"sql": "SELECT 1"}, "context": {}}) as resp:
            ev = _read_events(resp)
    stream_result = next(e for e in ev if e["event"] == "answer")["result"]
    assert run_data == stream_result == {"explanation": "同一 runner"}


def test_agent_runs_records_mode(tmp_path, monkeypatch):
    _enable_ai(tmp_path, monkeypatch)
    with _scripted([json.dumps({"action": "final", "result": {"explanation": "e"}})]):
        rid = _run_json("explain_sql", {"sql": "SELECT 1"}).json()["data"]["run_id"]
    listed = client.get("/api/ai/agent-runs?limit=50").json()["data"]["items"]
    assert any(i["run_id"] == rid and i["mode"] == "explain_sql" for i in listed)
