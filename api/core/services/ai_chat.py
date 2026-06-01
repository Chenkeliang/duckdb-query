"""LLM 多轮对话:数据/SQL 助手。

知道用户选中表的 schema，可在对话里生成 SQL（DuckDB 方言、只读优先、放 ```sql 代码块）、
解释、答疑。复用 LLMService，非流式。
"""

from __future__ import annotations

from typing import Any, Dict, List

_ALLOWED_ROLES = ("user", "assistant")


def chat(
    llm,
    messages: List[Dict[str, str]],
    schema_text: str = "",
    locale: str = "zh",
) -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    system = (
        "You are a data & SQL assistant embedded in a federated SQL query tool "
        "(DuckDB with ATTACH to MySQL/PostgreSQL). Help the user understand their "
        "data and write queries. When you provide SQL, use DuckDB dialect, prefer "
        "read-only SELECT, and put it inside a ```sql fenced code block. Be concise "
        f"and accurate. Respond in {lang}.\n\n"
        f"Available tables (schema):\n{schema_text or '(none provided)'}"
    )
    # 只保留合法的 user/assistant 非空消息，丢掉前端可能混入的其它字段
    history = [
        {"role": m.get("role"), "content": (m.get("content") or "").strip()}
        for m in (messages or [])
        if m.get("role") in _ALLOWED_ROLES and (m.get("content") or "").strip()
    ]
    raw = llm.complete(
        "chat",
        [{"role": "system", "content": system}, *history],
    )
    return {"content": (raw or "").strip()}
