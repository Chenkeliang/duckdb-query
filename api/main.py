from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import json
import os
import traceback
import base64
from datetime import datetime
from cryptography.fernet import Fernet
from contextlib import asynccontextmanager
from core.security.security import security_validator
from core.common.config_manager import config_manager
from core.common.exceptions import setup_exception_handlers
from core.security.encryption import password_encryptor
from middleware import RequestIdMiddleware

from routers import (
    file_ingestion,  # 文件入湖：/api/upload、/api/data-sources/excel/*
    join_query,  # 联邦 JOIN：/api/query；save_query_to_duckdb
    paste_data,
    duckdb_query,  # DuckDB / 联邦 SQL：/api/duckdb/*
    chunked_upload,
    url_reader,
    server_files,
    async_tasks,
    database_tables,  # 外部库元数据：/api/datasources/databases/*
    sql_favorites,
    datasources,  # 统一数据源：/api/datasources/*
    settings,
    query_cancel,
    pivot_query,  # /api/pivot-query/*
    set_operations,  # /api/set-operations/*
    query_export,  # /api/query-results/export
    duckdb_extensions,  # DuckDB 扩展管理：/api/duckdb/extensions/*
)
from routers import config_api
from routers import ai as ai_router
from core.database.database_manager import db_manager
from models.query_models import DatabaseConnection, DataSourceType
from core.data.file_datasource_manager import reload_all_file_datasources_to_duckdb
from core.database.duckdb_engine import (
    with_duckdb_connection,
    create_persistent_table,
    create_varchar_table_from_dataframe,
    ensure_all_tables_varchar,
)
from core.services.cleanup_scheduler import start_cleanup_scheduler, stop_cleanup_scheduler

logger = logging.getLogger(__name__)


def load_file_datasources_on_startup():
    """应用启动时重新加载所有文件数据源到DuckDB"""
    try:
        logger.info("Starting to reload file datasources...")
        with with_duckdb_connection() as duckdb_con:
            success_count = reload_all_file_datasources_to_duckdb(duckdb_con)
        logger.info(f"File datasources reload completed, successfully loaded files")
    except Exception as e:
        logger.error(f"Error reloading file datasources: {str(e)}")


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    """统一管理应用生命周期，替代 on_event 钩子"""
    logger.info("Application is starting...")
    
    # 加载数据库连接配置
    try:
        logger.info("Starting to load database connection configuration...")
        db_manager._load_connections_from_config()
        connections = db_manager.list_connections()
        logger.info(f"Database connection configuration loaded, total {len(connections)} connections")
        logger.info("All datasources loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load datasources at startup: {str(e)}")

    try:
        from routers.async_tasks import cleanup_old_files

        start_cleanup_scheduler(cleanup_old_files)
        logger.info("File cleanup scheduler started successfully")
    except Exception as e:
        logger.error(f"Failed to start file cleanup scheduler: {str(e)}")

    # Record the live port so local tools (the MCP server) can auto-discover us.
    from core.common.paths import write_runtime_file
    _port = int(os.getenv("DUCKQUERY_PORT") or os.getenv("PORT") or 48001)
    write_runtime_file(_port)

    try:
        yield
    finally:
        logger.info("Application is shutting down...")
        try:
            stop_cleanup_scheduler()
            logger.info("File cleanup scheduler stopped")
        except Exception as e:
            logger.error(f"Failed to stop file cleanup scheduler: {str(e)}")

        try:
            from core.database.duckdb_pool import shutdown_all_duckdb_connections

            shutdown_all_duckdb_connections()
            logger.info("DuckDB connections closed (WAL checkpointed)")
        except Exception as e:
            logger.error(f"Failed to close DuckDB connections during shutdown: {str(e)}")


app = FastAPI(
    title="DuckQuery · DuckDB Query API",
    description="API for DuckDB ingestion, federated SQL, JOIN/pivot/set-operation builders, and async analytics.",
    version="2.1.0",
    lifespan=app_lifespan,
)

# 设置统一异常处理
setup_exception_handlers(app)

# CORS middleware for frontend communication
# 使用统一配置管理器
app_config = config_manager.get_app_config()

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_config.cors_origins,  # 从配置管理器获取允许的源
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # 限制允许的方法
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "X-Request-ID",
    ],  # 限制允许的头部
    expose_headers=["X-Request-ID"],  # 暴露 X-Request-ID 头部给前端
)

# RequestId 中间件（查询取消功能支持）
app.add_middleware(RequestIdMiddleware)

# Include routers（职责说明见 api/routers/README.md）
app.include_router(datasources.router)
app.include_router(file_ingestion.router)
app.include_router(duckdb_query.router)
app.include_router(join_query.router)
app.include_router(pivot_query.router)
app.include_router(set_operations.router)
app.include_router(query_export.router)
app.include_router(paste_data.router)
app.include_router(chunked_upload.router)
app.include_router(url_reader.router)
app.include_router(server_files.router)
app.include_router(async_tasks.router)
app.include_router(database_tables.router)
app.include_router(sql_favorites.router)
app.include_router(config_api.router)
app.include_router(ai_router.router)
app.include_router(settings.router)
app.include_router(query_cancel.router)
app.include_router(duckdb_extensions.router)

# 桌面端专用：本地优雅停机端点。Docker/Web 部署没有 DUCKQUERY_DESKTOP=1，不会暴露。
if os.getenv("DUCKQUERY_DESKTOP") == "1":
    from routers import system_control

    app.include_router(system_control.router)


@app.get("/", tags=["Default"])
async def root():
    return {
        "message": "Welcome to the DuckQuery · DuckDB analytics API",
        "version": "2.0.0",
        "features": [
            "DuckDB-native execution with multi-database federation (MySQL, PostgreSQL, SQLite)",
            "High-performance file ingestion (CSV, Excel, JSON, Parquet)",
            "SQL, JOIN, pivot, and set-operation query builders with type-aware validation",
            "Asynchronous task execution and result export",
            "Connection management & credential security",
        ],
    }


def initialize_encryption_key():
    """
    Initializes the encryption key for the application.
    It follows a strict order:
    1. Check for SECRET_KEY environment variable.
    2. Check for a persisted key file in the data directory.
    3. If neither exists, generate a new key and save it to the file.
    """
    logger.info("Initializing encryption key...")
    secret_key_env = os.getenv("SECRET_KEY")
    key_file_path = os.path.join("data", ".secret_key")

    secret_key = None

    if secret_key_env:
        logger.info("Found SECRET_KEY in environment variables.")
        # Ensure the key is properly encoded for Fernet
        secret_key = base64.urlsafe_b64encode(
            secret_key_env.encode("utf-8").ljust(32)[:32]
        )
    elif os.path.exists(key_file_path):
        logger.info(f"Found persisted secret key file at {key_file_path}.")
        with open(key_file_path, "rb") as f:
            secret_key = f.read()
    else:
        logger.warning("No SECRET_KEY found. Generating a new one.")
        secret_key = Fernet.generate_key()
        try:
            os.makedirs("data", exist_ok=True)
            with open(key_file_path, "wb") as f:
                f.write(secret_key)
            logger.info(f"New secret key generated and saved to {key_file_path}.")
        except Exception as e:
            logger.error(f"Failed to save new secret key: {e}")
            # Fallback to using the key in memory without persisting

    # Note: The password_encryptor is already initialized in core/encryption.py
    # We don't need to re-initialize it here
    if secret_key:
        logger.info("Encryption key initialized successfully.")
    else:
        logger.error(
            "CRITICAL: Could not initialize encryption key. Password encryption will fail."
        )


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "timestamp": "2025-01-18"}
