from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd
import logging
import traceback
import json
import os
from sqlalchemy import create_engine
from core.duckdb_engine import get_db_connection, create_persistent_table, create_varchar_table_from_dataframe
from typing import Dict, Any, List
import uuid
from datetime import datetime

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()

# MySQL配置文件路径
MYSQL_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config", "mysql-configs.json"
)

# MySQL数据源管理文件路径
MYSQL_DATASOURCE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "config", "datasources.json"
)


def load_mysql_configs():
    """加载MySQL连接配置文件"""
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


def load_mysql_datasources():
    """加载MySQL数据源管理文件"""
    try:
        if not os.path.exists(MYSQL_DATASOURCE_FILE):
            return []

        with open(MYSQL_DATASOURCE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"加载MySQL数据源失败: {str(e)}")
        return []


def save_mysql_datasources(datasources: List[Dict]):
    """保存MySQL数据源管理文件"""
    try:
        with open(MYSQL_DATASOURCE_FILE, "w", encoding="utf-8") as f:
            json.dump(datasources, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.error(f"保存MySQL数据源失败: {str(e)}")
        return False


def get_mysql_connection_info(connection_name: str):
    """根据连接名称获取MySQL连接信息"""
    configs = load_mysql_configs()

    if connection_name not in configs:
        raise HTTPException(
            status_code=404, detail=f"未找到MySQL连接配置: {connection_name}"
        )

    config = configs[connection_name]
    return config["params"]


@router.post("/api/mysql_datasource/create", tags=["MySQL DataSource"])
async def create_mysql_datasource(request: dict = Body(...)):
    """
    创建MySQL数据源：从MySQL执行SQL查询，将结果加载到DuckDB作为数据源

    请求参数:
    - connection_name: MySQL连接名称（如 'sorder'）
    - sql: 要执行的SQL查询语句
    - datasource_alias: 数据源别名（用户自定义的名称）
    - description: 可选，数据源描述
    """
    try:
        connection_name = request.get("connection_name")
        sql_query = request.get("sql")
        datasource_alias = request.get("datasource_alias")
        description = request.get("description", "")

        if not connection_name:
            raise HTTPException(status_code=400, detail="缺少MySQL连接名称参数")

        if not sql_query:
            raise HTTPException(status_code=400, detail="缺少SQL查询语句")

        if not datasource_alias:
            raise HTTPException(status_code=400, detail="缺少数据源别名")

        logger.info(f"创建MySQL数据源: 连接={connection_name}, 别名={datasource_alias}")
        logger.info(f"SQL查询: {sql_query}")

        # 获取MySQL连接信息
        mysql_config = get_mysql_connection_info(connection_name)

        # 创建MySQL连接并执行查询（处理字符编码问题）
        connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=utf8mb4&use_unicode=True"

        # 创建引擎时指定编码参数
        engine = create_engine(
            connection_str,
            connect_args={
                "charset": "utf8mb4",
                "use_unicode": True,
                "init_command": "SET NAMES utf8mb4",
            },
            pool_pre_ping=True,
        )

        # 执行查询时处理编码问题
        try:
            df = pd.read_sql(sql_query, engine)
        except UnicodeDecodeError as e:
            logger.error(f"字符编码错误，尝试使用错误处理策略: {e}")
            # 如果遇到编码错误，使用错误处理策略
            import pymysql.cursors

            connection = pymysql.connect(
                host=mysql_config["host"],
                port=mysql_config["port"],
                user=mysql_config["user"],
                password=mysql_config["password"],
                database=mysql_config["database"],
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                use_unicode=True,
            )
            try:
                with connection.cursor() as cursor:
                    cursor.execute(sql_query)
                    results = cursor.fetchall()
                    if results:
                        df = pd.DataFrame(results)
                    else:
                        df = pd.DataFrame()
            finally:
                connection.close()

        if df.empty:
            return {"success": False, "message": "查询结果为空，无法创建数据源"}

        logger.info(f"查询完成，获得 {len(df)} 行数据，{len(df.columns)} 列")

        # 生成唯一的数据源ID
        datasource_id = f"mysql_{datasource_alias}_{uuid.uuid4().hex[:8]}"

        # 创建持久化表到DuckDB，使用DuckDB原生功能确保VARCHAR类型
        duckdb_con = get_db_connection()
        success = create_varchar_table_from_dataframe(datasource_id, df, duckdb_con)

        if not success:
            raise Exception("数据持久化到DuckDB失败")

        logger.info(f"数据已持久化到DuckDB，表ID: {datasource_id}")

        # 验证表创建成功
        tables_df = duckdb_con.execute("SHOW TABLES").fetchdf()
        if datasource_id not in tables_df["name"].tolist():
            raise Exception("数据持久化到DuckDB验证失败")

        # 保存数据源信息到管理文件
        datasources = load_mysql_datasources()

        # 检查别名是否已存在
        for existing in datasources:
            if existing["alias"] == datasource_alias:
                raise HTTPException(
                    status_code=400, detail=f"数据源别名 '{datasource_alias}' 已存在"
                )

        new_datasource = {
            "id": datasource_id,
            "alias": datasource_alias,
            "connection_name": connection_name,
            "sql_query": sql_query,
            "description": description,
            "row_count": len(df),
            "columns": df.columns.tolist(),
            "created_at": datetime.now().isoformat(),
            "type": "mysql_query",
        }

        datasources.append(new_datasource)

        if not save_mysql_datasources(datasources):
            logger.warning("保存数据源信息失败，但DuckDB中的数据仍然可用")

        return {
            "success": True,
            "message": f"MySQL数据源创建成功",
            "datasource": {
                "id": datasource_id,
                "alias": datasource_alias,
                "connection_name": connection_name,
                "row_count": len(df),
                "columns": df.columns.tolist(),
                "sample_data": df.head(3).to_dict(orient="records"),
                "description": description,
                "created_at": new_datasource["created_at"],
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建MySQL数据源失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"创建数据源失败: {str(e)}")


@router.get("/api/mysql_datasource/list", tags=["MySQL DataSource"])
async def list_mysql_datasources():
    """
    获取所有MySQL数据源列表
    """
    try:
        datasources = load_mysql_datasources()

        # 获取DuckDB中当前的表，验证数据源是否仍然可用
        duckdb_con = get_db_connection()
        tables_df = duckdb_con.execute("SHOW TABLES").fetchdf()
        available_tables = tables_df["name"].tolist()

        # 更新数据源状态
        for datasource in datasources:
            datasource["available"] = datasource["id"] in available_tables
            if datasource["available"]:
                # 获取当前行数
                try:
                    count_result = duckdb_con.execute(
                        f'SELECT COUNT(*) as cnt FROM "{datasource["id"]}"'
                    ).fetchdf()
                    datasource["current_row_count"] = int(count_result.iloc[0]["cnt"])
                except:
                    datasource["current_row_count"] = datasource.get("row_count", 0)

        return {
            "success": True,
            "datasources": datasources,
            "total_count": len(datasources),
            "available_count": len(
                [ds for ds in datasources if ds.get("available", False)]
            ),
        }

    except Exception as e:
        logger.error(f"获取MySQL数据源列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据源列表失败: {str(e)}")


@router.delete("/api/mysql_datasource/{datasource_alias}", tags=["MySQL DataSource"])
async def delete_mysql_datasource(datasource_alias: str):
    """
    删除MySQL数据源
    """
    try:
        datasources = load_mysql_datasources()

        # 查找要删除的数据源
        datasource_to_delete = None
        remaining_datasources = []

        for ds in datasources:
            if ds["alias"] == datasource_alias:
                datasource_to_delete = ds
            else:
                remaining_datasources.append(ds)

        if not datasource_to_delete:
            raise HTTPException(
                status_code=404, detail=f"未找到数据源: {datasource_alias}"
            )

        # 从DuckDB中删除表
        duckdb_con = get_db_connection()
        try:
            duckdb_con.execute(f'DROP TABLE IF EXISTS "{datasource_to_delete["id"]}"')
            logger.info(f"已从DuckDB中删除表: {datasource_to_delete['id']}")
        except Exception as e:
            logger.warning(f"从DuckDB删除表失败: {str(e)}")

        # 保存更新后的数据源列表
        if not save_mysql_datasources(remaining_datasources):
            logger.error("保存数据源列表失败")
            raise HTTPException(status_code=500, detail="删除数据源时保存配置失败")

        return {
            "success": True,
            "message": f"数据源 '{datasource_alias}' 删除成功",
            "deleted_datasource": {
                "alias": datasource_alias,
                "id": datasource_to_delete["id"],
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除MySQL数据源失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除数据源失败: {str(e)}")


@router.post(
    "/api/mysql_datasource/refresh/{datasource_alias}", tags=["MySQL DataSource"]
)
async def refresh_mysql_datasource(datasource_alias: str):
    """
    刷新MySQL数据源（重新执行SQL查询并更新数据）
    """
    try:
        datasources = load_mysql_datasources()

        # 查找要刷新的数据源
        target_datasource = None
        for ds in datasources:
            if ds["alias"] == datasource_alias:
                target_datasource = ds
                break

        if not target_datasource:
            raise HTTPException(
                status_code=404, detail=f"未找到数据源: {datasource_alias}"
            )

        logger.info(f"刷新MySQL数据源: {datasource_alias}")

        # 获取MySQL连接信息并重新执行查询
        mysql_config = get_mysql_connection_info(target_datasource["connection_name"])

        connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=utf8mb4&use_unicode=True"

        engine = create_engine(
            connection_str,
            connect_args={
                "charset": "utf8mb4",
                "use_unicode": True,
                "init_command": "SET NAMES utf8mb4",
            },
            pool_pre_ping=True,
        )

        try:
            df = pd.read_sql(target_datasource["sql_query"], engine)
        except UnicodeDecodeError as e:
            logger.error(f"刷新时字符编码错误，尝试使用错误处理策略: {e}")
            import pymysql.cursors

            connection = pymysql.connect(
                host=mysql_config["host"],
                port=mysql_config["port"],
                user=mysql_config["user"],
                password=mysql_config["password"],
                database=mysql_config["database"],
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                use_unicode=True,
            )
            try:
                with connection.cursor() as cursor:
                    cursor.execute(target_datasource["sql_query"])
                    results = cursor.fetchall()
                    if results:
                        df = pd.DataFrame(results)
                    else:
                        df = pd.DataFrame()
            finally:
                connection.close()

        # 处理数据类型
        df = df.fillna("")
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].astype(str)
            elif df[col].dtype == "datetime64[ns]":
                df[col] = df[col].dt.strftime("%Y-%m-%d %H:%M:%S")
            elif df[col].dtype == "bool":
                df[col] = df[col].astype(int)

        # 重新注册到DuckDB（覆盖原有数据）
        duckdb_con = get_db_connection()
        duckdb_con.register(target_datasource["id"], df)

        # 更新数据源信息
        target_datasource["row_count"] = len(df)
        target_datasource["columns"] = df.columns.tolist()
        target_datasource["refreshed_at"] = datetime.now().isoformat()

        # 保存更新后的信息
        save_mysql_datasources(datasources)

        logger.info(f"数据源刷新完成，新数据行数: {len(df)}")

        return {
            "success": True,
            "message": f"数据源 '{datasource_alias}' 刷新成功",
            "datasource": {
                "alias": datasource_alias,
                "row_count": len(df),
                "columns": df.columns.tolist(),
                "refreshed_at": target_datasource["refreshed_at"],
                "sample_data": df.head(3).to_dict(orient="records"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"刷新MySQL数据源失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"刷新数据源失败: {str(e)}")


@router.get(
    "/api/mysql_datasource/{datasource_alias}/preview", tags=["MySQL DataSource"]
)
async def preview_mysql_datasource(datasource_alias: str, limit: int = 10):
    """
    预览MySQL数据源中的数据
    """
    try:
        datasources = load_mysql_datasources()

        # 查找数据源
        target_datasource = None
        for ds in datasources:
            if ds["alias"] == datasource_alias:
                target_datasource = ds
                break

        if not target_datasource:
            raise HTTPException(
                status_code=404, detail=f"未找到数据源: {datasource_alias}"
            )

        # 从DuckDB查询数据
        duckdb_con = get_db_connection()

        query = f'SELECT * FROM "{target_datasource["id"]}" LIMIT {limit}'
        result_df = duckdb_con.execute(query).fetchdf()

        # 处理数据类型确保JSON序列化
        result_df = result_df.fillna("")
        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        return {
            "success": True,
            "datasource": {
                "alias": datasource_alias,
                "id": target_datasource["id"],
                "description": target_datasource.get("description", ""),
            },
            "preview_data": result_df.to_dict(orient="records"),
            "columns": result_df.columns.tolist(),
            "total_columns": len(result_df.columns),
            "preview_rows": len(result_df),
            "total_rows": target_datasource.get("row_count", 0),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"预览MySQL数据源失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"预览数据源失败: {str(e)}")
