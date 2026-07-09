"""LLM 调用服务：按功能解析 provider/model，解密 key，经 LiteLLM 调用。"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from core.common import crypto
from core.services import ai_config


class _LiteLLMProxy:
    """litellm 的惰性代理。

    litellm 导入极重（连带 tiktoken/aiohttp 等），若在模块顶层导入会拖慢桌面端
    冷启动（run.py 先打印端口再 import main，这段全部计入前端 pollHealth 超时窗口，
    Windows 上叠加杀软首启扫描曾导致「本地引擎启动超时」）。故推迟到首次真正
    使用 AI 功能时才导入。保留模块属性 `litellm`（测试直接 patch 其 .completion）。
    """

    _mod = None
    _missing = False

    def _load(self):
        cls = type(self)
        if cls._mod is None and not cls._missing:
            try:
                import litellm as _mod  # pylint: disable=import-error,import-outside-toplevel

                cls._mod = _mod
            except ImportError as e:  # litellm 为可选依赖：未安装时 AI 功能不可用，但应用仍能正常启动
                # 真实原因必须落日志:桌面打包漏收依赖时,错误同样是 ImportError,
                # 只报"未安装"会把打包问题伪装成环境问题(2026-07 实际发生过)
                logging.getLogger(__name__).warning("litellm import failed: %s", e)
                cls._missing = True
        return cls._mod

    def __getattr__(self, name):
        mod = self._load()
        if mod is None:
            raise AttributeError(name)
        return getattr(mod, name)


litellm = _LiteLLMProxy()


def _litellm_available() -> bool:
    if litellm is None:  # 测试通过 monkeypatch 置 None 模拟未安装
        return False
    if isinstance(litellm, _LiteLLMProxy):
        return litellm._load() is not None  # pylint: disable=protected-access
    return True  # 测试替换为 Mock 等其他对象


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
        if not _litellm_available():
            raise AIConfigError(
                "litellm is not installed; AI features are unavailable "
                "(install it or rebuild the image with requirements.txt)"
            )

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
