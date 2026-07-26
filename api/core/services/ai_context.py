"""Agent Profile 的确定性上下文构建原语(不调 LLM)。

从 routers/ai.py 抽出 build_schema_text,并提供紧凑目录构建。各 Profile 的
ContextBuilder 只组合这里的纯函数,构建自己需要的最小上下文——explain/suggest
不得在这里构建完整目录或发送无关数据。
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional

from core.database.duckdb_engine import with_duckdb_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    detach_databases_on_connection,
    format_qualified_table_reference,
    resolve_attach_configs,
)
from core.services import schema_sampler, table_registry

logger = logging.getLogger(__name__)

_MAX_DETAIL_TABLES = 10
_CATALOG_CAP = 30


def _sampled_block(con: Any, cand: str, ref: str, rows: list, budget: int) -> str:
    """本地未限定表才采样(联邦/限定名带 ".");返回样例块或空串。"""
    if "." in cand or budget <= 0:
        return ""
    return schema_sampler.sample_table_block(
        con, ref, [(r[0], r[1]) for r in rows],
        max_chars=min(schema_sampler.PER_TABLE_CHAR_BUDGET, budget),
    )


def build_schema_text(
    tables: List[str],
    attach_databases: Optional[list] = None,
    *,
    with_samples: bool = True,
) -> str:
    """选中表的结构文本(+ 本地表有界样例)。联邦表先 ATTACH 再 DESCRIBE。

    with_samples=False 时只出结构不采样(explain 等不需要值样例的场景)。
    """
    if not tables:
        return ""
    if len(tables) > _MAX_DETAIL_TABLES:
        logger.info(
            "schema text truncated to first %d of %d tables", _MAX_DETAIL_TABLES, len(tables)
        )
    attach_configs = resolve_attach_configs(attach_databases)
    lines: list[str] = []
    sample_budget = schema_sampler.OVERALL_CHAR_BUDGET if with_samples else 0
    sampled_any = False
    with with_duckdb_connection() as con:
        attached: list[str] = []
        try:
            if attach_configs:
                attached = attach_databases_on_connection(con, attach_configs)
            for name in tables[:_MAX_DETAIL_TABLES]:
                candidates = [name]
                if "." not in name and attached:
                    candidates += [f"{alias}.{name}" for alias in attached]
                for cand in candidates:
                    try:
                        ref = format_qualified_table_reference(cand)
                        rows = con.execute(f"DESCRIBE {ref}").fetchall()
                        cols = ", ".join(f"{r[0]} {r[1]}" for r in rows)
                        lines.append(f"{name}({cols})")
                        block = _sampled_block(con, cand, ref, rows, sample_budget)
                        if block:
                            lines.append(block)
                            sample_budget -= len(block)
                            sampled_any = True
                        break
                    except Exception:  # noqa: BLE001
                        continue
        finally:
            if attached:
                detach_databases_on_connection(con, attached)
    text = "\n".join(lines)
    if sampled_any:
        text = schema_sampler.SAMPLE_DISCLAIMER + "\n" + text
    return text


def build_catalog_text(
    authorized_aliases: Optional[List[str]] = None,
    local_tables: Optional[List[str]] = None,
) -> str:
    """紧凑目录:本地表(登记表序,最新在前)名字/行数/创建时间 + 授权别名。

    只给名字级信息(渐进披露),列结构由 inspect_table 按需取。

    local_tables 为用户选定的本地范围:None = 不限制(列全部);给了集合就只列这些
    (空集 = 本地不在范围内,一张不列)。目录必须与 run_query 的闸同源——否则模型
    看得见却查不动,只会白白撞墙再解释。
    """
    with with_duckdb_connection() as con:
        rows = con.execute(
            """
            SELECT table_name, estimated_size FROM duckdb_tables()
            WHERE NOT internal AND database_name = current_database()
              AND schema_name = 'main'
            """
        ).fetchall()
    names = [r[0] for r in rows if not r[0].lower().startswith("system_")]
    if local_tables is not None:
        picked = {str(t).lower() for t in local_tables}
        names = [n for n in names if n.lower() in picked]
    sizes = {r[0]: int(r[1] or 0) for r in rows}
    registry = table_registry.sync(names)
    names.sort(key=lambda n: (registry.get(n) or {}).get("sort_seq") or 0, reverse=True)
    shown = names[:_CATALOG_CAP]
    lines = []
    for n in shown:
        created = (registry.get(n) or {}).get("created_at")
        created_s = f", created {str(created)[:16]}" if created else ""
        lines.append(f"- {n} (~{sizes.get(n, 0)} rows{created_s})")
    if authorized_aliases:
        lines.append(
            "Attached aliases (query as alias.table): " + ", ".join(authorized_aliases)
        )
    if len(names) > len(shown):
        lines.append(f"…and {len(names) - len(shown)} more.")
    return "\n".join(lines) if lines else "(no local tables)"
