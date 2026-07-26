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
        "features": {"explain_sql": {"enabled": True, "provider": None, "model": None}},
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


def test_prepare_agent_federation_degrades_per_alias(monkeypatch):
    """Bug4:一个坏连接 + 一个好连接 → 好连接照常授权,坏连接进 unavailable_aliases,
    绝不因单个失败把整个联邦范围清空、静默退化成本地。"""
    from core.common.exceptions import ResourceNotFoundError
    from models.query_models import AttachDatabase

    monkeypatch.setattr(ai_router.ai_config, "load_ai_settings", lambda: {"enabled": True})
    monkeypatch.setattr(ai_router.ai_config, "resolve_feature",
                        lambda cfg, feat: {"provider": {"id": "p"}, "model": "m"})
    monkeypatch.setattr(ai_router, "LLMService", lambda cfg: object())

    def fake_resolve(items):
        att = items[0]
        if att.alias == "bad":
            raise ResourceNotFoundError("Database connection", att.connection_id)
        return [(att.alias, {"type": "sqlite"})]

    monkeypatch.setattr(ai_router, "resolve_attach_configs", fake_resolve)

    req = ai_router.AgentRequest(
        mode="data_qa",
        input={"messages": [{"role": "user", "content": "x"}]},
        context=ai_router.AgentContext(attach_databases=[
            AttachDatabase(alias="good", connection_id="c1"),
            AttachDatabase(alias="bad", connection_id="c2"),
        ]),
    )
    _agen, ctx = ai_router._prepare_agent(req)
    assert ctx.authorized_aliases == ["good"]              # 好连接照常授权
    assert [a for a, _ in ctx.unavailable_aliases] == ["bad"]  # 坏连接被排除且明示


# ---- 问数范围:请求里的 scope 必须真的落到 guard 的 ScopeLimits 上 ----
# (2026-07-26:此前 scope 只影响"详细结构"上下文,目录仍列全部表、闸对本地表
#  无条件放行——用户选了 2 张表,模型照样跑去查第 3 张。)

@pytest.mark.parametrize("scope_kwargs,sql,expected", [
    (None, "SELECT * FROM whatever", True),                        # 无 scope = 旧行为
    ({"local_mode": "all"}, "SELECT * FROM whatever", True),        # 一张没勾 = 整库
    ({"local_mode": "tables", "local_tables": ["a"]}, "SELECT * FROM a", True),
    ({"local_mode": "tables", "local_tables": ["a"]}, "SELECT * FROM b", False),
    ({"local_mode": "none"}, "SELECT * FROM a", False),             # 移空 = 纯对话
    ({"local_mode": "none"}, "SELECT 1 AS v", True),                # 不碰表照常
    ({"alias_tables": {"sorder": ["iget_order"]}}, "SELECT * FROM sorder.iget_order", True),
    ({"alias_tables": {"sorder": ["iget_order"]}}, "SELECT * FROM sorder.crm_order", False),
    ({"alias_tables": {"sorder": ["iget_order"]}}, "SELECT * FROM demo.other", True),  # 未列出的别名仍整库
])
def test_request_scope_reaches_the_sql_guard(scope_kwargs, sql, expected):
    from core.services.ai_sql_guard import check_sql

    scope = None if scope_kwargs is None else ai_router.AgentScope(**scope_kwargs)
    limits = ai_router._scope_limits(scope)
    allowed, reason = check_sql(sql, ["sorder", "demo"], limits)
    assert allowed is expected, reason


def test_scope_all_maps_to_no_limits():
    """全放开时不构造 ScopeLimits——避免给闸多一层无谓判定。"""
    assert ai_router._scope_limits(ai_router.AgentScope()) is None
    assert ai_router._scope_limits(None) is None
