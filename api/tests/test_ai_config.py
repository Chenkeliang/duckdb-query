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
        "features": {"generate_sql": {"enabled": True, "provider": None, "model": None}},
    }
    resolved = ai_config.resolve_feature(cfg, "generate_sql")
    assert resolved["provider"]["id"] == "p1"
    assert resolved["model"] == "gpt-4o"


def test_prepare_for_read_survives_undecryptable_key():
    # 密钥轮换 / 密文损坏时 decrypt 会抛 InvalidToken；读取设置必须兜底掩码，绝不 500
    stored = {
        "enabled": True,
        "providers": [
            {"id": "p1", "type": "openai", "api_key": "not-a-valid-fernet-token"}
        ],
        "features": {},
    }
    public = ai_config.prepare_for_read(stored)  # 不得抛异常
    assert public["providers"][0]["api_key"] == "****"


def test_resolve_feature_falls_back_to_first_enabled_provider_without_default():
    # 只配了一个供应商但没设 default_provider(2026-07 实际用户场景):功能应直接可用
    cfg = {
        "enabled": True,
        "default_provider": None,
        "providers": [
            {"id": "p0", "type": "openai", "enabled": False, "models": ["m0"]},
            {"id": "p1", "type": "openai_compatible", "enabled": True, "models": ["glm-5.2"]},
        ],
        "features": {},
    }
    resolved = ai_config.resolve_feature(cfg, "data_qa")
    assert resolved["provider"]["id"] == "p1"
    assert resolved["model"] == "glm-5.2"
