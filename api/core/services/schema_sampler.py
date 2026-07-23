"""AI 上下文的数据样例采集:只用 LIMIT 有界查询,亿级大表也安全。

给本地 DuckDB 表生成 ≤3 行样本 + 低基数文本列的取值枚举,拼进 AI schema
文本,让模型知道数据长什么样(解决 WHERE 条件值靠猜的问题)。联邦表
(alias.table)由调用方排除,数据值不外发远端库内容之外的采样。
采样是锦上添花:任何失败只降级为无样本,绝不让上下文构建本身失败。
"""

from __future__ import annotations

import logging
from typing import Any, List, Sequence, Tuple

from core.common.duckdb_types import normalize_duckdb_type
from core.common.sql_identifiers import quote_identifier

logger = logging.getLogger(__name__)

SAMPLE_ROW_LIMIT = 3
DISTINCT_SCAN_LIMIT = 1000  # 取值枚举只看前 1000 行,扫描严格有界
DISTINCT_VALUE_LIMIT = 8  # 采样内基数超过 8 视为高基数列,不枚举
MAX_CELL_CHARS = 60
MAX_SAMPLE_COLUMNS = 20  # 宽表只预览前 20 列
MAX_DISTINCT_COLUMNS = 8  # 每表最多探测 8 个候选列,限制查询数
PER_TABLE_CHAR_BUDGET = 800
OVERALL_CHAR_BUDGET = 4000
SAMPLE_DISCLAIMER = (
    "(sample rows / value lists below are small previews drawn from the data, "
    "not exhaustive)"
)

# 只有这些规范类型才做取值枚举:文本/布尔列的取值才对 WHERE 条件有指导意义
_DISTINCT_ELIGIBLE_TYPES = frozenset({"VARCHAR", "BOOLEAN"})


def _render_cell(value: Any) -> str:
    """单元格 → 提示词里的紧凑表示:NULL 字面量、字符串加引号、超长截断。"""
    if value is None:
        return "NULL"
    text = str(value).replace("\n", " ").replace("\r", " ")
    if len(text) > MAX_CELL_CHARS:
        text = text[:MAX_CELL_CHARS] + "…"
    return f"'{text}'" if isinstance(value, str) else text


def _distinct_value_lines(
    con: Any, qualified_ref: str, columns: Sequence[Tuple[str, str]]
) -> List[str]:
    """低基数文本列的取值枚举行;单列失败跳过,不影响其它列。"""
    lines: List[str] = []
    probed = 0
    for name, type_str in columns:
        if probed >= MAX_DISTINCT_COLUMNS:
            break
        if normalize_duckdb_type(type_str) not in _DISTINCT_ELIGIBLE_TYPES:
            continue
        probed += 1
        qc = quote_identifier(name)
        try:
            vals = con.execute(
                f"SELECT DISTINCT {qc} FROM (SELECT {qc} FROM {qualified_ref} "
                f"LIMIT {DISTINCT_SCAN_LIMIT}) AS _s WHERE {qc} IS NOT NULL "
                f"LIMIT {DISTINCT_VALUE_LIMIT + 1}"
            ).fetchall()
        except Exception as exc:  # noqa: BLE001  单列探测失败不致命
            logger.debug("distinct probe failed for %s.%s: %s", qualified_ref, name, exc)
            continue
        if not vals or len(vals) > DISTINCT_VALUE_LIMIT:
            continue  # 全 NULL,或采样内基数过高
        rendered = ", ".join(_render_cell(v[0]) for v in vals)
        lines.append(f"  {name} values: {rendered}")
    return lines


def sample_table_block(
    con: Any,
    qualified_ref: str,
    columns: Sequence[Tuple[str, str]],
    max_chars: int = PER_TABLE_CHAR_BUDGET,
) -> str:
    """给一张本地表生成样例文本块(已缩进两格),失败返回空串。

    qualified_ref 必须已由调用方经 format_qualified_table_reference 转义;
    columns 为 DESCRIBE 结果的 (列名, 类型) 序列。
    """
    if max_chars <= 0 or not columns:
        return ""
    try:
        shown = list(columns)[:MAX_SAMPLE_COLUMNS]
        col_refs = ", ".join(quote_identifier(name) for name, _ in shown)
        rows = con.execute(
            f"SELECT {col_refs} FROM {qualified_ref} LIMIT {SAMPLE_ROW_LIMIT}"
        ).fetchall()
        if not rows:
            return "  (no rows)"
        extra = len(columns) - len(shown)
        suffix = f" [+{extra} more columns]" if extra > 0 else ""
        rendered = ", ".join(
            "(" + ", ".join(_render_cell(v) for v in row) + ")" for row in rows
        )
        lines = [f"  sample rows: {rendered}{suffix}"]
        lines.extend(_distinct_value_lines(con, qualified_ref, shown))
        text = "\n".join(lines)
        if len(text) > max_chars:
            text = text[:max_chars] + "…(truncated)"
        return text
    except Exception as exc:  # noqa: BLE001  采样绝不让 schema 文本构建失败
        logger.debug("sampling failed for %s: %s", qualified_ref, exc)
        return ""
