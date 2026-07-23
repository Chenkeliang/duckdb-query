"""LLM 把自然语言翻成 DuckDB SELECT,带 SELECT-only 安全闸与一次自修复。

复用报错医生的 _is_select_only(DuckDB 解析器,零新依赖)与 _extract_json(DRY)。
调用方可注入 validator(routers 层用 EXPLAIN 干跑):生成 → 校验 → 失败把报错
喂回报错医生修一轮 → 修复结果仍需过校验,否则回退原 SQL(维持旧行为,
前端永不自动执行生成的 SQL,回退无额外风险)。
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Optional, Tuple

from core.services.ai_error_doctor import _extract_json, _is_select_only, explain_and_fix

logger = logging.getLogger(__name__)


def _generate(llm, question: str, context: str, locale: str) -> Dict[str, Any]:
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


def nl_to_sql(
    llm,
    question: str,
    context: str,
    locale: str = "zh",
    *,
    validator: Optional[Callable[[str], Tuple[bool, str]]] = None,
    schema_text: str = "",
) -> Dict[str, Any]:
    """生成 SQL;带 validator 时先干跑校验,失败经报错医生自修复一轮。

    修复链路上的任何故障(校验器异常/修复调用失败/修复结果仍不合法)都
    回退到首轮生成结果,绝不把一次可用的生成变成 5xx。
    """
    result = _generate(llm, question, context, locale)
    if not validator or not result["safe"]:
        return result
    try:
        ok, err = validator(result["sql"])
    except Exception as exc:  # noqa: BLE001  校验器故障不应吞掉可用结果
        logger.warning("nl_to_sql validator raised, skipping repair: %s", exc)
        return result
    if ok:
        return result
    logger.info("nl_to_sql validation failed, trying one repair round: %s", err)
    try:
        repair = explain_and_fix(llm, result["sql"], err, schema_text or context, locale)
    except Exception as exc:  # noqa: BLE001  修复失败绝不把请求变 5xx
        logger.warning("nl_to_sql repair round failed: %s", exc)
        return result
    fixed = repair.get("fixed_sql")
    if fixed and repair.get("safe"):
        try:
            fixed_ok, _ = validator(fixed)
        except Exception as exc:  # noqa: BLE001
            logger.warning("nl_to_sql validator raised on repaired SQL: %s", exc)
            return result
        if fixed_ok:
            return {"sql": fixed, "used_tables": result["used_tables"], "safe": True}
    return result
