"""LLM 报错医生：解释失败 SQL 并给出只读修正，带 SELECT-only 安全闸。"""

from __future__ import annotations

import json
import re
from typing import Any, Dict

import duckdb


def _is_select_only(sql: str) -> bool:
    """用 DuckDB 解析器判定 sql 是否全部为 SELECT（零新依赖，复用导出端点同款手法）。"""
    if not sql or not sql.strip():
        return False
    parser = duckdb.connect()
    try:
        statements = parser.extract_statements(sql)
    except Exception:
        return False
    finally:
        parser.close()
    return bool(statements) and all(
        s.type == duckdb.StatementType.SELECT for s in statements
    )


def _extract_json(text: str) -> Dict[str, Any]:
    """从模型回复里抽 JSON（容忍 ```json 围栏与前后噪声）。"""
    if not text:
        return {}
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    candidate = fenced.group(1) if fenced else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end == -1 or end < start:
        return {}
    try:
        return json.loads(candidate[start : end + 1])
    except Exception:
        return {}


def explain_and_fix(
    llm, failed_sql: str, error: str, schema_text: str, locale: str = "zh"
) -> Dict[str, Any]:
    lang = "中文" if locale == "zh" else "English"
    system = (
        "You are a DuckDB SQL expert. The user's SELECT query failed. "
        "Explain the error briefly and return a corrected, READ-ONLY SELECT query. "
        "Never produce INSERT/UPDATE/DELETE/DROP/CREATE/ALTER/COPY/ATTACH. "
        f"Respond in {lang}. Reply with strict JSON only: "
        '{"explanation": "<short>", "fixed_sql": "<corrected SQL or empty if impossible>"}'
    )
    user = f"Failed SQL:\n{failed_sql}\n\nError:\n{error}\n\nSchema:\n{schema_text or '(none)'}"
    raw = llm.complete("error_doctor", [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ])

    parsed = _extract_json(raw)
    explanation = str(parsed.get("explanation") or "").strip()
    fixed = str(parsed.get("fixed_sql") or "").strip()
    if not explanation:
        explanation = raw.strip()[:500] if isinstance(raw, str) else ""

    if fixed and _is_select_only(fixed):
        return {"explanation": explanation, "fixed_sql": fixed, "safe": True}
    return {"explanation": explanation, "fixed_sql": None, "safe": False}
