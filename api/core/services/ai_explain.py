"""LLM 解释 SQL:把一段 SQL 翻成人话(只读,不改写、不执行)。"""

from __future__ import annotations

from typing import Any, Dict


def explain_sql(llm, sql: str, schema_text: str = "", locale: str = "zh") -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    system = (
        "You are a DuckDB SQL expert. Explain, in plain and concise language for a "
        "non-expert, what the user's SQL query does. Do not rewrite or execute it. "
        f"Respond in {lang}. Plain text only, no code fences."
    )
    user = f"SQL:\n{sql}\n\nSchema:\n{schema_text or '(none)'}"
    raw = llm.complete(
        "explain",
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return {"explanation": (raw or "").strip()}
