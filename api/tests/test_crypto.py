import importlib

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
