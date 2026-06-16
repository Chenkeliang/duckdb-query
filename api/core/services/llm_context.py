"""拼 NL→SQL 上下文:方言备忘 + 相关表 DDL + few-shot 样例(Top-3)+ 可选历史。

纯函数:不调模型、不查库。种子语料在 api/prompts/。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Dict, List, Optional

_bundle = getattr(sys, "_MEIPASS", None)
_PROMPTS_DIR = (
    Path(_bundle) / "prompts"
    if _bundle
    else Path(__file__).resolve().parent.parent.parent / "prompts"
)
_MAX_EXAMPLES = 3


def _read_dialect() -> str:
    try:
        return (_PROMPTS_DIR / "duckdb_dialect.md").read_text(encoding="utf-8").strip()
    except Exception:  # noqa: BLE001
        return ""


def _read_examples() -> List[Dict[str, str]]:
    try:
        data = json.loads((_PROMPTS_DIR / "sql_examples.json").read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:  # noqa: BLE001
        return []


def build_nl2sql_context(
    schema_text: str, history: Optional[List[str]] = None, locale: str = "zh"
) -> str:
    parts: List[str] = []
    dialect = _read_dialect()
    if dialect:
        parts.append(dialect)
    if schema_text:
        parts.append("# Available tables\n" + schema_text)
    examples = _read_examples()[:_MAX_EXAMPLES]
    if examples:
        ex = "\n\n".join(
            f"Q: {e.get('question', '')}\nSQL: {e.get('sql', '')}" for e in examples
        )
        parts.append("# Examples\n" + ex)
    hist = [h for h in (history or []) if h][:_MAX_EXAMPLES]
    if hist:
        parts.append("# Recent user SQL\n" + "\n".join(hist))
    return "\n\n".join(parts)
