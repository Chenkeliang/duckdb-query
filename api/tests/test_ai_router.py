from unittest.mock import MagicMock, patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

import routers.ai as ai_router
from main import app

client = TestClient(app)


def test_put_then_get_masks_key(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)

    payload = {
        "enabled": True,
        "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "base_url": None,
                       "api_key": "sk-secret-4242", "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {"explain": {"enabled": True, "provider": None, "model": None}},
    }
    put = client.put("/api/settings/ai", json=payload)
    assert put.status_code == 200

    got = client.get("/api/settings/ai")
    assert got.status_code == 200
    data = got.json()["data"]
    assert data["enabled"] is True
    # 返回前端的 key 被掩码，绝不回传明文
    assert data["providers"][0]["api_key"] == "****4242"
    assert "sk-secret-4242" not in got.text


def test_provider_test_endpoint_pings_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)

    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x-1111",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {},
    })

    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="pong"))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/providers/p1/test")
    assert resp.status_code == 200
    assert resp.json()["data"]["ok"] is True


def test_provider_test_unknown_id_returns_error(tmp_path, monkeypatch):
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/providers/does-not-exist/test")
    assert resp.status_code == 404


def test_error_fix_returns_explanation_and_safe_fix(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-z-1",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {},
    })
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(
        content='{"explanation":"列写错了","fixed_sql":"SELECT order_id FROM orders"}'))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/error-fix", json={
            "sql": "SELECT order_idd FROM orders", "error": "Binder Error: ...",
            "tables": [], "locale": "zh",
        })
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["safe"] is True
    assert data["fixed_sql"] == "SELECT order_id FROM orders"
    assert "explanation" in data


def test_error_fix_when_ai_disabled_is_4xx(tmp_path, monkeypatch):
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/error-fix", json={
        "sql": "SELECT 1", "error": "e", "tables": [], "locale": "zh"})
    assert resp.status_code == 400


def test_build_schema_text_blocks_table_name_injection():
    """恶意表名不得经 DESCRIBE 触发堆叠语句（DuckDB 会执行堆叠语句 = 注入风险）。"""
    from core.database.duckdb_engine import with_duckdb_connection

    victim = "_inj_probe_keep"
    with with_duckdb_connection() as con:
        con.execute(f"DROP TABLE IF EXISTS {victim}")
        con.execute(f"CREATE TABLE {victim}(a INTEGER)")
    try:
        malicious = f'{victim}"; DROP TABLE {victim}; --'
        # 不应抛错，更绝不应执行被注入的 DROP
        ai_router._build_schema_text([malicious])
        with with_duckdb_connection() as con:
            survived = con.execute(
                "SELECT count(*) FROM information_schema.tables "
                f"WHERE table_name = '{victim}'"
            ).fetchone()[0]
        assert survived == 1, "表名注入执行了堆叠 DROP —— 存在 SQL 注入"
    finally:
        with with_duckdb_connection() as con:
            con.execute(f"DROP TABLE IF EXISTS {victim}")


def test_error_fix_disabled_has_stable_code(tmp_path, monkeypatch):
    # 默认 enabled=false → LLMService 抛 AIDisabledError → 稳定 code=ai_disabled
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/error-fix", json={
        "sql": "SELECT 1", "error": "e", "tables": [], "locale": "zh"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_disabled"


def test_explain_not_configured_has_stable_code(tmp_path, monkeypatch):
    # enabled=true 但无供应商 → AIConfigError → code=ai_not_configured
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": None, "providers": [], "features": {}})
    resp = client.post("/api/ai/explain-sql", json={"sql": "SELECT 1", "locale": "zh"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_not_configured"


def test_explain_sql_route_returns_explanation(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="这条 SQL 取所有订单。"))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/explain-sql", json={"sql": "SELECT * FROM orders", "locale": "zh"})
    assert resp.status_code == 200
    assert resp.json()["data"]["explanation"]


def test_nl_to_sql_route_returns_safe_select(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(
        content='{"sql":"SELECT count(*) FROM orders","used_tables":["orders"]}'))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/nl-to-sql", json={
            "question": "多少订单", "tables": ["orders"], "locale": "zh"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["safe"] is True
    assert data["sql"] == "SELECT count(*) FROM orders"
    assert data["used_tables"] == ["orders"]


def test_build_schema_text_logs_when_truncating(caplog):
    import logging
    names = [f"_no_such_t{i}" for i in range(12)]  # >10 触发截断
    with caplog.at_level(logging.INFO):
        ai_router._build_schema_text(names)
    assert any("truncat" in r.getMessage().lower() for r in caplog.records), \
        "tables 超过 10 个时应记录截断提示，避免静默丢弃"


def test_chat_route_returns_content(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="orders 表存放订单。"))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "orders 表是干嘛的"}],
            "tables": [], "locale": "zh"})
    assert resp.status_code == 200
    assert resp.json()["data"]["content"]


def test_chat_route_includes_current_sql_in_system_prompt(tmp_path, monkeypatch):
    """JOIN 页问"在当前SQL里加上xxx"时,后端应把工作台当前 SQL 拼进 system,
    否则助手看不到用户口中的"当前 SQL"。"""
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="好的"))]
    current_sql = 'SELECT * FROM "alerts" LEFT JOIN "rules" ON "alerts"."id" = "rules"."id"'
    with patch(
        "core.services.llm_service.litellm.completion", return_value=fake
    ) as mock_completion:
        resp = client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "在当前SQL里加上rules的关联"}],
            "tables": [], "locale": "zh", "current_sql": current_sql})
    assert resp.status_code == 200
    sent_messages = mock_completion.call_args.kwargs["messages"]
    system_message = next(m["content"] for m in sent_messages if m["role"] == "system")
    assert current_sql in system_message
    assert "Current SQL in the user's workbench" in system_message


def test_chat_system_prompt_enforces_duckdb_dialect(tmp_path, monkeypatch):
    """选中 MySQL/SQLite 表时模型易漂移到源库方言(反引号等);
    system 必须显式声明"一律 DuckDB 方言、双引号、禁源库特有函数"。"""
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="好的"))]
    with patch(
        "core.services.llm_service.litellm.completion", return_value=fake
    ) as mock_completion:
        resp = client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "帮我查询"}],
            "tables": [], "locale": "zh"})
    assert resp.status_code == 200
    sent_messages = mock_completion.call_args.kwargs["messages"]
    system_message = next(m["content"] for m in sent_messages if m["role"] == "system")
    assert "executes on DuckDB" in system_message
    assert "never backticks" in system_message
    assert "DuckDB dialect" in system_message


def test_chat_route_truncates_overlong_current_sql(tmp_path, monkeypatch):
    """current_sql 超过 4000 字符应被截断，避免把上下文撑爆。"""
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="好的"))]
    overlong_sql = "SELECT " + "a, " * 2000 + "1"
    with patch(
        "core.services.llm_service.litellm.completion", return_value=fake
    ) as mock_completion:
        resp = client.post("/api/ai/chat", json={
            "messages": [{"role": "user", "content": "hi"}],
            "tables": [], "locale": "zh", "current_sql": overlong_sql})
    assert resp.status_code == 200
    sent_messages = mock_completion.call_args.kwargs["messages"]
    system_message = next(m["content"] for m in sent_messages if m["role"] == "system")
    assert overlong_sql not in system_message
    assert len(system_message) < len(overlong_sql)


def test_chat_when_ai_disabled_has_stable_code(tmp_path, monkeypatch):
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/chat", json={
        "messages": [{"role": "user", "content": "hi"}], "tables": [], "locale": "zh"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_disabled"


def test_suggest_chart_returns_spec(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(
        content='{"type":"bar","x":"status","y":["amount"],"agg":"sum","reason":"按状态汇总金额"}'))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake):
        resp = client.post("/api/ai/suggest-chart", json={
            "columns": [{"name": "status", "type": "varchar(20)"},
                        {"name": "amount", "type": "decimal(11,2)"}],
            "sample": [{"status": "paid", "amount": 10}], "locale": "zh"})
    assert resp.status_code == 200
    d = resp.json()["data"]
    assert d["type"] == "bar"
    assert d["x"] == "status"
    assert d["y"] == ["amount"]
    assert d["agg"] == "sum"


def test_suggest_chart_disabled_has_stable_code(tmp_path, monkeypatch):
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    resp = client.post("/api/ai/suggest-chart", json={
        "columns": [{"name": "x", "type": "int"}], "sample": [], "locale": "zh"})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "ai_disabled"
