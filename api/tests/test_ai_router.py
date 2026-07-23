from unittest.mock import patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

import routers.ai as ai_router
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_ai_settings_in_db():
    """AI 设置自 2026-07 收拢进共享的 system.db(system_app_settings),不再是
    per-test tmp 文件。本文件启用/禁用用例交替运行,启用用例写入的 provider 会
    污染紧随其后的"AI disabled"断言(stale 密文 → 解密 InvalidToken)。每个
    用例前后清空该键,恢复独立性。"""
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

    with patch("core.services.llm_service.llm_client.complete", return_value="pong"):
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
    fake = '{"explanation":"列写错了","fixed_sql":"SELECT order_id FROM orders"}'
    with patch("core.services.llm_service.llm_client.complete", return_value=fake):
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
    with patch(
        "core.services.llm_service.llm_client.complete",
        return_value="这条 SQL 取所有订单。",
    ):
        resp = client.post("/api/ai/explain-sql", json={"sql": "SELECT * FROM orders", "locale": "zh"})
    assert resp.status_code == 200
    assert resp.json()["data"]["explanation"]


def _put_enabled_ai_settings(tmp_path, monkeypatch):
    """启用 AI 并配好一个 provider(nl-to-sql 系列用例的公共前置)。"""
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})


def _with_real_table(name: str, create_sql: str, insert_sql: str | None = None):
    """在共享测试库里建一张确定性的真实表,返回清理函数。"""
    from core.database.duckdb_engine import with_duckdb_connection

    with with_duckdb_connection() as con:
        con.execute(f"DROP TABLE IF EXISTS {name}")
        con.execute(create_sql)
        if insert_sql:
            con.execute(insert_sql)

    def _cleanup():
        with with_duckdb_connection() as con:
            con.execute(f"DROP TABLE IF EXISTS {name}")

    return _cleanup


def test_nl_to_sql_route_returns_safe_select(tmp_path, monkeypatch):
    _put_enabled_ai_settings(tmp_path, monkeypatch)
    t = "_ai_nlsql_ok"
    cleanup = _with_real_table(t, f"CREATE TABLE {t}(a INTEGER)", f"INSERT INTO {t} VALUES (1)")
    try:
        fake = f'{{"sql":"SELECT count(*) FROM {t}","used_tables":["{t}"]}}'
        with patch("core.services.llm_service.llm_client.complete",
                   return_value=fake) as mock_completion:
            resp = client.post("/api/ai/nl-to-sql", json={
                "question": "多少行", "tables": [t], "locale": "zh"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["safe"] is True
        assert data["sql"] == f"SELECT count(*) FROM {t}"
        assert data["used_tables"] == [t]
        # 表真实存在 → EXPLAIN 一次通过,不触发修复轮
        assert mock_completion.call_count == 1
    finally:
        cleanup()


def test_nl_to_sql_route_self_repairs_end_to_end(tmp_path, monkeypatch):
    """列名写错的生成 → EXPLAIN 失败 → 报错医生修一轮 → 返回修复后 SQL。"""
    _put_enabled_ai_settings(tmp_path, monkeypatch)
    t = "_ai_nlsql_repair"
    cleanup = _with_real_table(
        t,
        f"CREATE TABLE {t}(order_id INTEGER, status VARCHAR)",
        f"INSERT INTO {t} VALUES (1,'active'),(2,'closed')",
    )
    try:
        good = f"SELECT count(*) FROM {t} WHERE status = 'active'"
        responses = [
            f'{{"sql":"SELECT count(*) FROM {t} WHERE statuss = \'active\'",'
            f'"used_tables":["{t}"]}}',
            f'{{"explanation":"列名写错","fixed_sql":"{good}"}}',
        ]
        with patch("core.services.llm_service.llm_client.complete",
                   side_effect=responses) as mock_completion:
            resp = client.post("/api/ai/nl-to-sql", json={
                "question": "活跃的多少", "tables": [t], "locale": "zh"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sql"] == good
        assert data["safe"] is True
        assert mock_completion.call_count == 2
    finally:
        cleanup()


def test_nl_to_sql_route_falls_back_when_repair_fails(tmp_path, monkeypatch):
    """修复轮也没救回来 → 回退首轮 SQL(响应形状不变),且只修一轮。"""
    _put_enabled_ai_settings(tmp_path, monkeypatch)
    t = "_ai_nlsql_fallback"
    cleanup = _with_real_table(t, f"CREATE TABLE {t}(a INTEGER)")
    try:
        bad = f"SELECT nope FROM {t}"
        responses = [
            f'{{"sql":"{bad}","used_tables":["{t}"]}}',
            f'{{"explanation":"还是错","fixed_sql":"SELECT still_nope FROM {t}"}}',
        ]
        with patch("core.services.llm_service.llm_client.complete",
                   side_effect=responses) as mock_completion:
            resp = client.post("/api/ai/nl-to-sql", json={
                "question": "?", "tables": [t], "locale": "zh"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["sql"] == bad
        assert data["safe"] is True  # 语义仍是只读 SELECT;能否执行由用户点击后揭晓(维持旧行为)
        assert mock_completion.call_count == 2
    finally:
        cleanup()


def test_nl_to_sql_prompt_includes_data_samples(tmp_path, monkeypatch):
    """真实表的取值样例必须进 prompt——这是 WHERE 条件不靠猜的关键。"""
    _put_enabled_ai_settings(tmp_path, monkeypatch)
    t = "_ai_nlsql_samples"
    cleanup = _with_real_table(
        t,
        f"CREATE TABLE {t}(id INTEGER, status VARCHAR)",
        f"INSERT INTO {t} VALUES (1,'active'),(2,'closed')",
    )
    try:
        fake = f'{{"sql":"SELECT count(*) FROM {t}","used_tables":["{t}"]}}'
        with patch("core.services.llm_service.llm_client.complete",
                   return_value=fake) as mock_completion:
            client.post("/api/ai/nl-to-sql", json={
                "question": "多少行", "tables": [t], "locale": "zh"})
        user_msg = mock_completion.call_args_list[0].kwargs["messages"][1]["content"]
        assert "'active'" in user_msg
        assert "status values:" in user_msg
    finally:
        cleanup()


def test_build_schema_text_logs_when_truncating(caplog):
    import logging
    names = [f"_no_such_t{i}" for i in range(12)]  # >10 触发截断
    with caplog.at_level(logging.INFO):
        ai_router._build_schema_text(names)
    assert any("truncat" in r.getMessage().lower() for r in caplog.records), \
        "tables 超过 10 个时应记录截断提示，避免静默丢弃"


def test_build_schema_text_samples_local_but_not_qualified_tables(tmp_path, monkeypatch):
    """本地裸表名带样例 + 免责声明;限定名(联邦形态,带 \".\")只出结构不采样。"""
    from core.services import schema_sampler

    t = "_ai_schema_sample_probe"
    cleanup = _with_real_table(
        t,
        f"CREATE TABLE {t}(id INTEGER, status VARCHAR)",
        f"INSERT INTO {t} VALUES (1,'active'),(2,'closed')",
    )
    try:
        text = ai_router._build_schema_text([t])
        assert schema_sampler.SAMPLE_DISCLAIMER in text
        assert "sample rows:" in text
        assert "status values:" in text and "'active'" in text

        qualified = ai_router._build_schema_text([f"main.{t}"])
        assert f"main.{t}(" in qualified  # 结构照常
        assert "sample rows:" not in qualified  # 但不采样
        assert schema_sampler.SAMPLE_DISCLAIMER not in qualified
    finally:
        cleanup()


def test_chat_route_returns_content(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    settings_path = tmp_path / "ai_settings.json"
    monkeypatch.setattr(ai_router.ai_config, "ai_settings_path", lambda: settings_path)
    client.put("/api/settings/ai", json={
        "enabled": True, "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-x",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {}})
    with patch(
        "core.services.llm_service.llm_client.complete",
        return_value="orders 表存放订单。",
    ):
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
    current_sql = 'SELECT * FROM "alerts" LEFT JOIN "rules" ON "alerts"."id" = "rules"."id"'
    with patch(
        "core.services.llm_service.llm_client.complete", return_value="好的"
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
    with patch(
        "core.services.llm_service.llm_client.complete", return_value="好的"
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
    overlong_sql = "SELECT " + "a, " * 2000 + "1"
    with patch(
        "core.services.llm_service.llm_client.complete", return_value="好的"
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
    fake = '{"type":"bar","x":"status","y":["amount"],"agg":"sum","reason":"按状态汇总金额"}'
    with patch("core.services.llm_service.llm_client.complete", return_value=fake):
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
