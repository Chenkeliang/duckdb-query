"""
Visual Query Generator

SQL generation logic for visual query configurations.
Supports DuckDB syntax and comprehensive validation.
"""

import logging
import re
from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass
import duckdb

from models.visual_query_models import (
    VisualQueryConfig,
    AggregationConfig,
    FilterConfig,
    SortConfig,
    AggregationFunction,
    FilterOperator,
    LogicOperator,
    SortDirection,
    FilterValueType,
    ColumnStatistics,
    TableMetadata,
    SetOperationConfig,
    SetOperationType,
    TableConfig,
    ColumnMapping,
    VisualQueryMode,
    PivotConfig,
    PivotValueAxis,
    PivotValueConfig,
    JSONTableConfig,
    JSONTableColumnConfig,
)
from core.table_metadata_cache import table_metadata_cache

try:  # pragma: no cover - optional during tests
    from core.config_manager import config_manager  # type: ignore
except Exception:  # pragma: no cover - fallback when config manager unavailable
    config_manager = None

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of query configuration validation"""

    is_valid: bool
    errors: List[str]
    warnings: List[str]
    complexity_score: int = 0


@dataclass
class PerformanceEstimate:
    """Performance estimation for a query"""

    estimated_rows: int
    estimated_time: float
    complexity_score: int
    warnings: List[str]


@dataclass
class GeneratedVisualQuery:
    """Result structure for generated visual analysis SQL."""

    mode: VisualQueryMode
    base_sql: str
    final_sql: str
    pivot_sql: Optional[str]
    warnings: List[str]
    metadata: Dict[str, Any]


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


def generate_sql_from_config(
    config: VisualQueryConfig, resolved_casts: Optional[Dict[str, str]] = None
) -> str:
    """
    Generate SQL query from visual query configuration

    Args:
        config: Visual query configuration

    Returns:
        Generated SQL string with DuckDB syntax
    """
    try:
        # Build SELECT clause
        select_clause = _build_select_clause(config, resolved_casts)

        # Build FROM clause
        from_clause = _build_from_clause(config)

        # Build WHERE clause
        where_clause = _build_where_clause(config.filters, resolved_casts)

        # Build GROUP BY clause
        group_by_clause = _build_group_by_clause(config)

        # Build HAVING clause
        having_clause = _build_having_clause(config.having, resolved_casts)

        # Build ORDER BY clause
        order_by_clause = _build_order_by_clause(config.order_by)

        # Build LIMIT clause
        limit_clause = _build_limit_clause(config.limit)

        # Combine all clauses
        sql_parts = [select_clause, from_clause]

        if where_clause:
            sql_parts.append(where_clause)

        if group_by_clause:
            sql_parts.append(group_by_clause)

        if having_clause:
            sql_parts.append(having_clause)

        if order_by_clause:
            sql_parts.append(order_by_clause)

        if limit_clause:
            sql_parts.append(limit_clause)

        sql = " ".join(sql_parts)

        logger.info(f"Generated SQL: {sql}")
        return sql

    except Exception as e:
        logger.error(f"SQL generation failed: {str(e)}")
        raise ValueError(f"SQL生成失败: {str(e)}")


def generate_visual_query_sql(
    config: VisualQueryConfig,
    mode: VisualQueryMode = VisualQueryMode.REGULAR,
    pivot_config: Optional[PivotConfig] = None,
    app_config: Optional[Any] = None,
    resolved_casts: Optional[Dict[str, str]] = None,
) -> GeneratedVisualQuery:
    """Generate final SQL for the requested visual analysis mode."""

    warnings: List[str] = []

    if mode == VisualQueryMode.PIVOT:
        if pivot_config is None:
            raise ValueError("Pivot配置不能为空")

        if app_config is None and config_manager is not None:
            try:
                app_config = config_manager.get_app_config()
            except Exception as exc:  # pragma: no cover - fallback
                logger.warning("无法从配置管理器加载AppConfig，使用默认设置: %s", exc)
                app_config = None

        enable_pivot = getattr(app_config, "enable_pivot_tables", True)

        if not enable_pivot:
            raise ValueError("系统配置已禁用透视表功能，请联系管理员启用")

        # 强制使用原生PIVOT策略（因为扩展不可用）
        pivot_config.strategy = "native"

        base_sql = _generate_pivot_base_sql(config, pivot_config, resolved_casts)
        pivot_result = _generate_pivot_transformation_sql(
            base_sql=base_sql,
            pivot_config=pivot_config,
            pivot_extension_name=None,  # 不使用扩展
            casts_map=resolved_casts,
        )

        warnings.extend(pivot_result.get("warnings", []))

        metadata = {
            "mode": mode.value,
            "rows": pivot_config.rows,
            "columns": pivot_config.columns,
            "values": [
                {
                    "column": value.column,
                    "aggregation": value.aggregation.value,
                    "alias": value.alias,
                }
                for value in pivot_config.values
            ],
        }
        metadata.update(pivot_result.get("metadata", {}))

        return GeneratedVisualQuery(
            mode=mode,
            base_sql=base_sql,
            final_sql=pivot_result["final_sql"],
            pivot_sql=pivot_result["pivot_sql"],
            warnings=warnings,
            metadata=metadata,
        )

    # Regular mode fallback
    base_sql = generate_sql_from_config(config, resolved_casts)
    metadata = {"mode": mode.value}
    return GeneratedVisualQuery(
        mode=mode,
        base_sql=base_sql,
        final_sql=base_sql,
        pivot_sql=None,
        warnings=warnings,
        metadata=metadata,
    )


def _strip_trailing_semicolon(sql: str) -> str:
    return sql.rstrip().rstrip(";")


def _quote_identifier(identifier: str) -> str:
    safe = identifier.replace('"', '""')
    return f'"{safe}"'


def _maybe_quote_identifier(identifier: str) -> str:
    trimmed = (identifier or "").strip()
    if not trimmed:
        return trimmed
    if trimmed.startswith('"') and trimmed.endswith('"'):
        return trimmed
    return _quote_identifier(trimmed)


def _format_column_reference(identifier: str) -> str:
    trimmed = (identifier or "").strip()
    if not trimmed:
        raise ValueError("Column reference cannot be empty for JSON_TABLE")

    expression_tokens = (" ", "(", ")", "+", "-", "*", "/", "::")
    if any(token in trimmed for token in expression_tokens):
        return trimmed

    parts = [part for part in trimmed.split(".") if part]
    if not parts:
        return trimmed

    quoted_parts: List[str] = []
    for part in parts:
        stripped = part.strip()
        if not stripped:
            continue
        if stripped.startswith('"') and stripped.endswith('"'):
            quoted_parts.append(stripped)
        else:
            quoted_parts.append(_quote_identifier(stripped))

    return ".".join(quoted_parts) if quoted_parts else trimmed


def _build_json_table_join_clause(
    json_config: JSONTableConfig,
    index: int,
) -> str:
    if not json_config.columns:
        raise ValueError("JSON_TABLE 配置需要至少一个列定义")

    alias = json_config.alias or f"json_table_{index + 1}"
    alias_sql = _quote_identifier(alias)
    source_expr = _format_column_reference(json_config.source_column)
    iterator_alias = f"json_each_{index + 1}"

    root_path = json_config.root_path or "$"

    column_expressions = [
        _build_json_each_projection(column, iterator_alias)
        for column in json_config.columns
    ]
    columns_sql = ",\n        ".join(column_expressions)

    json_source_expr, path_literal = _resolve_json_each_source(source_expr, root_path)
    if path_literal:
        row_source = f"json_each({json_source_expr}, {path_literal}) AS {iterator_alias}"
    else:
        row_source = f"json_each({json_source_expr}) AS {iterator_alias}"
    lateral_subquery = (
        "(\n"
        "    SELECT\n"
        f"        {columns_sql}\n"
        f"    FROM {row_source}\n"
        ")"
    )

    join_keyword = "LEFT JOIN LATERAL" if json_config.outer_join else "JOIN LATERAL"
    return f" {join_keyword} {lateral_subquery} AS {alias_sql} ON TRUE"


def _build_json_each_projection(
    column: JSONTableColumnConfig, iterator_alias: str
) -> str:
    column_name = _quote_identifier(column.name)
    if column.ordinal:
        ordinal_expr = f"COALESCE({iterator_alias}.rowid, 0) + 1"
        return f"{ordinal_expr} AS {column_name}"

    data_type = (column.data_type or "VARCHAR").upper()
    path_literal = _format_literal(column.path or "$")
    value_reference = f"{iterator_alias}.value"
    extractor = (
        "json_extract_string" if _is_textual_json_type(data_type) else "json_extract"
    )
    extraction_expr = f"{extractor}({value_reference}, {path_literal})"

    projected_expr = f"TRY_CAST({extraction_expr} AS {data_type})"

    if column.default is not None:
        default_literal = _format_literal(column.default)
        typed_default = f"TRY_CAST({default_literal} AS {data_type})"
        projected_expr = f"COALESCE({projected_expr}, {typed_default})"

    return f"{projected_expr} AS {column_name}"


def _resolve_json_each_source(
    source_expr: str, root_path: str
) -> tuple[str, Optional[str]]:
    cleaned_path = (root_path or "$").strip() or "$"
    has_wildcard = "*" in cleaned_path or "?" in cleaned_path
    if cleaned_path == "$":
        return source_expr, None
    if has_wildcard:
        extracted = f"json_extract({source_expr}, {_format_literal(cleaned_path)})"
        return f"json({extracted})", None
    return source_expr, _format_literal(cleaned_path)


def _is_textual_json_type(data_type: str) -> bool:
    if not data_type:
        return True
    text_markers = ("CHAR", "TEXT", "STRING", "VARCHAR")
    return any(marker in data_type for marker in text_markers)


def _build_from_clause(config: VisualQueryConfig) -> str:
    clause = f'FROM {_quote_identifier(config.table_name)}'
    for idx, json_cfg in enumerate(getattr(config, "json_tables", []) or []):
        clause += _build_json_table_join_clause(json_cfg, idx)
    return clause


def _deduplicate_preserve_order(items: List[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            ordered.append(item)
    return ordered


def _generate_pivot_base_sql(
    config: VisualQueryConfig,
    pivot_config: PivotConfig,
    casts_map: Optional[Dict[str, str]] = None,
) -> str:
    # 构建必需列：行/列维度 + 指标引用列
    required_columns = (
        pivot_config.rows
        + pivot_config.columns
        + [value.column for value in pivot_config.values]
    )

    ordered_columns = _deduplicate_preserve_order(required_columns)

    if not ordered_columns:
        raise ValueError("Pivot分析至少需要选择一个指标或维度列")

    # 支持计算列：如果 required_columns 中包含与 calculated_fields 同名的列，
    # 则在 SELECT 中使用表达式 AS 别名，而不是裸列名
    calc_map = {}
    try:
        for calc in getattr(config, "calculated_fields", []) or []:
            # 期待字段: name, expression
            name = getattr(calc, "name", None) or getattr(calc, "id", None)
            expr = getattr(calc, "expression", None)
            if name and expr:
                calc_map[str(name)] = str(expr)
    except Exception:
        calc_map = {}

    select_items: List[str] = []
    used_aliases = set()
    for col in ordered_columns:
        if col in calc_map and col not in used_aliases:
            select_items.append(f"{calc_map[col]} AS {_quote_identifier(col)}")
            used_aliases.add(col)
        else:
            select_items.append(_quote_identifier(col))

    # 附加其余计算列（如果用户配置了但不在必需列里），以便后续引用（安全扩展）
    for alias, expr in calc_map.items():
        if alias not in used_aliases and alias not in ordered_columns:
            select_items.append(f"{expr} AS {_quote_identifier(alias)}")
            used_aliases.add(alias)

    select_clause = ", ".join(select_items)

    sql_parts = [
        f"SELECT {select_clause}",
        _build_from_clause(config),
    ]

    where_clause = _build_where_clause(config.filters, casts_map)
    if where_clause:
        sql_parts.append(where_clause)

    return _strip_trailing_semicolon(" ".join(sql_parts))


def _build_pivot_value_expression(
    value: PivotValueConfig, casts_map: Optional[Dict[str, str]] = None
) -> str:
    column_expr = _quote_identifier(value.column)

    cast_target = _resolve_cast_expression(value.column, casts_map)
    if cast_target:
        column_expr = f"TRY_CAST({column_expr} AS {cast_target})"

    # 应用类型转换（如果指定了且不是自动）
    elif (
        hasattr(value, "typeConversion")
        and value.typeConversion
        and value.typeConversion != "auto"
    ):
        column_expr = f"TRY_CAST({column_expr} AS {value.typeConversion.upper()})"

    if value.aggregation == AggregationFunction.COUNT_DISTINCT:
        agg_expr = f"COUNT(DISTINCT {column_expr})"
    else:
        agg_expr = f"{value.aggregation.value}({column_expr})"

    alias = value.alias or f"{value.aggregation.value.lower()}_{value.column}"
    alias_expr = _quote_identifier(alias)

    return f"{agg_expr} AS {alias_expr}"


def _format_extension_list(items: List[str]) -> str:
    if not items:
        return "[]"
    quoted_items = [f"'{item}'" for item in items]
    return f"[{', '.join(quoted_items)}]"


def _format_literal(value: Optional[Union[str, int, float]]) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    escaped = str(value).replace("'", "''")
    return f"'{escaped}'"


def _generate_pivot_transformation_sql(
    base_sql: str,
    pivot_config: PivotConfig,
    pivot_extension_name: str = None,  # 不再使用扩展
    casts_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    value_expressions = [
        _build_pivot_value_expression(v, casts_map) for v in pivot_config.values
    ]
    row_dimensions = [_quote_identifier(dim) for dim in pivot_config.rows]
    column_dimensions = [_quote_identifier(dim) for dim in pivot_config.columns]
    manual_values = list(
        getattr(pivot_config, "manual_column_values", []) or []
    )

    base_alias = "base"
    # 强制使用原生PIVOT策略
    strategy = "native"

    def _autosample_native_in_values(max_values: Optional[int]) -> Optional[List[str]]:
        """Auto-sample distinct values for the single column dimension to enable native PIVOT.
        Returns a list of string literals (unescaped) or None when not applicable.
        """
        if not pivot_config.columns or len(pivot_config.columns) != 1:
            return None
        if not max_values or max_values <= 0:
            return None
        try:
            from core.duckdb_engine import get_db_connection  # type: ignore

            target_col = pivot_config.columns[0]
            con = get_db_connection()
            # Use a CTE to reference the same base SQL; avoid trailing semicolon
            introspect_sql = (
                f"WITH base AS (\n{_strip_trailing_semicolon(base_sql)}\n)\n"
                f"SELECT DISTINCT {_quote_identifier(target_col)} AS v\n"
                f"FROM base\n"
                f"WHERE {_quote_identifier(target_col)} IS NOT NULL\n"
                f"LIMIT {int(max_values)}"
            )
            df = con.execute(introspect_sql).fetchdf()
            values: List[str] = []
            if df is not None and not df.empty:
                for raw in df["v"].tolist():
                    # Preserve original values as string form; _format_literal will escape
                    values.append(str(raw))
            return values or None
        except Exception as _:
            return None

    # 只使用原生PIVOT策略
    native_candidate = _try_generate_native_pivot(base_sql, pivot_config)
    if native_candidate is not None:
        native_candidate["metadata"].update(
            {"uses_pivot_extension": False, "strategy": "native"}
        )
        # 当需要小计/总计时，构建额外结果集
        if pivot_config.include_subtotals or pivot_config.include_grand_totals:
            native_candidate = _inject_pivot_totals(
                native_candidate,
                row_dimensions,
                pivot_config.values,
                manual_values,
                include_subtotals=pivot_config.include_subtotals,
                include_grand_totals=pivot_config.include_grand_totals,
            )
        return native_candidate

    # 如果原生PIVOT失败，尝试自动采样
    sample_cap = getattr(pivot_config, "column_value_limit", None)
    if sample_cap is None:
        sample_cap = 12
    if sample_cap and sample_cap > 0:
        sampled = _autosample_native_in_values(int(sample_cap))
        if sampled:
            # 构造临时配置，使用采样的列值
            try:
                temp_cfg = pivot_config.model_copy(
                    update={"manual_column_values": sampled}
                )
            except Exception:
                temp_cfg = pivot_config
                temp_cfg.manual_column_values = sampled

            native_candidate = _try_generate_native_pivot(base_sql, temp_cfg)
            if native_candidate is not None:
                native_candidate["metadata"].update(
                    {
                        "uses_pivot_extension": False,
                        "strategy": "native:auto_sampled",
                        "auto_sampled_values": sampled[:5],  # preview metadata
                    }
                )
                if pivot_config.include_subtotals or pivot_config.include_grand_totals:
                    native_candidate = _inject_pivot_totals(
                        native_candidate,
                        row_dimensions,
                        pivot_config.values,
                        sampled,
                        include_subtotals=pivot_config.include_subtotals,
                        include_grand_totals=pivot_config.include_grand_totals,
                    )
                return native_candidate
        # 如果自动采样也失败，返回错误
        raise ValueError(
            "未满足原生PIVOT条件（需要单一列维度和列值集合）；"
            "请填写‘列值顺序’或设置‘列数量上限’后重试"
        )

    # 如果到达这里，说明原生PIVOT和自动采样都失败了
    raise ValueError(
        "未满足原生PIVOT条件（需要单一列维度和列值集合）；"
        "请填写‘列值顺序’或设置‘列数量上限’后重试"
    )


def _try_generate_native_pivot(
    base_sql: str, pivot_config: PivotConfig
) -> Optional[Dict[str, Any]]:
    """Attempt to generate a DuckDB native PIVOT query.
    Requirements:
      - Exactly one column dimension is provided (pivot_config.columns length == 1)
      - manual_column_values present (IN list)
    """
    # Must have one column dimension
    if not pivot_config.columns or len(pivot_config.columns) != 1:
        return None
    # Require explicit IN list
    if not pivot_config.manual_column_values:
        return None

    # Build aggregated expressions list
    agg_items = []
    for v in pivot_config.values:
        column_expr = _quote_identifier(v.column)

        # 应用类型转换（如果指定了且不是自动）
        if (
            hasattr(v, "typeConversion")
            and v.typeConversion
            and v.typeConversion != "auto"
        ):
            column_expr = f"TRY_CAST({column_expr} AS {v.typeConversion.upper()})"

        agg_items.append(f"{v.aggregation.value}({column_expr})")

    col_dim = _quote_identifier(pivot_config.columns[0])
    in_values = ", ".join(_format_literal(x) for x in pivot_config.manual_column_values)

    # Construct native PIVOT statement并保留基础 CTE 结构，方便注入 totals
    pivot_select = (
        f"SELECT * FROM base PIVOT({', '.join(agg_items)} FOR {col_dim} IN ({in_values}))"
    )

    base_cte = f"WITH base AS (\n{_strip_trailing_semicolon(base_sql)}\n)"
    pivot_alias = "pivot_result"
    pivot_cte = f"{pivot_alias} AS (\n{pivot_select}\n)"
    final_sql = f"{base_cte},\n{pivot_cte}\nSELECT * FROM {pivot_alias};"

    return {
        "final_sql": final_sql,
        "pivot_sql": pivot_select,
        "pivot_alias": pivot_alias,
        "base_cte": base_cte,
        "pivot_cte": pivot_cte,
        "warnings": [],
        "metadata": {"pivot_native_on": pivot_select},
    }


def _derive_pivot_value_aliases(
    values: List[PivotValueConfig],
    manual_values: Optional[List[str]],
) -> List[str]:
    """Derive the column aliases produced by the native PIVOT statement."""
    aliases: List[str] = []
    manual = manual_values or []
    for value in values:
        base_alias = (
            value.alias
            if getattr(value, "alias", None)
            else f"{value.aggregation.value.lower()}_{value.column}"
        )
        if manual:
            for manual_val in manual:
                aliases.append(f"{base_alias}_{manual_val}")
        else:
            aliases.append(base_alias)
    return aliases


def _build_totals_selects(
    row_dimensions: List[str],
    value_aliases: List[str],
    pivot_alias: str = "pivot",
    include_subtotals: bool = False,
    include_grand_totals: bool = False,
) -> List[str]:
    """Construct SELECT statements for subtotal and grand-total rows."""
    selects: List[str] = []

    if include_subtotals and row_dimensions:
        # Generate subtotal for each prefix of the row dimensions (bottom-up)
        for depth in range(len(row_dimensions), 0, -1):
            prefix = row_dimensions[:depth]
            remaining = row_dimensions[depth:]

            select_parts: List[str] = []
            group_by_parts: List[str] = []

            for dim in prefix:
                select_parts.append(f"{pivot_alias}.{dim} AS {dim}")
                group_by_parts.append(f"{pivot_alias}.{dim}")

            # Fill remaining row dimensions with label '全部' (All)
            select_parts.extend([f"'全部' AS {dim}" for dim in remaining])

            select_parts.extend(
                [
                    f"SUM({pivot_alias}.{_quote_identifier(alias)}) AS {_quote_identifier(alias)}"
                    for alias in value_aliases
                ]
            )

            subtotal_select = f"SELECT {', '.join(select_parts)} FROM {pivot_alias}"
            if group_by_parts:
                subtotal_select = (
                    f"{subtotal_select} GROUP BY {', '.join(group_by_parts)}"
                )
            selects.append(subtotal_select)

    if include_grand_totals:
        all_dim_aliases = [f"'总计' AS {dim}" for dim in row_dimensions]
        total_values = [
            f"SUM({pivot_alias}.{_quote_identifier(alias)}) AS {_quote_identifier(alias)}"
            for alias in value_aliases
        ]
        grand_total_select = (
            f"SELECT {', '.join(all_dim_aliases + total_values)} FROM {pivot_alias}"
        )
        selects.append(grand_total_select)

    return selects


def _inject_pivot_totals(
    native_candidate: Dict[str, Any],
    row_dimensions: List[str],
    values: List[PivotValueConfig],
    manual_values: List[str],
    include_subtotals: bool,
    include_grand_totals: bool,
) -> Dict[str, Any]:
    """Augment native pivot SQL to include subtotal / grand-total rows."""

    if not include_subtotals and not include_grand_totals:
        return native_candidate

    pivot_alias = native_candidate.get("pivot_alias") or "pivot_result"
    base_cte = native_candidate.get("base_cte")
    pivot_cte = native_candidate.get("pivot_cte")
    pivot_sql = native_candidate.get("pivot_sql")

    if not pivot_sql or not base_cte or not pivot_cte:
        return native_candidate

    value_aliases = _derive_pivot_value_aliases(values, manual_values)
    if not value_aliases:
        return native_candidate

    totals_selects = _build_totals_selects(
        row_dimensions=row_dimensions,
        value_aliases=value_aliases,
        pivot_alias=pivot_alias,
        include_subtotals=include_subtotals,
        include_grand_totals=include_grand_totals,
    )

    if not totals_selects:
        return native_candidate

    union_sql = "\nUNION ALL\n".join(
        [f"SELECT * FROM {pivot_alias}"] + totals_selects
    )

    final_with_totals = f"{base_cte},\n{pivot_cte}\n{union_sql};"

    native_candidate["final_sql"] = final_with_totals
    native_candidate["metadata"] = {
        **native_candidate.get("metadata", {}),
        "has_totals": True,
        "include_subtotals": include_subtotals,
        "include_grand_totals": include_grand_totals,
    }

    return native_candidate


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


def _build_select_clause(
    config: VisualQueryConfig, casts_map: Optional[Dict[str, str]] = None
) -> str:
    """Build SELECT clause from configuration"""
    select_items = []

    # Add selected columns
    if config.selected_columns:
        for column in config.selected_columns:
            select_items.append(f'"{column}"')

    # Add calculated fields
    for calc_field in config.calculated_fields:
        select_items.append(f'{calc_field.expression} AS "{calc_field.name}"')

    # Add conditional fields
    for cond_field in config.conditional_fields:
        if cond_field.type.value == "conditional":
            case_expr = _build_case_expression(cond_field)
            select_items.append(f'{case_expr} AS "{cond_field.name}"')
        elif cond_field.type.value == "binning":
            bin_expr = _build_binning_expression(cond_field)
            select_items.append(f'{bin_expr} AS "{cond_field.name}"')

    # Add aggregations
    for agg in config.aggregations:
        agg_expr = _build_aggregation_expression(agg, casts_map)
        alias = agg.alias or f"{agg.function.value}_{agg.column}"
        select_items.append(f'{agg_expr} AS "{alias}"')

    # Handle DISTINCT
    distinct_keyword = "DISTINCT " if config.is_distinct else ""

    # If no items selected, default to all columns
    if not select_items:
        return f"SELECT {distinct_keyword}*"

    return f"SELECT {distinct_keyword}{', '.join(select_items)}"


def _build_aggregation_expression(
    agg: AggregationConfig, casts_map: Optional[Dict[str, str]] = None
) -> str:
    """Build aggregation expression"""
    func = agg.function.value
    column_expr = f'"{agg.column}"'

    cast_target = _resolve_cast_expression(agg.column, casts_map)
    if cast_target:
        column_expr = f"TRY_CAST({column_expr} AS {cast_target})"

    # Basic aggregation functions
    if func in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
        return f"{func}({column_expr})"
    elif func == "COUNT_DISTINCT":
        return f"COUNT(DISTINCT {column_expr})"

    # Statistical functions
    elif func == "MEDIAN":
        return f"PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY {column_expr})"
    elif func == "MODE":
        return f"MODE() WITHIN GROUP (ORDER BY {column_expr})"
    elif func in ["STDDEV_SAMP", "VAR_SAMP"]:
        return f"{func}({column_expr})"
    elif func == "PERCENTILE_CONT_25":
        return f"PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {column_expr})"
    elif func == "PERCENTILE_CONT_75":
        return f"PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {column_expr})"
    elif func == "PERCENTILE_DISC_25":
        return f"PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY {column_expr})"
    elif func == "PERCENTILE_DISC_75":
        return f"PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY {column_expr})"

    # Window functions
    elif func == "ROW_NUMBER":
        return f"ROW_NUMBER() OVER (ORDER BY {column_expr})"
    elif func == "RANK":
        return f"RANK() OVER (ORDER BY {column_expr})"
    elif func == "DENSE_RANK":
        return f"DENSE_RANK() OVER (ORDER BY {column_expr})"
    elif func == "PERCENT_RANK":
        return f"PERCENT_RANK() OVER (ORDER BY {column_expr})"
    elif func == "CUME_DIST":
        return f"CUME_DIST() OVER (ORDER BY {column_expr})"

    # Trend analysis functions
    elif func == "SUM_OVER":
        return f"SUM({column_expr}) OVER (ORDER BY {column_expr} ROWS UNBOUNDED PRECEDING)"
    elif func == "AVG_OVER":
        return f"AVG({column_expr}) OVER (ORDER BY {column_expr} ROWS 2 PRECEDING)"
    elif func == "LAG":
        return f"LAG({column_expr}, 1) OVER (ORDER BY {column_expr})"
    elif func == "LEAD":
        return f"LEAD({column_expr}, 1) OVER (ORDER BY {column_expr})"
    elif func == "FIRST_VALUE":
        return f"FIRST_VALUE({column_expr}) OVER (ORDER BY {column_expr})"
    elif func == "LAST_VALUE":
        return f"LAST_VALUE({column_expr}) OVER (ORDER BY {column_expr})"

    else:
        raise ValueError(f"不支持的聚合函数: {func}")


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


def _format_literal(value: Optional[Union[str, int, float]]) -> str:
    """Format literal value for SQL."""
    if value is None:
        return "NULL"

    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"

    if isinstance(value, (int, float)):
        if isinstance(value, float) and value == float("inf"):
            raise ValueError("浮点值不能为无穷大")
        return str(value)

    # Escape single quotes
    text = str(value).replace("'", "''")
    return f"'{text}'"


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
                raise ValueError("列对列比较缺少 right_column 参数")
            right = _format_identifier(right_column)
            right_expr = _apply_column_cast_sql(right, right_column, casts_map)
            return f"{column_expr} {operator} {right_expr}"
        elif value_type == FilterValueType.EXPRESSION:
            expression = getattr(filter_config, "expression", None)
            if not expression:
                raise ValueError("表达式比较缺少 expression 参数")
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


def _build_group_by_clause(config: VisualQueryConfig) -> str:
    """Build GROUP BY clause"""
    group_columns = []

    # Add explicitly specified group by columns
    if config.group_by:
        group_columns.extend([f'"{col}"' for col in config.group_by])

    # If we have aggregations but no explicit group by, use selected columns
    elif config.aggregations and config.selected_columns:
        group_columns.extend([f'"{col}"' for col in config.selected_columns])

    if group_columns:
        return f"GROUP BY {', '.join(group_columns)}"

    return ""


def _build_order_by_clause(order_configs: List[SortConfig]) -> str:
    """Build ORDER BY clause"""
    if not order_configs:
        return ""

    # Sort by priority first
    sorted_configs = sorted(order_configs, key=lambda x: x.priority)

    order_items = []
    for sort_config in sorted_configs:
        column = f'"{sort_config.column}"'
        direction = sort_config.direction.value
        order_items.append(f"{column} {direction}")

    return f"ORDER BY {', '.join(order_items)}"


def _build_limit_clause(limit: Optional[int]) -> str:
    """Build LIMIT clause"""
    if limit and limit > 0:
        return f"LIMIT {limit}"
    return ""


def _build_case_expression(cond_field) -> str:
    """Build CASE WHEN expression for conditional fields"""
    case_parts = ["CASE"]

    for condition in cond_field.conditions:
        column = f'"{condition.column}"'
        operator = condition.operator.value
        value = condition.value
        result = condition.result

        if operator in ["IS NULL", "IS NOT NULL"]:
            when_clause = f"WHEN {column} {operator} THEN '{result}'"
        elif isinstance(value, str):
            when_clause = f"WHEN {column} {operator} '{value}' THEN '{result}'"
        else:
            when_clause = f"WHEN {column} {operator} {value} THEN '{result}'"

        case_parts.append(when_clause)

    # Add default value
    if cond_field.default_value:
        case_parts.append(f"ELSE '{cond_field.default_value}'")
    else:
        case_parts.append("ELSE NULL")

    case_parts.append("END")

    return " ".join(case_parts)


def _build_binning_expression(cond_field) -> str:
    """Build binning expression using WIDTH_BUCKET"""
    column = f'"{cond_field.column}"'
    bins = cond_field.bins

    if cond_field.binning_type == "equal_width":
        # Use WIDTH_BUCKET for equal-width binning
        return f'WIDTH_BUCKET({column}, (SELECT MIN({column}) FROM "{cond_field.column}"), (SELECT MAX({column}) FROM "{cond_field.column}"), {bins})'
    else:
        # Default to equal-width binning
        return f'WIDTH_BUCKET({column}, (SELECT MIN({column}) FROM "{cond_field.column}"), (SELECT MAX({column}) FROM "{cond_field.column}"), {bins})'


def validate_query_config(config: VisualQueryConfig) -> ValidationResult:
    """
    Validate visual query configuration

    Args:
        config: Visual query configuration to validate

    Returns:
        ValidationResult with validation status and messages
    """
    errors = []
    warnings = []
    complexity_score = 0

    try:
        # Basic validation
        if not config.table_name or not config.table_name.strip():
            errors.append("表名不能为空")

        # Check if we have any analysis configuration
        has_analysis = (
            config.selected_columns
            or config.aggregations
            or config.calculated_fields
            or config.conditional_fields
            or config.filters
            or config.order_by
            or config.is_distinct
        )

        if not has_analysis:
            warnings.append("未配置任何分析条件，将执行全表查询")

        # Validate aggregations
        for agg in config.aggregations:
            if not agg.column or not agg.column.strip():
                errors.append("聚合函数必须指定列名")
            complexity_score += 2

        # Validate filters
        for filter_config in config.filters:
            if not filter_config.column or not filter_config.column.strip():
                errors.append("筛选条件必须指定列名")

            # Check if value is required for operator
            if filter_config.operator not in [
                FilterOperator.IS_NULL,
                FilterOperator.IS_NOT_NULL,
            ]:
                if filter_config.value is None:
                    errors.append(f"筛选条件 '{filter_config.column}' 需要指定值")

            if filter_config.operator == FilterOperator.BETWEEN:
                if filter_config.value2 is None:
                    errors.append(f"BETWEEN操作符需要指定两个值")

            complexity_score += 1

        # Validate calculated fields
        for calc_field in config.calculated_fields:
            if not calc_field.name or not calc_field.name.strip():
                errors.append("计算字段必须有名称")
            if not calc_field.expression or not calc_field.expression.strip():
                errors.append("计算字段必须有表达式")
            complexity_score += 3

        # Validate conditional fields
        for cond_field in config.conditional_fields:
            if not cond_field.name or not cond_field.name.strip():
                errors.append("条件字段必须有名称")

            if cond_field.type.value == "conditional":
                if not cond_field.conditions or len(cond_field.conditions) == 0:
                    errors.append("条件字段必须至少有一个条件")
            elif cond_field.type.value == "binning":
                if not cond_field.column or not cond_field.column.strip():
                    errors.append("分组字段必须指定列名")
                if not cond_field.bins or cond_field.bins < 2:
                    errors.append("分组字段必须至少有2个分组")

            complexity_score += 4

        # Validate sorting
        for sort_config in config.order_by:
            if not sort_config.column or not sort_config.column.strip():
                errors.append("排序必须指定列名")
            complexity_score += 1

        # Check for potential performance issues
        if len(config.aggregations) > 5:
            warnings.append("聚合函数过多可能影响查询性能")

        if len(config.filters) > 10:
            warnings.append("筛选条件过多可能影响查询性能")

        # Validate GROUP BY logic
        if config.aggregations and config.selected_columns:
            # When we have aggregations and selected columns, we need GROUP BY
            if not config.group_by:
                warnings.append("使用聚合函数时建议明确指定分组列")

        is_valid = len(errors) == 0

        return ValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            complexity_score=complexity_score,
        )

    except Exception as e:
        logger.error(f"Validation failed: {str(e)}")
        return ValidationResult(
            is_valid=False,
            errors=[f"配置验证失败: {str(e)}"],
            warnings=[],
            complexity_score=0,
        )


def get_column_statistics(table_name: str, column_name: str, con) -> ColumnStatistics:
    """
    Get statistics for a specific column

    Args:
        table_name: Name of the table
        column_name: Name of the column
        con: DuckDB connection

    Returns:
        ColumnStatistics object with column metadata
    """
    try:
        # Get basic column info
        column_info_sql = f'DESCRIBE "{table_name}"'
        columns_df = con.execute(column_info_sql).fetchdf()

        column_row = columns_df[columns_df["column_name"] == column_name]
        if column_row.empty:
            raise ValueError(f"列 '{column_name}' 在表 '{table_name}' 中不存在")

        data_type = column_row.iloc[0]["column_type"]

        # Get statistics
        stats_sql = f"""
        SELECT 
            COUNT(*) as total_count,
            COUNT("{column_name}") as non_null_count,
            COUNT(*) - COUNT("{column_name}") as null_count,
            COUNT(DISTINCT "{column_name}") as distinct_count
        FROM "{table_name}"
        """

        stats_df = con.execute(stats_sql).fetchdf()
        stats_row = stats_df.iloc[0]

        # Get min/max for numeric columns
        min_value = None
        max_value = None
        avg_value = None

        if data_type.upper() in [
            "INTEGER",
            "BIGINT",
            "DOUBLE",
            "FLOAT",
            "DECIMAL",
            "NUMERIC",
        ]:
            minmax_sql = f"""
            SELECT 
                MIN("{column_name}") as min_val,
                MAX("{column_name}") as max_val,
                AVG(CAST("{column_name}" AS DOUBLE)) as avg_val
            FROM "{table_name}"
            WHERE "{column_name}" IS NOT NULL
            """
            minmax_df = con.execute(minmax_sql).fetchdf()
            if not minmax_df.empty:
                minmax_row = minmax_df.iloc[0]
                min_value = minmax_row["min_val"]
                max_value = minmax_row["max_val"]
                avg_value = minmax_row["avg_val"]

        # Get sample values
        sample_sql = f"""
        SELECT DISTINCT "{column_name}"
        FROM "{table_name}"
        WHERE "{column_name}" IS NOT NULL
        LIMIT 10
        """
        sample_df = con.execute(sample_sql).fetchdf()
        sample_values = [str(val) for val in sample_df[column_name].tolist()]

        return ColumnStatistics(
            column_name=column_name,
            data_type=data_type,
            null_count=int(stats_row["null_count"]),
            distinct_count=int(stats_row["distinct_count"]),
            min_value=min_value,
            max_value=max_value,
            avg_value=float(avg_value) if avg_value is not None else None,
            sample_values=sample_values,
        )

    except Exception as e:
        logger.error(f"Failed to get column statistics: {str(e)}")
        raise ValueError(f"获取列统计信息失败: {str(e)}")


def get_table_metadata(table_name: str, con, use_cache: bool = True) -> TableMetadata:
    """
    Get metadata for a table including all column statistics

    Args:
        table_name: Name of the table
        con: DuckDB connection
        use_cache: Whether to reuse cached metadata when available

    Returns:
        TableMetadata object with complete table information
    """
    def _load_metadata() -> TableMetadata:
        # Get table row count
        count_sql = f'SELECT COUNT(*) as row_count FROM "{table_name}"'
        row_count = con.execute(count_sql).fetchdf().iloc[0]["row_count"]

        # Get column information
        columns_sql = f'DESCRIBE "{table_name}"'
        columns_df = con.execute(columns_sql).fetchdf()

        column_stats = []
        for _, column_row in columns_df.iterrows():
            column_name = column_row["column_name"]
            try:
                stats = get_column_statistics(table_name, column_name, con)
                column_stats.append(stats)
            except Exception as e:
                logger.warning(
                    f"Failed to get stats for column {column_name}: {str(e)}"
                )
                # Create basic stats if detailed stats fail
                column_stats.append(
                    ColumnStatistics(
                        column_name=column_name,
                        data_type=column_row["column_type"],
                        null_count=0,
                        distinct_count=0,
                        sample_values=[],
                    )
                )

        return TableMetadata(
            table_name=table_name,
            row_count=int(row_count),
            column_count=len(column_stats),
            columns=column_stats,
        )

    try:
        if use_cache:
            return table_metadata_cache.get_or_load(table_name, _load_metadata)
        return table_metadata_cache.get_or_load(
            table_name, _load_metadata, force_refresh=True
        )
    except Exception as e:
        logger.error(f"Failed to get table metadata: {str(e)}")
        raise ValueError(f"获取表元数据失败: {str(e)}")


def estimate_query_performance(config: VisualQueryConfig, con) -> PerformanceEstimate:
    """
    Estimate query performance based on configuration

    Args:
        config: Visual query configuration
        con: DuckDB connection

    Returns:
        PerformanceEstimate with estimated metrics
    """
    try:
        warnings = []
        complexity_score = 0

        # Get base table row count
        count_sql = f'SELECT COUNT(*) as total_rows FROM "{config.table_name}"'
        total_rows = con.execute(count_sql).fetchdf().iloc[0]["total_rows"]

        estimated_rows = total_rows

        # Estimate filtering impact
        if config.filters:
            # Rough estimate: each filter reduces rows by 50% on average
            filter_factor = 0.5 ** len(config.filters)
            estimated_rows = int(estimated_rows * filter_factor)
            complexity_score += len(config.filters)

        # Estimate aggregation impact
        if config.aggregations:
            if config.group_by or config.selected_columns:
                # GROUP BY typically reduces row count significantly
                estimated_rows = min(estimated_rows, int(total_rows * 0.1))
            else:
                # Single aggregation result
                estimated_rows = 1
            complexity_score += len(config.aggregations) * 2

        # Estimate calculated fields impact
        complexity_score += len(config.calculated_fields) * 3
        complexity_score += len(config.conditional_fields) * 4

        # Estimate sorting impact
        if config.order_by:
            complexity_score += len(config.order_by)

        # Apply limit
        if config.limit and config.limit < estimated_rows:
            estimated_rows = config.limit

        # Estimate execution time based on complexity and row count
        base_time = 0.001  # Base time in seconds
        row_factor = estimated_rows / 1000  # Time increases with row count
        complexity_factor = complexity_score / 10  # Time increases with complexity

        estimated_time = base_time + (row_factor * 0.01) + (complexity_factor * 0.1)

        # Add performance warnings
        if complexity_score > 20:
            warnings.append("查询复杂度较高，可能需要较长执行时间")

        if estimated_rows > 100000:
            warnings.append("预计结果集较大，建议添加筛选条件或限制行数")

        if len(config.aggregations) > 5:
            warnings.append("聚合函数较多，可能影响查询性能")

        return PerformanceEstimate(
            estimated_rows=int(estimated_rows),
            estimated_time=estimated_time,
            complexity_score=complexity_score,
            warnings=warnings,
        )

    except Exception as e:
        logger.error(f"Performance estimation failed: {str(e)}")
        return PerformanceEstimate(
            estimated_rows=0,
            estimated_time=0.0,
            complexity_score=0,
            warnings=[f"性能估算失败: {str(e)}"],
        )


# ==================== 集合操作查询生成器 ====================


class SetOperationQueryGenerator:
    """集合操作查询生成器"""

    def __init__(self):
        """初始化集合操作查询生成器"""
        self.logger = logging.getLogger(__name__)

    def build_set_operation_query(
        self, config: SetOperationConfig, preview_limit: int = None
    ) -> str:
        """
        构建集合操作查询

        Args:
            config: 集合操作配置
            preview_limit: 预览模式下每个表的行数限制

        Returns:
            str: 生成的SQL查询
        """
        try:
            operation_type = config.operation_type
            tables = config.tables
            use_by_name = config.use_by_name

            # 验证配置
            self._validate_config(config)

            # 生成各个子查询
            subqueries = []
            for table in tables:
                subquery = self._build_table_subquery(table, use_by_name, preview_limit)
                subqueries.append(f"({subquery})")

            # 组合集合操作查询
            if use_by_name and operation_type in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                operation = f"{operation_type.value} BY NAME"
            else:
                operation = operation_type.value

            set_query = f" {operation} ".join(subqueries)

            self.logger.info(
                f"生成集合操作查询: {operation_type}, 表数量: {len(tables)}"
            )
            return set_query

        except Exception as e:
            self.logger.error(f"构建集合操作查询失败: {str(e)}")
            raise ValueError(f"构建集合操作查询失败: {str(e)}")

    def _build_table_subquery(
        self, table: TableConfig, use_by_name: bool, limit: int = None
    ) -> str:
        """
        构建单表子查询

        Args:
            table: 表配置
            use_by_name: 是否使用BY NAME模式
            limit: 可选的行数限制

        Returns:
            str: 子查询SQL
        """
        table_name = table.table_name
        selected_columns = table.selected_columns
        column_mappings = table.column_mappings
        alias = table.alias

        # 构建表名（带别名）
        table_ref = f'"{table_name}"'
        if alias:
            table_ref += f' AS "{alias}"'

        if use_by_name:
            # BY NAME模式：DuckDB会自动按列名匹配，使用SELECT *即可
            columns_sql = "*"
        else:
            # 位置模式：使用选择的列
            if not selected_columns:
                columns_sql = "*"
            else:
                # 转义列名
                escaped_columns = [f'"{col}"' for col in selected_columns]
                columns_sql = ", ".join(escaped_columns)

        subquery = f"SELECT {columns_sql} FROM {table_ref}"

        # 如果提供了限制，添加LIMIT子句
        if limit is not None and limit > 0:
            subquery += f" LIMIT {limit}"

        return subquery

    def _validate_config(self, config: SetOperationConfig):
        """
        验证集合操作配置

        Args:
            config: 集合操作配置

        Raises:
            ValueError: 配置验证失败
        """
        operation_type = config.operation_type
        tables = config.tables
        use_by_name = config.use_by_name

        # 验证表数量
        if len(tables) < 2:
            raise ValueError("集合操作至少需要两个表")

        if len(tables) > 10:
            raise ValueError("集合操作最多支持10个表")

        # 验证BY NAME模式
        if use_by_name:
            if operation_type not in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                raise ValueError("只有UNION和UNION ALL支持BY NAME模式")

        # 验证列兼容性（非BY NAME模式）
        if not use_by_name:
            self._validate_column_compatibility(tables)

    def _validate_column_compatibility(self, tables: List[TableConfig]):
        """
        验证列兼容性（位置模式）

        Args:
            tables: 表配置列表

        Raises:
            ValueError: 列兼容性验证失败
        """
        if not tables:
            return

        first_table = tables[0]
        first_columns = first_table.selected_columns or []

        for i, table in enumerate(tables[1:], 1):
            table_columns = table.selected_columns or []

            if len(first_columns) != len(table_columns):
                raise ValueError(
                    f"表 {table.table_name} 的列数量({len(table_columns)}) "
                    f"与第一个表 {first_table.table_name} 的列数量({len(first_columns)})不匹配"
                )

    def estimate_result_rows(self, config: SetOperationConfig, connection=None) -> int:
        """
        估算集合操作结果行数

        Args:
            config: 集合操作配置
            connection: DuckDB连接（可选）

        Returns:
            int: 预估结果行数
        """
        try:
            if not connection:
                # 如果没有提供连接，返回粗略估算
                return self._rough_estimate_rows(config)

            operation_type = config.operation_type
            tables = config.tables

            if operation_type == SetOperationType.UNION:
                # UNION: 去重后的行数，通常小于所有表行数之和
                total_rows = 0
                for table in tables:
                    count_sql = f'SELECT COUNT(*) FROM "{table.table_name}"'
                    rows = connection.execute(count_sql).fetchone()[0]
                    total_rows += rows
                # 粗略估算：假设去重率为20%
                return int(total_rows * 0.8)

            elif operation_type == SetOperationType.UNION_ALL:
                # UNION ALL: 所有表行数之和
                total_rows = 0
                for table in tables:
                    count_sql = f'SELECT COUNT(*) FROM "{table.table_name}"'
                    rows = connection.execute(count_sql).fetchone()[0]
                    total_rows += rows
                return total_rows

            elif operation_type == SetOperationType.EXCEPT:
                # EXCEPT: 第一个表减去其他表，结果行数通常较小
                if len(tables) >= 2:
                    first_table_rows = connection.execute(
                        f'SELECT COUNT(*) FROM "{tables[0].table_name}"'
                    ).fetchone()[0]
                    # 粗略估算：假设差集为第一个表的10%
                    return int(first_table_rows * 0.1)
                return 0

            elif operation_type == SetOperationType.INTERSECT:
                # INTERSECT: 交集，结果行数通常最小
                if len(tables) >= 2:
                    first_table_rows = connection.execute(
                        f'SELECT COUNT(*) FROM "{tables[0].table_name}"'
                    ).fetchone()[0]
                    # 粗略估算：假设交集为第一个表的5%
                    return int(first_table_rows * 0.05)
                return 0

            else:
                return 0

        except Exception as e:
            self.logger.warning(f"估算结果行数失败: {str(e)}")
            return 0

    def _rough_estimate_rows(self, config: SetOperationConfig) -> int:
        """
        粗略估算行数（无数据库连接时）

        Args:
            config: 集合操作配置

        Returns:
            int: 粗略估算的行数
        """
        operation_type = config.operation_type
        table_count = len(config.tables)

        # 基于操作类型和表数量的粗略估算
        if operation_type == SetOperationType.UNION:
            return 1000 * table_count  # 假设每表1000行，去重后约800行/表
        elif operation_type == SetOperationType.UNION_ALL:
            return 1000 * table_count  # 假设每表1000行
        elif operation_type == SetOperationType.EXCEPT:
            return 100  # 差集通常较小
        elif operation_type == SetOperationType.INTERSECT:
            return 50  # 交集通常最小
        else:
            return 1000


# 全局集合操作查询生成器实例
set_operation_generator = SetOperationQueryGenerator()


def generate_set_operation_sql(
    config: SetOperationConfig, preview_limit: int = None
) -> str:
    """
    生成集合操作SQL查询

    Args:
        config: 集合操作配置
        preview_limit: 预览模式下每个表的行数限制

    Returns:
        str: 生成的SQL查询
    """
    return set_operation_generator.build_set_operation_query(config, preview_limit)


def estimate_set_operation_rows(config: SetOperationConfig, connection=None) -> int:
    """
    估算集合操作结果行数

    Args:
        config: 集合操作配置
        connection: DuckDB连接（可选）

    Returns:
        int: 预估结果行数
    """
    return set_operation_generator.estimate_result_rows(config, connection)
