import importlib
from unittest.mock import patch

from core.common import crypto
from core.services import llm_service


def _cfg(monkeypatch):
    monkeypatch.setenv("LLM_KEY_SECRET", "test-secret")
    importlib.reload(crypto)
    importlib.reload(llm_service)
    return {
        "enabled": True,
        "default_provider": "p1",
        "providers": [{
            "id": "p1", "type": "openai", "base_url": None,
            "api_key": crypto.encrypt_secret("sk-real-123456"),
            "models": ["gpt-4o-mini"], "enabled": True,
        }],
        "features": {"explain": {"enabled": True, "provider": None, "model": None}},
        "timeout_seconds": 30, "num_retries": 2,
    }


def test_complete_resolves_model_and_decrypts_key(monkeypatch):
    cfg = _cfg(monkeypatch)
    svc = llm_service.LLMService(cfg)

    with patch(
        "core.services.llm_service.llm_client.complete", return_value="hello"
    ) as m:
        out = svc.complete("explain", [{"role": "user", "content": "hi"}])

    assert out == "hello"
    kwargs = m.call_args.kwargs
    assert kwargs["provider_type"] == "openai"
    assert kwargs["model"] == "gpt-4o-mini"
    assert kwargs["api_key"] == "sk-real-123456"        # 已解密
    assert kwargs["messages"][0]["content"] == "hi"
    assert kwargs["timeout"] == 30
    assert kwargs["num_retries"] == 2


def test_complete_raises_when_ai_disabled(monkeypatch):
    cfg = _cfg(monkeypatch)
    cfg["enabled"] = False
    svc = llm_service.LLMService(cfg)
    try:
        svc.complete("explain", [{"role": "user", "content": "hi"}])
        assert False, "should have raised"
    except llm_service.AIDisabledError:
        pass


def test_complete_raises_when_feature_has_no_provider(monkeypatch):
    # default 为空但仍有已启用供应商时会回落(见 resolve_feature),
    # 因此这里把唯一供应商禁用,构造"真正无可用供应商"的场景
    cfg = _cfg(monkeypatch)
    cfg["default_provider"] = None
    cfg["providers"][0]["enabled"] = False
    cfg["features"]["explain"] = {"enabled": True, "provider": None, "model": None}
    svc = llm_service.LLMService(cfg)
    try:
        svc.complete("explain", [{"role": "user", "content": "hi"}])
        assert False, "should have raised"
    except llm_service.AIConfigError:
        pass
