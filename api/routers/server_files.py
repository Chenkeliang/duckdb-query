# pylint: disable=duplicate-code
import logging
import os
from typing import List, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel, field_validator

from core.common.exceptions import (
    AuthorizationError,
    BaseAPIException,
    ResourceNotFoundError,
    SecurityError,
    ValidationError as APIValidationError,
)
from core.common.config_manager import config_manager
from core.database.duckdb_engine import with_duckdb_connection
from core.data.excel_import_manager import (
    derive_default_table_name,
    inspect_excel_sheets,
    sanitize_identifier,
)
from core.data.file_datasource_manager import (
    create_table_from_file_path_typed,
    file_datasource_manager,
)
from core.data.file_utils import detect_file_type
from core.data.import_mode import normalize_import_mode
from core.common.timezone_utils import get_storage_time
from utils.response_helpers import (
    create_success_response,
    MessageCode,
    error_json_response,
)

logger = logging.getLogger(__name__)
router = APIRouter()

SUPPORTED_FORMATS = {"csv", "json", "jsonl", "parquet", "pq", "xlsx", "xls", "excel"}


class ServerFileImportRequest(BaseModel):
    path: str
    table_alias: Optional[str] = None
    import_mode: str = "auto"
    csv_delimiter: Optional[str] = None
    csv_has_header: Optional[bool] = None
    csv_encoding: Optional[str] = None

    @field_validator("import_mode", mode="before")
    @classmethod
    def _validate_import_mode(cls, value: str) -> str:
        return normalize_import_mode(value)


class ServerExcelInspectRequest(BaseModel):
    path: str
    table_alias: Optional[str] = None


class ExcelSheetImportConfig(BaseModel):
    """单个工作表的导入配置"""

    name: str
    target_table: str
    header_rows: int = 1
    header_row_index: Optional[int] = 0
    fill_merged: bool = False
    mode: str = "create"  # create, append, replace


class ServerExcelImportRequest(BaseModel):
    path: str
    sheets: List[ExcelSheetImportConfig]
    import_mode: str = "auto"

    @field_validator("import_mode", mode="before")
    @classmethod
    def _validate_cell_import_mode(cls, value: str) -> str:
        return normalize_import_mode(value)

    @field_validator("sheets")
    @classmethod
    def validate_sheets(cls, sheets):
        if not sheets:
            raise ValueError("At least one worksheet must be selected")
        return sheets


def _get_mount_configs() -> List[dict]:
    mounts = config_manager.get_app_config().server_data_mounts or []
    sanitized = []
    for entry in mounts:
        path = entry.get("path")
        if not path:
            continue
        real_path = os.path.realpath(path)
        sanitized.append(
            {
                "label": entry.get("label") or os.path.basename(path) or real_path,
                "path": path,
                "real_path": real_path,
                "exists": os.path.exists(path),
            }
        )
    return sanitized


def _resolve_path(path: str) -> tuple[str, dict]:
    if not path:
        raise APIValidationError("Missing path parameter")

    real_path = os.path.realpath(path)

    if os.getenv("ALLOW_ARBITRARY_LOCAL_PATHS") == "1":
        # 桌面模式:用户经原生文件对话框已授权访问;仍禁止 symlink
        if os.path.islink(path):
            raise SecurityError(
                "Symbolic links are not allowed",
                details={"field": "path", "code": "SYMLINK_NOT_ALLOWED"},
            )
        parent = os.path.dirname(real_path)
        return real_path, {
            "label": "local",
            "path": parent,
            "real_path": parent,
            "exists": os.path.exists(parent),
        }

    mounts = _get_mount_configs()
    for mount in mounts:
        root = mount["real_path"]
        # 必须在路径分隔符边界上判断包含关系,不能用裸 startswith——否则挂载目录
        # /data/allowed 会把同前缀的兄弟目录 /data/allowed_backup 也误判为在范围内。
        # root 来自 realpath,已规整且无尾部分隔符,故只需匹配"等于 root"或"以
        # root + 分隔符开头"两种情况。
        if real_path == root or real_path.startswith(root + os.sep):
            if os.path.islink(path):
                raise SecurityError(
                    "Symbolic links are not allowed",
                    details={"field": "path", "code": "SYMLINK_NOT_ALLOWED"},
                )
            return real_path, mount

    raise APIValidationError("Path is not within allowed mount directories")


def _to_display_path(real_path: str, mount: dict) -> str:
    if real_path == mount["real_path"]:
        return mount["path"]

    rel = os.path.relpath(real_path, mount["real_path"])
    return os.path.normpath(os.path.join(mount["path"], rel))


def _build_breadcrumbs(real_path: str, mount: dict) -> List[dict]:
    breadcrumbs = [
        {"name": mount["label"], "path": mount["path"], "is_root": True},
    ]

    if real_path == mount["real_path"]:
        return breadcrumbs

    rel_parts = os.path.relpath(real_path, mount["real_path"]).split(os.sep)
    current_real = mount["real_path"]
    for part in rel_parts:
        current_real = os.path.join(current_real, part)
        breadcrumbs.append(
            {
                "name": part,
                "path": _to_display_path(current_real, mount),
                "is_root": False,
            }
        )
    return breadcrumbs


@router.get("/api/server-files/mounted")
async def list_server_mounts():
    mounts = _get_mount_configs()
    return create_success_response(
        data={
            "mounts": [
                {"label": m["label"], "path": m["path"], "exists": m["exists"]}
                for m in mounts
            ]
        },
        message_code=MessageCode.SERVER_MOUNTS_RETRIEVED,
    )


@router.get("/api/server-files/browse")
async def list_server_directory(path: str = Query(..., description="服务器目录路径")):
    real_path, mount = _resolve_path(path)

    if not os.path.exists(real_path):
        raise ResourceNotFoundError("Path", path)
    if not os.path.isdir(real_path):
        raise APIValidationError("Target path is not a directory")

    entries = []
    try:
        with os.scandir(real_path) as iterator:
            for entry in iterator:
                entry_real = entry.path
                entry_path = _to_display_path(entry_real, mount)
                stat_info = entry.stat()
                common_payload = {
                    "name": entry.name,
                    "path": entry_path,
                    "modified": stat_info.st_mtime,
                }
                if entry.is_dir():
                    entries.append(
                        {
                            **common_payload,
                            "type": "directory",
                        }
                    )
                else:
                    ext = detect_file_type(entry.name)
                    suggested = sanitize_identifier(
                        os.path.splitext(entry.name)[0],
                        allow_leading_digit=False,
                        prefix="table",
                    )
                    entries.append(
                        {
                            **common_payload,
                            "type": "file",
                            "size": stat_info.st_size,
                            "extension": ext,
                            "supported": ext in SUPPORTED_FORMATS,
                            "suggested_table_name": suggested,
                        }
                    )
    except PermissionError as exc:
        raise AuthorizationError("No permission to read this directory") from exc

    entries.sort(key=lambda item: (item["type"] != "directory", item["name"].lower()))

    return create_success_response(
        data={
            "path": _to_display_path(real_path, mount),
            "entries": entries,
            "breadcrumbs": _build_breadcrumbs(real_path, mount),
            "mount": {"label": mount["label"], "path": mount["path"]},
        },
        message_code=MessageCode.SERVER_DIRECTORY_BROWSED,
    )


@router.post("/api/server-files/import")
async def import_server_file(payload: ServerFileImportRequest):
    real_path, mount = _resolve_path(payload.path)

    if not os.path.exists(real_path):
        raise ResourceNotFoundError("File", payload.path)
    if not os.path.isfile(real_path):
        raise APIValidationError("Target path is not a file")

    file_type = detect_file_type(real_path)
    if file_type not in SUPPORTED_FORMATS:
        raise APIValidationError(f"Unsupported file type: {file_type}")

    base_name = payload.table_alias or os.path.splitext(os.path.basename(real_path))[0]
    # 如果用户明确提供了 table_alias，尊重用户输入（允许数字开头）
    table_name = sanitize_identifier(
        base_name, allow_leading_digit=bool(payload.table_alias), prefix="table"
    )

    try:
        from core.database.duckdb_engine import with_duckdb_connection
        from core.services.file_ingestion_service import ingest_server_tabular

        from core.services.file_ingestion_service import build_file_metadata, save_file_metadata

        # Build reader_options for CSV files only
        reader_options: Optional[dict] = None
        if file_type == "csv":
            opts: dict = {}
            if payload.csv_delimiter is not None:
                opts["delim"] = payload.csv_delimiter
            if payload.csv_has_header is not None:
                opts["HEADER"] = payload.csv_has_header
            if payload.csv_encoding is not None:
                opts["encoding"] = payload.csv_encoding
            if opts:
                reader_options = opts

        with with_duckdb_connection() as con:
            ingest_result = ingest_server_tabular(
                con, real_path, payload.table_alias, import_mode=payload.import_mode,
                reader_options=reader_options,
            )
        table_name = ingest_result.table_name
        metadata = {
            "row_count": ingest_result.row_count,
            "column_count": ingest_result.column_count,
            "columns": ingest_result.columns,
            "column_profiles": ingest_result.column_profiles,
        }
        current_time = get_storage_time()
        table_metadata = build_file_metadata(
            source_id=table_name,
            filename=os.path.basename(real_path),
            file_path=_to_display_path(real_path, mount),
            file_type=file_type,
            table_metadata=metadata,
            extra={
                "upload_time": current_time,
                "created_at": current_time,
                "updated_at": current_time,
                "metadata": {
                    "schema_version": 2,
                    "mount_label": mount["label"],
                    "source_type": "server_directory",
                },
            },
        )
        try:
            save_file_metadata(table_metadata)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.warning("Failed to save file datasource metadata (ignored): %s", exc)
    except BaseAPIException:
        raise
    except Exception as exc:
        logger.error("Failed to import server file: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Import failed: {str(exc)}",
        )

    return create_success_response(
        data={
            "table_name": table_name,
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "file_type": file_type,
            "file_path": _to_display_path(real_path, mount),
            "mount_label": mount["label"],
        },
        message_code=MessageCode.SERVER_FILE_IMPORTED,
        message=f"Server file imported, table created: {table_name}",
    )


# ============ Excel 专用 API ============


@router.post("/api/server-files/excel/inspect")
async def inspect_server_excel(payload: ServerExcelInspectRequest):
    """
    检查服务器上的 Excel 文件，返回工作表信息
    """
    real_path, mount = _resolve_path(payload.path)

    if not os.path.exists(real_path):
        raise ResourceNotFoundError("File", payload.path)
    if not os.path.isfile(real_path):
        raise APIValidationError("Target path is not a file")

    file_ext = detect_file_type(real_path)
    if file_ext not in {"xlsx", "xls", "excel"}:
        raise APIValidationError(f"Not an Excel file: {file_ext}")

    try:
        from core.services.file_ingestion_service import inspect_excel_at_path

        inspected = inspect_excel_at_path(real_path, payload.table_alias)
    except BaseAPIException:
        raise
    except Exception as exc:
        logger.error("Failed to check Excel worksheets: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to check Excel: {str(exc)}",
        )

    return create_success_response(
        data={
            "file_path": _to_display_path(real_path, mount),
            "file_extension": inspected["file_extension"],
            "default_table_prefix": inspected["default_table_prefix"],
            "sheets": inspected["sheets"],
        },
        message_code=MessageCode.EXCEL_SHEETS_INSPECTED,
    )


@router.post("/api/server-files/excel/import")
async def import_server_excel(payload: ServerExcelImportRequest):
    """
    导入服务器上的 Excel 文件的指定工作表

    策略（由共享的 import_excel_sheets 实现）：
    1. 如果条件允许（xlsx + 首行表头 + 无合并填充），优先使用 DuckDB
    2. 否则使用 pandas
    """
    real_path, mount = _resolve_path(payload.path)

    if not os.path.exists(real_path):
        raise ResourceNotFoundError("File", payload.path)
    if not os.path.isfile(real_path):
        raise APIValidationError("Target path is not a file")

    file_ext = detect_file_type(real_path)
    if file_ext not in {"xlsx", "xls", "excel"}:
        raise APIValidationError(f"Not an Excel file: {file_ext}")

    # 批内冲突预检查：非 create 模式的 sheet 不允许写入同一目标表（create 模式的撞名去重
    # 交给共享导入函数里的 resolve_unique_table_name 动态处理，见 import_excel_sheets）。
    seen_non_create_names: set = set()
    for sheet_cfg in payload.sheets:
        if (sheet_cfg.mode or "create").lower() == "create":
            continue
        sanitized = sanitize_identifier(
            sheet_cfg.target_table, allow_leading_digit=True, prefix="table"
        )
        if sanitized in seen_non_create_names:
            raise APIValidationError(
                f"Worksheet '{sheet_cfg.name}' target table name '{sanitized}' conflicts with other worksheets"
            )
        seen_non_create_names.add(sanitized)

    current_time = get_storage_time()

    def _save_sheet_metadata(sheet_cfg, outcome: dict) -> None:
        header_row_index = (
            sheet_cfg.header_row_index if sheet_cfg.header_row_index is not None else 1
        )
        table_metadata = {
            "source_id": outcome["target_table"],
            "filename": os.path.basename(real_path),
            "file_path": _to_display_path(real_path, mount),
            "file_type": "excel_sheet",
            "sheet_name": sheet_cfg.name,
            "row_count": outcome["row_count"],
            "column_count": outcome["column_count"],
            "columns": outcome["columns"],
            "column_profiles": [],
            "upload_time": current_time,
            "created_at": current_time,
            "updated_at": current_time,
            "metadata": {
                "schema_version": 2,
                "mount_label": mount["label"],
                "source_type": "server_directory",
                "header_rows": sheet_cfg.header_rows,
                "header_row_index": header_row_index,
                "fill_merged": sheet_cfg.fill_merged,
                "import_engine": outcome["import_engine"],
            },
        }
        try:
            file_datasource_manager.save_file_datasource(table_metadata)
        except Exception as exc:  # pylint: disable=broad-exception-caught
            logger.warning("Failed to save metadata (ignored): %s", exc)

    from core.services.file_ingestion_service import (
        ExcelSheetImportError,
        import_excel_sheets,
    )

    try:
        with with_duckdb_connection() as con:
            outcomes = import_excel_sheets(
                con,
                real_path,
                payload.sheets,
                import_mode=payload.import_mode,
                engine="duckdb_native",
                stop_on_first_error=True,
                on_sheet_imported=_save_sheet_metadata,
            )
    except ExcelSheetImportError as exc:
        logger.error(
            "Failed to import worksheet %s: %s", exc.sheet_name, exc.message, exc_info=True
        )
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to import worksheet {exc.sheet_name}: {exc.message}",
        )

    imported_tables = [
        {
            "table_name": outcome["target_table"],
            "sheet_name": outcome["sheet_name"],
            "row_count": outcome["row_count"],
            "column_count": outcome["column_count"],
            "columns": outcome["columns"],
            "import_engine": outcome["import_engine"],
        }
        for outcome in outcomes
    ]

    return create_success_response(
        data={
            "imported_tables": imported_tables,
        },
        message_code=MessageCode.EXCEL_SHEETS_IMPORTED,
        message=f"Successfully imported {len(imported_tables)} worksheets",
    )
