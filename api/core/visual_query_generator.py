"""
Visual Query Generator

SQL generation logic for visual query configurations.
Supports DuckDB syntax and comprehensive validation.
"""

import logging
from typing import List, Dict, Any, Optional, Union
from dataclasses import dataclass
import pandas as pd
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
    ColumnStatistics,
    TableMetadata,
    SetOperationConfig,
    SetOperationType,
    TableConfig,
    ColumnMapping,
)

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


def generate_sql_from_config(config: VisualQueryConfig) -> str:
    """
    Generate SQL query from visual query configuration

    Args:
        config: Visual query configuration

    Returns:
        Generated SQL string with DuckDB syntax
    """
    try:
        # Build SELECT clause
        select_clause = _build_select_clause(config)

        # Build FROM clause
        from_clause = f'FROM "{config.table_name}"'

        # Build WHERE clause
        where_clause = _build_where_clause(config.filters)

        # Build GROUP BY clause
        group_by_clause = _build_group_by_clause(config)

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


def _build_select_clause(config: VisualQueryConfig) -> str:
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
        agg_expr = _build_aggregation_expression(agg)
        alias = agg.alias or f"{agg.function.value}_{agg.column}"
        select_items.append(f'{agg_expr} AS "{alias}"')

    # Handle DISTINCT
    distinct_keyword = "DISTINCT " if config.is_distinct else ""

    # If no items selected, default to all columns
    if not select_items:
        return f"SELECT {distinct_keyword}*"

    return f"SELECT {distinct_keyword}{', '.join(select_items)}"


def _build_aggregation_expression(agg: AggregationConfig) -> str:
    """Build aggregation expression"""
    func = agg.function.value
    column = f'"{agg.column}"'

    # Basic aggregation functions
    if func in ["SUM", "AVG", "COUNT", "MIN", "MAX"]:
        return f"{func}({column})"
    elif func == "COUNT_DISTINCT":
        return f"COUNT(DISTINCT {column})"

    # Statistical functions
    elif func == "MEDIAN":
        return f"PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY {column})"
    elif func == "MODE":
        return f"MODE() WITHIN GROUP (ORDER BY {column})"
    elif func in ["STDDEV_SAMP", "VAR_SAMP"]:
        return f"{func}({column})"
    elif func == "PERCENTILE_CONT_25":
        return f"PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {column})"
    elif func == "PERCENTILE_CONT_75":
        return f"PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {column})"
    elif func == "PERCENTILE_DISC_25":
        return f"PERCENTILE_DISC(0.25) WITHIN GROUP (ORDER BY {column})"
    elif func == "PERCENTILE_DISC_75":
        return f"PERCENTILE_DISC(0.75) WITHIN GROUP (ORDER BY {column})"

    # Window functions
    elif func == "ROW_NUMBER":
        return f"ROW_NUMBER() OVER (ORDER BY {column})"
    elif func == "RANK":
        return f"RANK() OVER (ORDER BY {column})"
    elif func == "DENSE_RANK":
        return f"DENSE_RANK() OVER (ORDER BY {column})"
    elif func == "PERCENT_RANK":
        return f"PERCENT_RANK() OVER (ORDER BY {column})"
    elif func == "CUME_DIST":
        return f"CUME_DIST() OVER (ORDER BY {column})"

    # Trend analysis functions
    elif func == "SUM_OVER":
        return f"SUM({column}) OVER (ORDER BY {column} ROWS UNBOUNDED PRECEDING)"
    elif func == "AVG_OVER":
        return f"AVG({column}) OVER (ORDER BY {column} ROWS 2 PRECEDING)"
    elif func == "LAG":
        return f"LAG({column}, 1) OVER (ORDER BY {column})"
    elif func == "LEAD":
        return f"LEAD({column}, 1) OVER (ORDER BY {column})"
    elif func == "FIRST_VALUE":
        return f"FIRST_VALUE({column}) OVER (ORDER BY {column})"
    elif func == "LAST_VALUE":
        return f"LAST_VALUE({column}) OVER (ORDER BY {column})"

    else:
        raise ValueError(f"不支持的聚合函数: {func}")


def _build_where_clause(filters: List[FilterConfig]) -> str:
    """Build WHERE clause from filters"""
    if not filters:
        return ""

    filter_conditions = []

    for i, filter_config in enumerate(filters):
        condition = _build_filter_condition(filter_config)

        if i == 0:
            filter_conditions.append(condition)
        else:
            logic_op = filter_config.logic_operator.value
            filter_conditions.append(f"{logic_op} {condition}")

    return f"WHERE {' '.join(filter_conditions)}"


def _build_filter_condition(filter_config: FilterConfig) -> str:
    """Build individual filter condition"""
    column = f'"{filter_config.column}"'
    operator = filter_config.operator.value
    value = filter_config.value

    if operator in ["IS NULL", "IS NOT NULL"]:
        return f"{column} {operator}"

    elif operator == "BETWEEN":
        value2 = filter_config.value2
        return f"{column} BETWEEN '{value}' AND '{value2}'"

    elif operator in ["LIKE", "ILIKE"]:
        # Handle pattern matching
        if not str(value).startswith("%") and not str(value).endswith("%"):
            value = f"%{value}%"
        return f"{column} {operator} '{value}'"

    else:
        # Standard comparison operators
        if isinstance(value, str):
            return f"{column} {operator} '{value}'"
        else:
            return f"{column} {operator} {value}"


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


def get_table_metadata(table_name: str, con) -> TableMetadata:
    """
    Get metadata for a table including all column statistics

    Args:
        table_name: Name of the table
        con: DuckDB connection

    Returns:
        TableMetadata object with complete table information
    """
    try:
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

    def build_set_operation_query(self, config: SetOperationConfig, preview_limit: int = None) -> str:
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

    def _build_table_subquery(self, table: TableConfig, use_by_name: bool, limit: int = None) -> str:
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


def generate_set_operation_sql(config: SetOperationConfig, preview_limit: int = None) -> str:
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
