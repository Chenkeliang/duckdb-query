"""llm_client.complete_async:重试语义/超时/立即失败,与同步版行为对齐。"""

import asyncio
from unittest.mock import MagicMock, patch

import httpx
import pytest

from core.services import llm_client
from core.services.llm_client import LLMClientError

MESSAGES = [{"role": "user", "content": "hi"}]


def _resp(status=200, json_data=None, text=""):
    resp = MagicMock()
    resp.status_code = status
    resp.text = text or (str(json_data)[:200] if json_data else "")
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = ValueError("no json")
    return resp


class FakeAsyncClient:
    """按脚本回放响应/异常;记录调用次数。"""

    script = []
    calls = 0

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None):
        FakeAsyncClient.calls += 1
        item = FakeAsyncClient.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def _run(**kwargs):
    return asyncio.run(
        llm_client.complete_async(
            provider_type="openai", model="m", messages=MESSAGES, **kwargs
        )
    )


@pytest.fixture(autouse=True)
def _fake_client(monkeypatch):
    FakeAsyncClient.script = []
    FakeAsyncClient.calls = 0
    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)
    yield


def test_success_extracts_openai_content():
    FakeAsyncClient.script = [
        _resp(json_data={"choices": [{"message": {"content": "pong"}}]})
    ]
    assert _run() == "pong"
    assert FakeAsyncClient.calls == 1


def test_retryable_status_then_success():
    FakeAsyncClient.script = [
        _resp(status=500, text="boom"),
        _resp(json_data={"choices": [{"message": {"content": "ok"}}]}),
    ]
    assert _run(num_retries=1) == "ok"
    assert FakeAsyncClient.calls == 2


def test_retries_exhausted_raises():
    FakeAsyncClient.script = [
        httpx.ConnectTimeout("t1"),
        httpx.ConnectTimeout("t2"),
    ]
    with pytest.raises(LLMClientError):
        _run(num_retries=1)
    assert FakeAsyncClient.calls == 2


def test_auth_error_fails_immediately_no_retry():
    FakeAsyncClient.script = [_resp(status=401, text="bad key")]
    with pytest.raises(LLMClientError):
        _run(num_retries=2)
    assert FakeAsyncClient.calls == 1  # 确定性 4xx 不重试不计费
