import logging
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, field_validator

from core.common.config_manager import config_manager
from core.database.duckdb_engine import get_db_connection
from core.data.excel_import_manager import (
    derive_default_table_name,
    inspect_excel_sheets,
    load_excel_sheet_dataframe,
    sanitize_identifier,
)
from core.data.file_datasource_manager import (
    create_table_from_file_path_typed,
    create_typed_table_from_dataframe,
    file_datasource_manager,
)
from core.data.file_utils import detect_file_type
from core.common.timezone_utils import get_storage_time
from utils.response_helpers import (
    create_success_response,
    MessageCode,
)

logger = logging.getLogger(__name__)
router = APIRouter()

SUPPORTED_FORMATS = {"csv", "json", "jsonl", "parquet", "pq", "xlsx", "xls", "excel"}


class ServerFileImportRequest(BaseModel):
    path: str
    table_alias: Optional[str] = None


class ServerExcelInspectRequest(BaseModel):
    path: str


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

    @field_validator("sheets")
    @classmethod
    def validate_sheets(cls, sheets):
        if not sheets:
            raise ValueError("至少需要选择一个工作表")
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
        raise HTTPException(status_code=400, detail="缺少路径参数")

    mounts = _get_mount_configs()
    real_path = os.path.realpath(path)

    for mount in mounts:
        root = mount["real_path"]
        if real_path.startswith(root):
            # 安全检查：禁止符号链接（防止白名单目录内的符号链接指向外部）
            if os.path.islink(path):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "code": "SYMLINK_NOT_ALLOWED",
                        "message": "不允许访问符号链接",
                        "field": "path",
                    },
                )
            return real_path, mount

    raise HTTPException(status_code=400, detail="路径不在允许的挂载目录内")


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
        raise HTTPException(status_code=404, detail="路径不存在")
    if not os.path.isdir(real_path):
        raise HTTPException(status_code=400, detail="目标路径不是目录")

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
        raise HTTPException(status_code=403, detail="没有权限读取该目录") from exc

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
        raise HTTPException(status_code=404, detail="文件不存在")
    if not os.path.isfile(real_path):
        raise HTTPException(status_code=400, detail="目标路径不是文件")

    file_type = detect_file_type(real_path)
    if file_type not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"暂不支持的文件类型: {file_type}")

    base_name = payload.table_alias or os.path.splitext(os.path.basename(real_path))[0]
    # 如果用户明确提供了 table_alias，尊重用户输入（允许数字开头）
    table_name = sanitize_identifier(
        base_name, allow_leading_digit=bool(payload.table_alias), prefix="table"
    )

    try:
        con = get_db_connection()
        metadata = create_table_from_file_path_typed(
            con, table_name, real_path, file_type
        )
    except Exception as exc:
        logger.error("导入服务器文件失败: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"导入失败: {str(exc)}") from exc

    # 使用 UTC naive 时间用于数据库存储
    current_time = get_storage_time()

    table_metadata = {
        "source_id": table_name,
        "filename": os.path.basename(real_path),
        "file_path": _to_display_path(real_path, mount),
        "file_type": file_type,
        "row_count": metadata.get("row_count", 0),
        "column_count": metadata.get("column_count", 0),
        "columns": metadata.get("columns", []),
        "column_profiles": metadata.get("column_profiles", []),
        "upload_time": current_time,
        "created_at": current_time,
        "updated_at": current_time,
        "metadata": {
            "schema_version": 2,
            "mount_label": mount["label"],
            "source_type": "server_directory",
        },
    }
    try:
        file_datasource_manager.save_file_datasource(table_metadata)
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.warning("保存文件数据源元数据失败（已忽略）: %s", exc, exc_info=True)

    return create_success_response(
        data={
            "table_name": table_name,
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "file_type": file_type,
            "file_path": table_metadata["file_path"],
            "mount_label": mount["label"],
        },
        message_code=MessageCode.SERVER_FILE_IMPORTED,
        message=f"已导入服务器文件，创建表: {table_name}",
    )


# ============ Excel 专用 API ============


def _should_use_duckdb(file_ext: str, header_row_index: int, fill_merged: bool) -> bool:
    """判断是否应该使用 DuckDB 导入 Excel

    注意: header_row_index 是 1-based（第一行=1）
    """
    # .xls 只能用 pandas (xlrd 引擎)
    if file_ext.lower() == "xls":
        return False
    # 非首行表头只能用 pandas (DuckDB 只支持 header=true/false)
    # header_row_index=1 表示第一行是表头，这种情况 DuckDB 可以处理
    if header_row_index is not None and header_row_index > 1:
        return False
    # 需要合并单元格填充只能用 pandas
    if fill_merged:
        return False
    return True


def _table_exists(con, table_name: str) -> bool:
    """检查表是否已存在"""
    try:
        result = con.execute("SHOW TABLES").fetchdf()
        return table_name in result["name"].tolist()
    except Exception:  # pylint: disable=broad-exception-caught
        return False


@router.post("/api/server-files/excel/inspect")
async def inspect_server_excel(payload: ServerExcelInspectRequest):
    """
    检查服务器上的 Excel 文件，返回工作表信息
    """
    real_path, mount = _resolve_path(payload.path)

    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    if not os.path.isfile(real_path):
        raise HTTPException(status_code=400, detail="目标路径不是文件")

    file_ext = detect_file_type(real_path)
    if file_ext not in {"xlsx", "xls", "excel"}:
        raise HTTPException(status_code=400, detail=f"不是 Excel 文件: {file_ext}")

    try:
        sheets = inspect_excel_sheets(real_path)
    except Exception as exc:
        logger.error("检查 Excel 工作表失败: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"检查 Excel 失败: {str(exc)}") from exc

    # 为每个工作表生成默认表名
    base_name = os.path.splitext(os.path.basename(real_path))[0]
    default_prefix = sanitize_identifier(
        base_name, allow_leading_digit=False, prefix="table"
    )

    for sheet in sheets:
        sheet["default_table_name"] = derive_default_table_name(
            default_prefix, sheet["name"]
        )

    return create_success_response(
        data={
            "file_path": _to_display_path(real_path, mount),
            "file_extension": file_ext,
            "default_table_prefix": default_prefix,
            "sheets": sheets,
        },
        message_code=MessageCode.EXCEL_SHEETS_INSPECTED,
    )


@router.post("/api/server-files/excel/import")
async def import_server_excel(payload: ServerExcelImportRequest):
    """
    导入服务器上的 Excel 文件的指定工作表

    策略：
    1. 如果条件允许（xlsx + 首行表头 + 无合并填充），优先使用 DuckDB
    2. 否则使用 pandas
    """
    real_path, mount = _resolve_path(payload.path)

    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    if not os.path.isfile(real_path):
        raise HTTPException(status_code=400, detail="目标路径不是文件")

    file_ext = detect_file_type(real_path)
    if file_ext not in {"xlsx", "xls", "excel"}:
        raise HTTPException(status_code=400, detail=f"不是 Excel 文件: {file_ext}")

    con = get_db_connection()
    imported_tables = []
    current_time = get_storage_time()

    # 1. 先构建表名映射，检查批次内部冲突
    sanitized_name_map = {}
    for sheet_cfg in payload.sheets:
        # 用户明确提供了目标表名，尊重用户输入（允许数字开头）
        sanitized = sanitize_identifier(
            sheet_cfg.target_table, allow_leading_digit=True, prefix="table"
        )
        if sanitized in sanitized_name_map.values():
            raise HTTPException(
                status_code=400,
                detail=f"工作表 '{sheet_cfg.name}' 的目标表名 '{sanitized}' 与其他工作表冲突",
            )
        sanitized_name_map[sheet_cfg.name] = sanitized

    # 2. 检查是否与现有表冲突
    for sheet_cfg in payload.sheets:
        target_table = sanitized_name_map[sheet_cfg.name]
        if sheet_cfg.mode == "create" and _table_exists(con, target_table):
            raise HTTPException(
                status_code=400,
                detail=f"表 '{target_table}' 已存在，请修改目标表名或选择覆盖模式",
            )

    # 4. 执行导入
    for sheet_cfg in payload.sheets:
        target_table = sanitized_name_map[sheet_cfg.name]
        header_row_index = (
            sheet_cfg.header_row_index if sheet_cfg.header_row_index is not None else 1
        )
        use_duckdb = _should_use_duckdb(
            file_ext, header_row_index, sheet_cfg.fill_merged
        )
        metadata = {}

        try:
            if use_duckdb:
                # 尝试 DuckDB 导入
                try:
                    logger.info("尝试使用 DuckDB 导入工作表: %s", sheet_cfg.name)
                    con.execute("INSTALL excel")
                    con.execute("LOAD excel")

                    sql = f"""
                        CREATE OR REPLACE TABLE "{target_table}" AS
                        SELECT * FROM read_xlsx('{real_path}', sheet='{sheet_cfg.name}', header=true)
                    """
                    con.execute(sql)

                    # 获取元数据
                    row_count = con.execute(
                        f'SELECT COUNT(*) FROM "{target_table}"'
                    ).fetchone()[0]
                    columns_info = con.execute(f'DESCRIBE "{target_table}"').fetchall()
                    columns = [col[0] for col in columns_info]

                    metadata = {
                        "row_count": row_count,
                        "column_count": len(columns),
                        "columns": columns,
                    }
                    logger.info("DuckDB 导入成功: %s, 行数: %d", target_table, row_count)

                except Exception as duckdb_exc:
                    logger.warning("DuckDB 导入失败，回退到 pandas: %s", duckdb_exc)
                    use_duckdb = False  # 触发下面的 pandas fallback

            if not use_duckdb:
                # pandas 导入
                # pandas 导入
                logger.info("使用 pandas 导入工作表: %s", sheet_cfg.name)
                df = load_excel_sheet_dataframe(
                    real_path,
                    sheet_cfg.name,
                    header_rows=sheet_cfg.header_rows,
                    header_row_index=header_row_index,
                    fill_merged=sheet_cfg.fill_merged,
                )

                if df is None or df.empty:
                    raise ValueError(f"工作表 {sheet_cfg.name} 不包含可导入的数据")

                # 处理追加/替换模式
                if sheet_cfg.mode == "replace":
                    con.execute(f'DROP TABLE IF EXISTS "{target_table}"')

                metadata = create_typed_table_from_dataframe(con, target_table, df)

            # 保存元数据
            table_metadata = {
                "source_id": target_table,
                "filename": os.path.basename(real_path),
                "file_path": _to_display_path(real_path, mount),
                "file_type": "excel_sheet",
                "sheet_name": sheet_cfg.name,
                "row_count": metadata.get("row_count", 0),
                "column_count": metadata.get("column_count", 0),
                "columns": metadata.get("columns", []),
                "column_profiles": metadata.get("column_profiles", []),
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
                    "import_engine": "duckdb" if use_duckdb else "pandas",
                },
            }

            try:
                file_datasource_manager.save_file_datasource(table_metadata)
            except Exception as exc:  # pylint: disable=broad-exception-caught
                logger.warning("保存元数据失败（已忽略）: %s", exc)

            imported_tables.append(
                {
                    "table_name": target_table,
                    "sheet_name": sheet_cfg.name,
                    "row_count": metadata.get("row_count", 0),
                    "column_count": metadata.get("column_count", 0),
                    "columns": metadata.get("columns", []),
                    "import_engine": "duckdb" if use_duckdb else "pandas",
                }
            )

        except HTTPException:
            raise
        except Exception as exc:
            logger.error("导入工作表 %s 失败: %s", sheet_cfg.name, exc, exc_info=True)
            raise HTTPException(
                status_code=500, detail=f"导入工作表 {sheet_cfg.name} 失败: {str(exc)}"
            ) from exc

    return create_success_response(
        data={
            "imported_tables": imported_tables,
        },
        message_code=MessageCode.EXCEL_SHEETS_IMPORTED,
        message=f"成功导入 {len(imported_tables)} 个工作表",
    )
