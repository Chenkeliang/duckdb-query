"""
统一文件入湖编排：上传 / 分块 / 服务器 / URL / Excel pending。

Router 层负责 HTTP、鉴权、落盘；本模块负责 DuckDB 建表与 file_datasource 元数据。
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

import duckdb

from core.common.timezone_utils import get_current_time_iso
from core.data.rows_ingest import load_rows_as_varchar_table
from core.data.excel_import_manager import (
    PendingExcelFile,
    cleanup_pending_excel,
    derive_default_table_name,
    get_pending_excel,
    inspect_excel_sheets,
    load_excel_sheet_rows,
    register_excel_upload,
    sanitize_identifier,
)
from core.data.file_datasource_manager import (
    _quote_identifier,
    create_table_from_dataframe,
    create_table_from_file_path_typed,
    file_datasource_manager,
)
from core.data.file_utils import detect_file_type
from core.data.import_mode import (
    normalize_import_mode,
    resolve_import_mode,
    should_promote_column_types,
    use_all_varchar_on_load,
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
    suffix = 0
    while True:
        try:
            result = con.execute(
                "SELECT 1 FROM information_schema.tables WHERE lower(table_name) = lower(?)",
                [sanitized],
            ).fetchone()
            if result is None:
                break
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.debug("Table name conflict check failed: %s", exc)
            break
        suffix += 1
        if suffix > 1000:
            raise ValueError(
                f"Cannot resolve a unique table name for '{original}' after 1000 attempts"
            )
        sanitized = f"{original}_{suffix}"
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


def _dedupe_default_table_names(sheets: List[Dict[str, Any]]) -> None:
    """批内去重：不同 sheet 归一化后可能撞出相同的 default_table_name（如
    "Sheet 1" / "Sheet-1" / "Sheet_1"），重复的从第二个起追加 _1/_2/_3。"""
    used: set = set()
    for sheet in sheets:
        name = sheet["default_table_name"]
        if name not in used:
            used.add(name)
            continue
        suffix = 1
        candidate = f"{name}_{suffix}"
        while candidate in used:
            suffix += 1
            candidate = f"{name}_{suffix}"
        sheet["default_table_name"] = candidate
        used.add(candidate)


def inspect_pending_excel(file_id: str) -> Dict[str, Any]:
    pending = get_pending_excel(file_id)
    if not pending:
        raise ValueError(f"Excel file not found or expired: {file_id}")

    sheets_info = inspect_excel_sheets(pending.stored_path)
    for sheet in sheets_info:
        sheet["default_table_name"] = derive_default_table_name(
            pending.default_table_prefix, sheet["name"]
        )
    _dedupe_default_table_names(sheets_info)
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
    _dedupe_default_table_names(sheets)
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


class ExcelSheetImportError(RuntimeError):
    """`stop_on_first_error=True` 时，某个 sheet 导入失败会抛出此异常。"""

    def __init__(self, sheet_name: str, message: str):
        self.sheet_name = sheet_name
        self.message = message
        super().__init__(message)


class _SheetSkip(Exception):
    """内部控制流：某个 sheet 因业务规则（撞名 fail / 无数据 / 无重叠列）需要跳过。"""


def _should_use_duckdb_native(
    file_ext: str, header_row_index: Optional[int], fill_merged: bool
) -> bool:
    """判断某 sheet 是否适合走 DuckDB `read_xlsx` 原生导入（比 pandas 更快）。

    注意: header_row_index 是 1-based（第一行=1）
    """
    if file_ext.lower() == "xls":  # .xls 只能用 pandas (xlrd 引擎)
        return False
    if header_row_index is not None and header_row_index > 1:
        # 非首行表头只能用 pandas (DuckDB 只支持 header=true/false)
        return False
    if fill_merged:  # 需要合并单元格填充只能用 pandas
        return False
    return True


def _import_sheet_via_rows(
    con,
    file_path: str,
    sheet_config,
    target_table: str,
    effective_header_row,
    *,
    append_into_existing: bool,
    import_mode,
):
    """行式 sheet 导入：忠实文本入临时表 → 建表促升 / 交集列追加。

    与 CSV 摄取铁律同一路径（all_varchar + 可证无损促升）。返回 (行数, 列名)。
    """
    header, data_rows = load_excel_sheet_rows(
        file_path,
        sheet_config.name,
        header_rows=sheet_config.header_rows,
        header_row_index=effective_header_row,
        fill_merged=sheet_config.fill_merged,
    )
    if not data_rows:
        raise _SheetSkip(f"Sheet '{sheet_config.name}' contains no data")

    quoted = _quote_identifier(target_table)
    temp_table, cleanup_rows = load_rows_as_varchar_table(con, header, data_rows)
    try:
        quoted_temp = _quote_identifier(temp_table)
        if append_into_existing:
            existing_cols = _fetch_existing_columns(con, target_table)
            insert_cols = [c for c in header if c in existing_cols]
            if not insert_cols:
                raise _SheetSkip(
                    "No overlapping columns between sheet and existing table"
                )
            cols_list = ", ".join(_quote_identifier(c) for c in insert_cols)
            con.execute(
                f"INSERT INTO {quoted} ({cols_list}) "
                f"SELECT {cols_list} FROM {quoted_temp}"
            )
            return len(data_rows), insert_cols

        con.execute(
            f"CREATE OR REPLACE TABLE {quoted} AS SELECT * FROM {quoted_temp}"
        )
        if should_promote_column_types(import_mode):
            promote_table_column_types_from_varchar(con, target_table)
        row_count = con.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
        columns = [row[0] for row in con.execute(f"DESCRIBE {quoted}").fetchall()]
        return row_count, columns
    finally:
        cleanup_rows()


def import_excel_sheets(
    con: duckdb.DuckDBPyConnection,
    file_path: str,
    sheet_configs: List[Any],
    import_mode: str = "auto",
    *,
    engine: str = "pandas",
    stop_on_first_error: bool = False,
    on_sheet_imported: Optional[Callable[[Any, Dict[str, Any]], None]] = None,
) -> List[Dict[str, Any]]:
    """把一个 Excel 文件的多个工作表导入 DuckDB。

    这是 import_pending_excel_sheets（pending 文件）与 import_server_excel（服务器路径）
    共用的核心：mode（create/replace/append/fail）语义、撞名去重（resolve_unique_table_name）
    只在这里实现一次。

    engine:
        "pandas"       — 始终用 pandas 读取 sheet（import_pending_excel_sheets 的历史行为）。
        "duckdb_native" — 满足条件（xlsx + 首行表头 + 无合并单元格 + 非 append-into-existing）
                          时优先尝试 DuckDB `read_xlsx`，失败或不满足条件回退 pandas
                          （import_server_excel 的历史行为）。
    stop_on_first_error:
        False — 单个 sheet 失败记为 success=False 并继续处理下一个（pending 路径历史行为）。
        True  — 单个 sheet 失败立即抛出 ExcelSheetImportError，不再处理后续 sheet
                （server-files 路径历史行为）。
    on_sheet_imported:
        每个 sheet 成功写入表后调用一次，用于落盘各自形态的 file_datasource 元数据；
        抛出的异常会被当作这个 sheet 的失败处理（呼应 import_pending_excel_sheets 原有的
        “元数据保存失败也算 sheet 失败”行为）。
    """
    normalize_import_mode(import_mode)
    file_ext = detect_file_type(file_path)

    results: List[Dict[str, Any]] = []
    for sheet_config in sheet_configs:
        target_table = ""
        try:
            target_table = sanitize_identifier(
                sheet_config.target_table,
                allow_leading_digit=True,
                prefix="table",
            )
            exists = _table_exists(con, target_table)
            mode = (sheet_config.mode or "create").lower()
            if mode == "create" and exists:
                # 撞名（库内已存在，或本批前面的 sheet 刚建的表）→ 自动加 _1/_2/_3 后缀，
                # 不再静默覆盖也不报错。resolve_unique_table_name 复查 information_schema，
                # 天然覆盖同批顺序创建的表。
                target_table = resolve_unique_table_name(
                    con, target_table, user_provided=True
                )
                exists = False
            elif exists and mode == "fail":
                raise _SheetSkip(f"Table {target_table} already exists")

            effective_header_row = (
                None
                if sheet_config.header_rows == 0
                else sheet_config.header_row_index
            )

            import_engine_used = "pandas"
            row_count = 0
            columns: List[str] = []

            use_native = (
                engine == "duckdb_native"
                and not (exists and mode == "append")
                and _should_use_duckdb_native(
                    file_ext, sheet_config.header_row_index, sheet_config.fill_merged
                )
            )

            if use_native:
                try:
                    logger.info(
                        "Attempting to import worksheet using DuckDB: %s", sheet_config.name
                    )
                    con.execute("INSTALL excel")
                    con.execute("LOAD excel")
                    all_varchar_clause = (
                        ", all_varchar = true" if use_all_varchar_on_load(import_mode) else ""
                    )
                    quoted = _quote_identifier(target_table)
                    con.execute(
                        f"CREATE OR REPLACE TABLE {quoted} AS "
                        f"SELECT * FROM read_xlsx('{file_path}', "
                        f"sheet='{sheet_config.name}', header=true{all_varchar_clause})"
                    )
                    if should_promote_column_types(import_mode):
                        promote_table_column_types_from_varchar(con, target_table)
                    row_count = con.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
                    columns = [row[0] for row in con.execute(f"DESCRIBE {quoted}").fetchall()]
                    import_engine_used = "duckdb"
                    logger.info(
                        "DuckDB import successful: %s, row count: %d", target_table, row_count
                    )
                except Exception as native_exc:  # pylint: disable=broad-exception-caught
                    logger.warning(
                        "DuckDB import failed, falling back to pandas: %s", native_exc
                    )
                    use_native = False

            if not use_native:
                row_count, columns = _import_sheet_via_rows(
                    con,
                    file_path,
                    sheet_config,
                    target_table,
                    effective_header_row,
                    append_into_existing=(exists and mode == "append"),
                    import_mode=import_mode,
                )
                import_engine_used = "rows"

            column_count = len(columns)
            outcome = {
                "sheet_name": sheet_config.name,
                "target_table": target_table,
                "row_count": row_count,
                "column_count": column_count,
                "columns": columns,
                "mode": mode,
                "import_engine": import_engine_used,
            }

            if on_sheet_imported is not None:
                on_sheet_imported(sheet_config, outcome)

            results.append({**outcome, "success": True})
        except _SheetSkip as skip:
            if stop_on_first_error:
                raise ExcelSheetImportError(sheet_config.name, str(skip)) from skip
            results.append({
                "sheet_name": sheet_config.name,
                "target_table": target_table,
                "success": False,
                "message": str(skip),
            })
        except Exception as sheet_error:  # pylint: disable=broad-exception-caught
            logger.error("Failed to import sheet %s: %s", sheet_config.name, sheet_error)
            if stop_on_first_error:
                raise ExcelSheetImportError(sheet_config.name, str(sheet_error)) from sheet_error
            results.append({
                "sheet_name": sheet_config.name,
                "target_table": target_table or getattr(sheet_config, "target_table", ""),
                "success": False,
                "message": str(sheet_error),
            })

    return results


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

    def _save_metadata(sheet_config: Any, outcome: Dict[str, Any]) -> None:
        file_info = build_file_metadata(
            source_id=outcome["target_table"],
            filename=pending.original_filename,
            file_path=pending.stored_path,
            file_type="excel",
            table_metadata={
                "row_count": outcome["row_count"],
                "column_count": outcome["column_count"],
                "columns": outcome["columns"],
            },
            extra={"sheet_name": sheet_config.name},
        )
        save_file_metadata(file_info)

    outcomes = import_excel_sheets(
        con,
        pending.stored_path,
        sheet_configs,
        import_mode=import_mode,
        engine="pandas",
        stop_on_first_error=False,
        on_sheet_imported=_save_metadata,
    )

    processed: List[Dict[str, Any]] = []
    for outcome in outcomes:
        if outcome["success"]:
            processed.append({
                "sheet_name": outcome["sheet_name"],
                "target_table": outcome["target_table"],
                "success": True,
                "row_count": outcome["row_count"],
                "column_count": outcome["column_count"],
                "mode": outcome["mode"],
            })
        else:
            processed.append(outcome)

    cleanup_pending_excel(file_id)
    return processed


def ingest_server_tabular(
    con: duckdb.DuckDBPyConnection,
    real_path: str,
    table_alias: Optional[str],
    import_mode: str = "auto",
    reader_options: Optional[Dict[str, Any]] = None,
) -> TabularIngestResult:
    file_type = detect_file_type(real_path)
    import_mode = resolve_import_mode(import_mode, file_type=file_type)
    table_name = sanitize_identifier(
        table_alias or os.path.splitext(os.path.basename(real_path))[0],
        allow_leading_digit=bool(table_alias),
        prefix="table",
    )
    meta = create_table_from_file_path_typed(
        con, table_name, real_path, file_type, import_mode=import_mode,
        reader_options=reader_options,
    )
    return TabularIngestResult(
        table_name=table_name,
        row_count=meta.get("row_count", 0),
        column_count=meta.get("column_count", 0),
        columns=meta.get("columns", []),
        column_profiles=meta.get("column_profiles", []),
        file_type=file_type,
    )
