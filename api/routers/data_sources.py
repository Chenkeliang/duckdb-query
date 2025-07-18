from fastapi import (
    APIRouter,
    UploadFile,
    File,
    BackgroundTasks,
    HTTPException,
    Body,
    Query,
)
from fastapi.responses import JSONResponse
from core.resource_manager import save_upload_file, schedule_cleanup
from models.query_models import DatabaseConnection, MySQLConfig
from core.duckdb_engine import get_db_connection
import pandas as pd
import logging
import os
import json
import traceback
import duckdb
from sqlalchemy import create_engine
import numpy as np
import base64

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()
duckdb_con = get_db_connection()

# MySQL配置文件路径
MYSQL_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "mysql_configs.json"
)
# 用于保存原始密码的字典，这样在显示配置时不会暴露密码
MYSQL_PASSWORDS = {}


# 确保SQL查询有LIMIT子句
def ensure_query_has_limit(query, default_limit=500):
    """
    检查SQL查询是否包含LIMIT子句，如果没有则添加默认的LIMIT

    Args:
        query (str): SQL查询语句
        default_limit (int): 默认的LIMIT值，如果没有指定则为500

    Returns:
        str: 确保包含LIMIT子句的SQL查询
    """
    # 转换为小写来进行不区分大小写的检查
    query_lower = query.lower()

    # 检查是否已经包含LIMIT子句
    if "limit " not in query_lower:
        # 如果查询以分号结束，在分号前添加LIMIT
        if query.strip().endswith(";"):
            return f"{query[:-1]} LIMIT {default_limit};"
        else:
            return f"{query} LIMIT {default_limit}"

    return query


# 确保MySQL配置文件存在
def ensure_mysql_config_file():
    if not os.path.exists(MYSQL_CONFIG_FILE):
        with open(MYSQL_CONFIG_FILE, "w") as f:
            json.dump([], f)


# 读取MySQL配置
def read_mysql_configs():
    ensure_mysql_config_file()
    try:
        with open(MYSQL_CONFIG_FILE, "r") as f:
            configs = json.load(f)
            # 从内存中恢复密码
            for config in configs:
                if "id" in config and config["id"] in MYSQL_PASSWORDS:
                    config["params"]["password"] = MYSQL_PASSWORDS[config["id"]]
            return configs
    except json.JSONDecodeError:
        # 如果文件为空或格式错误，返回空列表
        return []


# 保存MySQL配置
def save_mysql_configs(configs):
    ensure_mysql_config_file()
    # 保存密码到内存中
    for config in configs:
        if "params" in config and "password" in config["params"]:
            MYSQL_PASSWORDS[config["id"]] = config["params"]["password"]

    # 创建配置的副本以避免修改原始配置
    configs_to_save = []
    for config in configs:
        config_copy = json.loads(json.dumps(config))  # 深拷贝
        # 在保存到文件前隐藏密码
        if "params" in config_copy and "password" in config_copy["params"]:
            config_copy["params"]["password"] = "********"
        configs_to_save.append(config_copy)

    with open(MYSQL_CONFIG_FILE, "w") as f:
        json.dump(configs_to_save, f, indent=2)


# 获取所有MySQL配置
@router.get("/api/mysql_configs", tags=["Data Sources"])
async def get_mysql_configs():
    """获取所有保存的MySQL配置"""
    try:
        configs = read_mysql_configs()
        # 返回配置但不包含密码
        for config in configs:
            if "params" in config and "password" in config["params"]:
                config["params"]["password"] = "********"
        return {"configs": configs}
    except Exception as e:
        logger.error(f"获取MySQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取MySQL配置失败: {str(e)}")


# 保存MySQL配置
@router.post("/api/mysql_configs", tags=["Data Sources"])
async def save_mysql_config(config: MySQLConfig = Body(...)):
    """保存MySQL配置"""
    try:
        if config.type != "mysql":
            raise HTTPException(status_code=400, detail="仅支持MySQL配置")

        configs = read_mysql_configs()

        # 检查是否已存在相同ID的配置
        for i, existing_config in enumerate(configs):
            if existing_config["id"] == config.id:
                # 更新已存在的配置
                configs[i] = config.dict()
                save_mysql_configs(configs)
                return {"success": True, "message": "MySQL配置已更新"}

        # 添加新配置
        configs.append(config.dict())
        save_mysql_configs(configs)
        return {"success": True, "message": "MySQL配置已保存"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"保存MySQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"保存MySQL配置失败: {str(e)}")


# 删除MySQL配置
@router.delete("/api/mysql_configs/{config_id}", tags=["Data Sources"])
async def delete_mysql_config(config_id: str):
    """删除MySQL配置"""
    try:
        configs = read_mysql_configs()

        # 过滤掉要删除的配置
        updated_configs = [config for config in configs if config["id"] != config_id]

        if len(updated_configs) == len(configs):
            raise HTTPException(
                status_code=404, detail=f"未找到ID为 {config_id} 的MySQL配置"
            )

        save_mysql_configs(updated_configs)
        return {"success": True, "message": f"已删除ID为 {config_id} 的MySQL配置"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除MySQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除MySQL配置失败: {str(e)}")


def read_file_with_encoding(file_path, file_type):
    """尝试用不同的编码读取文件"""
    encodings = ["utf-8", "latin1", "cp1252", "iso-8859-1"]

    for encoding in encodings:
        try:
            if file_type == "csv":
                return pd.read_csv(file_path, nrows=5, encoding=encoding)
            elif file_type in ["xls", "xlsx"]:
                # Excel files handle encoding internally
                return pd.read_excel(file_path, nrows=5)
        except UnicodeDecodeError:
            continue

    # 如果所有编码都失败
    raise ValueError(f"无法解码文件 {file_path}，请检查文件编码")


def handle_non_serializable_data(df):
    """处理DataFrame中不可序列化的数据类型"""
    if df is None or df.empty:
        return df

    # 创建DataFrame的深拷贝，避免修改原始数据
    processed_df = df.copy()

    # 遍历所有列
    for col in processed_df.columns:
        # 处理字节类型数据
        if processed_df[col].dtype == "object":
            # 替换字节类型值为Base64编码的字符串
            processed_df[col] = processed_df[col].apply(
                lambda x: (
                    base64.b64encode(x).decode("ascii") if isinstance(x, bytes) else x
                )
            )

            # 替换NaN值为None
            processed_df[col] = processed_df[col].replace({np.nan: None})

            # 处理其他可能的不可序列化类型
            processed_df[col] = processed_df[col].apply(
                lambda x: (
                    str(x)
                    if not (
                        isinstance(x, (str, int, float, bool, type(None), list, dict))
                        or x is None
                    )
                    else x
                )
            )
        else:
            # 非对象类型列也需要处理NaN值
            processed_df[col] = processed_df[col].replace({np.nan: None})

    return processed_df


@router.post("/api/upload", tags=["Data Sources"])
async def upload_file(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """上传文件并返回路径和列（只保留原始文件名，不再追加UUID）"""
    try:
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        os.makedirs(temp_dir, exist_ok=True)
        save_path = os.path.join(temp_dir, file.filename)
        # 如果已存在同名文件，直接覆盖（或可选：直接返回已存在文件信息）
        with open(save_path, "wb") as f:
            content = await file.read()
            f.write(content)
        # 读取列信息
        if file.filename.endswith(".csv"):
            df = pd.read_csv(save_path, nrows=5)
        elif file.filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(save_path, nrows=5)
        else:
            raise ValueError("不支持的文件类型")
        # 注册到DuckDB
        source_id = file.filename.split(".")[0]
        if file.filename.endswith(".csv"):
            df_full = pd.read_csv(save_path)
        elif file.filename.endswith((".xls", ".xlsx")):
            df_full = pd.read_excel(save_path)
        else:
            df_full = None
        if df_full is not None:
            duckdb_con.register(source_id, df_full)
            logger.info(f"已将文件 {file.filename} 注册到DuckDB，表名: {source_id}")
        return {"file_id": save_path, "columns": df.columns.tolist()}
    except Exception as e:
        logger.error(f"文件上传处理失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"文件上传处理失败: {str(e)}")


@router.post("/api/connect_database", tags=["Data Sources"])
async def connect_database(connection: DatabaseConnection = Body(...)):
    """连接到数据库，提取数据并加载到DuckDB中"""
    try:
        logger.info(f"尝试连接到数据库: {connection.type} - {connection.id}")

        # 处理不同类型的数据库连接
        if connection.type == "csv":
            # 处理CSV文件的SQL查询
            if "query" not in connection.params:
                raise HTTPException(status_code=400, detail="SQL查询参数缺失")

            query = connection.params["query"]
            # 确保查询有LIMIT子句
            query = ensure_query_has_limit(query)
            database_name = connection.params.get("database", "")

            if not database_name:
                raise HTTPException(status_code=400, detail="缺少数据库名称参数")

            # 查找匹配的上传文件
            temp_dir = os.path.join(os.getcwd(), "temp_files")
            found_file = None

            for file_name in os.listdir(temp_dir):
                if database_name in file_name:
                    found_file = os.path.join(temp_dir, file_name)
                    break

            if not found_file:
                raise HTTPException(
                    status_code=404, detail=f"找不到匹配的文件: {database_name}"
                )

            # 根据文件类型读取数据
            if found_file.endswith(".csv"):
                df = pd.read_csv(found_file)
            elif found_file.endswith((".xlsx", ".xls")):
                df = pd.read_excel(found_file)
            else:
                raise HTTPException(status_code=400, detail="不支持的文件类型")

            # 使用DuckDB执行查询
            try:
                duckdb_con.register(database_name, df)
                result_df = duckdb_con.execute(query).fetchdf()

                # 将查询结果注册为新表，以便后续JOIN
                duckdb_con.register(connection.id, result_df)
                logger.info(f"SQL查询结果已注册为表: {connection.id}")

                # 处理不可序列化的数据
                result_df = handle_non_serializable_data(result_df)

                return {
                    "success": True,
                    "columns": result_df.columns.tolist(),
                    "data": result_df.replace({np.nan: None}).to_dict(orient="records"),
                }
            except Exception as e:
                raise HTTPException(
                    status_code=400, detail=f"SQL查询执行错误: {str(e)}"
                )

        elif connection.type in ["mysql", "postgresql", "sqlite"]:
            try:
                # 检查必要参数
                if "query" not in connection.params:
                    raise HTTPException(status_code=400, detail="缺少SQL查询参数")

                # 创建数据库连接字符串
                connection_str = None

                if connection.type == "mysql":
                    try:
                        host = connection.params.get("host", "localhost")
                        port = connection.params.get("port", 3306)
                        user = connection.params.get("user", "")
                        password = connection.params.get("password", "")
                        database = connection.params.get("database", "")

                        if not database:
                            raise HTTPException(
                                status_code=400, detail="缺少数据库名称参数"
                            )

                        # 创建MySQL连接字符串
                        connection_str = f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"

                    except ImportError:
                        raise HTTPException(
                            status_code=500,
                            detail="缺少MySQL驱动。请安装pymysql: pip install pymysql sqlalchemy",
                        )

                elif connection.type == "postgresql":
                    host = connection.params.get("host", "localhost")
                    port = connection.params.get("port", 5432)
                    user = connection.params.get("user", "")
                    password = connection.params.get("password", "")
                    database = connection.params.get("database", "")

                    if not database:
                        raise HTTPException(
                            status_code=400, detail="缺少数据库名称参数"
                        )

                        # 创建PostgreSQL连接字符串
                        connection_str = (
                            f"postgresql://{user}:{password}@{host}:{port}/{database}"
                        )

                elif connection.type == "sqlite":
                    database_path = connection.params.get("database", "")
                    if not database_path:
                        raise HTTPException(
                            status_code=400, detail="缺少SQLite数据库路径"
                        )

                    # 创建SQLite连接字符串
                    connection_str = f"sqlite:///{database_path}"

                # 使用SQLAlchemy创建引擎
                engine = create_engine(connection_str)

                # 使用pandas直接从数据库读取数据
                query = connection.params["query"]
                # 确保查询有LIMIT子句
                query = ensure_query_has_limit(query)
                try:
                    df = pd.read_sql(query, engine)

                    # 将数据注册到DuckDB用于后续JOIN
                    # 使用无引号的表名作为DuckDB表ID
                    table_id = connection.id.strip('"')
                    duckdb_con.register(table_id, df)

                    # 确认表已正确注册
                    tables = duckdb_con.execute("SHOW TABLES").fetchdf()
                    logger.info(f"当前DuckDB中的表: {tables.to_string()}")

                    logger.info(f"{connection.type}查询结果已注册为表: {table_id}")

                    # 处理不可序列化的数据
                    df = handle_non_serializable_data(df)

                    return {
                        "success": True,
                        "columns": df.columns.tolist(),
                        "data": df.to_dict(orient="records"),
                    }
                except Exception as e:
                    logger.error(f"SQL查询执行错误: {str(e)}")
                    raise HTTPException(
                        status_code=400, detail=f"SQL查询执行错误: {str(e)}"
                    )

            except ImportError as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"缺少必要的数据库驱动: {str(e)}。请安装SQLAlchemy和相应的数据库驱动",
                )
            except Exception as e:
                logger.error(f"数据库连接错误: {str(e)}")
                raise HTTPException(
                    status_code=500, detail=f"数据库连接或查询失败: {str(e)}"
                )

        elif connection.type == "duckdb":
            # 处理DuckDB连接
            try:
                # 检查必要参数
                if "query" not in connection.params:
                    raise HTTPException(status_code=400, detail="缺少query参数")

                # 使用DuckDB执行查询
                db_path = connection.params.get("database", ":memory:")

                # 确保查询有LIMIT子句
                query = connection.params["query"]
                query = ensure_query_has_limit(query)

                if db_path != ":memory:":
                    # 连接到指定的DuckDB文件
                    local_con = duckdb.connect(db_path)
                    result_df = local_con.execute(connection.params["query"]).fetchdf()
                    local_con.close()
                else:
                    # 使用当前的内存连接
                    result_df = duckdb_con.execute(connection.params["query"]).fetchdf()

                # 注册查询结果为新表
                duckdb_con.register(connection.id, result_df)
                logger.info(f"DuckDB查询结果已注册为表: {connection.id}")

                # 处理不可序列化的数据
                result_df = handle_non_serializable_data(result_df)

                return {
                    "success": True,
                    "columns": result_df.columns.tolist(),
                    "data": result_df.to_dict(orient="records"),
                }
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"DuckDB操作失败: {str(e)}")

        else:
            raise HTTPException(
                status_code=400, detail=f"不支持的数据库类型: {connection.type}"
            )

    except HTTPException:
        # 传递HTTPException
        raise
    except Exception as e:
        logger.error(f"数据库连接处理失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"数据库连接处理失败: {str(e)}")


@router.post("/api/delete_file", tags=["Data Sources"])
async def delete_file(request: dict = Body(...)):
    """删除指定的本地文件（仅限于temp_files目录下）"""
    file_path = request.get("path")
    if not file_path:
        raise HTTPException(status_code=400, detail="缺少文件路径参数")
    # 只允许删除 temp_files 目录下的文件，防止越权
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../temp_files"))
    abs_path = os.path.abspath(file_path)
    if not abs_path.startswith(base_dir):
        raise HTTPException(status_code=403, detail="禁止删除非数据目录文件")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    try:
        os.remove(abs_path)
        return {"success": True, "message": "文件已删除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件删除失败: {str(e)}")


@router.head("/api/file_exists", tags=["Data Sources"])
async def file_exists(path: str = Query(...)):
    """检查文件是否存在"""
    import os

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../temp_files"))
    abs_path = os.path.abspath(path)
    if not abs_path.startswith(base_dir):
        raise HTTPException(status_code=403, detail="禁止访问非数据目录文件")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    return


@router.get("/api/list_files", tags=["Data Sources"])
async def list_files():
    """列出 temp_files 目录下所有文件名（不含路径）"""
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp_files")
    if not os.path.exists(temp_dir):
        return []
    files = [
        f for f in os.listdir(temp_dir) if os.path.isfile(os.path.join(temp_dir, f))
    ]
    return JSONResponse(files)


@router.get("/api/file_columns", tags=["Data Sources"])
async def file_columns(filename: str):
    """获取指定文件的列名"""
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp_files")
    file_path = os.path.join(temp_dir, filename)
    if not os.path.exists(file_path):
        return []
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(file_path, nrows=5)
        elif filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(file_path, nrows=5)
        else:
            return []
        return JSONResponse(df.columns.tolist())
    except Exception:
        return []
