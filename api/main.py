from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import json
import os
import traceback
from datetime import datetime
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
    column_analysis,  # /api/columns/infer-cast
)
from routers import config_api
from routers import ai as ai_router
from core.database.database_manager import db_manager
from models.query_models import DatabaseConnection, DataSourceType
from core.data.file_datasource_manager import reload_all_file_datasources_to_duckdb
from core.database.duckdb_engine import with_duckdb_connection
from core.services.cleanup_scheduler import start_cleanup_scheduler, stop_cleanup_scheduler
from core.common.timezone_utils import get_current_time_iso

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
        from routers.chunked_upload import reap_stale_upload_sessions

        def _scheduled_cleanup() -> int:
            # 调度器是单回调,此组合点是唯一隔离层:一个回收失败不吞掉另一个
            cleaned = 0
            try:
                cleaned += cleanup_old_files()
            except Exception as exc:
                logger.error(f"cleanup_old_files failed: {exc}")
            try:
                cleaned += reap_stale_upload_sessions()
            except Exception as exc:
                logger.error(f"reap_stale_upload_sessions failed: {exc}")
            return cleaned

        start_cleanup_scheduler(_scheduled_cleanup)
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
app.include_router(column_analysis.router)
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


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "timestamp": get_current_time_iso()}
