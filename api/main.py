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

logger = logging.getLogger(__name__)


def load_mysql_configs_on_startup():
    """应用启动时加载MySQL配置到数据库管理器"""
    try:
        mysql_config_file = "mysql_configs.json"
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
            logger.info("未找到mysql_configs.json文件")

    except Exception as e:
        logger.error(f"加载MySQL配置时出错: {str(e)}")


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
    load_mysql_configs_on_startup()
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
