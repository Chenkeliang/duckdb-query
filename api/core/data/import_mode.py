"""上传导入模式：用户可选 auto（安全定型）或 literal（全部文本）。"""

from typing import Optional

VALID_IMPORT_MODES = frozenset({"auto", "literal"})
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
    normalize_import_mode(mode)
    return True
