# pylint: disable=duplicate-code
"""DuckDB table/column metadata for schema browsers."""

import json
import logging
import math
from typing import List, Optional

from models.pivot_query_models import ColumnStatistics, TableMetadata
from core.common.duckdb_types import is_numeric_type
from core.common.sql_identifiers import quote_identifier
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


def get_column_statistics(
    table_name: str, column_name: str, con, data_type: str = None
) -> ColumnStatistics:
    """
    Get statistics for a specific column

    Args:
        table_name: Name of the table
        column_name: Name of the column
        con: DuckDB connection
        data_type: 列类型;调用方(如 get_table_metadata)已有 DESCRIBE 结果时传入,
            避免逐列重复 DESCRIBE(Codex S-16 的 N+1 之一)。缺省时本函数自行 DESCRIBE。

    Returns:
        ColumnStatistics object with column metadata
    """
    try:
        if data_type is None:
            describe_rows = con.execute(
                f"DESCRIBE {quote_identifier(table_name)}"
            ).fetchall()
            # DESCRIBE 行首两列固定为 column_name / column_type
            data_type = next(
                (row[1] for row in describe_rows if str(row[0]) == column_name), None
            )
            if data_type is None:
                raise ValueError(
                    f"Column '{column_name}' does not exist in table '{table_name}'"
                )

        qt = quote_identifier(table_name)
        qc = quote_identifier(column_name)

        # count 类统计 + (数值列)min/max/avg 合并为一次全表扫描(原来是两条)
        numeric = is_numeric_type(str(data_type))
        min_value = max_value = avg_value = None
        if numeric:
            stats_sql = (
                f"SELECT COUNT(*), COUNT({qc}), COUNT(*) - COUNT({qc}), "
                f"COUNT(DISTINCT {qc}), MIN({qc}), MAX({qc}), "
                f"AVG(CAST({qc} AS DOUBLE)) FROM {qt}"
            )
            row = con.execute(stats_sql).fetchone()
            (total_count, non_null_count, null_count, distinct_count,
             min_value, max_value, avg_value) = row
        else:
            stats_sql = (
                f"SELECT COUNT(*), COUNT({qc}), COUNT(*) - COUNT({qc}), "
                f"COUNT(DISTINCT {qc}) FROM {qt}"
            )
            total_count, non_null_count, null_count, distinct_count = con.execute(
                stats_sql
            ).fetchone()

        # Get sample values
        column_ref = qc
        is_complex_type = any(
            marker in str(data_type).upper()
            for marker in ["STRUCT", "MAP", "LIST", "ARRAY", "JSON"]
        )
        sample_expr = f"to_json({column_ref})" if is_complex_type else column_ref
        sample_sql = f"""
        SELECT DISTINCT {sample_expr} AS sample_value
        FROM {qt}
        WHERE {qc} IS NOT NULL
        LIMIT 10
        """
        sample_rows = con.execute(sample_sql).fetchall()
        sample_values = []
        for (val,) in sample_rows:
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
            null_count=int(null_count),
            distinct_count=int(distinct_count),
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
        row_count = con.execute(count_sql).fetchone()[0]

        # Get column information（DESCRIBE 行首两列固定为 column_name / column_type）
        columns_sql = f'DESCRIBE "{table_name}"'
        describe_rows = con.execute(columns_sql).fetchall()

        column_stats = []
        for column_row in describe_rows:
            column_name = str(column_row[0])
            try:
                # 复用外层 DESCRIBE 得到的列类型,避免逐列再 DESCRIBE(S-16)
                stats = get_column_statistics(
                    table_name, column_name, con, data_type=str(column_row[1])
                )
                column_stats.append(stats)
            except Exception as e:
                logger.warning(
                    f"Failed to get stats for column {column_name}: {str(e)}"
                )
                # Create basic stats if detailed stats fail
                column_stats.append(
                    ColumnStatistics(
                        column_name=column_name,
                        data_type=str(column_row[1]),
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
