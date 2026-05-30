import importlib

from core.common import crypto
from core.services import ai_config


def test_load_returns_default_when_file_missing(tmp_path, monkeypatch):
    importlib.reload(ai_config)
    path = tmp_path / "ai_settings.json"
    cfg = ai_config.load_ai_settings(path)
    assert cfg["enabled"] is False
    assert cfg["providers"] == []


def test_save_then_load_round_trips_with_encrypted_key(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    importlib.reload(crypto)
    importlib.reload(ai_config)
    path = tmp_path / "ai_settings.json"

    ai_config.save_ai_settings({
        "enabled": True,
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-plain-9999",
                       "models": ["gpt-4o-mini"], "enabled": True}],
        "features": {},
    }, path)

    # 落盘的是密文，不是明文
    raw = path.read_text(encoding="utf-8")
    assert "sk-plain-9999" not in raw

    loaded = ai_config.load_ai_settings(path)
    assert loaded["enabled"] is True
    assert crypto.decrypt_secret(loaded["providers"][0]["api_key"]) == "sk-plain-9999"


def test_save_preserves_existing_key_when_incoming_empty(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    importlib.reload(crypto)
    importlib.reload(ai_config)
    path = tmp_path / "ai_settings.json"

    ai_config.save_ai_settings({
        "enabled": True,
        "providers": [{"id": "p1", "type": "openai", "api_key": "sk-keep-7777",
                       "models": ["m"], "enabled": True}],
        "features": {},
    }, path)
    # 二次保存：同 provider，api_key 为空（用户未改密钥）→ 应保留原密钥
    ai_config.save_ai_settings({
        "enabled": True,
        "providers": [{"id": "p1", "type": "openai", "api_key": "",
                       "models": ["m"], "enabled": True}],
        "features": {},
    }, path)
    loaded = ai_config.load_ai_settings(path)
    assert crypto.decrypt_secret(loaded["providers"][0]["api_key"]) == "sk-keep-7777"
