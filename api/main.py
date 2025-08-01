from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import json
import os
from datetime import datetime

from routers import (
    data_sources,
    query,
    mysql_query,
    mysql_datasource_manager,
    mysql_query_fallback,
    mysql_robust_manager,
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
from core.duckdb_engine import get_db_connection, create_persistent_table, create_varchar_table_from_dataframe, ensure_all_tables_varchar

logger = logging.getLogger(__name__)


def load_mysql_configs_on_startup():
    """应用启动时加载MySQL配置到数据库管理器"""
    try:
        mysql_config_file = "../config/mysql-configs.json"
        if os.path.exists(mysql_config_file):
            with open(mysql_config_file, "r") as f:
                configs = json.load(f)

            for config in configs:
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
            logger.info("未找到mysql-configs.json文件")

    except Exception as e:
        logger.error(f"加载MySQL配置时出错: {str(e)}")


def load_mysql_datasources_on_startup():
    """应用启动时重新加载所有MySQL数据源到DuckDB"""
    try:
        logger.info("开始重新加载MySQL数据源...")

        # 加载MySQL数据源配置
        mysql_datasource_file = "../config/datasources.json"
        if not os.path.exists(mysql_datasource_file):
            logger.info("未找到datasources.json文件")
            return

        with open(mysql_datasource_file, "r", encoding="utf-8") as f:
            datasources = json.load(f)

        if not datasources:
            logger.info("MySQL数据源配置为空")
            return

        # 加载MySQL连接配置
        mysql_config_file = "../config/mysql-configs.json"
        mysql_configs = {}
        if os.path.exists(mysql_config_file):
            with open(mysql_config_file, "r", encoding="utf-8") as f:
                configs = json.load(f)
                for config in configs:
                    mysql_configs[config["id"]] = config

        duckdb_con = get_db_connection()
        success_count = 0

        for datasource in datasources:
            try:
                connection_name = datasource.get("connection_name")
                sql_query = datasource.get("sql_query")
                # 兼容不同的ID字段名
                datasource_id = datasource.get("datasource_id") or datasource.get("id")

                if not all([connection_name, sql_query, datasource_id]):
                    logger.warning(f"MySQL数据源配置不完整，跳过: {datasource}")
                    continue

                # 获取连接配置
                if connection_name not in mysql_configs:
                    logger.warning(f"未找到MySQL连接配置: {connection_name}")
                    continue

                mysql_config = mysql_configs[connection_name]["params"]

                # 重新执行SQL查询
                from sqlalchemy import create_engine
                import pandas as pd

                # 支持 user 和 username 两种参数名称
                username = mysql_config.get('user') or mysql_config.get('username')
                if not username:
                    logger.error(f"MySQL配置缺少用户名: {connection_name}")
                    continue

                connection_str = (
                    f"mysql+pymysql://{username}:{mysql_config['password']}"
                    f"@{mysql_config['host']}:{mysql_config.get('port', 3306)}/{mysql_config['database']}"
                    "?charset=utf8mb4"
                )

                engine = create_engine(connection_str)
                df = pd.read_sql(sql_query, engine)

                # 创建持久化表，使用VARCHAR类型
                success = create_varchar_table_from_dataframe(datasource_id, df, duckdb_con)
                if success:
                    logger.info(f"成功重新加载MySQL数据源: {datasource_id} ({len(df)}行)")
                    success_count += 1
                else:
                    logger.error(f"重新加载MySQL数据源失败: {datasource_id}")

            except Exception as e:
                logger.error(f"重新加载MySQL数据源失败 {datasource.get('datasource_id', 'unknown')}: {str(e)}")

        logger.info(f"MySQL数据源重新加载完成，成功: {success_count}/{len(datasources)}")

    except Exception as e:
        logger.error(f"重新加载MySQL数据源时出错: {str(e)}")


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

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for simplicity, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(data_sources.router)
app.include_router(query.router)
app.include_router(mysql_query.router)  # 新增：MySQL自定义查询路由
app.include_router(mysql_datasource_manager.router)  # 新增：MySQL数据源管理路由
app.include_router(mysql_query_fallback.router)  # 新增：MySQL安全查询路由
app.include_router(mysql_robust_manager.router)  # 新增：MySQL强化管理路由
app.include_router(paste_data.router)  # 新增：数据粘贴板路由
app.include_router(duckdb_query.router)  # 新增：DuckDB自定义SQL查询路由
app.include_router(chunked_upload.router)  # 新增：分块文件上传路由
app.include_router(url_reader.router)  # 新增：URL文件读取路由

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

    # 重新加载MySQL数据源
    load_mysql_datasources_on_startup()

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
