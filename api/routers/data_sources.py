from fastapi import (
    APIRouter,
    UploadFile,
    File,
    BackgroundTasks,
    HTTPException,
    Body,
    Query,
    Request,
)
from fastapi.responses import JSONResponse, StreamingResponse
from core.resource_manager import save_upload_file, schedule_cleanup
from core.security import security_validator, mask_sensitive_config
from core.encryption import (
    decrypt_config_passwords,
    encrypt_config_passwords,
    mask_config_passwords,
)
from models.query_models import (
    DatabaseConnection,
    MySQLConfig,
    PostgreSQLConfig,
    SQLiteConfig,
    DataSourceType,
    ConnectionTestRequest,
    FileUploadResponse,
    ExportRequest,
    ExportFormat,
)
from core.duckdb_engine import (
    get_db_connection,
    register_dataframe,
    get_table_info,
    create_persistent_table,
)
from core.database_manager import db_manager
from core.file_datasource_manager import (
    file_datasource_manager,
    create_table_from_dataframe,
)
from core.file_utils import detect_file_type, read_file_by_type
import pandas as pd
import logging
import os
import json
import traceback
import duckdb
from sqlalchemy import create_engine
import numpy as np
import base64
import pyarrow as pa
import pyarrow.parquet as pq
import io
import datetime
import time
from typing import List, Dict, Any, Optional

# 设置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

router = APIRouter()
duckdb_con = get_db_connection()

# MySQL配置文件路径
MYSQL_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "config",
    "mysql-configs.json",
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
        logger.info(f"配置文件路径: {MYSQL_CONFIG_FILE}")
        logger.info(f"配置文件是否存在: {os.path.exists(MYSQL_CONFIG_FILE)}")

        with open(MYSQL_CONFIG_FILE, "r") as f:
            configs = json.load(f)
            logger.info(f"从文件读取到 {len(configs)} 个配置")

            # 解密密码
            decrypted_configs = []
            for i, config in enumerate(configs):
                config_id = config.get("id", f"config_{i}")
                logger.info(f"处理配置: {config_id}")
                try:
                    decrypted_config = decrypt_config_passwords(config)
                    decrypted_configs.append(decrypted_config)
                    logger.info(f"配置 {config_id} 解密成功")
                except Exception as e:
                    logger.error(f"配置 {config_id} 解密失败: {str(e)}")
                    # 解密失败时使用原配置
                    decrypted_configs.append(config)

            logger.info(f"最终返回 {len(decrypted_configs)} 个配置")
            return decrypted_configs
    except json.JSONDecodeError:
        # 如果文件为空或格式错误，返回空列表
        return []


# 保存MySQL配置
def save_mysql_configs(configs):
    ensure_mysql_config_file()

    # 创建配置的副本以避免修改原始配置
    configs_to_save = []
    for config in configs:
        config_copy = json.loads(json.dumps(config))  # 深拷贝
        # 加密密码后保存
        config_copy = encrypt_config_passwords(config_copy)
        configs_to_save.append(config_copy)

    with open(MYSQL_CONFIG_FILE, "w") as f:
        json.dump(configs_to_save, f, indent=2)


# 获取所有MySQL配置
@router.get("/api/mysql_configs", tags=["Data Sources"])
async def get_mysql_configs():
    """获取所有保存的MySQL配置"""
    try:
        configs = read_mysql_configs()
        # 创建深拷贝以避免修改原始配置
        import copy

        masked_configs = []
        for config in configs:
            config_copy = copy.deepcopy(config)
            if "params" in config_copy and "password" in config_copy["params"]:
                config_copy["params"]["password"] = "********"
            masked_configs.append(config_copy)
        return {"configs": masked_configs}
    except Exception as e:
        logger.error(f"获取MySQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取MySQL配置失败: {str(e)}")


# 获取单个MySQL配置的完整信息（包含解密的密码）
@router.get("/api/mysql_configs/{config_id}/full", tags=["Data Sources"])
async def get_mysql_config_full(config_id: str):
    """获取单个MySQL配置的完整信息（包含解密的密码）"""
    try:
        configs = read_mysql_configs()
        for config in configs:
            if config.get("id") == config_id:
                # 返回完整配置（包含解密的密码）
                return config

        raise HTTPException(status_code=404, detail=f"未找到配置: {config_id}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取MySQL配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取MySQL配置失败: {str(e)}")


# 数据库连接管理API


@router.post("/api/database_connections/test", tags=["Database Management"])
async def test_database_connection(request: ConnectionTestRequest):
    """测试数据库连接"""
    try:
        result = db_manager.test_connection(request)
        return result
    except Exception as e:
        logger.error(f"连接测试失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"连接测试失败: {str(e)}")


@router.post("/api/test_connection_simple", tags=["Database Management"])
async def test_connection_simple(request: dict = Body(...)):
    """简化的数据库连接测试"""
    try:
        db_type = request.get("type")

        if db_type == "sqlite":
            # SQLite连接测试
            database = request.get("database", ":memory:")
            try:
                import sqlite3

                conn = sqlite3.connect(database)
                conn.execute("SELECT 1")
                conn.close()
                return {"success": True, "message": "SQLite连接测试成功"}
            except Exception as e:
                return {"success": False, "message": f"SQLite连接失败: {str(e)}"}

        elif db_type == "mysql":
            # MySQL连接测试
            try:
                import pymysql

                conn = pymysql.connect(
                    host=request.get("host", "localhost"),
                    port=request.get("port", 3306),
                    user=request.get("username", ""),
                    password=request.get("password", ""),
                    database=request.get("database", ""),
                    connect_timeout=5,
                )
                conn.ping()
                conn.close()
                return {"success": True, "message": "MySQL连接测试成功"}
            except Exception as e:
                return {"success": False, "message": f"MySQL连接失败: {str(e)}"}

        elif db_type == "postgresql":
            # PostgreSQL连接测试
            try:
                import psycopg2

                conn = psycopg2.connect(
                    host=request.get("host", "localhost"),
                    port=request.get("port", 5432),
                    user=request.get("username", ""),
                    password=request.get("password", ""),
                    database=request.get("database", ""),
                    connect_timeout=5,
                )
                conn.close()
                return {"success": True, "message": "PostgreSQL连接测试成功"}
            except Exception as e:
                return {"success": False, "message": f"PostgreSQL连接失败: {str(e)}"}

        else:
            return {"success": False, "message": f"不支持的数据库类型: {db_type}"}

    except Exception as e:
        logger.error(f"连接测试失败: {str(e)}")
        return {"success": False, "message": f"连接测试失败: {str(e)}"}


@router.post("/api/database_connections", tags=["Database Management"])
async def create_database_connection(connection: DatabaseConnection):
    """创建数据库连接"""
    try:
        # 设置创建时间
        connection.created_at = datetime.datetime.now()
        connection.updated_at = datetime.datetime.now()

        success = db_manager.add_connection(connection)
        if success:
            return {
                "success": True,
                "message": "数据库连接创建成功",
                "connection": connection,
            }
        else:
            raise HTTPException(status_code=400, detail="数据库连接创建失败")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"创建数据库连接失败: {str(e)}")


@router.get("/api/database_connections", tags=["Database Management"])
async def list_database_connections(request: Request):
    """列出所有数据库连接"""
    import time
    import traceback

    # 记录详细的请求信息
    client_ip = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("user-agent", "unknown")
    referer = request.headers.get("referer", "unknown")
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    # 简单的请求频率限制
    current_time = time.time()

    # 全局请求限制器
    if not hasattr(list_database_connections, "_last_requests"):
        list_database_connections._last_requests = {}
        list_database_connections._cached_result = None

    # 检查该客户端的最后请求时间
    last_request_time = list_database_connections._last_requests.get(client_ip, 0)
    time_since_last = current_time - last_request_time

    # 如果距离上次请求不足2秒，直接返回缓存结果
    if time_since_last < 2.0 and list_database_connections._cached_result is not None:
        logger.warning(
            f"客户端 {client_ip} 请求过于频繁，距离上次请求仅 {time_since_last:.2f} 秒，返回缓存结果"
        )
        return list_database_connections._cached_result

    # 更新最后请求时间
    list_database_connections._last_requests[client_ip] = current_time
    logger.info(f"处理数据库连接请求 - IP: {client_ip}")

    try:
        connections = db_manager.list_connections()

        # 将DatabaseConnection对象转换为可序列化的字典
        serializable_connections = []
        for conn in connections:
            conn_dict = {
                "id": conn.id,
                "name": conn.name,
                "type": (
                    conn.type.value if hasattr(conn.type, "value") else str(conn.type)
                ),
                "params": conn.params,
                "status": (
                    conn.status.value
                    if hasattr(conn.status, "value")
                    else str(conn.status)
                ),
                "created_at": conn.created_at.isoformat() if conn.created_at else None,
                "updated_at": conn.updated_at.isoformat() if conn.updated_at else None,
                "last_tested": (
                    conn.last_tested.isoformat() if conn.last_tested else None
                ),
            }
            serializable_connections.append(conn_dict)

        logger.info(f"返回数据库连接列表，共 {len(serializable_connections)} 个连接")

        # 调试信息
        if len(serializable_connections) == 0:
            logger.warning("数据库管理器中没有连接！检查启动时的连接加载过程")
            # 检查原始连接对象
            raw_connections = db_manager.list_connections()
            logger.info(f"原始连接对象数量: {len(raw_connections)}")
            for i, conn in enumerate(raw_connections):
                logger.info(
                    f"连接 {i}: id={getattr(conn, 'id', 'N/A')}, type={getattr(conn, 'type', 'N/A')}"
                )

        result = {"success": True, "connections": serializable_connections}

        # 缓存结果
        list_database_connections._cached_result = result

        return result
    except Exception as e:
        logger.error(f"获取数据库连接列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据库连接列表失败: {str(e)}")


@router.get("/api/database_connections/{connection_id}", tags=["Database Management"])
async def get_database_connection(connection_id: str):
    """获取指定数据库连接"""
    try:
        connection = db_manager.get_connection(connection_id)
        if connection:
            return {"success": True, "connection": connection}
        else:
            raise HTTPException(status_code=404, detail="数据库连接不存在")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据库连接失败: {str(e)}")


@router.put("/api/database_connections/{connection_id}", tags=["Database Management"])
async def update_database_connection(
    connection_id: str, connection: DatabaseConnection
):
    """更新数据库连接"""
    try:
        # 确保ID匹配
        connection.id = connection_id
        connection.updated_at = datetime.datetime.now()

        # 先移除旧连接
        db_manager.remove_connection(connection_id)

        # 添加新连接
        success = db_manager.add_connection(connection)
        if success:
            return {
                "success": True,
                "message": "数据库连接更新成功",
                "connection": connection,
            }
        else:
            raise HTTPException(status_code=400, detail="数据库连接更新失败")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"更新数据库连接失败: {str(e)}")


@router.delete(
    "/api/database_connections/{connection_id}", tags=["Database Management"]
)
async def delete_database_connection(connection_id: str):
    """删除数据库连接"""
    try:
        success = db_manager.remove_connection(connection_id)
        if success:
            return {"success": True, "message": "数据库连接删除成功"}
        else:
            raise HTTPException(status_code=404, detail="数据库连接不存在")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除数据库连接失败: {str(e)}")


# 保存MySQL配置（保持向后兼容）
@router.post("/api/mysql_configs", tags=["Data Sources"])
async def save_mysql_config(config: MySQLConfig = Body(...)):
    """保存MySQL配置（向后兼容）"""
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
            elif file_type == "json":
                return pd.read_json(file_path, lines=True, nrows=5, encoding=encoding)
            elif file_type == "parquet":
                # Parquet files handle encoding internally
                return pd.read_parquet(file_path).head(5)
        except (UnicodeDecodeError, ValueError):
            continue

    # 如果所有编码都失败
    raise ValueError(f"无法解码文件 {file_path}，请检查文件编码")


def get_file_preview(file_path: str, rows: int = 10) -> Dict[str, Any]:
    """获取文件预览信息"""
    try:
        file_type = detect_file_type(file_path)
        df = read_file_by_type(file_path, file_type, nrows=rows)

        # 获取文件大小
        file_size = os.path.getsize(file_path)

        # 优化：不再尝试读取整个文件来获取行数，以提高性能
        # 对于大文件，这可能非常慢。行数可以在完全加载后获得。
        total_rows = -1  # 使用-1表示行数未知或延迟计算

        # 处理不可序列化的数据（包括NaN值）
        processed_df = handle_non_serializable_data(df)

        return {
            "file_type": file_type,
            "file_size": file_size,
            "total_rows": total_rows,
            "columns": processed_df.columns.tolist(),
            "column_types": processed_df.dtypes.astype(str).to_dict(),
            "preview_data": processed_df.head(rows).to_dict(orient="records"),
            "sample_values": {
                col: processed_df[col].dropna().head(3).tolist()
                for col in processed_df.columns
            },
        }
    except Exception as e:
        logger.error(f"获取文件预览失败 {file_path}: {str(e)}")
        raise


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
async def upload_file(
    background_tasks: BackgroundTasks, file: UploadFile = File(...)
) -> FileUploadResponse:
    """上传文件并返回详细信息，支持CSV、Excel、JSON、Parquet格式"""
    try:
        # 读取文件内容
        file_content = await file.read()
        file_size = len(file_content)

        # 重置文件指针
        await file.seek(0)

        # 保存临时文件用于安全验证
        temp_file_path = await save_upload_file(file)

        # 安全验证
        validation_result = security_validator.validate_file_upload(
            temp_file_path, file.filename, file_size
        )

        if not validation_result["valid"]:
            # 清理临时文件
            try:
                os.remove(temp_file_path)
            except:
                pass
            raise HTTPException(
                status_code=400,
                detail=f"文件验证失败: {'; '.join(validation_result['errors'])}",
            )

        # 记录警告信息
        if validation_result["warnings"]:
            logger.warning(
                f"文件上传警告 {file.filename}: {'; '.join(validation_result['warnings'])}"
            )

        # 检查文件类型（保持向后兼容）
        file_type = detect_file_type(file.filename)
        if file_type == "unknown":
            try:
                os.remove(temp_file_path)
            except:
                pass
            raise HTTPException(
                status_code=400,
                detail=f"不支持的文件类型。支持的格式：CSV, Excel, JSON, Parquet",
            )

        # 创建临时目录
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        os.makedirs(temp_dir, exist_ok=True)

        # 保存文件
        save_path = os.path.join(temp_dir, file.filename)
        with open(save_path, "wb") as f:
            f.write(file_content)

        # 获取文件预览信息
        preview_info = get_file_preview(save_path, rows=10)

        # 读取完整数据并持久化到DuckDB
        # 生成SQL兼容的表名，替换特殊字符为下划线
        source_id = file.filename.split(".")[0]
        source_id = "".join(c if c.isalnum() or c == "_" else "_" for c in source_id)
        # 确保表名不以数字开头
        if source_id and source_id[0].isdigit():
            source_id = f"table_{source_id}"
        # 确保表名不为空
        if not source_id:
            source_id = f"table_{int(time.time())}"

        df_full = read_file_by_type(save_path, file_type)

        # 使用CREATE TABLE持久化到DuckDB而不是临时注册
        try:
            create_table_from_dataframe(duckdb_con, source_id, df_full)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"持久化到DuckDB失败: {str(e)}")

        # 保存文件数据源配置到持久化存储
        file_info = {
            "source_id": source_id,
            "filename": file.filename,
            "file_path": save_path,
            "file_type": file_type,
            "row_count": len(df_full),
            "column_count": len(df_full.columns),
            "columns": list(df_full.columns),
            "upload_time": datetime.datetime.now(),
        }

        config_saved = file_datasource_manager.save_file_datasource(file_info)
        if not config_saved:
            logger.warning(f"文件数据源配置保存失败: {source_id}")

        logger.info(
            f"已将文件 {file.filename} 持久化到DuckDB，表名: {source_id}, 行数: {len(df_full)}"
        )

        # 安排文件清理（1小时后）
        schedule_cleanup(save_path, background_tasks)

        return FileUploadResponse(
            success=True,
            file_id=source_id,
            filename=file.filename,
            file_size=preview_info["file_size"],
            columns=preview_info["columns"],
            row_count=preview_info["total_rows"],
            preview_data=preview_info["preview_data"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文件上传处理失败: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"文件上传处理失败: {str(e)}")


@router.get("/api/file_preview/{filename}", tags=["Data Sources"])
async def get_file_preview_api(filename: str, rows: int = 10):
    """获取文件预览信息"""
    try:
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        file_path = os.path.join(temp_dir, filename)

        logger.info(f"尝试预览文件: {filename}, 路径: {file_path}")

        if not os.path.exists(file_path):
            logger.error(f"文件不存在: {file_path}")
            raise HTTPException(status_code=404, detail="文件不存在")

        # 检测文件类型
        file_type = detect_file_type(file_path)
        logger.info(f"检测到文件类型: {file_type}")

        preview_info = get_file_preview(file_path, rows)
        logger.info(f"文件预览成功: {filename}")
        return preview_info

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"文件预览失败 {filename}: {str(e)}")
        logger.error(f"堆栈跟踪: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"文件预览失败: {str(e)}")


@router.post("/api/connect_database", tags=["Data Sources"])
async def connect_database(connection: DatabaseConnection = Body(...)):
    """连接到数据库，提取数据并加载到DuckDB中"""
    try:
        logger.info(f"尝试连接到数据库: {connection.type} - {connection.id}")
        logger.info(f"连接参数: {connection.params}")
        logger.info(
            f"参数中是否包含query: {'query' in connection.params if connection.params else 'params为空'}"
        )

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
                        # 支持 user 和 username 两种参数名称
                        user = connection.params.get("user") or connection.params.get(
                            "username", ""
                        )
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
                    create_persistent_table(table_id, df, duckdb_con)

                    # 确认表已正确创建
                    tables = duckdb_con.execute("SHOW TABLES").fetchdf()
                    logger.info(f"当前DuckDB中的表: {tables.to_string()}")

                    logger.info(
                        f"{connection.type}查询结果已创建为持久化表: {table_id}"
                    )

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
    """删除指定的本地文件（仅限于temp_files目录下）并清理DuckDB中的对应表"""
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
        # 获取文件名（不含扩展名）作为表名
        filename = os.path.basename(abs_path)
        table_name = filename.split(".")[0]

        # 1. 删除物理文件
        os.remove(abs_path)
        logger.info(f"已删除物理文件: {abs_path}")

        # 2. 清理DuckDB中的对应表
        try:
            duckdb_con.execute(f'DROP TABLE IF EXISTS "{table_name}"')
            logger.info(f"已从DuckDB中删除表: {table_name}")
        except Exception as e:
            logger.warning(f"删除DuckDB表失败 {table_name}: {str(e)}")
            # 不抛出异常，因为文件已经删除成功

        # 3. 删除文件数据源配置
        try:
            config_removed = file_datasource_manager.remove_file_datasource(table_name)
            if config_removed:
                logger.info(f"已删除文件数据源配置: {table_name}")
            else:
                logger.warning(f"文件数据源配置不存在: {table_name}")
        except Exception as e:
            logger.warning(f"删除文件数据源配置失败 {table_name}: {str(e)}")

        return {
            "success": True,
            "message": f"文件已删除，并清理了DuckDB表和配置: {table_name}",
        }

    except Exception as e:
        logger.error(f"删除文件失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"文件删除失败: {str(e)}")


@router.post("/api/clear_duckdb_tables", tags=["Data Sources"])
async def clear_duckdb_tables():
    """清除DuckDB中的所有表数据"""
    try:
        from core.duckdb_engine import get_db_connection

        con = get_db_connection()

        # 获取当前所有表
        tables_df = con.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist() if not tables_df.empty else []

        dropped_tables = []
        for table_name in table_names:
            try:
                con.execute(f"DROP TABLE IF EXISTS {table_name}")
                dropped_tables.append(table_name)
                logger.info(f"已删除DuckDB表: {table_name}")
            except Exception as e:
                logger.error(f"删除表 {table_name} 失败: {str(e)}")

        return {
            "success": True,
            "message": f"已清除 {len(dropped_tables)} 个DuckDB表",
            "dropped_tables": dropped_tables,
        }

    except Exception as e:
        logger.error(f"清除DuckDB表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"清除DuckDB表失败: {str(e)}")


@router.delete("/api/clear_all_data", tags=["Data Sources"])
async def clear_all_data():
    """清除所有数据：删除temp_files中的文件和DuckDB中的表"""
    try:
        from core.duckdb_engine import get_db_connection

        # 1. 清除DuckDB表
        con = get_db_connection()
        tables_df = con.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist() if not tables_df.empty else []

        dropped_tables = []
        for table_name in table_names:
            try:
                con.execute(f"DROP TABLE IF EXISTS {table_name}")
                dropped_tables.append(table_name)
                logger.info(f"已删除DuckDB表: {table_name}")
            except Exception as e:
                logger.error(f"删除表 {table_name} 失败: {str(e)}")

        # 2. 清除temp_files目录中的文件
        temp_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "temp_files"
        )
        deleted_files = []

        if os.path.exists(temp_dir):
            for filename in os.listdir(temp_dir):
                file_path = os.path.join(temp_dir, filename)
                if os.path.isfile(file_path):
                    try:
                        os.remove(file_path)
                        deleted_files.append(filename)
                        logger.info(f"已删除文件: {filename}")
                    except Exception as e:
                        logger.error(f"删除文件 {filename} 失败: {str(e)}")

        return {
            "success": True,
            "message": f"已清除 {len(dropped_tables)} 个DuckDB表和 {len(deleted_files)} 个文件",
            "dropped_tables": dropped_tables,
            "deleted_files": deleted_files,
        }

    except Exception as e:
        logger.error(f"清除所有数据失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"清除所有数据失败: {str(e)}")


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


@router.get("/api/database_tables/{connection_id}", tags=["Database Management"])
async def get_database_tables(connection_id: str):
    """获取指定数据库连接的所有表信息"""
    try:
        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"数据库连接 {connection_id} 不存在"
            )

        # 连接数据库
        import pymysql

        db_config = connection.params

        # 支持 user 和 username 两种参数名称
        username = db_config.get("user") or db_config.get("username")
        if not username:
            raise HTTPException(
                status_code=400, detail="缺少用户名参数 (user 或 username)"
            )

        conn = pymysql.connect(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 3306)),
            user=username,
            password=db_config["password"],
            database=db_config["database"],
            charset="utf8mb4",
            connect_timeout=10,  # 连接超时10秒
            read_timeout=30,  # 读取超时30秒
            write_timeout=30,  # 写入超时30秒
        )

        try:
            with conn.cursor() as cursor:
                # 获取所有表名
                cursor.execute("SHOW TABLES")
                tables = [row[0] for row in cursor.fetchall()]

                table_info = []
                # 限制表数量，避免超时
                max_tables = 50
                tables_to_process = tables[:max_tables]

                for table_name in tables_to_process:
                    try:
                        # 获取表结构信息
                        cursor.execute(f"DESCRIBE `{table_name}`")
                        columns = []
                        for col_row in cursor.fetchall():
                            columns.append(
                                {
                                    "name": col_row[0],
                                    "type": col_row[1],
                                    "null": col_row[2],
                                    "key": col_row[3],
                                    "default": col_row[4],
                                    "extra": col_row[5],
                                }
                            )

                        # 不再统计行数，提升性能
                        table_info.append(
                            {
                                "table_name": table_name,
                                "columns": columns,
                                "column_count": len(columns),
                                "row_count": 0,  # 不再提供行数统计，返回0避免前端错误
                            }
                        )

                    except Exception as table_error:
                        logger.warning(
                            f"获取表 {table_name} 信息失败: {str(table_error)}"
                        )
                        # 即使单个表失败，也继续处理其他表
                        table_info.append(
                            {
                                "table_name": table_name,
                                "columns": [],
                                "column_count": 0,
                                "row_count": 0,  # 返回0避免前端错误
                                "error": str(table_error),
                            }
                        )

                return {
                    "success": True,
                    "connection_id": connection_id,
                    "connection_name": connection.name,
                    "database": db_config["database"],
                    "tables": table_info,
                    "table_count": len(table_info),
                }

        finally:
            conn.close()

    except Exception as e:
        logger.error(f"获取数据库表信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据库表信息失败: {str(e)}")


@router.get(
    "/api/database_table_details/{connection_id}/{table_name}",
    tags=["Database Management"],
)
async def get_table_details(connection_id: str, table_name: str):
    """获取指定表的详细信息，包括字段详情和示例数据"""
    try:
        # 获取数据库连接配置
        connection = db_manager.get_connection(connection_id)
        if not connection:
            raise HTTPException(
                status_code=404, detail=f"数据库连接 {connection_id} 不存在"
            )

        # 连接数据库
        import pymysql

        db_config = connection.params

        # 支持 user 和 username 两种参数名称
        username = db_config.get("user") or db_config.get("username")
        if not username:
            raise HTTPException(
                status_code=400, detail="缺少用户名参数 (user 或 username)"
            )

        conn = pymysql.connect(
            host=db_config.get("host", "localhost"),
            port=int(db_config.get("port", 3306)),
            user=username,
            password=db_config["password"],
            database=db_config["database"],
            charset="utf8mb4",
            connect_timeout=10,  # 连接超时10秒
            read_timeout=30,  # 读取超时30秒
            write_timeout=30,  # 写入超时30秒
        )

        try:
            with conn.cursor() as cursor:
                # 获取表结构详细信息
                cursor.execute(f"DESCRIBE `{table_name}`")
                columns = []
                for col_row in cursor.fetchall():
                    columns.append(
                        {
                            "name": col_row[0],
                            "type": col_row[1],
                            "null": col_row[2],
                            "key": col_row[3],
                            "default": col_row[4],
                            "extra": col_row[5],
                        }
                    )

                # 不再统计行数，提升性能
                row_count = 0  # 返回0避免前端错误

                # 获取示例数据（前5行）
                cursor.execute(f"SELECT * FROM `{table_name}` LIMIT 5")
                sample_data = []
                for row in cursor.fetchall():
                    sample_data.append(list(row))

                return {
                    "success": True,
                    "table_name": table_name,
                    "columns": columns,
                    "column_count": len(columns),
                    "row_count": row_count,
                    "sample_data": sample_data,
                }

        finally:
            conn.close()

    except Exception as e:
        logger.error(f"获取表详细信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取表详细信息失败: {str(e)}")


@router.get("/api/debug_file_paths", tags=["Data Sources"])
async def debug_file_paths():
    """调试文件路径信息"""
    import os

    # 计算API使用的路径
    api_temp_dir = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "temp_files"
    )

    # 检查所有可能的temp_files目录
    possible_dirs = [
        api_temp_dir,
        os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "temp_files"
        ),
        "temp_files",
        "../temp_files",
        "./temp_files",
    ]

    debug_info = {
        "current_file": __file__,
        "api_calculated_temp_dir": os.path.abspath(api_temp_dir),
        "directories_checked": [],
        "target_file_debug": {},
    }

    # 特别调试0711.xlsx
    target_file = "0711.xlsx"
    for dir_path in possible_dirs:
        abs_path = os.path.abspath(dir_path)
        target_path = os.path.join(abs_path, target_file)
        debug_info["target_file_debug"][dir_path] = {
            "dir_exists": os.path.exists(abs_path),
            "file_exists": os.path.exists(target_path),
            "file_path": target_path,
        }

    for dir_path in possible_dirs:
        abs_path = os.path.abspath(dir_path)
        exists = os.path.exists(abs_path)
        files = []
        file_details = {}
        if exists:
            try:
                files = os.listdir(abs_path)
                for f in files:
                    fp = os.path.join(abs_path, f)
                    file_details[f] = {
                        "is_file": os.path.isfile(fp),
                        "size": os.path.getsize(fp) if os.path.exists(fp) else 0,
                        "readable": (
                            os.access(fp, os.R_OK) if os.path.exists(fp) else False
                        ),
                    }
            except:
                files = ["ERROR_READING_DIR"]

        debug_info["directories_checked"].append(
            {
                "path": dir_path,
                "absolute_path": abs_path,
                "exists": exists,
                "files": files,
                "file_details": file_details,
            }
        )

    return debug_info


@router.get("/api/list_files", tags=["Data Sources"])
async def list_files():
    """列出 temp_files 目录下所有文件名（不含路径），并验证文件存在性"""
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp_files")
    if not os.path.exists(temp_dir):
        return JSONResponse([])

    verified_files = []
    for filename in os.listdir(temp_dir):
        file_path = os.path.join(temp_dir, filename)
        # 严格验证：文件存在且可读取
        if os.path.isfile(file_path) and os.access(file_path, os.R_OK):
            try:
                # 进一步验证文件完整性
                file_size = os.path.getsize(file_path)
                if file_size > 0:  # 确保文件不为空
                    verified_files.append(filename)
                else:
                    logger.warning(f"跳过空文件: {filename}")
            except Exception as e:
                logger.warning(f"跳过无法访问的文件: {filename}, 错误: {e}")

    logger.info(
        f"验证文件列表: 目录中有 {len(os.listdir(temp_dir))} 个项目，有效文件 {len(verified_files)} 个"
    )

    # 返回带有禁用缓存头的响应，确保前端获取最新数据
    return JSONResponse(
        verified_files,
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/api/file_columns", tags=["Data Sources"])
async def file_columns(filename: str):
    """获取指定文件的列名，确保文件存在性检查"""
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "temp_files")
    file_path = os.path.join(temp_dir, filename)

    # 严格检查文件是否存在
    if not os.path.exists(file_path):
        logger.warning(f"请求的文件不存在: {filename}, 路径: {file_path}")
        return []

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(file_path, nrows=5)
        elif filename.endswith((".xls", ".xlsx")):
            df = pd.read_excel(file_path, nrows=5)
        else:
            logger.warning(f"不支持的文件类型: {filename}")
            return []

        columns = df.columns.tolist()
        logger.info(f"成功获取文件列名: {filename}, 列数: {len(columns)}")
        return JSONResponse(columns)

    except Exception as e:
        logger.error(f"读取文件列名失败 {filename}: {str(e)}")
        return []


@router.get("/api/duckdb/tables", tags=["DuckDB"])
async def get_duckdb_tables():
    """获取DuckDB中的所有表信息"""
    con = get_db_connection()

    try:
        tables_df = con.execute("SHOW TABLES").fetchdf()

        if tables_df.empty:
            return {"success": True, "tables": [], "count": 0}

        table_info = []
        for _, row in tables_df.iterrows():
            table_name = row["name"]
            try:
                # 获取表结构
                schema_df = con.execute(f'DESCRIBE "{table_name}"').fetchdf()
                # 获取行数
                count_result = con.execute(
                    f'SELECT COUNT(*) as count FROM "{table_name}"'
                ).fetchone()
                row_count = count_result[0] if count_result else 0

                table_info.append(
                    {
                        "table_name": table_name,
                        "columns": schema_df.to_dict("records"),
                        "column_count": len(schema_df),
                        "row_count": row_count,
                    }
                )
            except Exception as table_error:
                logger.warning(f"获取表 {table_name} 信息失败: {str(table_error)}")
                table_info.append(
                    {
                        "table_name": table_name,
                        "columns": [],
                        "column_count": 0,
                        "row_count": 0,
                        "error": str(table_error),
                    }
                )

        return {"success": True, "tables": table_info, "count": len(table_info)}

    except Exception as e:
        logger.error(f"获取DuckDB表信息失败: {str(e)}")
        return {"success": False, "error": str(e), "tables": [], "count": 0}


@router.delete("/api/file_datasources/{source_id}", tags=["Data Sources"])
async def delete_file_datasource(source_id: str):
    """删除文件数据源（包括文件、DuckDB表和配置条目）"""
    try:
        # 1. Get the datasource config to find the file path
        datasource_config = file_datasource_manager.get_file_datasource(source_id)
        
        if not datasource_config:
            logger.warning(f"数据源配置 '{source_id}' 不存在，将尝试按约定清理。")
        else:
            # 2. Delete the physical file if it exists
            file_path = datasource_config.get("file_path")
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logger.info(f"已删除物理文件: {file_path}")
                except Exception as e:
                    logger.error(f"删除物理文件失败 {file_path}: {str(e)}")

        # 3. Drop the DuckDB table (table name is the source_id)
        try:
            duckdb_con.execute(f'DROP TABLE IF EXISTS "{source_id}"' )
            logger.info(f"已从DuckDB中删除表: {source_id}")
        except Exception as e:
            logger.warning(f"删除DuckDB表失败 {source_id}: {str(e)}")

        # 4. Delete the config entry
        file_datasource_manager.delete_file_datasource(source_id)
        
        return {"success": True, "message": f"数据源 {source_id} 已成功删除"}

    except Exception as e:
        logger.error(f"删除数据源失败 {source_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除数据源失败: {str(e)}")


@router.get("/api/file_datasources", tags=["Data Sources"])
async def get_file_datasources():
    """获取所有已保存的文件数据源配置，并过滤掉文件不存在的无效条目"""
    try:
        all_datasources = file_datasource_manager.list_file_datasources()
        
        # 验证每个数据源的文件是否仍然存在
        verified_datasources = []
        for ds in all_datasources:
            file_path = ds.get("file_path")
            if file_path and os.path.exists(file_path):
                verified_datasources.append(ds)
            else:
                logger.warning(f"数据源 '{ds.get('source_id')}' 对应的文件不存在: {file_path}。已从列表中过滤。")

        return {
            "success": True,
            "datasources": verified_datasources
        }
    except Exception as e:
        logger.error(f"获取文件数据源失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取文件数据源失败: {str(e)}")
