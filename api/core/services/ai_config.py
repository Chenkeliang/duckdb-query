"""AI 设置的内存形态与纯变换（加密存、掩码读、按功能解析 provider/model）。"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Dict, Optional

from core.common import crypto
from core.common.config_manager import config_manager


def default_ai_config() -> Dict[str, Any]:
    return {
        "enabled": False,
        "default_provider": None,
        "providers": [],
        "features": {},
        "timeout_seconds": 30,
        "num_retries": 2,
        "log_usage": True,
        "log_full_prompts": False,
    }


def prepare_for_storage(incoming: Dict[str, Any]) -> Dict[str, Any]:
    """保存前：把明文 api_key 加密。"""
    cfg = copy.deepcopy(incoming)
    for provider in cfg.get("providers", []):
        key = provider.get("api_key")
        if key:
            provider["api_key"] = crypto.encrypt_secret(key)
    return cfg


def prepare_for_read(stored: Dict[str, Any]) -> Dict[str, Any]:
    """返回前端前：把 api_key 掩码（解密出明文仅用于取尾 4 位提示）。"""
    cfg = copy.deepcopy(stored)
    for provider in cfg.get("providers", []):
        token = provider.get("api_key")
        plain = crypto.decrypt_secret(token) if token else ""
        provider["api_key"] = crypto.mask_secret(plain)
    return cfg


def get_provider(cfg: Dict[str, Any], provider_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not provider_id:
        return None
    for provider in cfg.get("providers", []):
        if provider.get("id") == provider_id:
            return provider
    return None


def resolve_feature(cfg: Dict[str, Any], feature: str) -> Dict[str, Any]:
    """解析某功能实际用的 provider(对象) 与 model；功能未指定则回落默认。"""
    feat = cfg.get("features", {}).get(feature, {}) or {}
    provider_id = feat.get("provider") or cfg.get("default_provider")
    provider = get_provider(cfg, provider_id)
    model = feat.get("model")
    if not model and provider:
        models = provider.get("models") or []
        model = models[0] if models else None
    return {"provider": provider, "model": model}


def ai_settings_path() -> Path:
    return Path(config_manager._default_data_dir()) / "ai_settings.json"


def load_ai_settings(path: Optional[Path] = None) -> Dict[str, Any]:
    """读取持久化的 AI 设置（存储态，api_key 为密文）；文件不存在则返回默认。"""
    target = path or ai_settings_path()
    if not target.exists():
        return default_ai_config()
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return default_ai_config()
    merged = default_ai_config()
    merged.update(data or {})
    return merged


def save_ai_settings(incoming: Dict[str, Any], path: Optional[Path] = None) -> None:
    """保存 AI 设置：明文 api_key 加密后落盘。

    若某 provider 的 incoming api_key 为空（前端未改密钥，仅回传掩码占位），
    保留已存的密文 key，避免把现有密钥覆盖丢失。
    """
    target = path or ai_settings_path()
    current = load_ai_settings(target)
    stored = prepare_for_storage(incoming)
    existing_keys = {
        p.get("id"): p.get("api_key") for p in current.get("providers", [])
    }
    for provider in stored.get("providers", []):
        if not provider.get("api_key") and existing_keys.get(provider.get("id")):
            provider["api_key"] = existing_keys[provider.get("id")]
    target.parent.mkdir(parents=True, exist_ok=True)
    config_manager.atomic_write_json(target, stored)
