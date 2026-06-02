"""LLM 推荐图表:给定结果列(名+类型)+样本,产出结构化 ChartSpec。"""

from __future__ import annotations

import json
from typing import Any, Dict, List

# 复用报错医生里的 JSON 抽取(更健壮、避免重复;nl_to_sql 也是这么复用的)
from core.services.ai_error_doctor import _extract_json

_TYPES = {"bar", "line", "area", "pie", "donut", "kpi"}
_AGGS = {"sum", "count", "avg", "min", "max"}


def suggest_chart(
    llm,
    columns: List[Dict[str, str]],
    sample: List[Dict[str, Any]],
    locale: str = "zh",
) -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    cols_text = ", ".join(f"{c.get('name')}({c.get('type')})" for c in columns)
    system = (
        "You pick ONE chart for a SQL result. Output ONLY JSON: "
        '{"type": one of bar|line|area|pie|donut|kpi, "x": dimension column name or null, '
        '"y": [metric column names], "agg": one of sum|count|avg|min|max, '
        '"xBin": "day"|"month"|null, "reason": short text}. '
        "x/y MUST be real column names from the list. Prefer a date column as x with line; "
        "else a text column as x with bar; numeric column as y. "
        "NEVER use pie or donut when x is a date/time column (dates are trends -> use line). "
        "Use pie/donut ONLY for a low-cardinality text category. "
        f"Reason in {lang}."
    )
    user = f"Columns: {cols_text}\nSample rows: {json.dumps(sample[:5], ensure_ascii=False)}"
    raw = llm.complete(
        "suggest_chart",
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    data = _extract_json(raw)
    out = {
        "type": data.get("type") if data.get("type") in _TYPES else "bar",
        "x": data.get("x"),
        "y": data.get("y") if isinstance(data.get("y"), list) else [],
        "agg": data.get("agg") if data.get("agg") in _AGGS else "sum",
        "xBin": data.get("xBin") if data.get("xBin") in ("day", "month") else None,
        "reason": str(data.get("reason") or ""),
    }
    return out
