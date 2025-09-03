from fastapi import (
    APIRouter,
    HTTPException,
    Body,
    UploadFile,
    File,
    Form,
    BackgroundTasks,
    Request,
)
import logging
import os
import json
import time
import traceback
from core.duckdb_engine import get_db_connection
from core.encryption import password_encryptor
from models.query_models import (
    DatabaseConnection,
    ConnectionTestRequest,
    FileUploadResponse,
)
from core.database_manager import db_manager
from core.security import security_validator
from core.resource_manager import save_upload_file, schedule_cleanup
from core.file_utils import detect_file_type, read_file_by_type
from core.file_datasource_manager import (
    file_datasource_manager,
    create_table_from_dataframe,
)
import datetime
from core.timezone_utils import get_current_time  # 导入时区工具

router = APIRouter()
logger = logging.getLogger(__name__)

DATASOURCES_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "..",
    "config",
    "datasources.json",
)


def _save_connections_to_config():
    try:
        connections = db_manager.list_connections()
        config_data = {"database_sources": [conn.dict() for conn in connections]}
        with open(DATASOURCES_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        logger.info("Successfully saved connections to config file.")
    except Exception as e:
        logger.error(f"Error saving connections to config file: {e}")


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

                # 获取配置的超时时间
                from core.config_manager import config_manager

                app_config = config_manager.get_app_config()

                conn = pymysql.connect(
                    host=request.get("host", "localhost"),
                    port=request.get("port", 3306),
                    user=request.get("username", ""),
                    password=request.get("password", ""),
                    database=request.get("database", ""),
                    connect_timeout=app_config.db_ping_timeout,
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
                    connect_timeout=app_config.db_ping_timeout,
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
        connection.created_at = get_current_time()
        connection.updated_at = get_current_time()

        success = db_manager.add_connection(connection)
        if success:
            _save_connections_to_config()
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

    # 记录详细的请求信息
    client_ip = request.client.host if request.client else "unknown"

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
        # 每次调用都重新加载配置，确保数据最新
        logger.info("重新加载数据库连接配置")
        logger.info(f"重新加载前连接数量: {len(db_manager.connections)}")
        logger.info(f"重新加载前配置状态: {getattr(db_manager, '_config_loaded', 'Unknown')}")
        
        db_manager._load_connections_from_config()
        
        logger.info(f"重新加载后连接数量: {len(db_manager.connections)}")
        logger.info(f"重新加载后配置状态: {getattr(db_manager, '_config_loaded', 'Unknown')}")
        
        connections = db_manager.list_connections()
        logger.info(f"list_connections() 返回: {len(connections)} 个连接")
        
        # 调试每个连接的状态
        for conn in connections:
            logger.info(f"连接 {conn.id}: 状态={conn.status}, 类型={type(conn.status)}")

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
                "status": conn.status.value if hasattr(conn.status, "value") else str(conn.status),
                "created_at": conn.created_at.isoformat() if conn.created_at else None,
                "updated_at": conn.updated_at.isoformat() if conn.updated_at else None,
                "last_tested": (
                    conn.last_tested.isoformat() if conn.last_tested else None
                ),
            }
            serializable_connections.append(conn_dict)

        logger.info(f"返回数据库连接列表，共 {len(serializable_connections)} 个连接")

        result = {"success": True, "connections": serializable_connections}

        # 不缓存结果，确保每次都是最新状态
        # list_database_connections._cached_result = result

        return result
    except Exception as e:
        logger.error(f"获取数据库连接列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据库连接列表失败: {str(e)}")


@router.post("/api/upload", tags=["Data Sources"])
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    table_alias: str = Form(None),
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
        from core.file_utils import get_file_preview

        preview_info = get_file_preview(save_path, rows=10)

        # 生成SQL兼容的表名
        if table_alias:
            # 使用用户提供的表别名，保持原始输入
            source_id = table_alias
        else:
            # 使用文件名作为默认表名
            source_id = file.filename.split(".")[0]

        # 清理特殊字符，但保持用户输入的原始格式
        if table_alias:
            # 用户提供的表别名，只清理不兼容的字符
            source_id = "".join(
                c if c.isalnum() or c == "_" else "_" for c in source_id
            )
        else:
            # 文件名生成的表名，进行完整清理
            source_id = "".join(
                c if c.isalnum() or c == "_" else "_" for c in source_id
            )
            if source_id and source_id[0].isdigit():
                source_id = f"table_{source_id}"

        if not source_id:
            source_id = f"table_{int(time.time())}"

        # 检查表名是否已存在，如果存在则添加时间后缀
        duckdb_con = get_db_connection()
        original_source_id = source_id

        while True:
            try:
                # 检查表是否存在
                result = duckdb_con.execute(
                    f'SELECT name FROM sqlite_master WHERE type="table" AND name="{source_id}"'
                ).fetchone()
                if result is None:
                    # 表不存在，可以使用这个名称
                    break
                else:
                    # 表已存在，添加时间后缀
                    import time

                    timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
                    source_id = f"{original_source_id}_{timestamp}"
                    break
            except Exception as e:
                logger.warning(f"检查表名时出错: {e}")
                break

        df_full = read_file_by_type(save_path, file_type)

        # 使用CREATE TABLE持久化到DuckDB而不是临时注册
        duckdb_con = get_db_connection()
        try:
            create_table_from_dataframe(duckdb_con, source_id, df_full)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"持久化到DuckDB失败: {str(e)}")

        # 保存文件数据源配置到持久化存储（遵循created_at字段标准）
        file_info = {
            "source_id": source_id,
            "filename": file.filename,
            "file_path": save_path,
            "file_type": file_type,
            "row_count": len(df_full),
            "column_count": len(df_full.columns),
            "columns": list(df_full.columns),
            "created_at": get_current_time(),  # 使用统一的created_at字段
        }

        config_saved = file_datasource_manager.save_file_datasource(file_info)
        if not config_saved:
            logger.warning(f"文件数据源配置保存失败: {source_id}")

        logger.info(
            f"已将文件 {file.filename} 持久化到DuckDB，表名: {source_id}, 行数: {len(df_full)}"
        )

        # 删除原始上传文件（数据已在DuckDB中）
        try:
            if os.path.exists(save_path):
                os.remove(save_path)
                logger.info(f"已删除原始上传文件: {save_path}")
        except Exception as e:
            logger.warning(f"删除原始上传文件失败: {str(e)}")

        # 删除临时验证文件
        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except Exception as e:
            logger.warning(f"删除临时文件失败: {str(e)}")

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
        # 设置更新时间
        connection.updated_at = get_current_time()

        # 先删除旧连接
        db_manager.remove_connection(connection_id)

        # 添加新连接
        success = db_manager.add_connection(connection)
        if success:
            _save_connections_to_config()
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
            _save_connections_to_config()
            return {"success": True, "message": "数据库连接删除成功"}
        else:
            raise HTTPException(status_code=404, detail="数据库连接不存在")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除数据库连接失败: {str(e)}")


# 新增数据库连接接口
@router.post("/api/database/connect", tags=["Database Management"])
async def connect_database(connection: DatabaseConnection):
    """连接数据库并返回表信息"""
    try:
        # 测试连接
        test_result = await test_database_connection(connection)
        if not test_result.success:
            raise HTTPException(status_code=400, detail=test_result.message)

        # 创建连接
        success = db_manager.add_connection(connection)
        if success:
            # 获取数据库表信息
            tables = await get_database_tables(connection)
            return {
                "success": True,
                "message": "数据库连接成功",
                "connection": connection,
                "tables": tables,
            }
        else:
            raise HTTPException(status_code=400, detail="数据库连接创建失败")
    except Exception as e:
        logger.error(f"数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def get_database_tables(connection: DatabaseConnection) -> list:
    """获取数据库表信息"""
    try:
        # 根据数据库类型获取表信息
        if connection.type == "mysql":
            return await get_mysql_tables(connection)
        elif connection.type == "postgresql":
            return await get_postgresql_tables(connection)
        else:
            return []
    except Exception as e:
        logger.warning(f"获取数据库表信息失败: {str(e)}")
        return []


async def get_mysql_tables(connection: DatabaseConnection) -> list:
    """获取MySQL表信息"""
    try:
        import pymysql

        # 获取配置的超时时间
        from core.config_manager import config_manager

        app_config = config_manager.get_app_config()

        # 创建连接
        conn = pymysql.connect(
            host=connection.params.get("host", "localhost"),
            port=connection.params.get("port", 3306),
            user=connection.params.get("username", ""),
            password=connection.params.get("password", ""),
            database=connection.params.get("database", ""),
            connect_timeout=app_config.db_connect_timeout,
        )

        with conn.cursor() as cursor:
            # 获取表列表
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()

            table_info = []
            for table in tables:
                table_name = table[0]

                # 获取表行数
                cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                row_count = cursor.fetchone()[0]

                # 获取表结构
                cursor.execute(f"DESCRIBE `{table_name}`")
                columns = cursor.fetchall()

                table_info.append(
                    {
                        "table_name": table_name,
                        "row_count": row_count,
                        "columns": [
                            {"name": col[0], "type": col[1], "nullable": col[2]}
                            for col in columns
                        ],
                        "column_count": len(columns),
                    }
                )

        conn.close()
        return table_info

    except Exception as e:
        logger.error(f"获取MySQL表信息失败: {str(e)}")
        return []


async def get_postgresql_tables(connection: DatabaseConnection) -> list:
    """获取PostgreSQL表信息"""
    try:
        import psycopg2

        # 创建连接
        conn = psycopg2.connect(
            host=connection.params.get("host", "localhost"),
            port=connection.params.get("port", 5432),
            user=connection.params.get("username", ""),
            password=connection.params.get("password", ""),
            database=connection.params.get("database", ""),
            connect_timeout=app_config.db_connect_timeout,
        )

        with conn.cursor() as cursor:
            # 获取表列表
            cursor.execute(
                """
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """
            )
            tables = cursor.fetchall()

            table_info = []
            for table in tables:
                table_name = table[0]

                # 获取表行数
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                row_count = cursor.fetchone()[0]

                # 获取表行数
                cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
                row_count = cursor.fetchone()[0]

                # 获取表结构
                cursor.execute(
                    f"""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = '{table_name}'
                    ORDER BY ordinal_position
                """
                )
                columns = cursor.fetchall()

                table_info.append(
                    {
                        "table_name": table_name,
                        "row_count": row_count,
                        "columns": [
                            {"name": col[0], "type": col[1], "nullable": col[2]}
                            for col in columns
                        ],
                        "column_count": len(columns),
                    }
                )

        conn.close()
        return table_info

    except Exception as e:
        logger.error(f"获取PostgreSQL表信息失败: {str(e)}")
        return []
