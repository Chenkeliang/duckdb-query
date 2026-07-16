"""LLM 调用服务：按功能解析 provider/model，解密 key，经轻量客户端调用。"""

from __future__ import annotations

from typing import Any, Dict, List

from core.common import crypto
from core.services import ai_config, llm_client


class AIDisabledError(RuntimeError):
    """AI 总开关关闭。"""


class AIConfigError(RuntimeError):
    """功能未配置可用的 provider/model。"""


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

        api_key = crypto.decrypt_secret(provider.get("api_key") or "")
        return llm_client.complete(
            provider_type=provider.get("type") or "openai_compatible",
            model=model,
            messages=messages,
            api_key=api_key or None,
            base_url=provider.get("base_url") or None,
            timeout=self._cfg.get("timeout_seconds", 30),
            num_retries=self._cfg.get("num_retries", 2),
        )
