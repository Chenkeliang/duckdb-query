"""LLM 把自然语言翻成 DuckDB SELECT,带 SELECT-only 安全闸。

复用报错医生的 _is_select_only(DuckDB 解析器,零新依赖)与 _extract_json(DRY)。
"""

from __future__ import annotations

from typing import Any, Dict

from core.services.ai_error_doctor import _extract_json, _is_select_only


def nl_to_sql(llm, question: str, context: str, locale: str = "zh") -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    system = (
        "You are a DuckDB SQL expert. Translate the user's question into a single "
        "READ-ONLY DuckDB SELECT query using ONLY the provided schema. "
        "Never produce INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/COPY/ATTACH. "
        f"Any prose in {lang}. Reply with strict JSON only: "
        '{"sql": "<SELECT ...>", "used_tables": ["t1"]}'
    )
    user = f"Question:\n{question}\n\nContext:\n{context or '(none)'}"
    raw = llm.complete(
        "nl_to_sql",
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    parsed = _extract_json(raw)
    sql = str(parsed.get("sql") or "").strip()
    used = parsed.get("used_tables") or []
    if not isinstance(used, list):
        used = []
    used = [str(t) for t in used]
    safe = bool(sql) and _is_select_only(sql)
    return {"sql": sql, "used_tables": used, "safe": safe}
