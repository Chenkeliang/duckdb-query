"""Shared DuckDB SQL helpers for pivot visual-query generation."""

import re
from typing import Dict, List, Optional, Union


from models.visual_query_models import (
    FilterConfig,
    FilterOperator,
    FilterValueType,
    VisualQueryConfig,
)


_IDENTIFIER_PATTERN = re.compile(r'"([^"]+)"|([\w\.\u4E00-\u9FFF]+)')
_SQL_RESERVED_IDENTIFIERS = {
    'AND',
    'OR',
    'NOT',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'END',
    'NULL',
    'TRUE',
    'FALSE',
    'TRY_CAST',
    'CAST',
    'DATE',
    'TIME',
    'TIMESTAMP',
    'COALESCE',
    'IF',
    'IFNULL',
    'IN',
    'EXISTS',
    'BETWEEN',
    'LIKE',
    'ILIKE',
    'SIMILAR',
    'AS',
    'IS',
    'SUM',
    'AVG',
    'COUNT',
    'MIN',
    'MAX',
    'MEDIAN',
    'MODE',
    'ROUND',
    'ABS',
    'UPPER',
    'LOWER',
    'LEFT',
    'RIGHT',
    'SUBSTRING',
    'TRIM',
    'LENGTH',
    'POWER',
    'LOG',
    'EXP',
    'RANK',
    'DENSE_RANK',
    'ROW_NUMBER',
    'OVER',
    'PARTITION',
}


def _apply_casts_to_expression_text(
    expression: str, casts_map: Optional[Dict[str, str]]
) -> str:
    if not expression or not casts_map:
        return expression

    def _replace(match: re.Match) -> str:
        identifier = match.group(1) or match.group(2)
        if not identifier:
            return match.group(0)
        upper = identifier.upper()
        if upper in _SQL_RESERVED_IDENTIFIERS:
            return match.group(0)
        candidates = [identifier.lower()]
        if '.' in identifier:
            candidates.append(identifier.split('.')[-1].lower())
        for candidate in candidates:
            cast = casts_map.get(candidate)
            if cast:
                prefix_window = expression[max(0, match.start() - 20) : match.start()]
                if re.search(r"TRY_CAST\s*\([^)]*$", prefix_window, re.IGNORECASE):
                    return match.group(0)
                token = f'"{identifier}"' if match.group(1) else identifier
                return f"TRY_CAST({token} AS {cast})"
        return match.group(0)

    return _IDENTIFIER_PATTERN.sub(_replace, expression)


def _apply_column_cast_sql(
    column_sql: str, raw_column: Optional[str], casts_map: Optional[Dict[str, str]]
) -> str:
    if not column_sql or not raw_column:
        return column_sql
    cast_target = _resolve_cast_expression(raw_column, casts_map)
    if cast_target:
        return f"TRY_CAST({column_sql} AS {cast_target})"
    return column_sql


def _strip_trailing_semicolon(sql: str) -> str:
    return sql.rstrip().rstrip(";")


def _quote_identifier(identifier: str) -> str:
    safe = identifier.replace('"', '""')
    return f'"{safe}"'

def _build_from_clause(config: VisualQueryConfig) -> str:

    from core.database.federated_attach import format_qualified_table_reference


    table_ref = format_qualified_table_reference(config.table_name)

    return f"FROM {table_ref}"


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

    # Escape single quotes
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


def _build_having_clause(
    filters: List[FilterConfig], casts_map: Optional[Dict[str, str]] = None
) -> str:
    """Build HAVING clause from filters"""
    if not filters:
        return ""

    filter_conditions: List[str] = []

    for index, filter_config in enumerate(filters):
        condition = _build_filter_condition(filter_config, casts_map)
        if index == 0:
            filter_conditions.append(condition)
        else:
            logic_op = filter_config.logic_operator.value
            filter_conditions.append(f"{logic_op} {condition}")

    return f"HAVING {' '.join(filter_conditions)}"


def _format_identifier(identifier: str) -> str:
    """Format column/alias/expression for SQL."""
    if not identifier:
        return ""

    identifier = identifier.strip()
    # Treat expressions (contains parentheses or spaces or dot-qualified) as raw
    if any(
        token in identifier
        for token in ("(", ")", " ", "+", "-", "*", "/", "%")
    ):
        return identifier

    # Already quoted
    if identifier.startswith('"') and identifier.endswith('"') and len(identifier) > 1:
        return identifier

    return f'"{identifier}"'


def _wrap_expression(expr: str) -> str:
    """Ensure expression is safely wrapped in parentheses when needed."""
    if not expr:
        return ""
    trimmed = expr.strip()
    if trimmed.lower().startswith("case"):
        return trimmed
    if trimmed.startswith("(") and trimmed.endswith(")"):
        return trimmed
    return f"({trimmed})"


def _apply_cast(expression: str, cast: Optional[str]) -> str:
    if not cast or not cast.strip():
        return expression
    cleaned = cast.strip()
    return f"TRY_CAST({expression} AS {cleaned})"


def _build_filter_condition(
    filter_config: FilterConfig, casts_map: Optional[Dict[str, str]] = None
) -> str:
    """Build individual filter condition"""
    raw_column = getattr(filter_config, "column", None)
    column = _format_identifier(raw_column) if raw_column else ""
    column_expr = (
        _apply_column_cast_sql(column, raw_column, casts_map) if column else ""
    )
    operator = filter_config.operator.value
    value_type = getattr(filter_config, "value_type", FilterValueType.CONSTANT)
    value = filter_config.value
    cast_target = getattr(filter_config, "cast", None)

    if value_type != FilterValueType.EXPRESSION and not column:
        raise ValueError("Column name cannot be empty for non-expression filters")

    if value_type != FilterValueType.EXPRESSION and operator in ["IS NULL", "IS NOT NULL"]:
        return f"{column_expr} {operator}"

    elif value_type != FilterValueType.EXPRESSION and operator == "BETWEEN":
        value2 = filter_config.value2
        return f"{column_expr} BETWEEN {_format_literal(value)} AND {_format_literal(value2)}"

    elif value_type != FilterValueType.EXPRESSION and operator in ["LIKE", "ILIKE"]:
        # Handle pattern matching
        if not str(value).startswith("%") and not str(value).endswith("%"):
            value = f"%{value}%"
        return f"{column_expr} {operator} '{value}'"

    else:
        # Handle comparison based on value type
        if value_type == FilterValueType.COLUMN:
            right_column = getattr(filter_config, "right_column", None)
            if not right_column:
                raise ValueError("Column-to-column comparison requires right_column parameter")
            right = _format_identifier(right_column)
            right_expr = _apply_column_cast_sql(right, right_column, casts_map)
            return f"{column_expr} {operator} {right_expr}"
        elif value_type == FilterValueType.EXPRESSION:
            expression = getattr(filter_config, "expression", None)
            if not expression:
                raise ValueError("Expression comparison requires expression parameter")
            expr_with_casts = _apply_casts_to_expression_text(expression, casts_map)
            expr = _wrap_expression(expr_with_casts)
            expr = _apply_cast(expr, cast_target)
            if column_expr:
                return f"{column_expr} {operator} {expr}"
            return expr
        else:
            # Standard comparison operators with constant values
            literal = _format_literal(value)
            return f"{column_expr} {operator} {literal}"
