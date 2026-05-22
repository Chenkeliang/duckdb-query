# pylint: disable=duplicate-code
"""
Visual query orchestration: pivot SQL, validation, metadata, set operations.

HTTP `/api/visual-query/*` is pivot-only (see `routers/visual_query.py`).
Shared SQL helpers live in `visual_query_sql_common`.
"""

import logging
import re
from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass
import duckdb

from models.visual_query_models import (
    VisualQueryConfig,
    FilterConfig,
    AggregationFunction,
    FilterOperator,
    ColumnStatistics,
    TableMetadata,
    SetOperationConfig,
    SetOperationType,
    TableConfig,
    ColumnMapping,
    VisualQueryMode,
    PivotConfig,
    PivotValueConfig,
)
from core.database.table_metadata_cache import table_metadata_cache

try:  # pragma: no cover - optional during tests
    from core.common.config_manager import config_manager  # type: ignore
except Exception:  # pragma: no cover - fallback when config manager unavailable
    config_manager = None

logger = logging.getLogger(__name__)

from core.services.visual_query_sql_common import (
    _build_from_clause,
    _build_where_clause,
    _deduplicate_preserve_order,
    _format_literal,
    _quote_identifier,
    _resolve_cast_expression,
    _strip_trailing_semicolon,
)



def _normalize_json_like_string(raw: str) -> Optional[str]:
    """Attempt to normalize a JSON-like string to valid JSON; return None if it fails."""
    if raw is None:
        return None
    try:
        import json

        return json.dumps(json.loads(raw), ensure_ascii=False)
    except Exception:
        pass
    try:
        normalized = (
            raw.replace("'", '"')
            .replace("\u2018", '"')
            .replace("\u2019", '"')
            .replace("True", "true")
            .replace("False", "false")
            .replace("None", "null")
        )
        import json

        return json.dumps(json.loads(normalized), ensure_ascii=False)
    except Exception:
        return None


@dataclass
class ValidationResult:
    """Result of query configuration validation"""

    is_valid: bool
    errors: List[str]
    warnings: List[str]
    complexity_score: int = 0


@dataclass
class GeneratedVisualQuery:
    """Result structure for generated visual analysis SQL."""

    mode: VisualQueryMode
    base_sql: str
    final_sql: str
    pivot_sql: Optional[str]
    warnings: List[str]
    metadata: Dict[str, Any]


def generate_visual_query_sql(
    config: VisualQueryConfig,
    mode: VisualQueryMode = VisualQueryMode.PIVOT,
    pivot_config: Optional[PivotConfig] = None,
    app_config: Optional[Any] = None,
    resolved_casts: Optional[Dict[str, str]] = None,
) -> GeneratedVisualQuery:
    """Generate pivot SQL (mode must be PIVOT)."""

    if mode != VisualQueryMode.PIVOT:
        raise ValueError("Only pivot mode is supported")
    if pivot_config is None:
        raise ValueError("Pivot configuration cannot be empty")

    warnings: List[str] = []

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

    return GeneratedVisualQuery(
        mode=mode,
        base_sql=base_sql,
        final_sql=pivot_result["final_sql"],
        pivot_sql=pivot_result["pivot_sql"],
        warnings=warnings,
        metadata=metadata,
    )


def _generate_pivot_base_sql(
    config: VisualQueryConfig,
    pivot_config: PivotConfig,
    casts_map: Optional[Dict[str, str]] = None,
) -> str:
    # 构建必需column：行/column维度 + 指标引用column
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

    # 检查是否设置了column数量限制
    # 如果设置了限制，我们不能使用动态 PIVOT（因为它会返回所有column），
    # 而应该skip此步直接进入下面的采样逻辑。
    # 除非已经有了 manual_column_values（即用户手动指定了column），那样 _try_generate_native_pivot 会优先使用它。
    explicit_limit = getattr(pivot_config, "column_value_limit", None)
    should_use_dynamic = explicit_limit is None or explicit_limit <= 0 or bool(pivot_config.manual_column_values)

    if should_use_dynamic:
        # 尝试使用原生PIVOT策略（支持动态column，不需要显式 IN columntable）
        native_candidate = _try_generate_native_pivot(base_sql, pivot_config, allow_dynamic=True)
        if native_candidate is not None:
            native_candidate["metadata"].update({"uses_pivot_extension": False})
            # 当需要小计/总计时，构建额外result集
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

    # 动态 PIVOT failed（多column维度场景），仅当显式设置 column_value_limit 时采样
    sample_cap = getattr(pivot_config, "column_value_limit", None)
    if sample_cap and sample_cap > 0:
        sampled = _autosample_native_in_values(int(sample_cap))
        if sampled:
            # 构造临时configuration，使用采样的column值
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
        # 如果自动采样也failed，返回error
        raise ValueError(
            "Native PIVOT conditions not met (requires single column dimension and column value set); "
            "please fill in 'column value order' or set 'column count limit' and retry"
        )

    # 如果到达这里，说明原生PIVOT和自动采样都failed了
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
    
    # Build IN clause only if explicit values provided
    if has_explicit_values:
        in_values = ", ".join(_format_literal(x) for x in pivot_config.manual_column_values)
        in_clause = f" IN ({in_values})"
        strategy = "native"
    else:
        # Dynamic PIVOT: no IN clause, DuckDB auto-detects column values
        in_clause = ""
        strategy = "native:dynamic"

    # Construct native PIVOT statement并保留基础 CTE 结构，方便注入 totals
    pivot_select = (
        f"SELECT * FROM base PIVOT({', '.join(agg_items)} FOR {col_dim}{in_clause})"
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
        "metadata": {"pivot_native_on": pivot_select, "strategy": strategy},
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




def validate_query_config(config: VisualQueryConfig) -> ValidationResult:
    """Validate pivot base-query configuration (table + filters)."""
    errors: List[str] = []
    warnings: List[str] = []
    complexity_score = 0

    try:
        if not config.table_name or not config.table_name.strip():
            errors.append("table名不能is empty")

        for filter_config in config.filters:
            if not filter_config.column or not filter_config.column.strip():
                errors.append("筛选条件必须指定column名")
            elif filter_config.operator not in [
                FilterOperator.IS_NULL,
                FilterOperator.IS_NOT_NULL,
            ]:
                if filter_config.value is None:
                    errors.append(f"筛选条件 '{filter_config.column}' 需要指定值")
            if filter_config.operator == FilterOperator.BETWEEN:
                if filter_config.value2 is None:
                    errors.append("BETWEEN操作符需要指定两个值")
            complexity_score += 1

        if len(config.filters) > 10:
            warnings.append("筛选条件过多可能影响query性能")

        return ValidationResult(
            is_valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            complexity_score=complexity_score,
        )

    except Exception as e:
        logger.error("Validation failed: %s", e)
        return ValidationResult(
            is_valid=False,
            errors=[f"configuration验证failed: {str(e)}"],
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
            raise ValueError(f"Column '{column_name}' does not exist in table '{table_name}'")

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
        column_ref = f'"{column_name}"'
        is_complex_type = any(
            marker in str(data_type).upper()
            for marker in ["STRUCT", "MAP", "LIST", "ARRAY", "JSON"]
        )
        sample_expr = f"to_json({column_ref})" if is_complex_type else column_ref
        sample_sql = f"""
        SELECT DISTINCT {sample_expr} AS sample_value
        FROM "{table_name}"
        WHERE "{column_name}" IS NOT NULL
        LIMIT 10
        """
        sample_df = con.execute(sample_sql).fetchdf()
        sample_values = []
        for val in sample_df["sample_value"].tolist():
            try:
                if isinstance(val, str):
                    normalized = _normalize_json_like_string(val)
                    sample_values.append(normalized if normalized is not None else val)
                elif isinstance(val, (dict, list)):
                    import json

                    sample_values.append(json.dumps(val, ensure_ascii=False))
                else:
                    sample_values.append(str(val))
            except Exception:
                sample_values.append(str(val))

        # 处理 NaN 值
        import math
        def safe_float(val):
            if val is None:
                return None
            try:
                f = float(val)
                if math.isnan(f) or math.isinf(f):
                    return None
                return f
            except (ValueError, TypeError):
                return None

        return ColumnStatistics(
            column_name=column_name,
            data_type=data_type,
            null_count=int(stats_row["null_count"]),
            distinct_count=int(stats_row["distinct_count"]),
            min_value=safe_float(min_value),
            max_value=safe_float(max_value),
            avg_value=safe_float(avg_value),
            sample_values=sample_values,
        )

    except Exception as e:
        logger.error(f"Failed to get column statistics: {str(e)}")
        raise ValueError(f"Failed to get column statistics: {str(e)}")


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
        raise ValueError(f"Failed to get table metadata: {str(e)}")


# ==================== 集合操作query生成器 ====================


class SetOperationQueryGenerator:
    """集合操作query生成器"""

    def __init__(self):
        """initializing集合操作query生成器"""
        self.logger = logging.getLogger(__name__)

    def build_set_operation_query(
        self, config: SetOperationConfig, preview_limit: int = None
    ) -> str:
        """
        构建集合操作query

        Args:
            config: 集合操作configuration
            preview_limit: 预览模式下每个table的行数限制

        Returns:
            str: 生成的SQLquery
        """
        try:
            operation_type = config.operation_type
            tables = config.tables
            use_by_name = config.use_by_name

            # 验证configuration
            self._validate_config(config)

            # 生成各个子query
            subqueries = []
            for table in tables:
                subquery = self._build_table_subquery(table, use_by_name, preview_limit)
                subqueries.append(f"({subquery})")

            # 组合集合操作query
            if use_by_name and operation_type in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                operation = f"{operation_type.value} BY NAME"
            else:
                operation = operation_type.value

            set_query = f" {operation} ".join(subqueries)

            self.logger.info(
                f"Generated set operation query: {operation_type}, table count: {len(tables)}"
            )
            return set_query

        except Exception as e:
            self.logger.error(f"Failed to build set operation query: {str(e)}")
            raise ValueError(f"Failed to build set operation query: {str(e)}")

    def _build_table_subquery(
        self, table: TableConfig, use_by_name: bool, limit: int = None
    ) -> str:
        """
        构建单table子query

        Args:
            table: tableconfiguration
            use_by_name: 是否使用BY NAME模式
            limit: 可选的行数限制

        Returns:
            str: 子querySQL
        """
        table_name = table.table_name
        selected_columns = table.selected_columns
        column_mappings = table.column_mappings
        alias = table.alias

        # 构建table名（带别名）
        table_ref = f'"{table_name}"'
        if alias:
            table_ref += f' AS "{alias}"'

        if use_by_name:
            # BY NAME模式：DuckDB会自动按column名匹配，使用SELECT *即可
            columns_sql = "*"
        else:
            # 位置模式：使用选择的column
            if not selected_columns:
                columns_sql = "*"
            else:
                # 转义column名
                escaped_columns = [f'"{col}"' for col in selected_columns]
                columns_sql = ", ".join(escaped_columns)

        subquery = f"SELECT {columns_sql} FROM {table_ref}"

        # 如果提供了限制，添加LIMIT子句
        if limit is not None and limit > 0:
            subquery += f" LIMIT {limit}"

        return subquery

    def _validate_config(self, config: SetOperationConfig):
        """
        验证集合操作configuration

        Args:
            config: 集合操作configuration

        Raises:
            ValueError: configuration验证failed
        """
        operation_type = config.operation_type
        tables = config.tables
        use_by_name = config.use_by_name

        # 验证table数量
        if len(tables) < 2:
            raise ValueError("Set operation requires at least two tables")

        if len(tables) > 10:
            raise ValueError("Set operation supports a maximum of 10 tables")

        # 验证BY NAME模式
        if use_by_name:
            if operation_type not in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                raise ValueError("Only UNION and UNION ALL support BY NAME mode")

        # 验证column兼容性（非BY NAME模式）
        if not use_by_name:
            self._validate_column_compatibility(tables)

    def _validate_column_compatibility(self, tables: List[TableConfig]):
        """
        验证column兼容性（位置模式）

        Args:
            tables: tableconfigurationcolumntable

        Raises:
            ValueError: column兼容性验证failed
        """
        if not tables:
            return

        first_table = tables[0]
        first_columns = first_table.selected_columns or []

        for i, table in enumerate(tables[1:], 1):
            table_columns = table.selected_columns or []

            if len(first_columns) != len(table_columns):
                raise ValueError(
                    f"Table {table.table_name} column count ({len(table_columns)}) "
                    f"does not match first table {first_table.table_name} column count ({len(first_columns)})"
                )

    def estimate_result_rows(self, config: SetOperationConfig, connection=None) -> int:
        """
        估算集合操作result行数

        Args:
            config: 集合操作configuration
            connection: DuckDBconnection（可选）

        Returns:
            int: 预估result行数
        """
        try:
            if not connection:
                # 如果没有提供connection，返回粗略估算
                return self._rough_estimate_rows(config)

            operation_type = config.operation_type
            tables = config.tables

            if operation_type == SetOperationType.UNION:
                # UNION: 去重后的行数，通常小于所有table行数之和
                total_rows = 0
                for table in tables:
                    count_sql = f'SELECT COUNT(*) FROM "{table.table_name}"'
                    rows = connection.execute(count_sql).fetchone()[0]
                    total_rows += rows
                # 粗略估算：假设去重率为20%
                return int(total_rows * 0.8)

            elif operation_type == SetOperationType.UNION_ALL:
                # UNION ALL: 所有table行数之和
                total_rows = 0
                for table in tables:
                    count_sql = f'SELECT COUNT(*) FROM "{table.table_name}"'
                    rows = connection.execute(count_sql).fetchone()[0]
                    total_rows += rows
                return total_rows

            elif operation_type == SetOperationType.EXCEPT:
                # EXCEPT: 第一个table减去其他table，result行数通常较小
                if len(tables) >= 2:
                    first_table_rows = connection.execute(
                        f'SELECT COUNT(*) FROM "{tables[0].table_name}"'
                    ).fetchone()[0]
                    # 粗略估算：假设差集为第一个table的10%
                    return int(first_table_rows * 0.1)
                return 0

            elif operation_type == SetOperationType.INTERSECT:
                # INTERSECT: 交集，result行数通常最小
                if len(tables) >= 2:
                    first_table_rows = connection.execute(
                        f'SELECT COUNT(*) FROM "{tables[0].table_name}"'
                    ).fetchone()[0]
                    # 粗略估算：假设交集为第一个table的5%
                    return int(first_table_rows * 0.05)
                return 0

            else:
                return 0

        except Exception as e:
            self.logger.warning(f"Failed to estimate result row count: {str(e)}")
            return 0

    def _rough_estimate_rows(self, config: SetOperationConfig) -> int:
        """
        粗略估算行数（无databaseconnection时）

        Args:
            config: 集合操作configuration

        Returns:
            int: 粗略估算的行数
        """
        operation_type = config.operation_type
        table_count = len(config.tables)

        # 基于操作类型和table数量的粗略估算
        if operation_type == SetOperationType.UNION:
            return 1000 * table_count  # 假设每table1000行，去重后约800行/table
        elif operation_type == SetOperationType.UNION_ALL:
            return 1000 * table_count  # 假设每table1000行
        elif operation_type == SetOperationType.EXCEPT:
            return 100  # 差集通常较小
        elif operation_type == SetOperationType.INTERSECT:
            return 50  # 交集通常最小
        else:
            return 1000


# 全局集合操作query生成器实例
set_operation_generator = SetOperationQueryGenerator()


def generate_set_operation_sql(
    config: SetOperationConfig, preview_limit: int = None
) -> str:
    """
    生成集合操作SQLquery

    Args:
        config: 集合操作configuration
        preview_limit: 预览模式下每个table的行数限制

    Returns:
        str: 生成的SQLquery
    """
    return set_operation_generator.build_set_operation_query(config, preview_limit)


def estimate_set_operation_rows(config: SetOperationConfig, connection=None) -> int:
    """
    估算集合操作result行数

    Args:
        config: 集合操作configuration
        connection: DuckDBconnection（可选）

    Returns:
        int: 预估result行数
    """
    return set_operation_generator.estimate_result_rows(config, connection)
