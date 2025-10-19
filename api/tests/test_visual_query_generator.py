"""
Unit tests for visual query generator

Tests SQL generation, validation, and performance estimation functionality.
"""

import pytest
from unittest.mock import Mock, patch
import pandas as pd

from core.visual_query_generator import (
    generate_sql_from_config,
    generate_visual_query_sql,
    validate_query_config,
    get_column_statistics,
    get_table_metadata,
    estimate_query_performance,
    ValidationResult,
    PerformanceEstimate,
)
from models.visual_query_models import (
    VisualQueryConfig,
    AggregationConfig,
    FilterConfig,
    SortConfig,
    AggregationFunction,
    FilterOperator,
    SortDirection,
    ColumnStatistics,
    TableMetadata,
    VisualQueryMode,
    PivotConfig,
    PivotValueConfig,
)


class TestSQLGeneration:
    """Test SQL generation from visual query configurations"""

    def test_basic_select_all(self):
        """Test basic SELECT * query generation"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=[],
            aggregations=[],
            filters=[],
            order_by=[],
            is_distinct=False,
        )

        sql = generate_sql_from_config(config)
        expected = 'SELECT * FROM "test_table"'
        assert sql == expected

    def test_select_specific_columns(self):
        """Test SELECT with specific columns"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1", "col2", "col3"],
            aggregations=[],
            filters=[],
            order_by=[],
            is_distinct=False,
        )

        sql = generate_sql_from_config(config)
        expected = 'SELECT "col1", "col2", "col3" FROM "test_table"'
        assert sql == expected

    def test_select_distinct(self):
        """Test SELECT DISTINCT query generation"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1", "col2"],
            aggregations=[],
            filters=[],
            order_by=[],
            is_distinct=True,
        )

        sql = generate_sql_from_config(config)
        expected = 'SELECT DISTINCT "col1", "col2" FROM "test_table"'
        assert sql == expected

    def test_aggregation_functions(self):
        """Test various aggregation functions"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["category"],
            aggregations=[
                AggregationConfig(
                    column="amount",
                    function=AggregationFunction.SUM,
                    alias="total_amount",
                ),
                AggregationConfig(
                    column="count", function=AggregationFunction.AVG, alias="avg_count"
                ),
                AggregationConfig(
                    column="id",
                    function=AggregationFunction.COUNT_DISTINCT,
                    alias="unique_ids",
                ),
            ],
            filters=[],
            order_by=[],
            group_by=["category"],
        )

        sql = generate_sql_from_config(config)

        # Check that all aggregation functions are present
        assert 'SUM("amount") AS "total_amount"' in sql
        assert 'AVG("count") AS "avg_count"' in sql
        assert 'COUNT(DISTINCT "id") AS "unique_ids"' in sql
        assert 'GROUP BY "category"' in sql

    def test_filter_conditions(self):
        """Test various filter conditions"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["*"],
            aggregations=[],
            filters=[
                FilterConfig(
                    column="status", operator=FilterOperator.EQUAL, value="active"
                ),
                FilterConfig(
                    column="age",
                    operator=FilterOperator.GREATER_THAN,
                    value=18,
                    logic_operator="AND",
                ),
                FilterConfig(
                    column="name",
                    operator=FilterOperator.LIKE,
                    value="John%",
                    logic_operator="AND",
                ),
            ],
            order_by=[],
        )

        sql = generate_sql_from_config(config)

        assert "WHERE \"status\" = 'active'" in sql
        assert 'AND "age" > 18' in sql
        assert "AND \"name\" LIKE 'John%'" in sql

    def test_sorting_and_limit(self):
        """Test ORDER BY and LIMIT clauses"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["name", "age"],
            aggregations=[],
            filters=[],
            order_by=[
                SortConfig(column="age", direction=SortDirection.DESC, priority=0),
                SortConfig(column="name", direction=SortDirection.ASC, priority=1),
            ],
            limit=100,
        )

        sql = generate_sql_from_config(config)

        assert 'ORDER BY "age" DESC, "name" ASC' in sql
        assert "LIMIT 100" in sql

    def test_complex_query(self):
        """Test complex query with all features"""
        config = VisualQueryConfig(
            table_name="sales_data",
            selected_columns=["region", "product_category"],
            aggregations=[
                AggregationConfig(
                    column="sales_amount",
                    function=AggregationFunction.SUM,
                    alias="total_sales",
                ),
                AggregationConfig(
                    column="order_id",
                    function=AggregationFunction.COUNT,
                    alias="order_count",
                ),
            ],
            filters=[
                FilterConfig(
                    column="order_date",
                    operator=FilterOperator.GREATER_EQUAL,
                    value="2023-01-01",
                ),
                FilterConfig(
                    column="status",
                    operator=FilterOperator.EQUAL,
                    value="completed",
                    logic_operator="AND",
                ),
            ],
            order_by=[
                SortConfig(
                    column="total_sales", direction=SortDirection.DESC, priority=0
                )
            ],
            group_by=["region", "product_category"],
            limit=50,
            is_distinct=False,
        )

        sql = generate_sql_from_config(config)

        # Verify all components are present
        assert 'SELECT "region", "product_category"' in sql
        assert 'SUM("sales_amount") AS "total_sales"' in sql
        assert 'COUNT("order_id") AS "order_count"' in sql
        assert 'FROM "sales_data"' in sql
        assert "WHERE \"order_date\" >= '2023-01-01'" in sql
        assert "AND \"status\" = 'completed'" in sql
        assert 'GROUP BY "region", "product_category"' in sql
        assert 'ORDER BY "total_sales" DESC' in sql
        assert "LIMIT 50" in sql


class TestVisualQueryModeGeneration:
    """Tests for the higher level visual query SQL dispatcher"""

    def test_generate_visual_query_sql_regular_mode(self):
        config = VisualQueryConfig(
            table_name="orders",
            selected_columns=["id", "status"],
            aggregations=[],
            filters=[],
            order_by=[],
        )

        result = generate_visual_query_sql(config, VisualQueryMode.REGULAR)

        assert result.mode == VisualQueryMode.REGULAR
        assert result.final_sql == 'SELECT "id", "status" FROM "orders"'
        assert result.base_sql == result.final_sql
        assert result.pivot_sql is None

    def test_generate_visual_query_sql_pivot_mode(self):
        config = VisualQueryConfig(
            table_name="sales",
            selected_columns=[],
            aggregations=[],
            filters=[],
            order_by=[],
        )

        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(
                    column="revenue",
                    aggregation=AggregationFunction.SUM,
                    alias="total_revenue",
                )
            ],
        )

        with patch("core.visual_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
                VisualQueryMode.PIVOT,
                pivot_config=pivot_config,
            )

        assert result.mode == VisualQueryMode.PIVOT
        assert "WITH base AS" in result.final_sql
        assert "pivot_table(" in result.final_sql
        assert "COUNT(" not in result.final_sql  # ensure aggregator respected alias
        assert result.pivot_sql is not None

    def test_generate_visual_query_sql_pivot_native_strategy(self):
        config = VisualQueryConfig(
            table_name="sales",
            selected_columns=[],
            aggregations=[],
            filters=[],
            order_by=[],
        )

        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(
                    column="revenue",
                    aggregation=AggregationFunction.SUM,
                    alias="total_revenue",
                )
            ],
            manual_column_values=["2022", "2023"],
            strategy="native",
        )

        with patch("core.visual_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
                VisualQueryMode.PIVOT,
                pivot_config=pivot_config,
            )

        assert result.mode == VisualQueryMode.PIVOT
        assert (
            " PIVOT(" in result.final_sql or " PIVOT(" in result.pivot_sql
            if result.pivot_sql
            else True
        )
        assert result.metadata.get("strategy") == "native"
        assert result.metadata.get("uses_pivot_extension") is False

    def test_generate_visual_query_sql_pivot_extension_with_limit(self):
        config = VisualQueryConfig(
            table_name="sales",
            selected_columns=[],
            aggregations=[],
            filters=[],
            order_by=[],
        )

        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(
                    column="revenue",
                    aggregation=AggregationFunction.SUM,
                    alias="total_revenue",
                )
            ],
            # 无手动列值，强制走扩展；并设置列数量上限
            strategy="extension",
            column_value_limit=5,
        )

        with patch("core.visual_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
                VisualQueryMode.PIVOT,
                pivot_config=pivot_config,
            )

        assert result.mode == VisualQueryMode.PIVOT
        assert result.metadata.get("strategy") == "extension"
        assert result.metadata.get("uses_pivot_extension") is True
        # 扩展调用中应包含 max_columns 参数
        assert "max_columns:=5" in (result.pivot_sql or "")

    def test_generate_visual_query_sql_pivot_mode_disabled(self):
        config = VisualQueryConfig(
            table_name="sales",
            selected_columns=[],
            aggregations=[],
            filters=[],
            order_by=[],
        )

        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(
                    column="revenue",
                    aggregation=AggregationFunction.SUM,
                    alias="total_revenue",
                )
            ],
        )

        with patch("core.visual_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=False,
                pivot_table_extension="pivot_table",
            )

            with pytest.raises(ValueError):
                generate_visual_query_sql(
                    config,
                    VisualQueryMode.PIVOT,
                    pivot_config=pivot_config,
                )


class TestValidation:
    """Test query configuration validation"""

    def test_valid_configuration(self):
        """Test validation of valid configuration"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1", "col2"],
            aggregations=[
                AggregationConfig(column="amount", function=AggregationFunction.SUM)
            ],
            filters=[
                FilterConfig(
                    column="status", operator=FilterOperator.EQUAL, value="active"
                )
            ],
            order_by=[
                SortConfig(column="col1", direction=SortDirection.ASC, priority=0)
            ],
        )

        result = validate_query_config(config)

        assert result.is_valid is True
        assert len(result.errors) == 0
        assert result.complexity_score > 0

    def test_empty_table_name(self):
        """Test validation with empty table name"""
        config = VisualQueryConfig(
            table_name="",
            selected_columns=["col1"],
            aggregations=[],
            filters=[],
            order_by=[],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert "表名不能为空" in result.errors

    def test_invalid_aggregation(self):
        """Test validation with invalid aggregation"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1"],
            aggregations=[
                AggregationConfig(column="", function=AggregationFunction.SUM)
            ],
            filters=[],
            order_by=[],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert "聚合函数必须指定列名" in result.errors

    def test_invalid_filter(self):
        """Test validation with invalid filter"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1"],
            aggregations=[],
            filters=[
                FilterConfig(column="status", operator=FilterOperator.EQUAL, value=None)
            ],
            order_by=[],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert "筛选条件 'status' 需要指定值" in result.errors

    def test_between_filter_validation(self):
        """Test validation of BETWEEN filter"""
        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1"],
            aggregations=[],
            filters=[
                FilterConfig(
                    column="age", operator=FilterOperator.BETWEEN, value=18, value2=None
                )
            ],
            order_by=[],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert "BETWEEN操作符需要指定两个值" in result.errors

    def test_performance_warnings(self):
        """Test performance warnings"""
        # Create config with many aggregations
        aggregations = [
            AggregationConfig(column=f"col{i}", function=AggregationFunction.SUM)
            for i in range(6)  # More than 5 aggregations
        ]

        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1"],
            aggregations=aggregations,
            filters=[],
            order_by=[],
        )

        result = validate_query_config(config)

        assert "聚合函数过多可能影响查询性能" in result.warnings


class TestColumnStatistics:
    """Test column statistics functionality"""

    @patch("core.visual_query_generator.logger")
    def test_get_column_statistics_success(self, mock_logger):
        """Test successful column statistics retrieval"""
        # Mock DuckDB connection
        mock_con = Mock()

        # Mock DESCRIBE table result
        describe_df = pd.DataFrame(
            {"column_name": ["test_column"], "column_type": ["INTEGER"]}
        )
        mock_con.execute.return_value.fetchdf.side_effect = [
            describe_df,  # DESCRIBE result
            pd.DataFrame(
                {  # Statistics result
                    "total_count": [1000],
                    "non_null_count": [950],
                    "null_count": [50],
                    "distinct_count": [100],
                }
            ),
            pd.DataFrame(
                {"min_val": [1], "max_val": [100], "avg_val": [50.5]}  # Min/Max result
            ),
            pd.DataFrame({"test_column": [1, 2, 3, 4, 5]}),  # Sample values
        ]

        result = get_column_statistics("test_table", "test_column", mock_con)

        assert isinstance(result, ColumnStatistics)
        assert result.column_name == "test_column"
        assert result.data_type == "INTEGER"
        assert result.null_count == 50
        assert result.distinct_count == 100
        assert result.min_value == 1
        assert result.max_value == 100
        assert result.avg_value == 50.5
        assert len(result.sample_values) == 5

    def test_get_column_statistics_column_not_found(self):
        """Test column statistics when column doesn't exist"""
        mock_con = Mock()

        # Mock empty DESCRIBE result
        describe_df = pd.DataFrame({"column_name": [], "column_type": []})
        mock_con.execute.return_value.fetchdf.return_value = describe_df

        with pytest.raises(
            ValueError, match="列 'nonexistent' 在表 'test_table' 中不存在"
        ):
            get_column_statistics("test_table", "nonexistent", mock_con)


class TestTableMetadata:
    """Test table metadata functionality"""

    @patch("core.visual_query_generator.get_column_statistics")
    def test_get_table_metadata_success(self, mock_get_column_stats):
        """Test successful table metadata retrieval"""
        mock_con = Mock()

        # Mock row count result
        mock_con.execute.return_value.fetchdf.side_effect = [
            pd.DataFrame({"row_count": [1000]}),  # Row count
            pd.DataFrame(
                {  # Column info
                    "column_name": ["col1", "col2"],
                    "column_type": ["INTEGER", "VARCHAR"],
                }
            ),
        ]

        # Mock column statistics
        mock_get_column_stats.side_effect = [
            ColumnStatistics(
                column_name="col1",
                data_type="INTEGER",
                null_count=10,
                distinct_count=100,
                sample_values=["1", "2", "3"],
            ),
            ColumnStatistics(
                column_name="col2",
                data_type="VARCHAR",
                null_count=5,
                distinct_count=200,
                sample_values=["a", "b", "c"],
            ),
        ]

        result = get_table_metadata("test_table", mock_con)

        assert isinstance(result, TableMetadata)
        assert result.table_name == "test_table"
        assert result.row_count == 1000
        assert result.column_count == 2
        assert len(result.columns) == 2
        assert result.columns[0].column_name == "col1"
        assert result.columns[1].column_name == "col2"


class TestPerformanceEstimation:
    """Test query performance estimation"""

    def test_estimate_simple_query_performance(self):
        """Test performance estimation for simple query"""
        mock_con = Mock()
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"total_rows": [1000]}
        )

        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1", "col2"],
            aggregations=[],
            filters=[],
            order_by=[],
        )

        result = estimate_query_performance(config, mock_con)

        assert isinstance(result, PerformanceEstimate)
        assert result.estimated_rows == 1000
        assert result.estimated_time > 0
        assert result.complexity_score >= 0

    def test_estimate_filtered_query_performance(self):
        """Test performance estimation with filters"""
        mock_con = Mock()
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"total_rows": [10000]}
        )

        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["col1"],
            aggregations=[],
            filters=[
                FilterConfig(
                    column="status", operator=FilterOperator.EQUAL, value="active"
                ),
                FilterConfig(
                    column="age",
                    operator=FilterOperator.GREATER_THAN,
                    value=18,
                    logic_operator="AND",
                ),
            ],
            order_by=[],
        )

        result = estimate_query_performance(config, mock_con)

        # With 2 filters, estimated rows should be reduced significantly
        assert result.estimated_rows < 10000
        assert result.complexity_score > 0

    def test_estimate_aggregated_query_performance(self):
        """Test performance estimation with aggregations"""
        mock_con = Mock()
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"total_rows": [100000]}
        )

        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["category"],
            aggregations=[
                AggregationConfig(column="amount", function=AggregationFunction.SUM),
                AggregationConfig(column="count", function=AggregationFunction.AVG),
            ],
            filters=[],
            order_by=[],
            group_by=["category"],
        )

        result = estimate_query_performance(config, mock_con)

        # Aggregated queries typically return fewer rows
        assert result.estimated_rows < 100000
        assert result.complexity_score > 0

    def test_performance_warnings(self):
        """Test performance warnings generation"""
        mock_con = Mock()
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"total_rows": [1000000]}
        )

        # Create complex query with many aggregations
        aggregations = [
            AggregationConfig(column=f"col{i}", function=AggregationFunction.SUM)
            for i in range(6)
        ]

        config = VisualQueryConfig(
            table_name="test_table",
            selected_columns=["category"],
            aggregations=aggregations,
            filters=[],
            order_by=[],
            group_by=["category"],
        )

        result = estimate_query_performance(config, mock_con)

        assert len(result.warnings) > 0
        assert any("聚合函数较多" in warning for warning in result.warnings)


if __name__ == "__main__":
    pytest.main([__file__])
