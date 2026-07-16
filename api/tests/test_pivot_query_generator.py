"""
Unit tests for pivot query generator

Tests SQL generation, validation, and performance estimation functionality.
"""

import pytest
from contextlib import contextmanager
from unittest.mock import Mock, patch

from core.services.pivot_query_generator import (
    generate_pivot_query_sql,
    validate_query_config,
    ValidationResult,
)
from core.services.table_metadata_service import (
    get_column_statistics,
    get_table_metadata,
)
from models.pivot_query_models import (
    PivotQueryConfig,
    FilterConfig,
    AggregationFunction,
    FilterOperator,
    ColumnStatistics,
    TableMetadata,
    PivotQueryMode,
    PivotConfig,
    PivotValueConfig,
)
from core.database.table_metadata_cache import table_metadata_cache


class TestPivotQueryModeGeneration:
    """Tests for the higher level pivot query SQL dispatcher"""

    def test_generate_pivot_query_sql_pivot_mode(self):
        config = PivotQueryConfig(
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

            result = generate_pivot_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.mode == PivotQueryMode.PIVOT
        assert "WITH base AS" in result.final_sql
        assert "PIVOT(" in result.final_sql or (result.pivot_sql and "PIVOT(" in result.pivot_sql)
        assert result.metadata.get("strategy") == "native"
        assert result.metadata.get("uses_pivot_extension") is False
        assert result.pivot_sql is not None

    def test_generate_pivot_query_sql_pivot_native_strategy(self):
        config = PivotQueryConfig(
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

            result = generate_pivot_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.mode == PivotQueryMode.PIVOT
        assert (
            " PIVOT(" in result.final_sql or " PIVOT(" in result.pivot_sql
            if result.pivot_sql
            else True
        )
        assert result.metadata.get("strategy") == "native"
        assert result.metadata.get("uses_pivot_extension") is False

    def test_generate_pivot_query_sql_pivot_native_with_totals(self):
        config = PivotQueryConfig(
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

            result = generate_pivot_query_sql(
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

    def test_generate_pivot_query_sql_pivot_extension_with_limit(self):
        config = PivotQueryConfig(
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
        mock_execute.fetchall.return_value = [("2022",), ("2023",)]

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

            result = generate_pivot_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.mode == PivotQueryMode.PIVOT
        assert result.metadata.get("strategy") == "native:auto_sampled"
        assert result.metadata.get("uses_pivot_extension") is False
        assert result.metadata.get("auto_sampled_values") == ["2022", "2023"]

    def test_generate_pivot_query_sql_pivot_mode_disabled(self):
        config = PivotQueryConfig(
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
            generate_pivot_query_sql(
                config,
                pivot_config=pivot_config,
                app_config=disabled_app_config,
            )


    def test_generate_pivot_query_sql_pivot_dynamic_strategy(self):
        """Test that dynamic pivot is used when no manual values provided and no limit set."""
        config = PivotQueryConfig(
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

            result = generate_pivot_query_sql(
                config,
                pivot_config=pivot_config,
            )

        assert result.mode == PivotQueryMode.PIVOT
        assert result.metadata.get("strategy") == "native:dynamic"
        assert result.metadata.get("uses_pivot_extension") is False
        assert "IN (" not in result.final_sql  # No explicit IN list
        assert "PIVOT" in result.final_sql

    def test_dynamic_pivot_sql_actually_executes(self):
        """回归: 动态透视曾生成 PIVOT(agg FOR col)（缺 IN 列表，DuckDB 语法错误）。
        动态列必须用简写语法 PIVOT base ON col USING agg。字符串断言拦不住语法错，
        故直接在真实 DuckDB 上执行生成的 SQL 验证。"""
        import duckdb

        config = PivotQueryConfig(table_name="sales", filters=[])
        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(column="revenue", aggregation=AggregationFunction.SUM)
            ],
        )

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )
            result = generate_pivot_query_sql(config, pivot_config=pivot_config)

        assert result.metadata.get("strategy") == "native:dynamic"
        conn = duckdb.connect()
        conn.execute(
            "CREATE TABLE sales(region VARCHAR, year VARCHAR, revenue INT);"
            "INSERT INTO sales VALUES('北京','2025',100),('北京','2026',200),('上海','2025',300)"
        )
        rows = conn.execute(result.final_sql).fetchall()
        # 北京: 2025=100, 2026=200; 上海: 2025=300, 2026=NULL
        assert sorted(rows) == [("上海", 300, None), ("北京", 100, 200)]

    def test_dynamic_pivot_with_grand_totals_degrades_with_warning(self):
        """回归: 动态透视+总计曾用猜测别名(sum_amount)注入 totals,引用执行期才存在的列
        → Binder Error。现应降级为不注入并给出 warning,生成的 SQL 必须可执行。"""
        import duckdb

        config = PivotQueryConfig(table_name="sales", filters=[])
        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(column="revenue", aggregation=AggregationFunction.SUM)
            ],
            include_grand_totals=True,
        )

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True,
                pivot_table_extension="pivot_table",
            )
            result = generate_pivot_query_sql(config, pivot_config=pivot_config)

        assert result.metadata.get("strategy") == "native:dynamic"
        assert any("Subtotals" in w or "totals" in w for w in result.warnings)
        conn = duckdb.connect()
        conn.execute(
            "CREATE TABLE sales(region VARCHAR, year VARCHAR, revenue INT);"
            "INSERT INTO sales VALUES('北京','2025',100),('上海','2025',300)"
        )
        rows = conn.execute(result.final_sql).fetchall()  # 不应抛 Binder Error
        assert len(rows) == 2

    def test_native_pivot_single_agg_totals_executes(self):
        """回归: 静态 pivot(manual_column_values)+ 总计 曾用错误别名
        ({agg}_{col}_{value}=sum_revenue_2022) 注入 totals,而 DuckDB 单聚合列名
        实为裸值 '2022' → Binder Error。字符串断言(现有 *_with_totals 用例)拦不住,
        故直接在真实 DuckDB 执行并校验总计值。"""
        import duckdb

        config = PivotQueryConfig(table_name="sales", filters=[])
        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(column="revenue", aggregation=AggregationFunction.SUM)
            ],
            manual_column_values=["2022", "2023"],
            include_grand_totals=True,
            strategy="native",
        )

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True, pivot_table_extension="pivot_table"
            )
            result = generate_pivot_query_sql(config, pivot_config=pivot_config)

        assert result.metadata.get("has_totals") is True
        conn = duckdb.connect()
        conn.execute(
            "CREATE TABLE sales(region VARCHAR, year VARCHAR, revenue INT);"
            "INSERT INTO sales VALUES('北京','2022',100),('北京','2023',200),"
            "('上海','2022',300),('上海','2023',50),('北京','2022',25)"
        )
        rows = conn.execute(result.final_sql).fetchall()  # 不应抛 Binder Error
        by_region = {r[0]: (r[1], r[2]) for r in rows}  # 列序: region, "2022", "2023"
        assert by_region["北京"] == (125, 200)
        assert by_region["上海"] == (300, 50)
        assert by_region["总计"] == (425, 250)  # 2022=125+300, 2023=200+50

    def test_native_pivot_multi_agg_totals_executes(self):
        """回归: 多聚合静态 pivot + 总计。DuckDB 多聚合列名为 {值}_{agg}({列})
        (如 2022_sum(revenue) / 2022_count(revenue)),别名推导必须精确匹配(含顺序:
        值外层、聚合内层)否则 Binder Error / 列错位。"""
        import duckdb

        config = PivotQueryConfig(table_name="sales", filters=[])
        pivot_config = PivotConfig(
            rows=["region"],
            columns=["year"],
            values=[
                PivotValueConfig(column="revenue", aggregation=AggregationFunction.SUM),
                PivotValueConfig(column="revenue", aggregation=AggregationFunction.COUNT),
            ],
            manual_column_values=["2022", "2023"],
            include_grand_totals=True,
            strategy="native",
        )

        with patch("core.services.pivot_query_generator.config_manager") as mock_manager:
            mock_manager.get_app_config.return_value = Mock(
                enable_pivot_tables=True, pivot_table_extension="pivot_table"
            )
            result = generate_pivot_query_sql(config, pivot_config=pivot_config)

        conn = duckdb.connect()
        conn.execute(
            "CREATE TABLE sales(region VARCHAR, year VARCHAR, revenue INT);"
            "INSERT INTO sales VALUES('北京','2022',100),('北京','2022',25),"
            "('北京','2023',200),('上海','2022',300),('上海','2023',50)"
        )
        rows = conn.execute(result.final_sql).fetchall()  # 不应抛 Binder Error
        # 列序: region, 2022_sum, 2022_count, 2023_sum, 2023_count
        by_region = {r[0]: tuple(r[1:]) for r in rows}
        assert by_region["北京"] == (125, 2, 200, 1)
        assert by_region["上海"] == (300, 1, 50, 1)
        assert by_region["总计"] == (425, 3, 250, 2)


class TestValidation:
    """Test query configuration validation"""

    def test_valid_configuration(self):
        """Test validation of valid pivot base configuration"""
        config = PivotQueryConfig(
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
        config = PivotQueryConfig.model_construct(
            table_name="",
            filters=[],
        )

        result = validate_query_config(config)

        assert result.is_valid is False
        assert any("empty" in err.lower() or "不能为空" in err for err in result.errors)

    def test_invalid_filter(self):
        """Test validation with invalid filter"""
        config = PivotQueryConfig.model_construct(
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
        config = PivotQueryConfig.model_construct(
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
        config = PivotQueryConfig(
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
        mock_con.execute.return_value.description = []

        # Mock DESCRIBE table result
        # 新取数形态：DESCRIBE/样本走 fetchall，统计/极值走 fetchone
        mock_con.execute.return_value.fetchall.side_effect = [
            [("test_column", "INTEGER")],  # DESCRIBE result
            [(1,), (2,), (3,), (4,), (5,)],  # Sample values
        ]
        mock_con.execute.return_value.fetchone.side_effect = [
            (1000, 950, 50, 100),  # Statistics result
            (1, 100, 50.5),  # Min/Max result
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
        mock_con.execute.return_value.description = []

        # Mock empty DESCRIBE result
        mock_con.execute.return_value.fetchall.return_value = []

        with pytest.raises(ValueError, match="does not exist in table"):
            get_column_statistics("test_table", "nonexistent", mock_con)


class TestTableMetadata:
    """Test table metadata functionality"""

    @patch("core.services.table_metadata_service.get_column_statistics")
    def test_get_table_metadata_success(self, mock_get_column_stats):
        """Test successful table metadata retrieval"""
        mock_con = Mock()
        mock_con.execute.return_value.description = []

        # Mock row count (fetchone) 与列信息 (fetchall)
        mock_con.execute.return_value.fetchone.return_value = (1000,)
        mock_con.execute.return_value.fetchall.return_value = [
            ("col1", "INTEGER"),
            ("col2", "VARCHAR"),
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
        mock_con.execute.return_value.description = []

        mock_con.execute.return_value.fetchone.return_value = (50,)
        mock_con.execute.return_value.fetchall.return_value = [("col1", "INTEGER")]

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
