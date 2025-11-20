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
from core.security import security_validator
from core.config_manager import config_manager
from core.exceptions import setup_exception_handlers
from core.encryption import password_encryptor

from routers import (
    data_sources,
    query,
    paste_data,
    duckdb_query,
    chunked_upload,
    url_reader,
    server_files,
    async_tasks,  # 异步任务路由
    database_tables,  # 数据库表管理路由
    sql_favorites,  # SQL收藏路由
)
from routers import config_api  # 配置暴露路由

# 尝试导入可能存在的其他路由模块
try:
    from routers import enhanced_data_sources

    enhanced_data_sources_available = True
except ImportError:
    enhanced_data_sources_available = False

try:
    from routers import query_proxy

    query_proxy_available = True
except ImportError:
    query_proxy_available = False
from core.database_manager import db_manager
from models.query_models import DatabaseConnection, DataSourceType
from core.file_datasource_manager import reload_all_file_datasources_to_duckdb
from core.duckdb_engine import (
    with_duckdb_connection,
    create_persistent_table,
    create_varchar_table_from_dataframe,
    ensure_all_tables_varchar,
)
from core.cleanup_scheduler import start_cleanup_scheduler, stop_cleanup_scheduler

logger = logging.getLogger(__name__)


def load_file_datasources_on_startup():
    """应用启动时重新加载所有文件数据源到DuckDB"""
    try:
        logger.info("开始重新加载文件数据源...")
        with with_duckdb_connection() as duckdb_con:
            success_count = reload_all_file_datasources_to_duckdb(duckdb_con)
        logger.info(f"文件数据源重新加载完成，成功加载 {success_count} 个文件")
    except Exception as e:
        logger.error(f"重新加载文件数据源时出错: {str(e)}")


@asynccontextmanager
async def app_lifespan(app: FastAPI):
    """统一管理应用生命周期，替代 on_event 钩子"""
    logger.info("应用正在启动...")
    try:
        logger.info("开始加载数据库连接配置...")
        db_manager._load_connections_from_config()
        connections = db_manager.list_connections()
        logger.info(f"数据库连接配置加载完成，共 {len(connections)} 个连接")
        logger.info("所有数据源加载完成")
    except Exception as e:
        logger.error(f"启动时加载数据源失败: {str(e)}")

    try:
        from routers.async_tasks import cleanup_old_files

        start_cleanup_scheduler(cleanup_old_files)
        logger.info("文件清理调度器启动成功")
    except Exception as e:
        logger.error(f"启动文件清理调度器失败: {str(e)}")

    try:
        yield
    finally:
        logger.info("应用关闭中...")
        try:
            stop_cleanup_scheduler()
            logger.info("文件清理调度器已停止")
        except Exception as e:
            logger.error(f"停止文件清理调度器失败: {str(e)}")


app = FastAPI(
    title="DuckQuery · DuckDB Visual Analytics API",
    description="Interactive API for DuckDB-powered data ingestion, cross-source joins, and analytics with native DuckDB extensions.",
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
    ],  # 限制允许的头部
)

# Include routers
app.include_router(data_sources.router)
app.include_router(query.router)
app.include_router(paste_data.router)  # 数据粘贴板路由
app.include_router(duckdb_query.router)  # DuckDB自定义SQL查询路由
app.include_router(chunked_upload.router)  # 分块文件上传路由
app.include_router(url_reader.router)  # URL文件读取路由
app.include_router(server_files.router)  # 服务器目录读取/导入路由
app.include_router(async_tasks.router)  # 异步任务路由
app.include_router(database_tables.router)  # 数据库表管理路由
app.include_router(sql_favorites.router)  # SQL收藏路由
app.include_router(config_api.router)  # 配置暴露路由

# 条件性注册可能存在的其他路由
if enhanced_data_sources_available:
    app.include_router(enhanced_data_sources.router)  # DuckDB原生扩展路由

if query_proxy_available:
    app.include_router(query_proxy.router)  # 查询代理路由


@app.get("/", tags=["Default"])
async def root():
    return {
        "message": "Welcome to the DuckQuery · DuckDB analytics API",
        "version": "2.0.0",
        "features": [
            "DuckDB-native execution with multi-database federation (MySQL, PostgreSQL, SQLite)",
            "High-performance file ingestion (CSV, Excel, JSON, Parquet)",
            "Visual + SQL driven JOIN operations and type-aware validation",
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

