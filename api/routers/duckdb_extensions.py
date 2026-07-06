# pylint: disable=duplicate-code
"""
DuckDB 扩展管理路由

管理 DuckDB 扩展的目录展示、安装状态查询与按需在线安装：
- GET  /api/duckdb/extensions                 列出精选目录及每个扩展的安装状态
- POST /api/duckdb/extensions/{name}/install   触发指定扩展的后台联网安装
- GET  /api/duckdb/extensions/install/{name}   查询安装进度

PRESEEDED 中的扩展在桌面端打包时已随安装包下发（见 api/scripts/fetch_duckdb_extensions.py），
无需联网即可使用；CATALOG 中其余扩展需要用户主动点击安装，安装成功后离线可用。
"""

import gzip
import logging
import os
import ssl
import threading
import urllib.request
from typing import Dict, Optional, Tuple

from core.common.exceptions import ValidationError as APIValidationError
from core.database.duckdb_engine import with_duckdb_connection
from fastapi import APIRouter
from utils.response_helpers import (
    MessageCode,
    create_list_response,
    create_success_response,
    error_json_response,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ==================== 精选目录 ====================

CATEGORY_DATASOURCE = "datasource"
CATEGORY_CAPABILITY = "capability"

# 桌面端预置扩展：打包时已下载进安装包，视为始终已安装，不可再次触发联网安装
PRESEEDED = {"excel", "httpfs", "mysql", "postgres"}

# LOAD 名 -> CDN 文件名 / duckdb_extensions() 中的 extension_name。
# DuckDB 1.1+ 将 mysql/postgres 扩展重命名为 mysql_scanner/postgres_scanner，
# 但 LOAD 指令仍使用旧名，前端只暴露 LOAD 名（见 scripts/fetch_duckdb_extensions.py）。
_CDN_NAME_OVERRIDES = {
    "mysql": "mysql_scanner",
    "postgres": "postgres_scanner",
}

# name -> (category, 中文说明, English description, usage SQL 示例或 None)
CATALOG: Dict[str, Tuple[str, str, str, Optional[str]]] = {
    # ---- 数据源 ----
    "sqlite_scanner": (
        CATEGORY_DATASOURCE,
        "读写本地 SQLite 数据库文件",
        "Read & write local SQLite database files",
        "ATTACH IF NOT EXISTS 'path/to/data.db' AS sq (TYPE sqlite); SELECT * FROM sq.some_table",
    ),
    "aws": (
        CATEGORY_DATASOURCE,
        "访问 S3 存储(凭证与签名,配合 httpfs)",
        "S3 credentials & signing (with httpfs)",
        "CREATE OR REPLACE SECRET my_s3 (TYPE s3, KEY_ID 'AK...', SECRET '...', REGION 'ap-east-1'); SELECT * FROM 's3://bucket/x.parquet'",
    ),
    "azure": (
        CATEGORY_DATASOURCE,
        "读取 Azure Blob 存储",
        "Read Azure Blob Storage",
        "CREATE OR REPLACE SECRET my_az (TYPE azure, CONNECTION_STRING '...'); SELECT * FROM 'az://container/x.parquet'",
    ),
    "iceberg": (
        CATEGORY_DATASOURCE,
        "读取 Apache Iceberg 表",
        "Read Apache Iceberg tables",
        "SELECT * FROM iceberg_scan('path/to/iceberg_table')",
    ),
    "delta": (
        CATEGORY_DATASOURCE,
        "读取 Delta Lake 表",
        "Read Delta Lake tables",
        "SELECT * FROM delta_scan('path/to/delta_table')",
    ),
    "ducklake": (
        CATEGORY_DATASOURCE,
        "DuckLake 湖仓格式",
        "DuckLake lakehouse format",
        "ATTACH IF NOT EXISTS 'ducklake:meta.ducklake' AS lake",
    ),
    "vortex": (
        CATEGORY_DATASOURCE,
        "读取 Vortex 列式格式",
        "Read Vortex columnar files",
        "SELECT * FROM read_vortex('path/to/file.vortex')",
    ),
    "excel": (
        CATEGORY_DATASOURCE,
        "Excel 读写",
        "Excel read & write",
        "SELECT * FROM 'path/to/file.xlsx'",
    ),
    "httpfs": (
        CATEGORY_DATASOURCE,
        "HTTP(S) 远程文件读取",
        "Remote files over HTTP(S)",
        "SELECT * FROM 'https://host/data.parquet'",
    ),
    "mysql": (CATEGORY_DATASOURCE, "连接 MySQL", "Connect to MySQL", None),
    "postgres": (CATEGORY_DATASOURCE, "连接 PostgreSQL", "Connect to PostgreSQL", None),
    # ---- 能力增强 ----
    "encodings": (
        CATEGORY_CAPABILITY,
        "读取 GBK 等非 UTF-8 编码文件",
        "Non-UTF-8 encodings (e.g. GBK)",
        "SELECT * FROM read_csv('file.csv', encoding='gb18030')",
    ),
    "fts": (
        CATEGORY_CAPABILITY,
        "全文检索索引(BM25)",
        "Full-text search (BM25)",
        "PRAGMA create_fts_index('docs', 'id', 'body')",
    ),
    "vss": (
        CATEGORY_CAPABILITY,
        "向量相似度检索(HNSW 索引)",
        "Vector similarity search (HNSW)",
        "SET hnsw_enable_experimental_persistence = true; CREATE INDEX idx ON tbl USING HNSW (embedding)",
    ),
    "spatial": (
        CATEGORY_CAPABILITY,
        "地理空间类型与函数(体积较大)",
        "Geospatial types & functions (large)",
        "SELECT ST_AsText(ST_Point(116.4, 39.9))",
    ),
    "inet": (
        CATEGORY_CAPABILITY,
        "IP 地址类型与网段运算",
        "IP address types & functions",
        "SELECT '10.0.0.1/8'::INET",
    ),
}

_EXTENSIONS_CDN_BASE = "https://extensions.duckdb.org"
_DOWNLOAD_USER_AGENT = "Mozilla/5.0"

# ==================== 安装状态（内存,进程重启后重置） ====================

_install_lock = threading.Lock()
_install_state: Dict[str, dict] = {}


def _default_state() -> dict:
    return {"status": "idle", "progress": 0, "error": None}


def _get_install_state(name: str) -> dict:
    with _install_lock:
        return dict(_install_state.get(name, _default_state()))


def _set_install_state(name: str, **fields) -> None:
    with _install_lock:
        state = _install_state.setdefault(name, _default_state())
        state.update(fields)


def _is_install_active(name: str) -> bool:
    with _install_lock:
        state = _install_state.get(name)
        return bool(state) and state.get("status") in ("downloading", "verifying")


# ==================== 接口 ====================


@router.get("/api/duckdb/extensions", tags=["DuckDB Extensions"])
async def list_duckdb_extensions():
    """列出精选扩展目录，标注每个扩展是否已预置/已安装"""
    try:
        with with_duckdb_connection() as con:
            rows = con.execute(
                "SELECT extension_name, installed FROM duckdb_extensions()"
            ).fetchall()
        installed_map = {str(row[0]).lower(): bool(row[1]) for row in rows}

        items = []
        for name, (category, desc_zh, desc_en, usage) in CATALOG.items():
            bundled = name in PRESEEDED
            query_name = _CDN_NAME_OVERRIDES.get(name, name)
            installed = bundled or installed_map.get(query_name.lower(), False)
            items.append(
                {
                    "name": name,
                    "category": category,
                    "description": desc_zh,
                    "description_en": desc_en,
                    "usage": usage,
                    "installed": installed,
                    "bundled": bundled,
                }
            )

        return create_list_response(
            items=items,
            total=len(items),
            message_code=MessageCode.EXTENSIONS_RETRIEVED,
        )
    except Exception as exc:
        logger.error("Failed to list DuckDB extensions: %s", exc, exc_info=True)
        return error_json_response(
            500,
            MessageCode.OPERATION_FAILED,
            f"Failed to list DuckDB extensions: {exc}",
        )


@router.post("/api/duckdb/extensions/{name}/install", tags=["DuckDB Extensions"])
async def install_duckdb_extension(name: str):
    """触发指定扩展的后台联网安装；已在安装中则幂等返回当前进度"""
    if name not in CATALOG:
        raise APIValidationError(f"Unknown extension: {name}")
    if name in PRESEEDED:
        raise APIValidationError(f"Extension '{name}' is bundled and cannot be installed")

    if _is_install_active(name):
        return create_success_response(
            data=_get_install_state(name),
            message_code=MessageCode.EXTENSION_INSTALL_STARTED,
            message="Extension installation already in progress",
        )

    _set_install_state(name, status="downloading", progress=0, error=None)
    thread = threading.Thread(
        target=_run_extension_install,
        args=(name,),
        name=f"ext-install-{name}",
        daemon=True,
    )
    thread.start()

    return create_success_response(
        data={"status": "started"},
        message_code=MessageCode.EXTENSION_INSTALL_STARTED,
    )


@router.get("/api/duckdb/extensions/install/{name}", tags=["DuckDB Extensions"])
async def get_duckdb_extension_install_status(name: str):
    """查询指定扩展的安装进度"""
    return create_success_response(
        data=_get_install_state(name),
        message_code=MessageCode.EXTENSION_INSTALL_STATUS_RETRIEVED,
    )


# ==================== 安装线程 ====================


def _resolve_target_path(name: str) -> Tuple[str, str, str]:
    """查询 DuckDB 版本/平台/扩展目录，返回 (下载 URL, 目标目录, 目标文件路径)"""
    with with_duckdb_connection() as con:
        version = con.execute("SELECT version()").fetchone()[0]
        platform = con.execute("SELECT platform FROM pragma_platform()").fetchone()[0]
        ext_dir_row = con.execute(
            "SELECT current_setting('extension_directory')"
        ).fetchone()[0]

    ext_dir = ext_dir_row or os.path.expanduser("~/.duckdb/extensions")
    dest_dir = os.path.join(ext_dir, version, platform)
    dest_path = os.path.join(dest_dir, f"{name}.duckdb_extension")
    cdn_name = _CDN_NAME_OVERRIDES.get(name, name)
    url = f"{_EXTENSIONS_CDN_BASE}/{version}/{platform}/{cdn_name}.duckdb_extension.gz"
    return url, dest_dir, dest_path


def _ssl_context() -> Optional[ssl.SSLContext]:
    """显式用 certifi 的 CA 包建 SSL 上下文。

    PyInstaller 冻结的 Python 没有系统 CA 证书路径,默认 urlopen 会报
    CERTIFICATE_VERIFY_FAILED(桌面端实际踩过);certifi 随依赖打进包里,始终可用。
    开发环境拿不到 certifi 时返回 None,走系统默认验证——绝不降级为跳过验证。
    """
    try:
        import certifi  # pylint: disable=import-outside-toplevel

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None


def _download_extension_archive(url: str, gz_path: str, name: str) -> None:
    """流式下载扩展压缩包，按 Content-Length 更新 0-90 的下载进度"""
    request = urllib.request.Request(url, headers={"User-Agent": _DOWNLOAD_USER_AGENT})
    with urllib.request.urlopen(request, timeout=60, context=_ssl_context()) as response:
        total_size = int(response.headers.get("Content-Length") or 0)
        downloaded = 0
        chunk_size = 64 * 1024
        with open(gz_path, "wb") as gz_file:
            while True:
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                gz_file.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    progress = min(90, int(downloaded / total_size * 90))
                    _set_install_state(name, status="downloading", progress=progress)


def _run_extension_install(name: str) -> None:
    """后台线程：下载 -> 解压落盘(原子 rename) -> LOAD 验证。不向 stdout 输出任何内容。"""
    gz_path: Optional[str] = None
    try:
        url, dest_dir, dest_path = _resolve_target_path(name)
        os.makedirs(dest_dir, exist_ok=True)

        logger.info("Downloading DuckDB extension %s from %s", name, url)
        gz_path = dest_path + ".gz.tmp"
        _download_extension_archive(url, gz_path, name)

        _set_install_state(name, status="verifying", progress=90)

        tmp_path = dest_path + ".tmp"
        with gzip.open(gz_path, "rb") as gz_file, open(tmp_path, "wb") as out_file:
            out_file.write(gz_file.read())
        os.replace(tmp_path, dest_path)
        os.remove(gz_path)
        gz_path = None

        with with_duckdb_connection() as con:
            con.execute(f"LOAD {name}")

        _set_install_state(name, status="done", progress=100, error=None)
        logger.info("DuckDB extension %s installed successfully", name)

    except Exception as exc:
        logger.error("Failed to install DuckDB extension %s: %s", name, exc, exc_info=True)
        current = _get_install_state(name)
        _set_install_state(
            name,
            status="error",
            progress=current.get("progress", 0),
            error=f"扩展 {name} 安装失败：{str(exc)[:200]}",
        )
    finally:
        if gz_path and os.path.exists(gz_path):
            try:
                os.remove(gz_path)
            except OSError:
                pass
