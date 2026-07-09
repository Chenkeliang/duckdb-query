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
    # 方言规则单独成段并放在最前:模型看到 MySQL/SQLite 表段容易漂移到源库方言
    # (反引号、DATE_FORMAT 等),但本工具所有 SQL 都在 DuckDB 上执行
    system = (
        "You are a data & SQL assistant embedded in a federated SQL query tool "
        "(DuckDB with ATTACH to MySQL/PostgreSQL/SQLite/DuckDB). Help the user "
        "understand their data and write queries.\n"
        "Dialect rule (critical): every query in this tool executes on DuckDB — "
        "including tables that come from an attached MySQL/PostgreSQL/SQLite "
        "database. Always write DuckDB dialect: double-quote identifiers (never "
        "backticks), use DuckDB functions and syntax only, and avoid "
        "source-engine-specific functions. Only produce another dialect if the "
        "user explicitly asks for SQL to run outside this tool, and note that it "
        "will not run here.\n"
        "When you provide SQL, prefer read-only SELECT and put it inside a ```sql "
        "fenced code block. Be concise and accurate. External tables listed under "
        "the catalog's 'External database <alias>' sections must be referenced as "
        "alias.table; if the user asks about a table that does not appear anywhere "
        f"below, say honestly that it cannot be found instead of guessing. Respond in {lang}.\n\n"
        f"{schema_text or '(none provided)'}"
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
