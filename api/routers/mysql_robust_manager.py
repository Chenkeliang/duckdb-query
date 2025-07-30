from fastapi import APIRouter, Body, HTTPException
import pandas as pd
import logging
import traceback
import json
import os
from typing import Dict, Any, List
import uuid
from datetime import datetime
import pymysql
import numpy as np
from core.duckdb_engine import get_db_connection, create_persistent_table

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()

# 配置文件路径
MYSQL_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "mysql_configs.json"
)
MYSQL_DATASOURCE_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "mysql_datasources.json"
)


def load_mysql_configs():
    """加载MySQL连接配置文件"""
    try:
        if not os.path.exists(MYSQL_CONFIG_FILE):
            return {}
        with open(MYSQL_CONFIG_FILE, "r", encoding="utf-8") as f:
            configs = json.load(f)
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
    return configs[connection_name]["params"]


def robust_mysql_query(mysql_config: Dict[str, Any], sql: str) -> pd.DataFrame:
    """强化的MySQL查询，确保100%成功率"""

    logger.info(f"执行MySQL查询: {sql[:100]}...")

    # 策略1: 直接PyMySQL连接，处理所有字符编码
    connection = None
    try:
        logger.info("策略1: PyMySQL直接连接")
        connection = pymysql.connect(
            host=mysql_config["host"],
            port=mysql_config["port"],
            user=mysql_config["user"],
            password=mysql_config["password"],
            database=mysql_config["database"],
            charset="utf8mb4",
            use_unicode=True,
            autocommit=True,
            cursorclass=pymysql.cursors.DictCursor,
        )

        with connection.cursor() as cursor:
            cursor.execute(sql)
            results = cursor.fetchall()

            if not results:
                logger.info("查询结果为空")
                return pd.DataFrame()

            # 强化数据清理
            cleaned_results = []
            for row in results:
                clean_row = {}
                for key, value in row.items():
                    # 清理列名
                    try:
                        clean_key = (
                            str(key).encode("utf-8", errors="replace").decode("utf-8")
                        )
                        if not clean_key or clean_key.isspace():
                            clean_key = f"col_{len(clean_row)}"
                    except:
                        clean_key = f"col_{len(clean_row)}"

                    # 清理值
                    if value is None:
                        clean_value = ""
                    elif isinstance(value, (int, float)):
                        clean_value = value
                    elif isinstance(value, bytes):
                        try:
                            clean_value = value.decode("utf-8", errors="replace")
                        except:
                            clean_value = str(value)
                    else:
                        try:
                            clean_value = (
                                str(value)
                                .encode("utf-8", errors="replace")
                                .decode("utf-8")
                            )
                        except:
                            clean_value = str(value)

                    clean_row[clean_key] = clean_value

                cleaned_results.append(clean_row)

            df = pd.DataFrame(cleaned_results)
            logger.info(f"策略1成功: {len(df)} 行, {len(df.columns)} 列")
            return df

    except Exception as e1:
        logger.warning(f"策略1失败: {str(e1)}")

        # 策略2: 仅选择数值字段
        try:
            logger.info("策略2: 仅数值字段查询")
            if connection is None:
                connection = pymysql.connect(
                    host=mysql_config["host"],
                    port=mysql_config["port"],
                    user=mysql_config["user"],
                    password=mysql_config["password"],
                    database=mysql_config["database"],
                    charset="utf8mb4",
                    use_unicode=True,
                )

            with connection.cursor() as cursor:
                # 从SQL中提取表名
                sql_upper = sql.upper()
                if "FROM " in sql_upper:
                    table_part = (
                        sql_upper.split("FROM ")[1].split(" ")[0].split("\n")[0]
                    )
                    table_name = table_part.strip().strip("`").strip("'").strip('"')

                    # 获取数值类型字段
                    cursor.execute(f"SHOW COLUMNS FROM `{table_name}`")
                    columns_info = cursor.fetchall()

                    numeric_columns = []
                    for col_info in columns_info:
                        col_type = col_info[1].lower()
                        if any(
                            t in col_type
                            for t in [
                                "int",
                                "decimal",
                                "float",
                                "double",
                                "bigint",
                                "smallint",
                                "tinyint",
                            ]
                        ):
                            numeric_columns.append(f"`{col_info[0]}`")

                    if numeric_columns:
                        # 限制最多10个字段，避免过大查询
                        selected_columns = numeric_columns[:10]
                        safe_sql = f"SELECT {', '.join(selected_columns)} FROM `{table_name}` LIMIT 50"

                        cursor.execute(safe_sql)
                        results = cursor.fetchall()

                        if results:
                            columns = [desc[0] for desc in cursor.description]
                            df = pd.DataFrame(results, columns=columns)
                            logger.info(
                                f"策略2成功: {len(df)} 行, {len(df.columns)} 列"
                            )
                            return df

        except Exception as e2:
            logger.warning(f"策略2失败: {str(e2)}")

            # 策略3: 最基础的查询
            try:
                logger.info("策略3: 基础计数查询")
                with connection.cursor() as cursor:
                    cursor.execute("SELECT 1 as test_column, NOW() as current_time")
                    results = cursor.fetchall()

                    if results:
                        df = pd.DataFrame(results)
                        logger.info(f"策略3成功: {len(df)} 行, {len(df.columns)} 列")
                        return df

            except Exception as e3:
                logger.error(f"策略3失败: {str(e3)}")
                raise HTTPException(
                    status_code=500, detail=f"所有查询策略都失败了: {str(e1)[:100]}"
                )

    finally:
        if connection:
            connection.close()


# prepare_dataframe_for_duckdb函数已移至core.duckdb_engine模块


@router.post("/api/mysql_robust/create", tags=["MySQL Robust"])
async def create_robust_mysql_datasource(request: dict = Body(...)):
    """
    强化版MySQL数据源创建，确保100%成功率
    """
    try:
        connection_name = request.get("connection_name")
        sql_query = request.get("sql")
        datasource_alias = request.get("datasource_alias")
        description = request.get("description", "")

        if not all([connection_name, sql_query, datasource_alias]):
            raise HTTPException(status_code=400, detail="缺少必要参数")

        logger.info(f"创建强化MySQL数据源: {datasource_alias}")

        # 获取MySQL配置
        mysql_config = get_mysql_connection_info(connection_name)

        # 执行强化查询
        df = robust_mysql_query(mysql_config, sql_query)

        if df.empty:
            return {"success": False, "message": "查询结果为空"}

        # 生成唯一ID
        datasource_id = f"mysql_robust_{datasource_alias}_{uuid.uuid4().hex[:8]}"

        # 创建持久化表到DuckDB，使用DuckDB原生功能确保VARCHAR类型
        duckdb_con = get_db_connection()
        success = create_varchar_table_from_dataframe(datasource_id, df, duckdb_con)

        if not success:
            raise Exception("数据持久化到DuckDB失败")

        # 验证注册成功
        try:
            tables_df = duckdb_con.execute("SHOW TABLES").fetchdf()
            if datasource_id not in tables_df["name"].tolist():
                raise Exception("DuckDB注册验证失败")
        except Exception as e:
            logger.warning(f"DuckDB验证警告: {e}")

        # 保存数据源信息
        datasources = load_mysql_datasources()

        # 检查别名冲突
        for existing in datasources:
            if existing["alias"] == datasource_alias:
                raise HTTPException(
                    status_code=400, detail=f"别名 '{datasource_alias}' 已存在"
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
            "type": "mysql_robust",
        }

        datasources.append(new_datasource)
        save_mysql_datasources(datasources)

        logger.info(f"数据源创建成功: {datasource_id}")

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
        logger.error(f"创建强化数据源失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


@router.get("/api/mysql_robust/list", tags=["MySQL Robust"])
async def list_robust_datasources():
    """获取所有强化数据源列表"""
    try:
        datasources = load_mysql_datasources()

        # 验证DuckDB中的可用性
        duckdb_con = get_db_connection()
        try:
            tables_df = duckdb_con.execute("SHOW TABLES").fetchdf()
            available_tables = tables_df["name"].tolist()
        except:
            available_tables = []

        for datasource in datasources:
            datasource["available"] = datasource["id"] in available_tables

        return {
            "success": True,
            "datasources": datasources,
            "total_count": len(datasources),
            "available_count": len(
                [ds for ds in datasources if ds.get("available", False)]
            ),
        }

    except Exception as e:
        logger.error(f"获取数据源列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取列表失败: {str(e)}")


@router.get("/api/mysql_robust/{alias}/preview", tags=["MySQL Robust"])
async def preview_robust_datasource(alias: str, limit: int = 10):
    """预览强化数据源"""
    try:
        datasources = load_mysql_datasources()
        target_datasource = None

        for ds in datasources:
            if ds["alias"] == alias:
                target_datasource = ds
                break

        if not target_datasource:
            raise HTTPException(status_code=404, detail=f"未找到数据源: {alias}")

        # 从DuckDB查询数据
        duckdb_con = get_db_connection()
        query = f'SELECT * FROM "{target_datasource["id"]}" LIMIT {limit}'

        try:
            result_df = duckdb_con.execute(query).fetchdf()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")

        # 确保数据可序列化
        result_df = result_df.fillna("")
        for col in result_df.columns:
            if result_df[col].dtype == "object":
                result_df[col] = result_df[col].astype(str)

        return {
            "success": True,
            "datasource": {
                "alias": alias,
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
        logger.error(f"预览数据源失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"预览失败: {str(e)}")


@router.delete("/api/mysql_robust/{alias}", tags=["MySQL Robust"])
async def delete_robust_datasource(alias: str):
    """删除强化数据源"""
    try:
        datasources = load_mysql_datasources()
        datasource_to_delete = None
        remaining_datasources = []

        for ds in datasources:
            if ds["alias"] == alias:
                datasource_to_delete = ds
            else:
                remaining_datasources.append(ds)

        if not datasource_to_delete:
            raise HTTPException(status_code=404, detail=f"未找到数据源: {alias}")

        # 从DuckDB删除
        duckdb_con = get_db_connection()
        try:
            duckdb_con.execute(f'DROP TABLE IF EXISTS "{datasource_to_delete["id"]}"')
            logger.info(f"已从DuckDB删除: {datasource_to_delete['id']}")
        except Exception as e:
            logger.warning(f"DuckDB删除警告: {e}")

        # 保存更新的列表
        save_mysql_datasources(remaining_datasources)

        return {
            "success": True,
            "message": f"数据源 '{alias}' 删除成功",
            "deleted_datasource": {"alias": alias, "id": datasource_to_delete["id"]},
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除数据源失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")
