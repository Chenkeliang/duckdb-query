import importlib
from unittest.mock import MagicMock, patch

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

    fake = MagicMock()
    fake.choices = [MagicMock(message=MagicMock(content="hello"))]
    with patch("core.services.llm_service.litellm.completion", return_value=fake) as m:
        out = svc.complete("explain", [{"role": "user", "content": "hi"}])

    assert out == "hello"
    kwargs = m.call_args.kwargs
    assert kwargs["model"] == "openai/gpt-4o-mini"      # type/model 组合
    assert kwargs["api_key"] == "sk-real-123456"        # 已解密
    assert kwargs["messages"][0]["content"] == "hi"


def test_complete_raises_when_ai_disabled(monkeypatch):
    cfg = _cfg(monkeypatch)
    cfg["enabled"] = False
    svc = llm_service.LLMService(cfg)
    try:
        svc.complete("explain", [{"role": "user", "content": "hi"}])
        assert False, "should have raised"
    except llm_service.AIDisabledError:
        pass


def test_complete_raises_when_litellm_missing(monkeypatch):
    # litellm 未安装（None）时，应用可启动，调用时给出清晰错误而非崩溃
    cfg = _cfg(monkeypatch)
    monkeypatch.setattr(llm_service, "litellm", None)
    svc = llm_service.LLMService(cfg)
    try:
        svc.complete("explain", [{"role": "user", "content": "hi"}])
        assert False, "should have raised"
    except llm_service.AIConfigError:
        pass


def test_complete_raises_when_feature_has_no_provider(monkeypatch):
    cfg = _cfg(monkeypatch)
    cfg["default_provider"] = None
    cfg["features"]["explain"] = {"enabled": True, "provider": None, "model": None}
    svc = llm_service.LLMService(cfg)
    try:
        svc.complete("explain", [{"role": "user", "content": "hi"}])
        assert False, "should have raised"
    except llm_service.AIConfigError:
        pass
