"""
统一文件入湖编排：上传 / 分块 / 服务器 / URL / Excel pending。

Router 层负责 HTTP、鉴权、落盘；本模块负责 DuckDB 建表与 file_datasource 元数据。
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from uuid import uuid4

import duckdb

from core.common.timezone_utils import get_current_time_iso
from core.data.excel_import_manager import (
    PendingExcelFile,
    cleanup_pending_excel,
    derive_default_table_name,
    get_pending_excel,
    inspect_excel_sheets,
    load_excel_sheet_dataframe,
    register_excel_upload,
    sanitize_identifier,
)
from core.data.file_datasource_manager import (
    _quote_identifier,
    create_table_from_dataframe,
    create_table_from_file_path_typed,
    create_typed_table_from_dataframe,
    file_datasource_manager,
)
from core.data.file_utils import detect_file_type
from core.data.import_mode import (
    normalize_import_mode,
    resolve_import_mode,
    should_promote_column_types,
)
from core.data.ingestion_precision import promote_table_column_types_from_varchar

logger = logging.getLogger(__name__)


@dataclass
class TabularIngestResult:
    table_name: str
    row_count: int
    column_count: int
    columns: List[Any]
    column_profiles: List[Any] = field(default_factory=list)
    file_type: str = ""


@dataclass
class ExcelPendingPayload:
    file_id: str
    original_filename: str
    file_size: int
    table_alias: Optional[str]
    default_table_prefix: str
    uploaded_at: str

    def to_api_dict(self) -> Dict[str, Any]:
        return {
            "file_id": self.file_id,
            "original_filename": self.original_filename,
            "file_size": self.file_size,
            "table_alias": self.table_alias,
            "uploaded_at": self.uploaded_at,
            "default_table_prefix": self.default_table_prefix,
        }


def resolve_unique_table_name(
    con: duckdb.DuckDBPyConnection,
    desired_name: Optional[str],
    *,
    user_provided: bool = False,
    prefix: str = "table",
) -> str:
    base_name = desired_name or "table"
    sanitized = sanitize_identifier(
        base_name, allow_leading_digit=user_provided, prefix=prefix
    )
    if not sanitized:
        sanitized = f"{prefix}_{int(time.time())}"

    original = sanitized
    while True:
        try:
            result = con.execute(
                "SELECT 1 FROM information_schema.tables WHERE lower(table_name) = lower(?)",
                [sanitized],
            ).fetchone()
            if result is None:
                break
            timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
            sanitized = f"{original}_{timestamp}"
            break
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug("Table name conflict check failed: %s", exc)
            break
    return sanitized


def build_file_metadata(
    *,
    source_id: str,
    filename: str,
    file_path: str,
    file_type: str,
    table_metadata: Dict[str, Any],
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    payload = {
        "source_id": source_id,
        "filename": filename,
        "file_path": file_path,
        "file_type": file_type,
        "row_count": table_metadata.get("row_count", 0),
        "column_count": table_metadata.get("column_count", 0),
        "columns": table_metadata.get("columns", []),
        "column_profiles": table_metadata.get("column_profiles", []),
        "schema_version": 2,
        "created_at": get_current_time_iso(),
    }
    if extra:
        payload.update(extra)
    return payload


def save_file_metadata(metadata: Dict[str, Any]) -> bool:
    return file_datasource_manager.save_file_datasource(metadata)


def ingest_tabular_file(
    con: duckdb.DuckDBPyConnection,
    file_path: str,
    file_type: str,
    table_alias: Optional[str] = None,
    import_mode: str = "auto",
    *,
    filename_for_meta: Optional[str] = None,
    persist_path: Optional[str] = None,
    reader_options: Optional[Dict[str, Any]] = None,
) -> TabularIngestResult:
    """将 CSV/JSON/Parquet 等文件载入 DuckDB 并写入 file_datasource 元数据。"""
    import_mode = resolve_import_mode(import_mode, file_type=file_type)
    desired = table_alias or os.path.splitext(
        os.path.basename(file_path)
    )[0]
    table_name = resolve_unique_table_name(
        con, desired, user_provided=bool(table_alias)
    )

    meta = create_table_from_dataframe(
        con,
        table_name,
        file_path,
        file_type,
        reader_options=reader_options,
        import_mode=import_mode,
    )

    file_info = build_file_metadata(
        source_id=table_name,
        filename=filename_for_meta or os.path.basename(file_path),
        file_path=persist_path or file_path,
        file_type=file_type,
        table_metadata=meta,
    )
    save_file_metadata(file_info)

    return TabularIngestResult(
        table_name=table_name,
        row_count=meta.get("row_count", 0),
        column_count=meta.get("column_count", 0),
        columns=meta.get("columns", []),
        column_profiles=meta.get("column_profiles", []),
        file_type=file_type,
    )


def prepare_excel_pending(
    source_path: str,
    original_filename: str,
    table_alias: Optional[str] = None,
) -> ExcelPendingPayload:
    pending: PendingExcelFile = register_excel_upload(
        source_path, original_filename, table_alias
    )
    return ExcelPendingPayload(
        file_id=pending.file_id,
        original_filename=pending.original_filename,
        file_size=pending.file_size,
        table_alias=pending.table_alias,
        default_table_prefix=pending.default_table_prefix,
        uploaded_at=pending.uploaded_at,
    )


def inspect_pending_excel(file_id: str) -> Dict[str, Any]:
    pending = get_pending_excel(file_id)
    if not pending:
        raise ValueError(f"Excel file not found or expired: {file_id}")

    sheets_info = inspect_excel_sheets(pending.stored_path)
    for sheet in sheets_info:
        sheet["default_table_name"] = derive_default_table_name(
            pending.default_table_prefix, sheet["name"]
        )
    return {
        "file_id": pending.file_id,
        "original_filename": pending.original_filename,
        "table_alias": pending.table_alias,
        "default_table_prefix": pending.default_table_prefix,
        "sheets": sheets_info,
    }


def inspect_excel_at_path(
    file_path: str,
    table_alias: Optional[str] = None,
) -> Dict[str, Any]:
    sheets = inspect_excel_sheets(file_path)
    base_name = table_alias or os.path.splitext(os.path.basename(file_path))[0]
    default_prefix = sanitize_identifier(
        base_name,
        allow_leading_digit=bool(table_alias),
        prefix="table",
    )
    for sheet in sheets:
        sheet["default_table_name"] = derive_default_table_name(
            default_prefix, sheet["name"]
        )
    return {
        "default_table_prefix": default_prefix,
        "sheets": sheets,
        "file_extension": detect_file_type(file_path),
    }


def _table_exists(con: duckdb.DuckDBPyConnection, table_name: str) -> bool:
    try:
        result = con.execute(
            "SELECT 1 FROM information_schema.tables WHERE lower(table_name) = lower(?)",
            [table_name],
        ).fetchone()
        return result is not None
    except Exception:
        return False


def _fetch_existing_columns(con: duckdb.DuckDBPyConnection, table_name: str) -> List[str]:
    rows = con.execute(
        f"PRAGMA table_info({_quote_identifier(table_name)})"
    ).fetchall()
    return [row[1] for row in rows]


def import_pending_excel_sheets(
    con: duckdb.DuckDBPyConnection,
    file_id: str,
    sheet_configs: List[Any],
    import_mode: str = "auto",
) -> List[Dict[str, Any]]:
    """导入已上传 pending Excel 的多个工作表。sheet_configs 为 Pydantic 模型列表。"""
    normalize_import_mode(import_mode)
    pending = get_pending_excel(file_id)
    if not pending:
        raise ValueError(f"Excel file not found or expired: {file_id}")

    processed: List[Dict[str, Any]] = []
    for sheet_config in sheet_configs:
        try:
            target_table = sanitize_identifier(
                sheet_config.target_table,
                allow_leading_digit=True,
                prefix="table",
            )
            exists = _table_exists(con, target_table)
            mode = sheet_config.mode.lower()
            if exists and mode == "fail":
                processed.append({
                    "sheet_name": sheet_config.name,
                    "target_table": target_table,
                    "success": False,
                    "message": f"Table {target_table} already exists",
                })
                continue

            effective_header_row = (
                None
                if sheet_config.header_rows == 0
                else sheet_config.header_row_index
            )
            df = load_excel_sheet_dataframe(
                pending.stored_path,
                sheet_config.name,
                header_rows=sheet_config.header_rows,
                header_row_index=effective_header_row,
                fill_merged=sheet_config.fill_merged,
                import_mode=import_mode,
            )

            if df.empty:
                processed.append({
                    "sheet_name": sheet_config.name,
                    "target_table": target_table,
                    "success": False,
                    "message": f"Sheet '{sheet_config.name}' contains no data",
                })
                continue

            quoted = _quote_identifier(target_table)
            if exists and mode == "append":
                existing_cols = _fetch_existing_columns(con, target_table)
                insert_cols = [c for c in df.columns if c in existing_cols]
                if not insert_cols:
                    processed.append({
                        "sheet_name": sheet_config.name,
                        "target_table": target_table,
                        "success": False,
                        "message": "No overlapping columns between sheet and existing table",
                    })
                    continue
                df_insert = df[insert_cols]
                temp_view = f"__excel_tmp_{uuid4().hex}"
                con.register(temp_view, df_insert)
                cols_list = ", ".join(_quote_identifier(c) for c in insert_cols)
                insert_sql = (
                    f"INSERT INTO {quoted} ({cols_list}) "
                    f"SELECT {cols_list} FROM {temp_view}"
                )
                con.execute(insert_sql)
                con.unregister(temp_view)
                row_count = len(df_insert)
            else:
                if exists and mode == "replace":
                    con.execute(f"DROP TABLE IF EXISTS {quoted}")
                temp_view = f"__excel_tmp_{uuid4().hex}"
                con.register(temp_view, df)
                con.execute(f"CREATE TABLE {quoted} AS SELECT * FROM {temp_view}")
                con.unregister(temp_view)
                row_count = len(df)
                if should_promote_column_types(import_mode):
                    promote_table_column_types_from_varchar(con, target_table)

            file_info = build_file_metadata(
                source_id=target_table,
                filename=pending.original_filename,
                file_path=pending.stored_path,
                file_type="excel",
                table_metadata={
                    "row_count": row_count,
                    "column_count": len(df.columns),
                    "columns": list(df.columns),
                },
                extra={"sheet_name": sheet_config.name},
            )
            save_file_metadata(file_info)

            processed.append({
                "sheet_name": sheet_config.name,
                "target_table": target_table,
                "success": True,
                "row_count": row_count,
                "column_count": len(df.columns),
                "mode": mode,
            })
        except Exception as sheet_error:
            logger.error("Failed to import sheet %s: %s", sheet_config.name, sheet_error)
            processed.append({
                "sheet_name": sheet_config.name,
                "target_table": getattr(sheet_config, "target_table", ""),
                "success": False,
                "message": str(sheet_error),
            })

    cleanup_pending_excel(file_id)
    return processed


def ingest_server_tabular(
    con: duckdb.DuckDBPyConnection,
    real_path: str,
    table_alias: Optional[str],
    import_mode: str = "auto",
) -> TabularIngestResult:
    file_type = detect_file_type(real_path)
    import_mode = resolve_import_mode(import_mode, file_type=file_type)
    table_name = sanitize_identifier(
        table_alias or os.path.splitext(os.path.basename(real_path))[0],
        allow_leading_digit=bool(table_alias),
        prefix="table",
    )
    meta = create_table_from_file_path_typed(
        con, table_name, real_path, file_type, import_mode=import_mode
    )
    return TabularIngestResult(
        table_name=table_name,
        row_count=meta.get("row_count", 0),
        column_count=meta.get("column_count", 0),
        columns=meta.get("columns", []),
        column_profiles=meta.get("column_profiles", []),
        file_type=file_type,
    )
