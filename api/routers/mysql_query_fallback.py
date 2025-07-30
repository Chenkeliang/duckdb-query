from fastapi import APIRouter, Body, HTTPException
import pandas as pd
import logging
import traceback
import json
import os
from typing import Dict, Any
import pymysql

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


def get_mysql_connection_info(connection_name: str):
    """根据连接名称获取MySQL连接信息"""
    configs = load_mysql_configs()

    if connection_name not in configs:
        raise HTTPException(
            status_code=404, detail=f"未找到MySQL连接配置: {connection_name}"
        )

    config = configs[connection_name]
    return config["params"]


def safe_mysql_query(mysql_config: Dict[str, Any], sql: str) -> pd.DataFrame:
    """安全的MySQL查询，处理各种字符编码问题"""

    # 方法1: 使用PyMySQL直接连接，最大兼容性
    try:
        logger.info("尝试方法1: PyMySQL直接连接")
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

        try:
            with connection.cursor() as cursor:
                cursor.execute(sql)
                results = cursor.fetchall()

                if results:
                    # 处理结果中的字符编码问题
                    clean_results = []
                    for row in results:
                        clean_row = {}
                        for key, value in row.items():
                            # 清理key
                            clean_key = (
                                str(key)
                                .encode("utf-8", errors="replace")
                                .decode("utf-8")
                            )
                            # 清理value
                            if value is None:
                                clean_value = ""
                            elif isinstance(value, (str, bytes)):
                                try:
                                    if isinstance(value, bytes):
                                        clean_value = value.decode(
                                            "utf-8", errors="replace"
                                        )
                                    else:
                                        clean_value = (
                                            str(value)
                                            .encode("utf-8", errors="replace")
                                            .decode("utf-8")
                                        )
                                except:
                                    clean_value = str(value)
                            else:
                                clean_value = value

                            clean_row[clean_key] = clean_value
                        clean_results.append(clean_row)

                    df = pd.DataFrame(clean_results)
                    logger.info(f"方法1成功: 获得 {len(df)} 行数据")
                    return df
                else:
                    logger.info("方法1成功: 查询结果为空")
                    return pd.DataFrame()

        finally:
            connection.close()

    except Exception as e1:
        logger.warning(f"方法1失败: {str(e1)}")

        # 方法2: 使用SQLAlchemy，但使用Latin-1编码
        try:
            logger.info("尝试方法2: SQLAlchemy with Latin-1")
            from sqlalchemy import create_engine

            connection_str = f"mysql+pymysql://{mysql_config['user']}:{mysql_config['password']}@{mysql_config['host']}:{mysql_config['port']}/{mysql_config['database']}?charset=latin1"

            engine = create_engine(connection_str)
            df = pd.read_sql(sql, engine)

            # 转换编码
            for col in df.columns:
                if df[col].dtype == "object":
                    df[col] = df[col].apply(
                        lambda x: (
                            str(x)
                            .encode("latin-1", errors="ignore")
                            .decode("utf-8", errors="replace")
                            if x is not None
                            else ""
                        )
                    )

            logger.info(f"方法2成功: 获得 {len(df)} 行数据")
            return df

        except Exception as e2:
            logger.warning(f"方法2失败: {str(e2)}")

            # 方法3: 最基础的查询，只选择数值字段
            try:
                logger.info("尝试方法3: 仅数值字段查询")

                # 获取表结构
                connection = pymysql.connect(
                    host=mysql_config["host"],
                    port=mysql_config["port"],
                    user=mysql_config["user"],
                    password=mysql_config["password"],
                    database=mysql_config["database"],
                    charset="utf8mb4",
                    use_unicode=True,
                )

                try:
                    with connection.cursor() as cursor:
                        # 获取表名
                        if "FROM " in sql.upper():
                            table_part = sql.upper().split("FROM ")[1].split(" ")[0]
                            table_name = table_part.strip("`").strip()

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
                                    ]
                                ):
                                    numeric_columns.append(f"`{col_info[0]}`")

                            if numeric_columns:
                                # 构建安全的查询
                                safe_sql = f"SELECT {', '.join(numeric_columns[:10])} FROM `{table_name}` LIMIT 10"
                                cursor.execute(safe_sql)
                                results = cursor.fetchall()

                                if results:
                                    # 构建DataFrame
                                    columns = [desc[0] for desc in cursor.description]
                                    df = pd.DataFrame(results, columns=columns)
                                    logger.info(
                                        f"方法3成功: 获得 {len(df)} 行数据，{len(df.columns)} 列"
                                    )
                                    return df

                finally:
                    connection.close()

            except Exception as e3:
                logger.error(f"方法3失败: {str(e3)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"所有查询方法都失败了: 1) {str(e1)} 2) {str(e2)} 3) {str(e3)}",
                )


@router.post("/api/mysql_query_safe", tags=["MySQL Safe Query"])
async def safe_mysql_query_endpoint(request: dict = Body(...)):
    """
    安全的MySQL查询接口，处理字符编码问题

    请求参数:
    - datasource_name: 数据源名称
    - sql: SQL查询语句
    - limit: 限制返回行数，默认10
    """
    try:
        datasource_name = request.get("datasource_name")
        sql_query = request.get("sql")
        limit = request.get("limit", 10)

        if not datasource_name:
            raise HTTPException(status_code=400, detail="缺少数据源名称参数")

        if not sql_query:
            raise HTTPException(status_code=400, detail="缺少SQL查询语句")

        # 添加LIMIT子句
        if "LIMIT" not in sql_query.upper():
            sql_query = f"{sql_query} LIMIT {limit}"

        logger.info(f"执行安全MySQL查询: 数据源={datasource_name}")
        logger.info(f"SQL: {sql_query}")

        # 获取MySQL连接信息
        mysql_config = get_mysql_connection_info(datasource_name)

        # 执行安全查询
        df = safe_mysql_query(mysql_config, sql_query)

        # 最终数据清理
        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].fillna("").astype(str)

        return {
            "success": True,
            "message": f"查询成功",
            "datasource_name": datasource_name,
            "row_count": len(df),
            "columns": df.columns.tolist(),
            "data": df.to_dict(orient="records"),
            "sql_executed": sql_query,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"安全MySQL查询失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")
