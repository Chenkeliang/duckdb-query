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
