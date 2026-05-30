import importlib

from core.common import crypto
from core.services import ai_config


def test_default_config_is_disabled():
    cfg = ai_config.default_ai_config()
    assert cfg["enabled"] is False
    assert cfg["providers"] == []


def test_save_encrypts_key_and_read_masks_it(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    importlib.reload(crypto)
    importlib.reload(ai_config)

    incoming = {
        "enabled": True,
        "providers": [
            {"id": "openai-1", "type": "openai", "base_url": None,
             "api_key": "sk-plain-123456", "models": ["gpt-4o-mini"], "enabled": True}
        ],
        "features": {},
    }
    stored = ai_config.prepare_for_storage(incoming)
    # 存储态：key 被加密，不是明文
    assert stored["providers"][0]["api_key"] != "sk-plain-123456"
    assert crypto.decrypt_secret(stored["providers"][0]["api_key"]) == "sk-plain-123456"

    public = ai_config.prepare_for_read(stored)
    # 读取态：key 被掩码
    assert public["providers"][0]["api_key"] == "****3456"


def test_resolve_feature_falls_back_to_default():
    cfg = {
        "enabled": True,
        "default_provider": "p1",
        "providers": [{"id": "p1", "type": "openai", "models": ["gpt-4o"]}],
        "features": {"nl_to_sql": {"enabled": True, "provider": None, "model": None}},
    }
    resolved = ai_config.resolve_feature(cfg, "nl_to_sql")
    assert resolved["provider"]["id"] == "p1"
    assert resolved["model"] == "gpt-4o"
