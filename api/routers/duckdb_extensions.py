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
import sys
import threading
import urllib.request
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from core.common.exceptions import ValidationError as APIValidationError
from core.common.sql_identifiers import escape_string_literal
from core.database.duckdb_engine import _autoinstall_toggle_lock, with_duckdb_connection
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

@dataclass(frozen=True)
class ExtensionSpec:
    """Stable extension identity across UI, LOAD aliases and CDN artifacts."""

    name: str
    category: str
    description: str
    description_en: str
    usage: Optional[str] = None
    load_name: Optional[str] = None
    artifact_name: Optional[str] = None
    source: str = "official"
    bundled: bool = False
    installable: bool = True

    @property
    def resolved_load_name(self) -> str:
        return self.load_name or self.name

    @property
    def resolved_artifact_name(self) -> str:
        return self.artifact_name or self.name


def _extension(
    name: str,
    category: str,
    description: str,
    description_en: str,
    usage: Optional[str] = None,
    **kwargs,
) -> ExtensionSpec:
    return ExtensionSpec(name, category, description, description_en, usage, **kwargs)


CATALOG: Dict[str, ExtensionSpec] = {
    # ---- 数据源 ----
    "sqlite_scanner": _extension("sqlite_scanner",
        CATEGORY_DATASOURCE,
        "读写本地 SQLite 数据库文件",
        "Read & write local SQLite database files",
        "ATTACH IF NOT EXISTS 'path/to/data.db' AS sq (TYPE sqlite); SELECT * FROM sq.some_table",
    ),
    "aws": _extension("aws",
        CATEGORY_DATASOURCE,
        "访问 S3 存储(凭证与签名,配合 httpfs)",
        "S3 credentials & signing (with httpfs)",
        "CREATE OR REPLACE SECRET my_s3 (TYPE s3, KEY_ID 'AK...', SECRET '...', REGION 'ap-east-1'); SELECT * FROM 's3://bucket/x.parquet'",
    ),
    "azure": _extension("azure",
        CATEGORY_DATASOURCE,
        "读取 Azure Blob 存储",
        "Read Azure Blob Storage",
        "CREATE OR REPLACE SECRET my_az (TYPE azure, CONNECTION_STRING '...'); SELECT * FROM 'az://container/x.parquet'",
    ),
    "iceberg": _extension("iceberg",
        CATEGORY_DATASOURCE,
        "读取 Apache Iceberg 表",
        "Read Apache Iceberg tables",
        "SELECT * FROM iceberg_scan('path/to/iceberg_table')",
    ),
    "delta": _extension("delta",
        CATEGORY_DATASOURCE,
        "读取 Delta Lake 表",
        "Read Delta Lake tables",
        "SELECT * FROM delta_scan('path/to/delta_table')",
    ),
    "ducklake": _extension("ducklake",
        CATEGORY_DATASOURCE,
        "DuckLake 湖仓格式",
        "DuckLake lakehouse format",
        "ATTACH IF NOT EXISTS 'ducklake:meta.ducklake' AS lake",
    ),
    "vortex": _extension("vortex",
        CATEGORY_DATASOURCE,
        "读取 Vortex 列式格式",
        "Read Vortex columnar files",
        "SELECT * FROM read_vortex('path/to/file.vortex')",
    ),
    "excel": _extension("excel",
        CATEGORY_DATASOURCE,
        "Excel 读写",
        "Excel read & write",
        "SELECT * FROM 'path/to/file.xlsx'", bundled=True,
    ),
    "httpfs": _extension("httpfs",
        CATEGORY_DATASOURCE,
        "HTTP(S) 远程文件读取",
        "Remote files over HTTP(S)",
        "SELECT * FROM 'https://host/data.parquet'",
    ),
    "mysql": _extension(
        "mysql", CATEGORY_DATASOURCE, "连接 MySQL", "Connect to MySQL", None,
        artifact_name="mysql_scanner",
    ),
    "postgres": _extension(
        "postgres", CATEGORY_DATASOURCE, "连接 PostgreSQL", "Connect to PostgreSQL", None,
        artifact_name="postgres_scanner",
    ),
    # ---- 能力增强 ----
    "encodings": _extension("encodings",
        CATEGORY_CAPABILITY,
        "读取 GBK 等非 UTF-8 编码文件",
        "Non-UTF-8 encodings (e.g. GBK)",
        "SELECT * FROM read_csv('file.csv', encoding='gb18030')",
    ),
    "fts": _extension("fts",
        CATEGORY_CAPABILITY,
        "全文检索索引(BM25)",
        "Full-text search (BM25)",
        "PRAGMA create_fts_index('docs', 'id', 'body')",
    ),
    "vss": _extension("vss",
        CATEGORY_CAPABILITY,
        "可选 HNSW 向量索引加速（APPROX NEAREST 无需安装）",
        "Optional HNSW vector index acceleration (not required by APPROX NEAREST)",
        "SET hnsw_enable_experimental_persistence = true; CREATE INDEX idx ON tbl USING HNSW (embedding)",
    ),
    "spatial": _extension("spatial",
        CATEGORY_CAPABILITY,
        "地理空间类型与函数(体积较大)",
        "Geospatial types & functions (large)",
        "SELECT ST_AsText(ST_Point(116.4, 39.9))",
    ),
    "inet": _extension("inet",
        CATEGORY_CAPABILITY,
        "IP 地址类型与网段运算",
        "IP address types & functions",
        "SELECT '10.0.0.1/8'::INET",
    ),
}

# Compatibility export for packaging/tests; runtime installation state remains factual.
PRESEEDED = {name for name, spec in CATALOG.items() if spec.bundled}

_EXTENSIONS_CDN_BASE = "https://extensions.duckdb.org"
_DOWNLOAD_USER_AGENT = "Mozilla/5.0"
_MAX_EXTENSION_SIZE_BYTES = 512 * 1024 * 1024

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
def list_duckdb_extensions():
    """List curated extensions with factual runtime installation metadata."""
    try:
        with with_duckdb_connection() as con:
            rows = con.execute(
                "SELECT extension_name, installed, loaded, extension_version, installed_from "
                "FROM duckdb_extensions()"
            ).fetchall()
        runtime_map = {
            str(row[0]).lower(): {
                "installed": bool(row[1]),
                "loaded": bool(row[2]),
                "extension_version": row[3],
                "installed_from": row[4],
            }
            for row in rows
        }

        items = []
        for name, spec in CATALOG.items():
            runtime = runtime_map.get(spec.resolved_artifact_name.lower(), {})
            items.append(
                {
                    "name": name,
                    "load_name": spec.resolved_load_name,
                    "artifact_name": spec.resolved_artifact_name,
                    "category": spec.category,
                    "source": spec.source,
                    "description": spec.description,
                    "description_en": spec.description_en,
                    "usage": spec.usage,
                    "installed": bool(runtime.get("installed", False)),
                    "loaded": bool(runtime.get("loaded", False)),
                    "extension_version": runtime.get("extension_version"),
                    "installed_from": runtime.get("installed_from"),
                    "bundled": spec.bundled,
                    "installable": spec.installable,
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
def install_duckdb_extension(name: str):
    """触发指定扩展的后台联网安装；已在安装中则幂等返回当前进度"""
    if name not in CATALOG:
        raise APIValidationError(f"Unknown extension: {name}")
    if not CATALOG[name].installable:
        raise APIValidationError(f"Extension '{name}' cannot be installed from this catalog")

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
def get_duckdb_extension_install_status(name: str):
    """查询指定扩展的安装进度"""
    return create_success_response(
        data=_get_install_state(name),
        message_code=MessageCode.EXTENSION_INSTALL_STATUS_RETRIEVED,
    )


# ==================== 安装线程 ====================


def _resolve_target_path(name: str) -> Tuple[str, str, str]:
    """查询 DuckDB 版本/平台/扩展目录，返回 (下载 URL, 目标目录, 目标文件路径)"""
    spec = CATALOG[name]
    with with_duckdb_connection() as con:
        version = con.execute("SELECT version()").fetchone()[0]
        platform = con.execute("SELECT platform FROM pragma_platform()").fetchone()[0]
        ext_dir_row = con.execute(
            "SELECT current_setting('extension_directory')"
        ).fetchone()[0]

    ext_dir = ext_dir_row or os.path.expanduser("~/.duckdb/extensions")
    dest_dir = os.path.join(ext_dir, version, platform)
    artifact_name = spec.resolved_artifact_name
    dest_path = os.path.join(dest_dir, f"{artifact_name}.duckdb_extension")
    url = f"{_EXTENSIONS_CDN_BASE}/{version}/{platform}/{artifact_name}.duckdb_extension.gz"
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


def _extract_extension_archive(gz_path: str, candidate_path: str) -> None:
    """Stream-decompress one artifact with a hard output-size bound."""
    extracted = 0
    with gzip.open(gz_path, "rb") as gz_file, open(candidate_path, "wb") as out_file:
        while True:
            chunk = gz_file.read(64 * 1024)
            if not chunk:
                break
            extracted += len(chunk)
            if extracted > _MAX_EXTENSION_SIZE_BYTES:
                raise ValueError("Decompressed extension exceeds the maximum allowed size")
            out_file.write(chunk)
    if extracted == 0:
        raise ValueError("Downloaded extension archive is empty")


def _verify_and_publish_extension(
    connection,
    candidate_path: str,
    destination_path: str,
    *,
    replace_before_load: Optional[bool] = None,
) -> None:
    """Verify and atomically publish one candidate without losing an old artifact.

    Windows locks a successfully loaded DLL, so it must be moved into its final name
    before LOAD. POSIX verifies the candidate first and publishes afterward.
    """
    replace_first = (
        sys.platform.startswith("win")
        if replace_before_load is None
        else replace_before_load
    )
    if not replace_first:
        connection.execute(f"LOAD '{escape_string_literal(candidate_path)}'")
        os.replace(candidate_path, destination_path)
        return

    rollback_path = destination_path + ".rollback"
    had_previous = os.path.exists(destination_path)
    if os.path.exists(rollback_path):
        raise RuntimeError(
            f"Unresolved extension rollback file exists: {rollback_path}"
        )
    if had_previous:
        os.replace(destination_path, rollback_path)
    try:
        os.replace(candidate_path, destination_path)
        connection.execute(f"LOAD '{escape_string_literal(destination_path)}'")
    except Exception:
        if os.path.exists(destination_path):
            os.remove(destination_path)
        if had_previous and os.path.exists(rollback_path):
            os.replace(rollback_path, destination_path)
        raise
    if os.path.exists(rollback_path):
        try:
            os.remove(rollback_path)
        except OSError as exc:
            logger.warning("Failed to remove extension rollback file %s: %s", rollback_path, exc)


def _run_extension_install(name: str) -> None:
    """Download, verify a candidate offline, then atomically publish it."""
    gz_path: Optional[str] = None
    candidate_path: Optional[str] = None
    try:
        url, dest_dir, dest_path = _resolve_target_path(name)
        os.makedirs(dest_dir, exist_ok=True)

        logger.info("Downloading DuckDB extension %s from %s", name, url)
        gz_path = dest_path + ".gz.tmp"
        _download_extension_archive(url, gz_path, name)

        _set_install_state(name, status="verifying", progress=90)

        candidate_path = dest_path + ".candidate.duckdb_extension"
        _extract_extension_archive(gz_path, candidate_path)
        os.remove(gz_path)
        gz_path = None

        with with_duckdb_connection() as con:
            # Verify the exact downloaded artifact with autoinstall disabled. Loading
            # by alias could silently fetch a second canonical file and mask bad paths.
            with _autoinstall_toggle_lock:
                previous = bool(
                    con.execute(
                        "SELECT current_setting('autoinstall_known_extensions')"
                    ).fetchone()[0]
                )
                con.execute("SET autoinstall_known_extensions=false")
                try:
                    _verify_and_publish_extension(
                        con,
                        candidate_path,
                        dest_path,
                    )
                    candidate_path = None
                finally:
                    con.execute(
                        "SET autoinstall_known_extensions="
                        f"{'true' if previous else 'false'}"
                    )

        _set_install_state(name, status="done", progress=100, error=None)
        logger.info("DuckDB extension %s installed successfully", name)

    except Exception as exc:
        logger.error("Failed to install DuckDB extension %s: %s", name, exc, exc_info=True)
        current = _get_install_state(name)
        _set_install_state(
            name,
            status="error",
            progress=current.get("progress", 0),
            error=f"Extension {name} installation failed: {str(exc)[:200]}",
        )
    finally:
        for temporary_path in (gz_path, candidate_path):
            if temporary_path and os.path.exists(temporary_path):
                try:
                    os.remove(temporary_path)
                except OSError:
                    pass
