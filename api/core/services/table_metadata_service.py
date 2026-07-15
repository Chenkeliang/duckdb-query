# pylint: disable=duplicate-code
"""DuckDB table/column metadata for schema browsers."""

import json
import logging
import math
from typing import List, Optional

from models.pivot_query_models import ColumnStatistics, TableMetadata
from core.database.duckdb_engine import fetch_query_dataframe
from core.database.table_metadata_cache import table_metadata_cache

logger = logging.getLogger(__name__)


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

        # 前缀匹配：DESCRIBE 返回的是 DECIMAL(38,2) 这类带参数的完整类型名
        if str(data_type).upper().startswith(
            (
                "INTEGER",
                "BIGINT",
                "SMALLINT",
                "TINYINT",
                "HUGEINT",
                "UBIGINT",
                "UINTEGER",
                "USMALLINT",
                "UTINYINT",
                "DOUBLE",
                "FLOAT",
                "REAL",
                "DECIMAL",
                "NUMERIC",
            )
        ):
            minmax_sql = f"""
            SELECT
                MIN("{column_name}") as min_val,
                MAX("{column_name}") as max_val,
                AVG(CAST("{column_name}" AS DOUBLE)) as avg_val
            FROM "{table_name}"
            WHERE "{column_name}" IS NOT NULL
            """
            minmax_df = fetch_query_dataframe(con, minmax_sql)
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
        sample_df = fetch_query_dataframe(con, sample_sql)
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
        import decimal as _decimal
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

        def safe_number(val):
            """DECIMAL 的 min/max 以精确十进制字符串返回，其余走 float。"""
            if isinstance(val, _decimal.Decimal):
                return str(val) if val.is_finite() else None
            return safe_float(val)

        return ColumnStatistics(
            column_name=column_name,
            data_type=data_type,
            null_count=int(stats_row["null_count"]),
            distinct_count=int(stats_row["distinct_count"]),
            min_value=safe_number(min_value),
            max_value=safe_number(max_value),
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
