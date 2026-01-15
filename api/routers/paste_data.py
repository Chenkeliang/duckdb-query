import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.database.duckdb_engine import with_duckdb_connection
from core.data.file_datasource_manager import (
    build_table_metadata_snapshot,
    file_datasource_manager,
)
from core.common.timezone_utils import get_current_time_iso  # 导入时区工具

router = APIRouter()
logger = logging.getLogger(__name__)


class PasteDataRequest(BaseModel):
    table_name: str
    column_names: List[str]
    column_types: List[str]
    data_rows: List[List[str]]
    delimiter: str = ","
    has_header: bool = False


BOOL_TRUE_VALUES = {"true", "t", "1", "yes", "y"}
BOOL_FALSE_VALUES = {"false", "f", "0", "no", "n"}


def _clean_cell_value(value: Any) -> Optional[str]:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    if text.lower() == "null":
        return None

    if len(text) >= 2 and ((text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'"))):
        text = text[1:-1].strip()

    return text or None


def _sanitize_table_name(table_name: str) -> str:
    filtered = "".join(c for c in table_name if c.isalnum() or c in ("_", "-")).strip()
    if filtered:
        return filtered
    return f"pasted_table_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"


def _quote_identifier(identifier: str) -> str:
    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


def _build_column_expression(source_alias: str, column_name: str, column_type: str) -> str:
    safe_alias = _quote_identifier(column_name)
    source_column = f"{source_alias}.{_quote_identifier(column_name)}"
    source_text = f"CAST({source_column} AS VARCHAR)"
    trimmed = f"NULLIF(TRIM({source_text}), '')"
    normalized_type = (column_type or "VARCHAR").upper()

    if normalized_type == "INTEGER":
        return f"COALESCE(TRY_CAST({trimmed} AS BIGINT), 0) AS {safe_alias}"
    if normalized_type == "DOUBLE":
        return f"COALESCE(TRY_CAST({trimmed} AS DOUBLE), 0.0) AS {safe_alias}"
    if normalized_type == "DATE":
        return f"TRY_CAST({trimmed} AS TIMESTAMP) AS {safe_alias}"
    if normalized_type == "BOOLEAN":
        normalized = f"LOWER({trimmed})"
        true_values = ", ".join(f"'{value}'" for value in sorted(BOOL_TRUE_VALUES))
        false_values = ", ".join(f"'{value}'" for value in sorted(BOOL_FALSE_VALUES))
        return (
            "CASE "
            f"WHEN {normalized} IN ({true_values}) THEN TRUE "
            f"WHEN {normalized} IN ({false_values}) THEN FALSE "
            f"WHEN {normalized} IS NULL THEN FALSE "
            "ELSE FALSE END AS "
            f"{safe_alias}"
        )

    # 默认作为字符串处理，保持兼容行为
    return f"COALESCE(TRIM({source_text}), '') AS {safe_alias}"


def _persist_pasted_dataframe(
    connection,
    table_name: str,
    dataframe: pd.DataFrame,
    column_definitions: List[Tuple[str, str]],
) -> Dict[str, Any]:
    temp_view = f"paste_input_{uuid4().hex[:8]}"
    source_alias = "src"
    connection.register(temp_view, dataframe)

    quoted_temp_view = _quote_identifier(temp_view)
    select_list = [
        _build_column_expression(source_alias, name, col_type)
        for name, col_type in column_definitions
    ]
    select_sql = ", ".join(select_list)
    quoted_table = _quote_identifier(table_name)
    create_sql = (
        f"CREATE TABLE {quoted_table} AS "
        f"SELECT {select_sql} FROM {quoted_temp_view} AS {source_alias}"
    )

    connection.execute("BEGIN TRANSACTION")
    try:
        connection.execute(f"DROP TABLE IF EXISTS {quoted_table}")
        connection.execute(create_sql)
        connection.execute("COMMIT")
    except Exception:
        connection.execute("ROLLBACK")
        raise
    finally:
        try:
            connection.unregister(temp_view)
        except Exception as exc:
            logger.debug("释放粘贴数据临时视图失败: %s (%s)", temp_view, exc)

    return build_table_metadata_snapshot(connection, table_name)


@router.post("/api/paste-data", tags=["Data Sources"])
async def save_paste_data(request: PasteDataRequest):
    """
    保存粘贴的数据到DuckDB
    """
    try:
        logger.info(f"开始处理粘贴数据保存请求，表名: {request.table_name}")

        # 验证输入
        if not request.table_name.strip():
            raise HTTPException(status_code=400, detail="表名不能为空")

        if not request.column_names:
            raise HTTPException(status_code=400, detail="列名不能为空")

        if not request.data_rows:
            raise HTTPException(status_code=400, detail="数据不能为空")

        if len(request.column_names) != len(request.column_types):
            raise HTTPException(status_code=400, detail="列名和列类型数量不匹配")

        # 验证数据行列数一致性
        expected_columns = len(request.column_names)
        for i, row in enumerate(request.data_rows):
            if len(row) != expected_columns:
                raise HTTPException(
                    status_code=400,
                    detail=f"第 {i+1} 行数据列数 ({len(row)}) 与预期列数 ({expected_columns}) 不匹配",
                )

        cleaned_rows = [
            [_clean_cell_value(value) for value in row]
            for row in request.data_rows
        ]
        df = pd.DataFrame(cleaned_rows, columns=request.column_names)

        clean_table_name = _sanitize_table_name(request.table_name)
        column_definitions: List[Tuple[str, str]] = list(
            zip(request.column_names, request.column_types)
        )

        if not column_definitions:
            raise HTTPException(status_code=400, detail="列配置不能为空")

        with with_duckdb_connection() as connection:
            metadata = _persist_pasted_dataframe(
                connection, clean_table_name, df, column_definitions
            )

        saved_rows = metadata.get("row_count", len(df))
        logger.info(
            "成功保存粘贴数据到表: %s, 行数: %s, 列数: %s",
            clean_table_name,
            saved_rows,
            len(request.column_names),
        )

        created_at_value = get_current_time_iso()

        metadata_payload = {
            "source_id": clean_table_name,
            "filename": f"{clean_table_name}.pasted",
            "file_path": "pasted_data",
            "file_type": "pasted",
            "row_count": saved_rows,
            "column_count": metadata.get("column_count", len(request.column_names)),
            "columns": metadata.get("columns", request.column_names),
            "column_profiles": metadata.get("column_profiles"),
            "schema_version": metadata.get("schema_version", 2),
            "created_at": created_at_value,
        }

        try:
            file_datasource_manager.save_file_datasource(metadata_payload)
            logger.info(f"成功刷新粘贴数据的元数据: {clean_table_name}")
        except Exception as exc:
            logger.warning(f"刷新粘贴数据的元数据失败: {exc}")

        return {
            "success": True,
            "message": f"数据已成功保存到表: {clean_table_name}",
            "table_name": clean_table_name,
            "rows_saved": saved_rows,
            "columns_count": metadata.get("column_count", len(request.column_names)),
            "column_info": [
                {"name": name, "type": type_}
                for name, type_ in column_definitions
            ],
            "created_at": created_at_value,
            "createdAt": created_at_value,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"保存粘贴数据失败: {str(e)}")
        logger.error(
            f"请求数据: table_name={request.table_name}, columns={len(request.column_names)}, rows={len(request.data_rows)}"
        )
        raise HTTPException(status_code=500, detail=f"保存数据失败: {str(e)}")
