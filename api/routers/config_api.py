import duckdb
from fastapi import APIRouter
from pydantic import BaseModel
from core.common.exceptions import ValidationError as APIValidationError
from utils.response_helpers import create_success_response, MessageCode
from core.common.config_manager import config_manager
from core.database.duckdb_engine import (
    ENGINE_COMPAT_OPTIONS,
    apply_engine_compat_settings,
    with_duckdb_connection,
)
from core.database.duckdb_pool import with_system_connection
from core.database.duckdb_storage import DUCKDB_STORAGE_COMPATIBILITY_VERSION
from core.database.storage_upgrade import schedule_storage_upgrade, storage_upgrade_plan

router = APIRouter()


@router.get("/api/resource-budget", tags=["Config"])
def get_budget():
    """Return the configured resource budget without acquiring a user connection."""
    from core.database.resource_budget import get_resource_budget
    return create_success_response(data=get_resource_budget(config_manager.get_app_config()), message_code=MessageCode.OPERATION_SUCCESS)


@router.get("/api/storage-upgrade/backup", tags=["Config"])
def inspect_storage_backup():
    """Read-only inspection of the latest migration backup."""
    from core.database.backup_inspection import inspect_latest_backup
    return create_success_response(data=inspect_latest_backup(), message_code=MessageCode.OPERATION_SUCCESS)


@router.post("/api/storage-upgrade/open-backup", tags=["Config"])
def open_storage_backup():
    """Open the validated backup folder on the desktop host."""
    from core.database.backup_inspection import open_latest_backup
    return create_success_response(data={"opened": open_latest_backup()}, message_code=MessageCode.OPERATION_SUCCESS)


class EngineCompatSettings(BaseModel):
    """引擎兼容性配置：与 DuckDB 各扩展注册的 SET GLOBAL 开关一一对应，
    默认值与 DuckDB 原生默认一致（全 false）"""

    sqlite_all_varchar: bool = False
    mysql_incomplete_dates_as_nulls: bool = False
    pg_array_as_varchar: bool = False
    unsafe_enable_version_guessing: bool = False


class StorageUpgradeConfirmation(BaseModel):
    confirm_backup: bool = False
    confirm_no_downgrade: bool = False


def _remote_storage_configured(app_config) -> bool:
    settings = getattr(app_config, "duckdb_remote_settings", None) or {}
    if not isinstance(settings, dict):
        return False
    return bool(
        settings.get("s3_access_key_id")
        or settings.get("s3_secret_access_key")
        or settings.get("s3_endpoint")
        or settings.get("s3_region")
    )


def _duckdb_versions() -> tuple[str, str]:
    connection = duckdb.connect(":memory:")
    try:
        engine_version = str(connection.execute("SELECT version()").fetchone()[0])
    finally:
        connection.close()
    return str(duckdb.__version__), engine_version


def _database_storage_version(connection) -> str:
    row = connection.execute(
        "SELECT tags FROM duckdb_databases() "
        "WHERE database_name = current_database()"
    ).fetchone()
    tags = row[0] if row and isinstance(row[0], dict) else {}
    return str(tags.get("storage_version") or "unknown")


def _current_storage_upgrade_plan() -> dict:
    with with_duckdb_connection() as connection:
        main_storage_version = _database_storage_version(connection)
    with with_system_connection() as connection:
        system_storage_version = _database_storage_version(connection)
    return storage_upgrade_plan(main_storage_version, system_storage_version)


def format_file_size(size_bytes: int) -> str:
    """将字节数转换为人类可读的格式"""
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024 * 1024):.0f}GB"
    elif size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.0f}MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.0f}KB"
    else:
        return f"{size_bytes}B"


@router.get("/api/app-config/features", tags=["Config"])
def get_app_features():
    """
    返回前端需要的功能开关与关键阈值。
    - enable_pivot_tables: 是否启用透视表
    - pivot_table_extension: 透视扩展名称
    - max_query_rows: 预览时前端展示/拼接LIMIT可参考的最大行数
    - max_file_size: 最大文件上传大小（字节）
    - max_file_size_display: 最大文件上传大小（人类可读格式）
    """
    app_config = config_manager.get_app_config()
    python_version, engine_version = _duckdb_versions()
    storage_plan = _current_storage_upgrade_plan()
    max_file_size = int(getattr(app_config, "max_file_size", 500 * 1024 * 1024))
    return create_success_response(
        data={
            "enable_pivot_tables": bool(getattr(app_config, "enable_pivot_tables", True)),
            "pivot_table_extension": getattr(
                app_config, "pivot_table_extension", "pivot_table"
            ),
            "max_query_rows": int(getattr(app_config, "max_query_rows", 10000)),
            "pivot_max_columns": int(getattr(app_config, "pivot_max_columns", 300)),
            "max_file_size": max_file_size,
            "max_file_size_display": format_file_size(max_file_size),
            "federated_query_timeout": int(getattr(app_config, "federated_query_timeout", 300)),
            "json_import_column_type": str(
                getattr(app_config, "json_import_column_type", "auto") or "auto"
            ),
            "remote_storage_configured": _remote_storage_configured(app_config),
            "duckdb_python_version": python_version,
            "duckdb_engine_version": engine_version,
            "duckdb_storage_compatibility_version": DUCKDB_STORAGE_COMPATIBILITY_VERSION,
            "duckdb_main_storage_version": storage_plan["main"]["version"],
            "duckdb_system_storage_version": storage_plan["system"]["version"],
            "duckdb_storage_upgrade_required": storage_plan["required"],
        },
        message_code=MessageCode.APP_FEATURES_RETRIEVED,
    )


@router.get("/api/storage-upgrade", tags=["Config"])
def get_storage_upgrade():
    """Return the current offline migration plan and latest report."""
    return create_success_response(
        data=_current_storage_upgrade_plan(),
        message_code=MessageCode.OPERATION_SUCCESS,
    )


@router.post("/api/storage-upgrade/schedule", tags=["Config"])
def post_storage_upgrade(payload: StorageUpgradeConfirmation):
    """Schedule storage migration for the next process start."""
    if not payload.confirm_backup or not payload.confirm_no_downgrade:
        raise APIValidationError(
            "Backup and no-downgrade confirmations are both required"
        )
    plan = _current_storage_upgrade_plan()
    if not plan["required"]:
        return create_success_response(
            data=plan,
            message_code=MessageCode.OPERATION_SUCCESS,
        )
    if plan["free_bytes"] < plan["required_bytes"]:
        raise APIValidationError("Insufficient disk space for storage migration")
    if plan["active_queries"] > 0:
        raise APIValidationError("Active queries must finish before scheduling migration")
    request = schedule_storage_upgrade()
    return create_success_response(
        data={**plan, "pending_restart": True, "backup_directory": request["backup_directory"]},
        message_code=MessageCode.OPERATION_SUCCESS,
    )


@router.get("/api/app-config/engine-compat", tags=["Config"])
def get_engine_compat():
    """返回当前引擎兼容性配置（四个布尔开关，默认全 false）。"""
    app_config = config_manager.get_app_config()
    compat = app_config.engine_compat or {}
    return create_success_response(
        data={option: bool(compat.get(option, False)) for option in ENGINE_COMPAT_OPTIONS},
        message_code=MessageCode.OPERATION_SUCCESS,
    )


@router.put("/api/app-config/engine-compat", tags=["Config"])
def put_engine_compat(payload: EngineCompatSettings):
    """保存引擎兼容性配置，并立即在连接池上生效（SET GLOBAL，见 apply_engine_compat_settings）。"""
    new_values = payload.model_dump()
    config_manager.update_app_config(engine_compat=new_values)

    with with_duckdb_connection() as connection:
        apply_engine_compat_settings(connection, new_values)

    return create_success_response(
        data=new_values, message_code=MessageCode.OPERATION_SUCCESS
    )
