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
        if not token:
            provider["api_key"] = ""
            continue
        try:
            plain = crypto.decrypt_secret(token)
        except Exception:
            # 密钥轮换 / 密文损坏：不暴露明文、也绝不让读取设置 500，
            # 给出「已设置但当前不可读」的掩码占位。
            provider["api_key"] = "****"
            continue
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
    """解析某功能实际用的 provider(对象) 与 model。

    回落顺序:feature 指定 → default_provider → 第一个已启用且有模型的供应商
    (用户只配了一个供应商但没点"设为默认"时,AI 功能应当直接可用)。
    与前端 useAiStatus.isFeatureConfigured 保持镜像。
    """
    feat = cfg.get("features", {}).get(feature, {}) or {}
    provider_id = feat.get("provider") or cfg.get("default_provider")
    provider = get_provider(cfg, provider_id)
    if provider is None or not provider.get("enabled", True):  # 缺省视为启用(兼容旧配置)
        provider = next(
            (
                p
                for p in cfg.get("providers", [])
                if p.get("enabled", True) and p.get("models")
            ),
            provider,  # 无可回落对象时保留原解析结果(可能为 None)
        )
    model = feat.get("model")
    if not model and provider:
        models = provider.get("models") or []
        model = models[0] if models else None
    return {"provider": provider, "model": model}


# system.db 通用设置表(system_app_settings)里的键;AI 设置自 2026-07 起
# 持久化在这里,与连接/收藏/快捷键同库——单文件备份 system.db 即可带走全部业务配置。
_AI_SETTINGS_KEY = "ai_settings"


def ai_settings_path() -> Path:
    """旧 JSON 文件路径:仅供一次性迁移与显式 path 场景(测试)使用。"""
    return Path(config_manager._default_data_dir()) / "ai_settings.json"


def _load_from_file(target: Path) -> Dict[str, Any]:
    """显式 path 场景的文件读取(测试接缝,保留旧语义)。"""
    if not target.exists():
        return default_ai_config()
    try:
        data = json.loads(target.read_text(encoding="utf-8"))
    except Exception:
        return default_ai_config()
    merged = default_ai_config()
    merged.update(data or {})
    return merged


def _migrate_legacy_file_to_db() -> Optional[Dict[str, Any]]:
    """一次性迁移:旧 ai_settings.json 存在则导入 system.db,并把文件改名
    .migrated 留作备份(与 sql-favorites 迁移同一约定)。返回导入的配置。"""
    legacy = ai_settings_path()
    if not legacy.exists():
        return None
    try:
        data = json.loads(legacy.read_text(encoding="utf-8"))
    except Exception:
        return None
    merged = default_ai_config()
    merged.update(data or {})
    from core.database.metadata_manager import metadata_manager  # 惰性:保持本模块纯函数可独立导入

    metadata_manager.save_app_setting(_AI_SETTINGS_KEY, merged)
    try:
        legacy.rename(legacy.with_name(legacy.name + ".migrated"))
    except OSError:
        pass  # 改名失败不阻塞——后续读取以 system.db 为准
    return merged


# 1.3.0 破坏性升级:5 个旧独立 LLM 功能键 → 统一 Agent 的 per-profile 键
# (profile.model_feature)。suggest_chart 键名前后一致,无需搬移;开发期 interim
# 迁移产物 `agent` 一并收敛到 data_qa。同 target 多来源时按此表顺序取先者。
_LEGACY_TO_PROFILE: Dict[str, str] = {
    "chat": "data_qa",
    "agent": "data_qa",
    "nl_to_sql": "generate_sql",
    "error_doctor": "repair_sql",
    "error_fix": "repair_sql",
    "explain": "explain_sql",
}


def migrate_legacy_features_to_profiles(stored: Dict[str, Any]) -> tuple[Dict[str, Any], bool]:
    """一次性版本迁移:旧独立功能键 → 统一 Agent 的 per-profile 键(1.3.0)。

    chat/agent→data_qa、nl_to_sql→generate_sql、error_doctor/error_fix→repair_sql、
    explain→explain_sql(suggest_chart 键名不变,不动)。目标 profile 键已配置则不
    覆盖;旧键一律删除(不留半迁移)。以是否存在任一旧键为门控,自终止且幂等
    (迁移后旧键不复存在 → 再次读取不触发)。features 里只有 provider/model 字符串、
    不含密钥,搬移无加密副作用。**仅数据升级**:运行时只按 profile.model_feature
    解析(per-profile 覆盖 → default_provider 兜底),从不回退到这些旧键。
    """
    features = stored.get("features")
    if not isinstance(features, dict):
        return stored, False
    changed = False
    for legacy_key, profile_key in _LEGACY_TO_PROFILE.items():
        if legacy_key not in features:
            continue
        legacy_cfg = features.pop(legacy_key) or {}
        changed = True
        target = features.get(profile_key) or {}
        target_configured = bool(target.get("provider") or target.get("model"))
        if not target_configured and (legacy_cfg.get("provider") or legacy_cfg.get("model")):
            features[profile_key] = {
                "provider": legacy_cfg.get("provider"),
                "model": legacy_cfg.get("model"),
            }
    if changed:
        stored["features"] = features
    return stored, changed


def load_ai_settings(path: Optional[Path] = None) -> Dict[str, Any]:
    """读取持久化的 AI 设置(存储态,api_key 为密文)。

    默认从 system.db(system_app_settings)读取;首次读取若发现旧
    ai_settings.json 会自动导入并改名备份。显式传 path 时保持文件语义。
    """
    if path is not None:
        return _load_from_file(path)
    from core.database.metadata_manager import metadata_manager

    stored = metadata_manager.get_app_setting(_AI_SETTINGS_KEY)
    if stored is None:
        stored = _migrate_legacy_file_to_db()
    # legacy→profile 一次性迁移:命中则持久化回库,此后幂等不再触发
    if stored:
        stored, changed = migrate_legacy_features_to_profiles(stored)
        if changed:
            metadata_manager.save_app_setting(_AI_SETTINGS_KEY, stored)
    merged = default_ai_config()
    merged.update(stored or {})
    return merged


def save_ai_settings(incoming: Dict[str, Any], path: Optional[Path] = None) -> None:
    """保存 AI 设置:明文 api_key 加密后持久化到 system.db。

    若某 provider 的 incoming api_key 为空(前端未改密钥,仅回传掩码占位),
    保留已存的密文 key,避免把现有密钥覆盖丢失。显式传 path 时写文件(测试)。
    """
    current = load_ai_settings(path)
    stored = prepare_for_storage(incoming)
    existing_keys = {
        p.get("id"): p.get("api_key") for p in current.get("providers", [])
    }
    for provider in stored.get("providers", []):
        if not provider.get("api_key") and existing_keys.get(provider.get("id")):
            provider["api_key"] = existing_keys[provider.get("id")]

    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        config_manager.atomic_write_json(path, stored)
        return
    from core.database.metadata_manager import metadata_manager

    metadata_manager.save_app_setting(_AI_SETTINGS_KEY, stored)
