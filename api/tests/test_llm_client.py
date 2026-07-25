"""llm_client（litellm 替代）：请求构造 / 内容提取 / 重试语义。"""

from unittest.mock import MagicMock, patch

import httpx
import pytest

from core.services import llm_client
from core.services.llm_client import LLMClientError, _build_request


def _resp(status=200, json_data=None, text=""):
    resp = MagicMock()
    resp.status_code = status
    resp.text = text or (str(json_data)[:200] if json_data else "")
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = ValueError("no json")
    return resp


MESSAGES = [
    {"role": "system", "content": "you are helpful"},
    {"role": "user", "content": "hi"},
]


class TestBuildRequest:
    def test_openai_defaults(self):
        url, headers, body, _ = _build_request(
            "openai", "gpt-4o-mini", MESSAGES, "sk-1", None
        )
        assert url == "https://api.openai.com/v1/chat/completions"
        assert headers["Authorization"] == "Bearer sk-1"
        assert body["messages"] == MESSAGES  # system 保留在 messages 里

    def test_openai_compatible_uses_base_url_as_is(self):
        # base_url 语义与 litellm api_base 一致：包含 /v1 前缀，仅追加路径
        url, _, _, _ = _build_request(
            "openai_compatible", "deepseek-chat", MESSAGES, "k",
            "https://api.deepseek.com/v1/",
        )
        assert url == "https://api.deepseek.com/v1/chat/completions"

    def test_ollama_appends_v1_and_key_optional(self):
        url, headers, _, _ = _build_request(
            "ollama", "qwen3", MESSAGES, None, "http://192.168.1.5:11434"
        )
        assert url == "http://192.168.1.5:11434/v1/chat/completions"
        assert "Authorization" not in headers

    def test_anthropic_extracts_system_and_sets_headers(self):
        url, headers, body, _ = _build_request(
            "anthropic", "claude-sonnet-5", MESSAGES, "sk-ant", None
        )
        assert url == "https://api.anthropic.com/v1/messages"
        assert headers["x-api-key"] == "sk-ant"
        assert headers["anthropic-version"]
        assert body["system"] == "you are helpful"
        assert all(m["role"] != "system" for m in body["messages"])
        assert body["max_tokens"] > 0

    def test_anthropic_base_url_with_v1_not_doubled(self):
        url, _, _, _ = _build_request(
            "anthropic", "m", MESSAGES, "k", "https://gw.example.com/v1"
        )
        assert url == "https://gw.example.com/v1/messages"

    def test_anthropic_compatible_uses_messages_protocol(self):
        """anthropic_compatible 是 UI 层的第三方网关类型,协议面与 anthropic 完全一致。"""
        url, headers, body, _ = _build_request(
            "anthropic_compatible", "deepseek-v4-pro", MESSAGES, "sk-ds",
            "https://api.deepseek.com/anthropic",
        )
        assert url == "https://api.deepseek.com/anthropic/v1/messages"
        assert headers["x-api-key"] == "sk-ds"
        assert headers["anthropic-version"]
        assert body["system"] == "you are helpful"
        assert body["max_tokens"] > 0


class TestComplete:
    def test_openai_shape_extracted(self):
        data = {"choices": [{"message": {"content": "hello"}}]}
        with patch("httpx.post", return_value=_resp(200, data)):
            out = llm_client.complete(
                provider_type="openai", model="m", messages=MESSAGES, api_key="k"
            )
        assert out == "hello"

    def test_anthropic_shape_extracted(self):
        data = {"content": [{"type": "text", "text": "hi "}, {"type": "text", "text": "there"}]}
        with patch("httpx.post", return_value=_resp(200, data)):
            out = llm_client.complete(
                provider_type="anthropic", model="m", messages=MESSAGES, api_key="k"
            )
        assert out == "hi there"

    def test_retries_on_429_then_succeeds(self, monkeypatch):
        monkeypatch.setattr(llm_client.time, "sleep", lambda _s: None)
        ok = _resp(200, {"choices": [{"message": {"content": "ok"}}]})
        with patch("httpx.post", side_effect=[_resp(429, text="rate"), ok]) as m:
            out = llm_client.complete(
                provider_type="openai", model="m", messages=MESSAGES,
                api_key="k", num_retries=2,
            )
        assert out == "ok"
        assert m.call_count == 2

    def test_auth_error_not_retried(self):
        with patch("httpx.post", return_value=_resp(401, text="bad key")) as m:
            with pytest.raises(LLMClientError, match="401"):
                llm_client.complete(
                    provider_type="openai", model="m", messages=MESSAGES,
                    api_key="bad", num_retries=3,
                )
        assert m.call_count == 1  # 确定性失败不重试

    def test_network_error_exhausts_retries(self, monkeypatch):
        monkeypatch.setattr(llm_client.time, "sleep", lambda _s: None)
        with patch("httpx.post", side_effect=httpx.ConnectError("refused")) as m:
            with pytest.raises(LLMClientError, match="request failed"):
                llm_client.complete(
                    provider_type="openai", model="m", messages=MESSAGES,
                    api_key="k", num_retries=2,
                )
        assert m.call_count == 3  # 1 次原始 + 2 次重试
