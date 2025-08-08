from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import json
import os
import traceback
from datetime import datetime
from core.security import security_validator
from core.config_manager import config_manager
from core.exceptions import setup_exception_handlers

from routers import (
    data_sources,
    query,
    mysql_unified,  # 统一的MySQL路由模块
    paste_data,
    duckdb_query,
    chunked_upload,
    url_reader,
)

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
    get_db_connection,
    create_persistent_table,
    create_varchar_table_from_dataframe,
    ensure_all_tables_varchar,
)

logger = logging.getLogger(__name__)


def load_mysql_configs_on_startup():
    """应用启动时加载MySQL配置到数据库管理器"""
    try:
        mysql_config_file = "../config/mysql-configs.json"
        logger.info(f"尝试加载MySQL配置文件: {mysql_config_file}")

        if os.path.exists(mysql_config_file):
            logger.info("找到MySQL配置文件，开始加载...")
            with open(mysql_config_file, "r") as f:
                configs = json.load(f)

            logger.info(f"配置文件包含 {len(configs)} 个配置")

            for config in configs:
                logger.info(f"正在处理配置: {config.get('id', 'unknown')}")
                # 创建DatabaseConnection对象
                db_connection = DatabaseConnection(
                    id=config["id"],
                    name=config.get("name", config["id"]),
                    type=DataSourceType.MYSQL,
                    params=config["params"],
                    created_at=datetime.now(),
                )

                # 添加到数据库管理器
                success = db_manager.add_connection(db_connection)
                if success:
                    logger.info(f"成功加载MySQL配置: {config['id']}")
                else:
                    logger.error(f"加载MySQL配置失败: {config['id']}")
        else:
            logger.warning(f"未找到MySQL配置文件: {mysql_config_file}")
            # 检查其他可能的位置
            alternative_paths = [
                "config/mysql-configs.json",
                "mysql-configs.json",
                "../mysql-configs.json",
            ]
            for alt_path in alternative_paths:
                if os.path.exists(alt_path):
                    logger.info(f"在备用位置找到配置文件: {alt_path}")
                    break
            else:
                logger.warning("在所有可能的位置都未找到MySQL配置文件")

    except Exception as e:
        logger.error(f"加载MySQL配置时出错: {str(e)}")
        logger.error(f"错误详情: {traceback.format_exc()}")


def register_mysql_connections_as_datasources():
    """将MySQL连接注册为可用数据源（不预执行SQL）"""
    try:
        logger.info("注册MySQL连接为数据源...")

        # 使用统一的配置读取函数（包含解密逻辑）
        from routers.data_sources import read_mysql_configs

        mysql_configs_list = read_mysql_configs()

        # 转换为字典格式以兼容现有代码
        mysql_configs = {}
        for config in mysql_configs_list:
            mysql_configs[config["id"]] = type(
                "Config",
                (),
                {
                    "id": config["id"],
                    "name": config.get("name", config["id"]),
                    "enabled": config.get("enabled", True),
                    "params": config["params"],
                },
            )()

        if not mysql_configs:
            logger.info("未找到MySQL连接配置")
            return

        # 将MySQL连接添加到数据库管理器
        from core.database_manager import db_manager
        from models.query_models import DatabaseConnection, DataSourceType

        success_count = 0
        for config_id, config in mysql_configs.items():
            try:
                if not config.enabled:
                    logger.info(f"跳过已禁用的MySQL连接: {config_id}")
                    continue

                # 创建数据库连接对象
                db_connection = DatabaseConnection(
                    id=config.id,
                    name=config.name,
                    type=DataSourceType.MYSQL,
                    params=config.params,
                    created_at=datetime.now(),
                )

                # 添加到数据库管理器
                success = db_manager.add_connection(db_connection)
                if success:
                    logger.info(f"成功注册MySQL数据源: {config_id}")
                    success_count += 1
                else:
                    logger.error(f"注册MySQL数据源失败: {config_id}")

            except Exception as e:
                logger.error(f"注册MySQL数据源失败 {config_id}: {str(e)}")

        logger.info(f"MySQL数据源注册完成，成功: {success_count}/{len(mysql_configs)}")

    except Exception as e:
        logger.error(f"注册MySQL数据源时出错: {str(e)}")


def load_file_datasources_on_startup():
    """应用启动时重新加载所有文件数据源到DuckDB"""
    try:
        logger.info("开始重新加载文件数据源...")
        duckdb_con = get_db_connection()
        success_count = reload_all_file_datasources_to_duckdb(duckdb_con)
        logger.info(f"文件数据源重新加载完成，成功加载 {success_count} 个文件")
    except Exception as e:
        logger.error(f"重新加载文件数据源时出错: {str(e)}")


app = FastAPI(
    title="Interactive Data Query API",
    description="Enhanced API for interactive data querying, joining, and exporting with multi-database support using DuckDB native extensions.",
    version="2.1.0",
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
app.include_router(mysql_unified.router)  # 统一的MySQL路由模块
app.include_router(paste_data.router)  # 数据粘贴板路由
app.include_router(duckdb_query.router)  # DuckDB自定义SQL查询路由
app.include_router(chunked_upload.router)  # 分块文件上传路由
app.include_router(url_reader.router)  # URL文件读取路由

# 条件性注册可能存在的其他路由
if enhanced_data_sources_available:
    app.include_router(enhanced_data_sources.router)  # DuckDB原生扩展路由

if query_proxy_available:
    app.include_router(query_proxy.router)  # 查询代理路由


# 应用启动事件
@app.on_event("startup")
async def startup_event():
    """应用启动时执行的初始化操作"""
    logger.info("应用启动中...")

    # 加载MySQL配置
    load_mysql_configs_on_startup()

    # 注册MySQL连接为数据源
    register_mysql_connections_as_datasources()

    # 重新加载文件数据源
    load_file_datasources_on_startup()

    # 确保所有表都是VARCHAR类型（解决JOIN类型转换问题）
    logger.info("开始检查和转换表类型...")
    ensure_all_tables_varchar()
    logger.info("表类型检查和转换完成")

    logger.info("应用启动完成")


@app.get("/", tags=["Default"])
async def root():
    return {
        "message": "Welcome to the Enhanced Interactive Data Query API",
        "version": "2.0.0",
        "features": [
            "Multi-database support (MySQL, PostgreSQL, SQLite)",
            "Enhanced file format support (CSV, Excel, JSON, Parquet)",
            "Advanced JOIN operations",
            "Data export functionality",
            "Connection management",
        ],
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "timestamp": "2025-01-18"}
