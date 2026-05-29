"""上传导入模式：用户可选 auto（安全定型）或 literal（全部文本）。"""

from typing import Optional

VALID_IMPORT_MODES = frozenset({"auto", "literal", "variant"})
DEFAULT_IMPORT_MODE = "auto"


def normalize_import_mode(mode: Optional[str]) -> str:
    normalized = (mode or DEFAULT_IMPORT_MODE).strip().lower()
    if normalized not in VALID_IMPORT_MODES:
        raise ValueError(
            f"import_mode must be one of: {', '.join(sorted(VALID_IMPORT_MODES))}"
        )
    return normalized


def should_promote_column_types(mode: Optional[str]) -> bool:
    return normalize_import_mode(mode) == "auto"


def use_all_varchar_on_load(mode: Optional[str]) -> bool:
    """CSV / read_xlsx 先按文本读入（auto 与 literal 均如此）。"""
    return normalize_import_mode(mode) != "variant"


def is_variant_json_import(mode: Optional[str]) -> bool:
    return normalize_import_mode(mode) == "variant"


def resolve_import_mode(
    requested: Optional[str],
    *,
    file_type: Optional[str] = None,
) -> str:
    """解析最终入湖模式：显式 import_mode 优先；auto + JSON 可读 app 配置。"""
    mode = (requested or DEFAULT_IMPORT_MODE).strip().lower()
    if mode != "auto":
        return normalize_import_mode(mode)

    normalized_type = (file_type or "").lower().lstrip(".")
    if normalized_type in ("json", "jsonl"):
        from core.common.config_manager import config_manager

        cfg = (
            getattr(config_manager.get_app_config(), "json_import_column_type", "auto")
            or "auto"
        ).strip().lower()
        if cfg == "variant":
            return "variant"
    return "auto"
