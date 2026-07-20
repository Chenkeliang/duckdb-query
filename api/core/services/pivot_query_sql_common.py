"""Shared DuckDB SQL helpers for pivot query generation."""

from typing import Dict, List, Optional, Union

from models.pivot_query_models import FilterConfig, PivotQueryConfig


def _apply_column_cast_sql(
    column_sql: str, raw_column: Optional[str], casts_map: Optional[Dict[str, str]]
) -> str:
    if not column_sql or not raw_column:
        return column_sql
    cast_target = _resolve_cast_expression(raw_column, casts_map)
    if cast_target:
        # casts_map 值原样拼进 SQL——渲染前统一过规范类型白名单
        # (纵深防御:无论上游模型层是否已校验)
        from core.common.duckdb_types import validate_cast_type

        return f"TRY_CAST({column_sql} AS {validate_cast_type(cast_target)})"
    return column_sql


def _strip_trailing_semicolon(sql: str) -> str:
    return sql.rstrip().rstrip(";")


# 标识符转义统一走 core.common.sql_identifiers(消灭历史 8 份副本)
from core.common.sql_identifiers import quote_identifier as _quote_identifier  # noqa: E402


def _build_from_clause(config: PivotQueryConfig) -> str:
    table_ref = (config.table_name or "").strip()
    if not table_ref:
        raise ValueError("table_name is required")
    if "." not in table_ref:
        bare_table = table_ref.strip('"')
        return f"FROM {_quote_identifier(bare_table)}"
    from core.database.federated_attach import format_qualified_table_reference

    return f"FROM {format_qualified_table_reference(table_ref)}"


def _deduplicate_preserve_order(items: List[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def _format_literal(value: Optional[Union[str, int, float]]) -> str:
    """Format literal value for SQL."""
    if value is None:
        return "NULL"

    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"

    if isinstance(value, (int, float)):
        if isinstance(value, float) and value == float("inf"):
            raise ValueError("Float value cannot be infinity")
        return str(value)

    text = str(value).replace("'", "''")
    return f"'{text}'"


def _resolve_cast_expression(
    column: str, casts_map: Optional[Dict[str, str]]
) -> Optional[str]:
    if not casts_map or not column:
        return None
    key = column.lower()
    if key in casts_map:
        return casts_map[key]
    if "." in key:
        last = key.split(".")[-1]
        if last in casts_map:
            return casts_map[last]
    return casts_map.get(column)


def _build_where_clause(
    filters: List[FilterConfig], casts_map: Optional[Dict[str, str]] = None
) -> str:
    """Build WHERE clause from filters"""
    if not filters:
        return ""

    filter_conditions = []

    for i, filter_config in enumerate(filters):
        condition = _build_filter_condition(filter_config, casts_map)

        if i == 0:
            filter_conditions.append(condition)
        else:
            logic_op = filter_config.logic_operator.value
            filter_conditions.append(f"{logic_op} {condition}")

    return f"WHERE {' '.join(filter_conditions)}"


def _build_filter_condition(
    filter_config: FilterConfig, casts_map: Optional[Dict[str, str]] = None
) -> str:
    """Build a pivot filter condition (column vs constant)."""
    raw_column = filter_config.column
    # 过滤列名一律走 quote_identifier 严格转义(双引号加倍 + 始终引号)。旧 _format_identifier
    # 对含空格/括号/运算符的值原样直通(为"表达式"设计),被恶意 column 如 `1=1) -- ` 利用
    # 注入 WHERE 子句(Codex 对抗复审 critical)。过滤列本就该是纯标识符,不接受表达式。
    column = _quote_identifier(raw_column)
    column_expr = _apply_column_cast_sql(column, raw_column, casts_map)
    operator = filter_config.operator.value
    value = filter_config.value

    if operator in ("IS NULL", "IS NOT NULL"):
        return f"{column_expr} {operator}"

    if operator == "BETWEEN":
        return (
            f"{column_expr} BETWEEN {_format_literal(value)} "
            f"AND {_format_literal(filter_config.value2)}"
        )

    if operator in ("LIKE", "ILIKE"):
        pattern = str(value)
        if not pattern.startswith("%") and not pattern.endswith("%"):
            pattern = f"%{pattern}%"
        escaped = pattern.replace("'", "''")
        return f"{column_expr} {operator} '{escaped}'"

    return f"{column_expr} {operator} {_format_literal(value)}"
