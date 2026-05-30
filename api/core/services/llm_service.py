"""LLM 调用服务：按功能解析 provider/model，解密 key，经 LiteLLM 调用。"""

from __future__ import annotations

from typing import Any, Dict, List

import litellm  # pylint: disable=import-error

from core.common import crypto
from core.services import ai_config


class AIDisabledError(RuntimeError):
    """AI 总开关关闭。"""


class AIConfigError(RuntimeError):
    """功能未配置可用的 provider/model。"""


# LiteLLM 的 model 前缀：把我们的 provider type 映射为 LiteLLM 约定
_TYPE_PREFIX = {
    "openai": "openai",
    "anthropic": "anthropic",
    "ollama": "ollama",
    "openai_compatible": "openai",  # 通用 OpenAI 兼容端点
}


class LLMService:
    def __init__(self, cfg: Dict[str, Any]):
        self._cfg = cfg

    def complete(self, feature: str, messages: List[Dict[str, str]]) -> str:
        if not self._cfg.get("enabled"):
            raise AIDisabledError("AI features are disabled")

        resolved = ai_config.resolve_feature(self._cfg, feature)
        provider = resolved["provider"]
        model = resolved["model"]
        if not provider or not model:
            raise AIConfigError(f"No provider/model configured for feature '{feature}'")

        prefix = _TYPE_PREFIX.get(provider.get("type"), "openai")
        kwargs: Dict[str, Any] = {
            "model": f"{prefix}/{model}",
            "messages": messages,
            "timeout": self._cfg.get("timeout_seconds", 30),
            "num_retries": self._cfg.get("num_retries", 2),
        }
        api_key = crypto.decrypt_secret(provider.get("api_key") or "")
        if api_key:
            kwargs["api_key"] = api_key
        if provider.get("base_url"):
            kwargs["api_base"] = provider["base_url"]

        response = litellm.completion(**kwargs)
        return response.choices[0].message.content
