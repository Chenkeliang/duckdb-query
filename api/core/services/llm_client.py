"""轻量 LLM 客户端：httpx 直连 OpenAI 兼容 / Anthropic / Ollama 端点。

替代 litellm——本项目只用"非流式 completion"一个能力，而 litellm 连带
tokenizers/tiktoken/aiohttp/jsonschema 等依赖在桌面冻结包里占约 54MB。
四类 provider（openai / openai_compatible / anthropic / ollama）直连覆盖，
参数面与原 litellm.completion 用法等价：model、messages、api_key、
base_url、timeout、num_retries。
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_ANTHROPIC_VERSION = "2023-06-01"
# Anthropic /v1/messages 的 max_tokens 是必填项，取值对齐 litellm 的默认上限
_ANTHROPIC_MAX_TOKENS = 4096
_RETRYABLE_STATUS = {408, 409, 429, 500, 502, 503, 504}


class LLMClientError(RuntimeError):
    """上游调用失败（网络 / HTTP 状态 / 响应结构不符）。"""


def _openai_content(data: Dict[str, Any]) -> str:
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMClientError(
            f"unexpected completion response shape: {str(data)[:200]}"
        ) from exc
    return content or ""


def _anthropic_content(data: Dict[str, Any]) -> str:
    try:
        blocks = data["content"]
        return "".join(
            block.get("text", "") for block in blocks if block.get("type") == "text"
        )
    except (KeyError, TypeError) as exc:
        raise LLMClientError(
            f"unexpected anthropic response shape: {str(data)[:200]}"
        ) from exc


def _build_request(
    provider_type: str,
    model: str,
    messages: List[Dict[str, str]],
    api_key: Optional[str],
    base_url: Optional[str],
) -> Tuple[str, Dict[str, str], Dict[str, Any], Callable[[Dict[str, Any]], str]]:
    """按 provider 类型构造 (url, headers, body, 内容提取器)。"""
    if provider_type == "anthropic":
        base = (base_url or "https://api.anthropic.com").rstrip("/")
        if base.endswith("/v1"):
            base = base[: -len("/v1")]
        # Anthropic 的 system 是顶层参数，不属于 messages
        system_parts = [
            m.get("content") or "" for m in messages if m.get("role") == "system"
        ]
        chat = [m for m in messages if m.get("role") != "system"]
        body: Dict[str, Any] = {
            "model": model,
            "max_tokens": _ANTHROPIC_MAX_TOKENS,
            "messages": chat,
        }
        if system_parts:
            body["system"] = "\n\n".join(system_parts)
        headers = {
            "x-api-key": api_key or "",
            "anthropic-version": _ANTHROPIC_VERSION,
        }
        return f"{base}/v1/messages", headers, body, _anthropic_content

    if provider_type == "ollama":
        # Ollama 的 OpenAI 兼容层挂在 /v1；用户配置通常只填 host:port
        base = (base_url or "http://localhost:11434").rstrip("/")
        if not base.endswith("/v1"):
            base = f"{base}/v1"
    else:
        # openai / openai_compatible：base_url 语义与 litellm 的 api_base 一致
        # （包含 /v1 等路径前缀，客户端只追加 /chat/completions）
        base = (base_url or "https://api.openai.com/v1").rstrip("/")

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = {"model": model, "messages": messages}
    return f"{base}/chat/completions", headers, body, _openai_content


def complete(
    *,
    provider_type: str,
    model: str,
    messages: List[Dict[str, str]],
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    timeout: float = 30,
    num_retries: int = 2,
) -> str:
    """非流式 completion，返回首选回复的文本内容。

    网络错误与可重试状态码（429/5xx 等）按 num_retries 指数退避重试；
    其余 4xx（鉴权/参数错误）立即抛出，避免对确定性失败反复计费重试。
    """
    # 惰性导入：import httpx 冷启动实测 ~250ms，桌面端 run.py 的
    # "importing app" 阶段在前端健康轮询超时窗口内，首次真正调用 AI 再付
    import httpx  # pylint: disable=import-outside-toplevel

    url, headers, body, extract = _build_request(
        provider_type, model, messages, api_key, base_url
    )
    attempts = max(int(num_retries), 0) + 1
    last_err: Optional[LLMClientError] = None
    for attempt in range(attempts):
        if attempt:
            time.sleep(min(0.5 * 2 ** (attempt - 1), 4.0))
        try:
            resp = httpx.post(url, json=body, headers=headers, timeout=timeout)
        except httpx.HTTPError as exc:
            last_err = LLMClientError(f"LLM request failed: {exc}")
            logger.warning("LLM request error (attempt %d/%d): %s", attempt + 1, attempts, exc)
            continue
        if resp.status_code in _RETRYABLE_STATUS:
            last_err = LLMClientError(
                f"LLM upstream HTTP {resp.status_code}: {resp.text[:200]}"
            )
            logger.warning(
                "LLM retryable status %d (attempt %d/%d)",
                resp.status_code, attempt + 1, attempts,
            )
            continue
        if resp.status_code >= 400:
            raise LLMClientError(
                f"LLM upstream HTTP {resp.status_code}: {resp.text[:200]}"
            )
        try:
            data = resp.json()
        except ValueError as exc:
            raise LLMClientError(
                f"LLM upstream returned non-JSON: {resp.text[:200]}"
            ) from exc
        return extract(data)
    assert last_err is not None
    raise last_err
