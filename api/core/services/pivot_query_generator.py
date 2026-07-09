# pylint: disable=duplicate-code
"""Pivot SQL generation and config validation (HTTP /api/pivot-query)."""

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from models.pivot_query_models import (
    PivotQueryConfig,
    FilterOperator,
    PivotQueryMode,
    PivotConfig,
    PivotValueConfig,
)
from core.services.pivot_query_sql_common import (
    _build_from_clause,
    _build_where_clause,
    _deduplicate_preserve_order,
    _format_literal,
    _quote_identifier,
    _strip_trailing_semicolon,
)

try:  # pragma: no cover
    from core.common.config_manager import config_manager  # type: ignore
except Exception:  # pragma: no cover
    config_manager = None

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of query configuration validation"""

    is_valid: bool
    errors: List[str]
    warnings: List[str]


@dataclass
class GeneratedPivotQuery:
    """Result structure for generated pivot SQL."""

    mode: PivotQueryMode
    base_sql: str
    final_sql: str
    pivot_sql: Optional[str]
    warnings: List[str]
    metadata: Dict[str, Any]


def generate_pivot_query_sql(
    config: PivotQueryConfig,
    pivot_config: PivotConfig,
    app_config: Optional[Any] = None,
    resolved_casts: Optional[Dict[str, str]] = None,
) -> GeneratedPivotQuery:
    """Generate pivot SQL (HTTP /api/pivot-query/*)."""
    warnings: List[str] = []
    mode = PivotQueryMode.PIVOT

    if app_config is None and config_manager is not None:
        try:
            app_config = config_manager.get_app_config()
        except Exception as exc:  # pragma: no cover - fallback
            logger.warning(
                "Unable to load AppConfig from config manager, using default settings: %s",
                exc,
            )
            app_config = None

    enable_pivot = getattr(app_config, "enable_pivot_tables", True)
    if not enable_pivot:
        raise ValueError(
            "System configuration has disabled pivot table feature, please contact administrator to enable"
        )

    pivot_config.strategy = "native"

    base_sql = _generate_pivot_base_sql(config, pivot_config, resolved_casts)
    pivot_result = _generate_pivot_transformation_sql(
        base_sql=base_sql,
        pivot_config=pivot_config,
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

    return GeneratedPivotQuery(
        mode=mode,
        base_sql=base_sql,
        final_sql=pivot_result["final_sql"],
        pivot_sql=pivot_result["pivot_sql"],
        warnings=warnings,
        metadata=metadata,
    )


def _generate_pivot_base_sql(
    config: PivotQueryConfig,
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
        raise ValueError("Pivot analysis requires at least one metric or dimension column")

    select_clause = ", ".join(_quote_identifier(col) for col in ordered_columns)

    sql_parts = [
        f"SELECT {select_clause}",
        _build_from_clause(config),
    ]

    where_clause = _build_where_clause(config.filters, casts_map)
    if where_clause:
        sql_parts.append(where_clause)

    return _strip_trailing_semicolon(" ".join(sql_parts))


def _generate_pivot_transformation_sql(
    base_sql: str,
    pivot_config: PivotConfig,
    casts_map: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    row_dimensions = [_quote_identifier(dim) for dim in pivot_config.rows]
    manual_values = list(
        getattr(pivot_config, "manual_column_values", []) or []
    )

    def _autosample_native_in_values(max_values: Optional[int]) -> Optional[List[str]]:
        """Auto-sample distinct values for the single column dimension to enable native PIVOT.
        Returns a list of string literals (unescaped) or None when not applicable.
        """
        if not pivot_config.columns or len(pivot_config.columns) != 1:
            return None
        if not max_values or max_values <= 0:
            return None
        try:
            from core.database.duckdb_engine import with_duckdb_connection  # type: ignore

            target_col = pivot_config.columns[0]
            introspect_sql = (
                f"WITH base AS (\n{_strip_trailing_semicolon(base_sql)}\n)\n"
                f"SELECT DISTINCT {_quote_identifier(target_col)} AS v\n"
                f"FROM base\n"
                f"WHERE {_quote_identifier(target_col)} IS NOT NULL\n"
                f"LIMIT {int(max_values)}"
            )
            with with_duckdb_connection() as con:
                df = con.execute(introspect_sql).fetchdf()
            values: List[str] = []
            if df is not None and not df.empty:
                for raw in df["v"].tolist():
                    # Preserve original values as string form; _format_literal will escape
                    values.append(str(raw))
            return values or None
        except Exception as _:
            return None

    # 检查是否设置了列数量限制
    # 如果设置了限制，我们不能使用动态 PIVOT（因为它会返回所有列），
    # 而应该跳过此步直接进入下面的采样逻辑。
    # 除非已经有了 manual_column_values（即用户手动指定了列），那样 _try_generate_native_pivot 会优先使用它。
    explicit_limit = getattr(pivot_config, "column_value_limit", None)
    should_use_dynamic = explicit_limit is None or explicit_limit <= 0 or bool(pivot_config.manual_column_values)

    if should_use_dynamic:
        # 尝试使用原生 PIVOT 策略（支持动态列，不需要显式 IN 列表）
        native_candidate = _try_generate_native_pivot(base_sql, pivot_config, allow_dynamic=True)
        if native_candidate is not None:
            native_candidate["metadata"].update({"uses_pivot_extension": False})
            # 当需要小计/总计时，构建额外结果集
            if pivot_config.include_subtotals or pivot_config.include_grand_totals:
                if not manual_values:
                    # 动态透视的列名在执行期才确定，_derive_pivot_value_aliases 无法
                    # 预知（会引用不存在的列 → Binder Error），故降级为不注入并告警。
                    # 需要小计请提供 manual_column_values 或 column_value_limit。
                    native_candidate["warnings"].append(
                        "Subtotals/grand totals require explicit column values "
                        "(manual_column_values or column_value_limit); skipped for dynamic pivot"
                    )
                else:
                    native_candidate = _inject_pivot_totals(
                        native_candidate,
                        row_dimensions,
                        pivot_config.values,
                        manual_values,
                        include_subtotals=pivot_config.include_subtotals,
                        include_grand_totals=pivot_config.include_grand_totals,
                    )
            return native_candidate

    # 动态 PIVOT 失败（多列维度场景），仅当显式设置 column_value_limit 时采样
    sample_cap = getattr(pivot_config, "column_value_limit", None)
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

            native_candidate = _try_generate_native_pivot(base_sql, temp_cfg, allow_dynamic=False)
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
            "Native PIVOT conditions not met (requires single column dimension and column value set); "
            "please fill in 'column value order' or set 'column count limit' and retry"
        )

    # 如果到达这里，说明原生 PIVOT 和自动采样都失败了
    raise ValueError(
        "Native PIVOT conditions not met (requires single column dimension and column value set); "
        "please fill in 'column value order' or set 'column count limit' and retry"
    )


def _try_generate_native_pivot(
    base_sql: str, pivot_config: PivotConfig, allow_dynamic: bool = True
) -> Optional[Dict[str, Any]]:
    """Attempt to generate a DuckDB native PIVOT query.
    
    Requirements:
      - Exactly one column dimension is provided (pivot_config.columns length == 1)
      - If manual_column_values present, use explicit IN list
      - If manual_column_values is empty AND allow_dynamic is True, generate dynamic PIVOT
        (DuckDB will automatically use all distinct values as column headers)
    
    Args:
        base_sql: The base SELECT query to pivot on
        pivot_config: PivotConfig with rows, columns, values configuration
        allow_dynamic: If True, allows generating PIVOT without explicit IN list
    """
    # Must have one column dimension
    if not pivot_config.columns or len(pivot_config.columns) != 1:
        return None
    
    # Determine if we have explicit IN values
    has_explicit_values = bool(pivot_config.manual_column_values)
    
    # If not allowing dynamic and no explicit values, fail early
    if not has_explicit_values and not allow_dynamic:
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
    
    # 构造原生 PIVOT 语句，并保留基础 CTE 结构，方便注入合计行
    if has_explicit_values:
        in_values = ", ".join(_format_literal(x) for x in pivot_config.manual_column_values)
        pivot_select = (
            f"SELECT * FROM base PIVOT({', '.join(agg_items)} FOR {col_dim} IN ({in_values}))"
        )
        strategy = "native"
    else:
        # Dynamic PIVOT: 函数式 PIVOT(... FOR col) 语法必须带 IN 列表，省略 IN 是语法错误；
        # 动态取全部去重值须用简写语法 PIVOT base ON col USING agg
        pivot_select = (
            f"SELECT * FROM (PIVOT base ON {col_dim} USING {', '.join(agg_items)})"
        )
        strategy = "native:dynamic"

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
        "metadata": {"pivot_native_on": pivot_select, "strategy": strategy},
    }


def _derive_pivot_value_aliases(
    values: List[PivotValueConfig],
    manual_values: Optional[List[str]],
) -> List[str]:
    """Derive the exact column names DuckDB's native PIVOT emits, so the
    totals/subtotal SELECTs reference columns that actually exist (otherwise
    UNION ALL fails with a Binder Error).

    Verified against the DuckDB build used here — for ``PIVOT(<aggs> FOR col
    IN (<values>))`` with unaliased aggregates (which is what
    ``_try_generate_native_pivot`` emits):
      - single aggregate   -> bare pivot value, e.g. ``Q1``
      - multiple aggregates -> ``{value}_{agg}({column})``, e.g.
        ``Q1_sum(amount)`` / ``Q1_count(amount)`` — ordered value-outer,
        aggregate-inner (matching PIVOT's output column order for UNION ALL).

    Totals require explicit column values, so ``manual_values`` is
    authoritative; without them the caller skips totals entirely.
    """
    manual = manual_values or []
    if not manual or not values:
        return []
    single = len(values) == 1
    aliases: List[str] = []
    for manual_val in manual:
        for value in values:
            if single:
                aliases.append(str(manual_val))
            else:
                aliases.append(
                    f"{manual_val}_{value.aggregation.value.lower()}({value.column})"
                )
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




def validate_query_config(config: PivotQueryConfig) -> ValidationResult:
    """Validate pivot base-query configuration (table + filters)."""
    errors: List[str] = []
    warnings: List[str] = []

    try:
        if not config.table_name or not config.table_name.strip():
            errors.append("table名不能is empty")

        for filter_config in config.filters:
            if not filter_config.column or not filter_config.column.strip():
                errors.append("筛选条件必须指定column名")
            elif filter_config.operator not in (
                FilterOperator.IS_NULL,
                FilterOperator.IS_NOT_NULL,
            ):
                if filter_config.value is None:
                    errors.append(f"筛选条件 '{filter_config.column}' 需要指定值")
            if filter_config.operator == FilterOperator.BETWEEN:
                if filter_config.value2 is None:
                    errors.append("BETWEEN操作符需要指定两个值")

        if len(config.filters) > 10:
            warnings.append("筛选条件过多可能影响query性能")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )

    except Exception as e:
        logger.error("Validation failed: %s", e)
        return ValidationResult(
            is_valid=False,
            errors=[f"configuration验证failed: {str(e)}"],
            warnings=[],
        )
