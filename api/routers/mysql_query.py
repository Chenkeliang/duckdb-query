from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd
import logging
import traceback
import json
import os
from sqlalchemy import create_engine
from core.duckdb_engine import get_db_connection, create_persistent_table
from typing import Dict, Any

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()

# MySQL配置文件路径
MYSQL_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "mysql_configs.json"
)


def load_mysql_configs():
    """加载MySQL配置文件"""
    try:
        if not os.path.exists(MYSQL_CONFIG_FILE):
            return {}

        with open(MYSQL_CONFIG_FILE, "r", encoding="utf-8") as f:
            configs = json.load(f)

        # 转换为字典格式，以id为key
        config_dict = {}
        for config in configs:
            config_dict[config["id"]] = config

        return config_dict
    except Exception as e:
        logger.error(f"加载MySQL配置失败: {str(e)}")
        return {}


def get_mysql_connection_info(datasource_name: str):
    """根据数据源名称获取MySQL连接信息"""
    configs = load_mysql_configs()

    if datasource_name not in configs:
        raise HTTPException(
            status_code=404, detail=f"未找到数据源配置: {datasource_name}"
        )

    config = configs[datasource_name]
    return config["params"]


@router.post("/api/mysql_custom_query", tags=["MySQL Query"])
async def execute_mysql_custom_query(request: dict = Body(...)):
    """
    执行MySQL自定义SQL查询并加载到DuckDB

    请求参数:
    - datasource_name: 数据源名称（从配置文件中查找）
    - sql: 自定义SQL查询语句
    - table_name: 可选，在DuckDB中的表名，默认使用数据源名称
    """
    try:
        datasource_name = request.get("datasource_name")
        custom_sql = request.get("sql")
        table_name = request.get("table_name", datasource_name)

        if not datasource_name:
            raise HTTPException(status_code=400, detail="缺少数据源名称参数")

        if not custom_sql:
            raise HTTPException(status_code=400, detail="缺少SQL查询语句")

        logger.info(f"执行MySQL自定义查询: 数据源={datasource_name}, 表名={table_name}")
        logger.info(f"SQL: {custom_sql}")

        # 获取MySQL连接信息（从配置文件）
        mysql_config = get_mysql_connection_info(datasource_name)

        # 创建MySQL连接
        connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=utf8mb4"

        # 执行查询
        engine = create_engine(connection_str)
        df = pd.read_sql(custom_sql, engine)

        logger.info(f"查询完成，获得 {len(df)} 行数据")

        # 处理数据类型，确保可JSON序列化
        df = df.fillna("")  # 处理NaN值
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].astype(str)
            elif df[col].dtype == "datetime64[ns]":
                df[col] = df[col].dt.strftime("%Y-%m-%d %H:%M:%S")

        # 创建持久化表到DuckDB
        duckdb_con = get_db_connection()
        success = create_persistent_table(table_name, df, duckdb_con)

        if not success:
            raise Exception("数据持久化到DuckDB失败")

        logger.info(f"数据已持久化到DuckDB，表名: {table_name}")

        # 验证注册成功
        tables_df = duckdb_con.execute("SHOW TABLES").fetchdf()
        logger.info(f"当前DuckDB表: {tables_df['name'].tolist()}")

        return {
            "success": True,
            "message": f"查询成功，数据已加载到DuckDB表: {table_name}",
            "datasource_name": datasource_name,
            "table_name": table_name,
            "row_count": len(df),
            "columns": df.columns.tolist(),
            "sample_data": df.head(5).to_dict(orient="records"),
            "sql_executed": custom_sql,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MySQL自定义查询失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"查询执行失败: {str(e)}")


@router.get("/api/mysql_datasources", tags=["MySQL Query"])
async def list_mysql_datasources():
    """
    获取可用的MySQL数据源列表
    """
    try:
        configs = load_mysql_configs()

        datasources = []
        for datasource_id, config in configs.items():
            datasources.append(
                {
                    "id": datasource_id,
                    "name": config.get("name", datasource_id),
                    "type": config.get("type", "mysql"),
                    "host": config["params"]["host"],
                    "database": config["params"]["database"],
                    "description": f"MySQL数据库: {config['params']['database']}@{config['params']['host']}",
                }
            )

        return {"success": True, "datasources": datasources, "count": len(datasources)}

    except Exception as e:
        logger.error(f"获取MySQL数据源列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据源列表失败: {str(e)}")


@router.post("/api/test_mysql_connection", tags=["MySQL Query"])
async def test_mysql_connection(request: dict = Body(...)):
    """
    测试MySQL数据源连接

    请求参数:
    - datasource_name: 数据源名称
    """
    try:
        datasource_name = request.get("datasource_name")

        if not datasource_name:
            raise HTTPException(status_code=400, detail="缺少数据源名称参数")

        # 获取MySQL连接信息
        mysql_config = get_mysql_connection_info(datasource_name)

        # 测试连接
        connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=utf8mb4"

        engine = create_engine(connection_str)

        # 执行简单查询测试连接
        test_df = pd.read_sql("SELECT 1 as test_connection", engine)

        if len(test_df) > 0:
            return {
                "success": True,
                "message": f"数据源 {datasource_name} 连接测试成功",
                "datasource_name": datasource_name,
                "host": mysql_config["host"],
                "database": mysql_config["database"],
            }
        else:
            raise Exception("连接测试查询返回空结果")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MySQL连接测试失败: {str(e)}")
        return {
            "success": False,
            "message": f"数据源 {datasource_name} 连接测试失败: {str(e)}",
            "datasource_name": datasource_name,
        }


@router.post("/api/mysql_query_preview", tags=["MySQL Query"])
async def preview_mysql_query(request: dict = Body(...)):
    """
    预览MySQL查询结果（只返回前几行，不加载到DuckDB）

    请求参数:
    - datasource_name: 数据源名称
    - sql: SQL查询语句
    - limit: 预览行数，默认10行
    """
    try:
        datasource_name = request.get("datasource_name")
        custom_sql = request.get("sql")
        limit = request.get("limit", 10)

        if not datasource_name:
            raise HTTPException(status_code=400, detail="缺少数据源名称参数")

        if not custom_sql:
            raise HTTPException(status_code=400, detail="缺少SQL查询语句")

        logger.info(f"预览MySQL查询: 数据源={datasource_name}, 限制={limit}行")

        # 获取MySQL连接信息
        mysql_config = get_mysql_connection_info(datasource_name)

        # 添加LIMIT子句到查询
        preview_sql = f"{custom_sql} LIMIT {limit}"

        # 执行查询
        connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=utf8mb4"
        engine = create_engine(connection_str)
        df = pd.read_sql(preview_sql, engine)

        # 处理数据类型
        df = df.fillna("")
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].astype(str)
            elif df[col].dtype == "datetime64[ns]":
                df[col] = df[col].dt.strftime("%Y-%m-%d %H:%M:%S")

        return {
            "success": True,
            "message": f"查询预览成功",
            "datasource_name": datasource_name,
            "row_count": len(df),
            "columns": df.columns.tolist(),
            "preview_data": df.to_dict(orient="records"),
            "sql_executed": preview_sql,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MySQL查询预览失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询预览失败: {str(e)}")
