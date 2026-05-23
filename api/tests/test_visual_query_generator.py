"""
Unit tests for visual query generator

Tests SQL generation, validation, and performance estimation functionality.
"""

import pytest
from contextlib import contextmanager
from unittest.mock import Mock, patch
import pandas as pd

from core.services.pivot_query_generator import (
    generate_visual_query_sql,
    validate_query_config,
    ValidationResult,
)
from core.services.table_metadata_service import (
    get_column_statistics,
    get_table_metadata,
)
from models.visual_query_models import (
    VisualQueryConfig,
    FilterConfig,
    AggregationFunction,
    FilterOperator,
    ColumnStatistics,
    TableMetadata,
    VisualQueryMode,
    PivotConfig,
    PivotValueConfig,
)
from core.database.table_metadata_cache import table_metadata_cache


class TestVisualQueryModeGeneration:
    """Tests for the higher level visual query SQL dispatcher"""

    def test_generate_visual_query_sql_pivot_mode(self):
        config = VisualQueryConfig(
            table_name="sales",
            filters=[],
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
        )

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.mode == VisualQueryMode.PIVOT
        assert "WITH base AS" in result.final_sql
        assert "PIVOT(" in result.final_sql or (result.pivot_sql and "PIVOT(" in result.pivot_sql)
        assert result.metadata.get("strategy") == "native"
        assert result.metadata.get("uses_pivot_extension") is False
        assert result.pivot_sql is not None

    def test_generate_visual_query_sql_pivot_native_strategy(self):
        config = VisualQueryConfig(
            table_name="sales",
            filters=[],
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

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
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

    def test_generate_visual_query_sql_pivot_native_with_totals(self):
        config = VisualQueryConfig(
            table_name="sales",
            filters=[],
            )

        pivot_config = PivotConfig(
            rows=["region", "product"],
            columns=["year"],
            values=[
                PivotValueConfig(
                    column="revenue",
                    aggregation=AggregationFunction.SUM,
                )
            ],
            manual_column_values=["2022", "2023"],
            include_subtotals=True,
            include_grand_totals=True,
            strategy="native",
        )

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.metadata.get("has_totals") is True
        assert result.metadata.get("include_subtotals") is True
        assert result.metadata.get("include_grand_totals") is True
        assert "pivot_result" in result.final_sql
        assert "UNION ALL" in result.final_sql
        assert "'总计'" in result.final_sql
        assert "'全部'" in result.final_sql
        assert result.final_sql.strip().endswith(";")

    def test_generate_visual_query_sql_pivot_extension_with_limit(self):
        config = VisualQueryConfig(
            table_name="sales",
            filters=[],
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

        mock_execute = Mock()
        mock_execute.fetchdf.return_value = pd.DataFrame({"v": ["2022", "2023"]})

        @contextmanager
        def fake_duckdb_connection():
            con = Mock()
            con.execute.return_value = mock_execute
            yield con

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager, \
            patch(
                "core.database.duckdb_engine.with_duckdb_connection",
                side_effect=fake_duckdb_connection,
            ):
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.mode == VisualQueryMode.PIVOT
        assert result.metadata.get("strategy") == "native:auto_sampled"
        assert result.metadata.get("uses_pivot_extension") is False
        assert result.metadata.get("auto_sampled_values") == ["2022", "2023"]

    def test_generate_visual_query_sql_pivot_mode_disabled(self):
        config = VisualQueryConfig(
            table_name="sales",
            filters=[],
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

        disabled_app_config = Mock(
            enable_pivot_tables=False,
            pivot_table_extension="pivot_table",
        )

        with pytest.raises(ValueError):
            generate_visual_query_sql(
                config,
                pivot_config=pivot_config,
                app_config=disabled_app_config,
            )


    def test_generate_visual_query_sql_pivot_dynamic_strategy(self):
        """Test that dynamic pivot is used when no manual values provided and no limit set."""
        config = VisualQueryConfig(
            table_name="sales",
            filters=[],
            )

        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(
                    column="revenue",
                    aggregation=AggregationFunction.SUM,
                )
            ],
            # No manual values, NO limit -> should trigger dynamic
        )

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )

            result = generate_visual_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.mode == VisualQueryMode.PIVOT
        assert result.metadata.get("strategy") == "native:dynamic"
        assert result.metadata.get("uses_pivot_extension") is False
        assert "IN (" not in result.final_sql  # No explicit IN list
        assert "PIVOT" in result.final_sql


class TestValidation:
    """Test query configuration validation"""

    def test_valid_configuration(self):
        """Test validation of valid pivot base configuration"""
        config = VisualQueryConfig(
            table_name="test_table",
            filters=[
                FilterConfig(
                    column="status", operator=FilterOperator.EQUAL, value="active"
                )
            ],
        )

        result = validate_query_config(config)

        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_empty_table_name(self):
        """Test validation with empty table name"""
        config = VisualQueryConfig.model_construct(
            table_name="",
            filters=[],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert any("empty" in err.lower() or "不能为空" in err for err in result.errors)

    def test_invalid_filter(self):
        """Test validation with invalid filter"""
        config = VisualQueryConfig.model_construct(
            table_name="test_table",
            filters=[
                FilterConfig.model_construct(
                    column="status", operator=FilterOperator.EQUAL, value=None
                )
            ],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert "筛选条件 'status' 需要指定值" in result.errors

    def test_between_filter_validation(self):
        """Test validation of BETWEEN filter"""
        config = VisualQueryConfig.model_construct(
            table_name="test_table",
            filters=[
                FilterConfig.model_construct(
                    column="age", operator=FilterOperator.BETWEEN, value=18, value2=None
                )
            ],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert "BETWEEN操作符需要指定两个值" in result.errors

    def test_many_filters_warning(self):
        """Many filters should add a performance warning"""
        config = VisualQueryConfig(
            table_name="test_table",
            filters=[
                FilterConfig(
                    column=f"col{i}",
                    operator=FilterOperator.EQUAL,
                    value=i,
                )
                for i in range(11)
            ],
        )

        result = validate_query_config(config)

        assert any("筛选条件过多" in w for w in result.warnings)


class TestColumnStatistics:
    """Test column statistics functionality"""

    @patch("core.services.table_metadata_service.logger")
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
            pd.DataFrame({"sample_value": [1, 2, 3, 4, 5]}),  # Sample values - use 'sample_value' column name
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

        with pytest.raises(ValueError, match="does not exist in table"):
            get_column_statistics("test_table", "nonexistent", mock_con)


class TestTableMetadata:
    """Test table metadata functionality"""

    @patch("core.services.table_metadata_service.get_column_statistics")
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

    @patch("core.services.table_metadata_service.get_column_statistics")
    def test_get_table_metadata_uses_cache(self, mock_get_column_stats):
        """Calling get_table_metadata twice should hit DuckDB once when cache enabled."""
        table_metadata_cache.invalidate()
        mock_con = Mock()

        mock_con.execute.return_value.fetchdf.side_effect = [
            pd.DataFrame({"row_count": [50]}),
            pd.DataFrame(
                {
                    "column_name": ["col1"],
                    "column_type": ["INTEGER"],
                }
            ),
        ]

        mock_get_column_stats.return_value = ColumnStatistics(
            column_name="col1",
            data_type="INTEGER",
            null_count=0,
            distinct_count=5,
            sample_values=["1", "2"],
        )

        result_one = get_table_metadata("cached_table", mock_con)
        result_two = get_table_metadata("cached_table", mock_con)

        assert result_one is result_two
        assert mock_con.execute.call_count == 2
        table_metadata_cache.invalidate("cached_table")


if __name__ == "__main__":
    pytest.main([__file__])
