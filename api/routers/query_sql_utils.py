"""Shared SQL helpers for join-query and pivot-query routers."""

from __future__ import annotations

import logging
import re

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)
_sqlglot_logger = logging.getLogger("sqlglot")


def remove_auto_added_limit(sql: str) -> str:
    """Remove system-added LIMIT (equals max_query_rows), keep user LIMIT."""
    from core.common.config_manager import config_manager

    try:
        max_rows = config_manager.get_app_config().max_query_rows
    except Exception:
        max_rows = 10000

    sql_cleaned = sql.rstrip("; \t\n\r")
    limit_pattern = rf"\s+LIMIT\s+{max_rows}$"

    if re.search(limit_pattern, sql_cleaned, re.IGNORECASE):
        sql_cleaned = re.sub(limit_pattern, "", sql_cleaned, flags=re.IGNORECASE)
        logger.info("Removed system-added LIMIT %s, restored user original SQL", max_rows)
    else:
        logger.info("Keeping user original SQL LIMIT clause")

    return sql_cleaned.strip()


def get_join_type_sql(join_type: str) -> str:
    """Convert frontend join type to SQL JOIN syntax."""
    join_type = join_type.lower()
    if join_type == "inner":
        return "INNER JOIN"
    if join_type == "left":
        return "LEFT JOIN"
    if join_type == "right":
        return "RIGHT JOIN"
    if join_type in ("outer", "full_outer"):
        return "FULL OUTER JOIN"
    if join_type == "cross":
        return "CROSS JOIN"
    return "INNER JOIN"


# 解析后顶层落在这些 AST 类型上,才认为"能在末尾追加 LIMIT"。
# 白名单而非黑名单:sqlglot 认不出的 DuckDB 专有语句(RESET/LOAD/EXPLAIN/CALL/
# VACUUM 等)会退化成 Command 节点或直接解析失败,天然落在"未列出"里——不必像
# 过去那样每出现一种新语句就先在生产环境炸一次语法错误才能补上黑名单条目。
_LIMIT_ACCEPTING_TYPES = (
    exp.Select, exp.Union, exp.Except, exp.Intersect, exp.Values, exp.Pivot, exp.Subquery,
)
# sqlglot 不认识 DuckDB `TABLE t` 简写(会误解析成对字面量 "TABLE" 取别名的表达式),
# 只能单独识别这一种写法,避免相对旧黑名单实现的行为回归
_BARE_TABLE_RE = re.compile(r"^TABLE\s+\S+\s*;?\s*$", re.IGNORECASE)


def statement_accepts_limit(query: str) -> bool:
    """该语句能否在末尾追加 LIMIT(SELECT/WITH/VALUES/PIVOT/UNPIVOT/集合运算等可以;
    DDL/扩展管理/PRAGMA 等不行)。

    用 AST 分类判定,未识别的语句一律判定为"不接受"——宁可不补 LIMIT,也不对
    看不懂的语句盲目追加可能引发语法错误的后缀。
    """
    stripped = query.strip()
    if _BARE_TABLE_RE.match(stripped):
        return True
    prev_level = _sqlglot_logger.level
    _sqlglot_logger.setLevel(logging.ERROR)  # 抑制"退化成 Command"告警刷屏,这里只取分类结果
    try:
        tree = sqlglot.parse_one(stripped, read="duckdb")
    except Exception:
        return False
    finally:
        _sqlglot_logger.setLevel(prev_level)
    return isinstance(tree, _LIMIT_ACCEPTING_TYPES)


def ensure_query_has_limit(query: str, default_limit: int = 1000) -> str:
    """Append LIMIT when missing (skip DDL/DESCRIBE/SHOW etc.)."""
    query_stripped = query.strip()

    if not statement_accepts_limit(query_stripped):
        return query

    if not re.search(r"\sLIMIT\s+\d+\s*($|;)", query, re.IGNORECASE):
        if query_stripped.endswith(";"):
            return f"{query_stripped[:-1]} LIMIT {default_limit};"
        return f"{query_stripped} LIMIT {default_limit}"
    return query
