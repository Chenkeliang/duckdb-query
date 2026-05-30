import importlib
import logging

from core.common import crypto


def test_encrypt_decrypt_round_trip(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret-key-please-change")
    importlib.reload(crypto)
    token = crypto.encrypt_secret("sk-abc123")
    assert token != "sk-abc123"
    assert crypto.decrypt_secret(token) == "sk-abc123"


def test_mask_secret_keeps_only_a_hint():
    assert crypto.mask_secret("sk-abcdef123456") == "****3456"
    assert crypto.mask_secret("") == ""
    assert crypto.mask_secret(None) == ""


def test_decrypt_empty_returns_empty(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret-key-please-change")
    importlib.reload(crypto)
    assert crypto.decrypt_secret("") == ""


def test_encrypt_warns_when_using_default_secret(monkeypatch, caplog):
    # 未配置 LLM_KEY_SECRET：默认密钥写在源码里，没有真正机密性 —— 加密真实 key 时必须告警
    monkeypatch.delenv("LLM_KEY_SECRET", raising=False)
    importlib.reload(crypto)
    with caplog.at_level(logging.WARNING):
        token = crypto.encrypt_secret("sk-needs-protection")
    assert token  # 仍能加密，不阻断
    assert any(
        "LLM_KEY_SECRET" in r.getMessage() for r in caplog.records
    ), "默认密钥兜底时应发出 LLM_KEY_SECRET 告警"
