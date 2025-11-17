import logging
import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from core.config_manager import config_manager
from core.duckdb_engine import get_db_connection
from core.excel_import_manager import sanitize_identifier
from core.file_datasource_manager import (
    create_table_from_file_path_typed,
    file_datasource_manager,
)
from core.file_utils import detect_file_type
from core.timezone_utils import get_current_time_iso

logger = logging.getLogger(__name__)
router = APIRouter()

SUPPORTED_FORMATS = {"csv", "json", "jsonl", "parquet", "pq", "xlsx", "xls", "excel"}


class ServerFileImportRequest(BaseModel):
    path: str
    table_alias: Optional[str] = None


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


@router.get("/api/server_files/mounts")
async def list_server_mounts():
    mounts = _get_mount_configs()
    return {
        "mounts": [
            {"label": m["label"], "path": m["path"], "exists": m["exists"]}
            for m in mounts
        ]
    }


@router.get("/api/server_files")
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
    except PermissionError:
        raise HTTPException(status_code=403, detail="没有权限读取该目录")

    entries.sort(key=lambda item: (item["type"] != "directory", item["name"].lower()))

    return {
        "path": _to_display_path(real_path, mount),
        "entries": entries,
        "breadcrumbs": _build_breadcrumbs(real_path, mount),
        "mount": {"label": mount["label"], "path": mount["path"]},
    }


@router.post("/api/server_files/import")
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
    table_name = sanitize_identifier(
        base_name, allow_leading_digit=False, prefix="table"
    )

    try:
        con = get_db_connection()
        metadata = create_table_from_file_path_typed(
            con, table_name, real_path, file_type
        )
    except Exception as exc:
        logger.error("导入服务器文件失败: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"导入失败: {str(exc)}")

    table_metadata = {
        "source_id": table_name,
        "filename": os.path.basename(real_path),
        "file_path": _to_display_path(real_path, mount),
        "file_type": file_type,
        "row_count": metadata.get("row_count", 0),
        "column_count": metadata.get("column_count", 0),
        "columns": metadata.get("columns", []),
        "column_profiles": metadata.get("column_profiles", []),
        "schema_version": 2,
        "created_at": get_current_time_iso(),
        "mount_label": mount["label"],
        "source_type": "server_directory",
    }
    file_datasource_manager.save_file_datasource(table_metadata)

    return {
        "success": True,
        "message": f"已导入服务器文件，创建表: {table_name}",
        "table_name": table_name,
        "row_count": metadata.get("row_count", 0),
        "column_count": metadata.get("column_count", 0),
        "columns": metadata.get("columns", []),
        "file_type": file_type,
        "file_path": table_metadata["file_path"],
        "mount_label": mount["label"],
    }
