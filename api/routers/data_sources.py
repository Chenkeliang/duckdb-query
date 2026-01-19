import datetime
import json
import logging
import os
import time
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from core.common.timezone_utils import get_current_time, get_current_time_iso  # 导入时区工具
from core.data.excel_import_manager import (
    cleanup_pending_excel,
    derive_default_table_name,
    get_pending_excel,
    inspect_excel_sheets,
    load_excel_sheet_dataframe,
    register_excel_upload,
    sanitize_identifier,
)
from core.data.file_datasource_manager import (
    _quote_identifier,
    build_table_metadata_snapshot,
    create_table_from_dataframe,
    file_datasource_manager,
)
from core.data.file_utils import detect_file_type
from core.database.database_manager import db_manager
from core.database.duckdb_engine import with_duckdb_connection
from core.security.encryption import password_encryptor
from core.security.security import security_validator
from core.services.resource_manager import save_upload_file, schedule_cleanup
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import JSONResponse
from models.query_models import (
    ConnectionStatus,
    ConnectionTestRequest,
    DatabaseConnection,
    FileUploadResponse,
)
from pydantic import BaseModel, Field, field_validator, model_validator
from utils.response_helpers import (
    MessageCode,
    create_error_response,
    create_list_response,
    create_success_response,
)

router = APIRouter()
logger = logging.getLogger(__name__)


VALID_EXCEL_IMPORT_MODES = {"replace", "append", "fail"}


class ExcelInspectRequest(BaseModel):
    file_id: str = Field(..., description="上传后的Excel文件标识")


class ExcelImportSheet(BaseModel):
    name: str = Field(..., description="工作表名称")
    target_table: str = Field(..., description="目标DuckDB表名")
    mode: str = Field(default="replace", description="导入模式 replace/append/fail")
    header_rows: int = Field(default=1, description="表头行数")
    header_row_index: Optional[int] = Field(
        default=1, description="表头起始行(1-based)"
    )
    fill_merged: bool = Field(default=False, description="是否填充合并单元格")

    @field_validator("mode", mode="before")
    def _validate_mode(cls, mode: str) -> str:
        normalized = (mode or "").lower()
        if normalized not in VALID_EXCEL_IMPORT_MODES:
            raise ValueError(f"不支持的导入模式: {mode}")
        return normalized

    @field_validator("header_rows")
    def _validate_header_rows(cls, value: int) -> int:
        if value < 0:
            raise ValueError("表头行数不能为负数")
        return value

    @field_validator("target_table")
    def _validate_target_table(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("目标表名不能为空")
        return value

    @model_validator(mode="after")
    def _normalize_header_row_index(self):
        if self.header_rows == 0:
            self.header_row_index = None
        elif self.header_row_index is None or self.header_row_index <= 0:
            self.header_row_index = 1
        return self


class ExcelImportRequest(BaseModel):
    file_id: str = Field(..., description="上传后的Excel文件标识")
    sheets: List[ExcelImportSheet]

    @field_validator("sheets")
    def _validate_sheets(cls, sheets: List[ExcelImportSheet]) -> List[ExcelImportSheet]:
        if not sheets:
            raise ValueError("至少需要选择一个工作表进行导入")
        return sheets


@router.post(
    "/api/database_connections/test",
    tags=["Database Management"],
    deprecated=True,
    summary="测试数据库连接（已废弃）",
    description="⚠️ 此端点已废弃，请使用 POST /api/datasources/databases/test",
)
async def test_database_connection(request: ConnectionTestRequest, response: Response):
    """
    测试数据库连接（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: POST /api/datasources/databases/test
    """
    # 添加废弃响应头
    response.headers["X-Deprecated"] = "true"
    response.headers["X-New-Endpoint"] = "/api/datasources/databases/test"
    response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        "使用了废弃的端点: /api/database_connections/test, "
        "请迁移到 /api/datasources/databases/test"
    )

    try:
        result = db_manager.test_connection(request)
        return result
    except Exception as e:
        logger.error(f"连接测试失败: {str(e)}")

        # 使用统一的错误代码系统
        from core.common.error_codes import (
            analyze_error_type,
            create_error_response,
            get_http_status_code,
        )

        original_error = str(e)
        error_code = analyze_error_type(original_error)
        status_code = get_http_status_code(error_code)

        # 创建标准化的错误响应
        error_response = create_error_response(
            error_code=error_code, original_error=original_error
        )

        # 返回详细的错误响应
        raise HTTPException(status_code=status_code, detail=error_response)


@router.post(
    "/api/database_connections/{connection_id}/refresh",
    tags=["Database Management"],
    deprecated=True,
    summary="刷新数据库连接（已废弃）",
    description="⚠️ 此端点已废弃，请使用 POST /api/datasources/databases/{connection_id}/refresh",
)
async def refresh_database_connection(connection_id: str, response: Response):
    """
    刷新数据库连接（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: POST /api/datasources/databases/{connection_id}/refresh
    """
    # 添加废弃响应头
    response.headers["X-Deprecated"] = "true"
    response.headers["X-New-Endpoint"] = (
        f"/api/datasources/databases/{connection_id}/refresh"
    )
    response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        f"使用了废弃的端点: POST /api/database_connections/{connection_id}/refresh, "
        f"请迁移到 POST /api/datasources/databases/{connection_id}/refresh"
    )

    connection = db_manager.get_connection(connection_id)
    if not connection:
        raise HTTPException(status_code=404, detail="未找到数据库连接")

    logger.info(f"开始重新测试数据库连接: {connection_id}")

    test_request = ConnectionTestRequest(type=connection.type, params=connection.params)
    test_result = db_manager.test_connection(test_request)

    now = get_current_time()
    connection.last_tested = now
    connection.updated_at = now

    success = False
    message = test_result.message or ""

    if test_result.success:
        try:
            if connection_id in db_manager.engines:
                try:
                    db_manager.engines[connection_id].dispose()
                except Exception as dispose_error:
                    logger.warning(f"释放旧数据库引擎时出现警告: {dispose_error}")

            engine = db_manager._create_engine(connection.type, connection.params)
            db_manager.engines[connection_id] = engine
            connection.status = ConnectionStatus.ACTIVE
            success = True
            message = test_result.message or "连接测试成功"
            logger.info(f"数据库连接 {connection_id} 测试成功，状态已更新为 ACTIVE")
        except Exception as engine_error:
            logger.error(
                f"连接 {connection_id} 测试成功但初始化引擎失败: {engine_error}"
            )
            connection.status = ConnectionStatus.ERROR
            message = f"连接成功但初始化失败: {engine_error}"
    else:
        connection.status = ConnectionStatus.ERROR
        message = test_result.message or "连接测试失败"
        if connection_id in db_manager.engines:
            try:
                db_manager.engines[connection_id].dispose()
            except Exception as dispose_error:
                logger.warning(
                    f"连接 {connection_id} 测试失败，释放引擎时出现警告: {dispose_error}"
                )
            db_manager.engines.pop(connection_id, None)
        logger.warning(f"数据库连接 {connection_id} 测试失败: {message}")

    db_manager.connections[connection_id] = connection

    return create_success_response(
        data={
            "connection": connection,
            "test_result": test_result,
        },
        message_code=MessageCode.CONNECTION_TEST_SUCCESS
        if success
        else MessageCode.CONNECTION_TEST_FAILED,
        message=message,
    )


@router.post(
    "/api/test_connection_simple",
    tags=["Database Management"],
    deprecated=True,
    summary="简化的数据库连接测试（已废弃）",
    description="⚠️ 此端点已废弃，请使用 POST /api/datasources/databases/test",
)
async def test_connection_simple(request: dict = Body(...), response: Response = None):
    """
    简化的数据库连接测试（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: POST /api/datasources/databases/test
    """
    # 添加废弃响应头
    if response:
        response.headers["X-Deprecated"] = "true"
        response.headers["X-New-Endpoint"] = "/api/datasources/databases/test"
        response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        "使用了废弃的端点: /api/test_connection_simple, "
        "请迁移到 /api/datasources/databases/test"
    )
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
                return create_success_response(
                    data={"connection_type": "sqlite"},
                    message_code=MessageCode.CONNECTION_TEST_SUCCESS,
                    message="SQLite连接测试成功",
                )
            except Exception as e:
                return JSONResponse(
                    status_code=500,
                    content=create_error_response(
                        code=MessageCode.CONNECTION_TEST_FAILED,
                        message=f"SQLite connection failed: {str(e)}",
                        details={"connection_type": "sqlite"},
                    ),
                )

        elif db_type == "mysql":
            # MySQL连接测试
            try:
                import pymysql

                # 获取配置的超时时间
                from core.common.config_manager import config_manager

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
                return create_success_response(
                    data={"connection_type": "mysql"},
                    message_code=MessageCode.CONNECTION_TEST_SUCCESS,
                    message="MySQL连接测试成功",
                )
            except Exception as e:
                return JSONResponse(
                    status_code=500,
                    content=create_error_response(
                        code=MessageCode.CONNECTION_TEST_FAILED,
                        message=f"MySQL连接失败: {str(e)}",
                        details={"connection_type": "mysql"},
                    ),
                )

        elif db_type == "postgresql":
            # PostgreSQL连接测试
            try:
                import psycopg2

                # 获取配置的超时时间
                from core.common.config_manager import config_manager

                app_config = config_manager.get_app_config()

                conn = psycopg2.connect(
                    host=request.get("host", "localhost"),
                    port=request.get("port", 5432),
                    user=request.get("username", ""),
                    password=request.get("password", ""),
                    database=request.get("database", ""),
                    connect_timeout=app_config.db_ping_timeout,
                )
                conn.close()
                return create_success_response(
                    data={"connection_type": "postgresql"},
                    message_code=MessageCode.CONNECTION_TEST_SUCCESS,
                    message="PostgreSQL连接测试成功",
                )
            except Exception as e:
                return JSONResponse(
                    status_code=500,
                    content=create_error_response(
                        code=MessageCode.CONNECTION_TEST_FAILED,
                        message=f"PostgreSQL连接失败: {str(e)}",
                        details={"connection_type": "postgresql"},
                    ),
                )

        else:
            return JSONResponse(
                status_code=400,
                content=create_error_response(
                    code=MessageCode.VALIDATION_ERROR,
                    message=f"Unsupported database type: {db_type}",
                    details={"db_type": db_type},
                ),
            )

    except Exception as e:
        logger.error(f"连接测试失败: {str(e)}")
        return JSONResponse(
            status_code=500,
            content=create_error_response(
                code=MessageCode.CONNECTION_TEST_FAILED,
                message=f"Connection test failed: {str(e)}",
                details={},
            ),
        )


@router.post(
    "/api/database_connections",
    tags=["Database Management"],
    deprecated=True,
    summary="创建数据库连接（已废弃）",
    description="⚠️ 此端点已废弃，请使用 POST /api/datasources/databases",
)
async def create_database_connection(
    connection: DatabaseConnection, response: Response
):
    """
    创建数据库连接（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: POST /api/datasources/databases
    """
    # 添加废弃响应头
    response.headers["X-Deprecated"] = "true"
    response.headers["X-New-Endpoint"] = "/api/datasources/databases"
    response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        "使用了废弃的端点: /api/database_connections, "
        "请迁移到 /api/datasources/databases"
    )

    try:
        # 设置创建时间
        connection.created_at = get_current_time()
        connection.updated_at = get_current_time()

        success = db_manager.add_connection(connection)
        if success:
            return create_success_response(
                data={"connection": connection},
                message_code=MessageCode.CONNECTION_CREATED,
            )
        else:
            raise HTTPException(status_code=400, detail="Database connection creation failed")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database connection creation failed: {str(e)}")


@router.get(
    "/api/database_connections",
    tags=["Database Management"],
    deprecated=True,
    summary="列出所有数据库连接（已废弃）",
    description="⚠️ 此端点已废弃，请使用 GET /api/datasources?type=database",
)
async def list_database_connections(request: Request, response: Response):
    """
    列出所有数据库连接（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: GET /api/datasources?type=database
    """
    import time

    # 添加废弃响应头
    response.headers["X-Deprecated"] = "true"
    response.headers["X-New-Endpoint"] = "/api/datasources?type=database"
    response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        "使用了废弃的端点: /api/database_connections, "
        "请迁移到 /api/datasources?type=database"
    )

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
        logger.info(
            f"重新加载前配置状态: {getattr(db_manager, '_config_loaded', 'Unknown')}"
        )

        db_manager._load_connections_from_config()

        logger.info(f"重新加载后连接数量: {len(db_manager.connections)}")
        logger.info(
            f"重新加载后配置状态: {getattr(db_manager, '_config_loaded', 'Unknown')}"
        )

        connections = db_manager.list_connections()
        logger.info(f"list_connections() 返回: {len(connections)} 个连接")

        # 调试每个连接的状态
        for conn in connections:
            logger.info(f"连接 {conn.id}: 状态={conn.status}, 类型={type(conn.status)}")

        # 将DatabaseConnection对象转换为可序列化的字典
        serializable_connections = []
        for conn in connections:
            # 解密密码用于前端显示
            params = conn.params.copy()
            if "password" in params and params["password"]:
                if password_encryptor and password_encryptor.is_encrypted(
                    params["password"]
                ):
                    params["password"] = password_encryptor.decrypt_password(
                        params["password"]
                    )

            conn_dict = {
                "id": conn.id,
                "name": conn.name,
                "type": (
                    conn.type.value if hasattr(conn.type, "value") else str(conn.type)
                ),
                "params": params,
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

        result = create_list_response(
            items=serializable_connections,
            total=len(serializable_connections),
            message_code=MessageCode.DATASOURCES_RETRIEVED,
        )

        # 不缓存结果，确保每次都是最新状态
        # list_database_connections._cached_result = result

        return result
    except Exception as e:
        logger.error(f"获取数据库连接列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get database connections: {str(e)}")


@router.post("/api/upload", tags=["Data Sources"])
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    table_alias: str = Form(None),
) -> Any:
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
        from core.data.file_utils import get_file_preview

        if file_type == "excel":
            pending_excel = register_excel_upload(save_path, file.filename, table_alias)

            try:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
            except Exception as e:
                logger.warning(f"删除临时文件失败: {str(e)}")

            pending_dir = Path(pending_excel.stored_path).parent
            schedule_cleanup(str(pending_dir), background_tasks, delay_seconds=6 * 3600)

            logger.info(
                "Excel 文件上传成功，等待工作表选择: %s (%s)",
                pending_excel.original_filename,
                pending_excel.file_id,
            )

            return create_success_response(
                data={
                    "file_type": "excel",
                    "requires_sheet_selection": True,
                    "pending_excel": {
                        "file_id": pending_excel.file_id,
                        "original_filename": pending_excel.original_filename,
                        "file_size": pending_excel.file_size,
                        "table_alias": pending_excel.table_alias,
                        "uploaded_at": pending_excel.uploaded_at,
                        "default_table_prefix": pending_excel.default_table_prefix,
                    },
                },
                message_code=MessageCode.FILE_UPLOADED,
                message="Excel 文件已上传，请选择需要导入的工作表。",
            )

        preview_info = get_file_preview(save_path, rows=10)

        source_id = table_alias if table_alias else file.filename.split(".")[0]
        # 如果用户明确提供了 table_alias，尊重用户输入（允许数字开头）
        # 只有使用文件名作为默认值时才需要更严格的处理
        source_id = sanitize_identifier(
            source_id, allow_leading_digit=bool(table_alias), prefix="table"
        )

        if not source_id:
            source_id = f"table_{int(time.time())}"

        original_source_id = source_id

        with with_duckdb_connection() as duckdb_con:
            while True:
                try:
                    result = duckdb_con.execute(
                        "SELECT table_name FROM information_schema.tables WHERE table_name = ?",
                        [source_id],
                    ).fetchone()
                    if result is None:
                        break
                    timestamp = time.strftime("%Y%m%d%H%M", time.localtime())
                    source_id = f"{original_source_id}_{timestamp}"
                    break
                except Exception as e:
                    logger.warning(f"检查表名时出错: {e}")
                    break

            try:
                table_metadata = create_table_from_dataframe(
                    duckdb_con, source_id, save_path, file_type
                )
            except Exception as e:
                raise HTTPException(
                    status_code=500, detail=f"持久化到DuckDB失败: {str(e)}"
                )

        row_count = table_metadata.get("row_count", 0)
        column_count = table_metadata.get("column_count", 0)
        columns = table_metadata.get("columns", [])
        column_profiles = table_metadata.get("column_profiles", [])

        file_info = {
            "source_id": source_id,
            "filename": file.filename,
            "file_path": save_path,
            "file_type": file_type,
            "row_count": row_count,
            "column_count": column_count,
            "columns": columns,
            "column_profiles": column_profiles,
            "schema_version": 2,
            "created_at": get_current_time_iso(),
        }

        config_saved = file_datasource_manager.save_file_datasource(file_info)
        if not config_saved:
            logger.warning(f"文件数据源配置保存失败: {source_id}")

        logger.info(
            f"已将文件 {file.filename} 持久化到DuckDB，表名: {source_id}, 行数: {row_count}"
        )

        try:
            if os.path.exists(save_path):
                os.remove(save_path)
        except Exception as e:
            logger.warning(f"删除原始上传文件失败: {str(e)}")

        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
        except Exception as e:
            logger.warning(f"删除临时文件失败: {str(e)}")

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


def _table_exists(con, table_name: str) -> bool:
    try:
        result = con.execute(
            "SELECT 1 FROM information_schema.tables WHERE lower(table_name) = lower(?)",
            [table_name],
        ).fetchone()
        return result is not None
    except Exception as exc:
        logger.warning("检查表是否存在失败 %s: %s", table_name, exc)
        return False


def _fetch_existing_columns(con, table_name: str) -> List[str]:
    rows = con.execute(f"PRAGMA table_info({_quote_identifier(table_name)})").fetchall()
    return [row[1] for row in rows]


@router.post("/api/data-sources/excel/inspect", tags=["Data Sources"])
async def inspect_excel(request: ExcelInspectRequest):
    pending = get_pending_excel(request.file_id)
    if not pending:
        raise HTTPException(
            status_code=404, detail="未找到对应的Excel缓存文件，请重新上传。"
        )

    try:
        sheets = inspect_excel_sheets(pending.stored_path)
    except Exception as exc:
        logger.error("读取Excel工作表失败 %s: %s", pending.stored_path, exc)
        raise HTTPException(
            status_code=500,
            detail=f"读取Excel工作表失败: {str(exc)}",
        )

    for sheet in sheets:
        sheet["default_table_name"] = derive_default_table_name(
            pending.default_table_prefix, sheet["name"]
        )

    return create_success_response(
        data={
            "file_id": pending.file_id,
            "original_filename": pending.original_filename,
            "default_table_prefix": pending.default_table_prefix,
            "sheets": sheets,
        },
        message_code=MessageCode.EXCEL_SHEETS_INSPECTED,
    )


@router.post("/api/data-sources/excel/import", tags=["Data Sources"])
async def import_excel(request: ExcelImportRequest):
    pending = get_pending_excel(request.file_id)
    if not pending:
        raise HTTPException(
            status_code=404, detail="未找到对应的Excel缓存文件，请重新上传。"
        )

    processed_results = []
    metadata_to_persist = []
    sanitized_name_map = {}

    for sheet_cfg in request.sheets:
        # 用户明确提供了目标表名，尊重用户输入（允许数字开头）
        sanitized = sanitize_identifier(
            sheet_cfg.target_table, allow_leading_digit=True, prefix="table"
        )
        if sanitized in sanitized_name_map:
            raise HTTPException(
                status_code=400,
                detail=f"存在重复的目标表名: {sanitized}",
            )
        sanitized_name_map[sheet_cfg.name] = sanitized

    with with_duckdb_connection() as con:
        try:
            con.execute("BEGIN TRANSACTION")
            for sheet_cfg in request.sheets:
                target_table = sanitized_name_map[sheet_cfg.name]
                df = load_excel_sheet_dataframe(
                    pending.stored_path,
                    sheet_cfg.name,
                    header_rows=sheet_cfg.header_rows,
                    header_row_index=sheet_cfg.header_row_index,
                    fill_merged=sheet_cfg.fill_merged,
                )

                if df.empty:
                    raise ValueError(f"工作表 {sheet_cfg.name} 不包含可导入的数据。")

                table_exists = _table_exists(con, target_table)
                mode = sheet_cfg.mode

                if mode == "fail" and table_exists:
                    raise ValueError(f"目标表 {target_table} 已存在，导入模式为 fail。")

                view_name = f"excel_view_{uuid4().hex[:8]}"
                con.register(view_name, df)

                columns_clause = ", ".join(
                    f"{_quote_identifier(col)}" for col in df.columns
                )
                try:
                    if mode == "append" and table_exists:
                        existing_cols = _fetch_existing_columns(con, target_table)
                        if [col.lower() for col in existing_cols] != [
                            col.lower() for col in df.columns
                        ]:
                            raise ValueError(
                                f"目标表 {target_table} 的列结构与工作表 {sheet_cfg.name} 不匹配，无法追加。"
                            )
                        insert_sql = (
                            f"INSERT INTO {_quote_identifier(target_table)} ({columns_clause}) "
                            f"SELECT {columns_clause} FROM {view_name}"
                        )
                        con.execute(insert_sql)
                    else:
                        statement = (
                            f"CREATE OR REPLACE TABLE {_quote_identifier(target_table)} "
                            f"AS SELECT * FROM {view_name}"
                        )
                        if mode == "append" and not table_exists:
                            statement = (
                                f"CREATE TABLE {_quote_identifier(target_table)} "
                                f"AS SELECT * FROM {view_name}"
                            )
                        con.execute(statement)
                finally:
                    con.unregister(view_name)

                metadata = build_table_metadata_snapshot(con, target_table)
                metadata_to_persist.append((target_table, metadata, sheet_cfg))

                processed_results.append(
                    {
                        "sheet_name": sheet_cfg.name,
                        "target_table": target_table,
                        "mode": mode,
                        "row_count": metadata.get("row_count", 0),
                        "column_count": metadata.get("column_count", 0),
                        "columns": metadata.get("columns", []),
                        "column_profiles": metadata.get("column_profiles", []),
                        "header_rows": sheet_cfg.header_rows,
                        "header_row_index": sheet_cfg.header_row_index,
                    }
                )

            con.execute("COMMIT")
        except Exception as exc:
            logger.error("Excel 导入失败: %s", exc, exc_info=True)
            try:
                con.execute("ROLLBACK")
            except Exception:
                pass
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "EXCEL_IMPORT_FAILED",
                    "message": str(exc),
                },
            )

    for target_table, metadata, sheet_cfg in metadata_to_persist:
        file_info = {
            "source_id": target_table,
            "filename": pending.original_filename,
            "sheet_name": sheet_cfg.name,
            "source_file": pending.stored_path,
            "file_type": "excel_sheet",
            "ingest_mode": sheet_cfg.mode,
            "header_rows": sheet_cfg.header_rows,
            "header_row_index": sheet_cfg.header_row_index,
            "fill_merged": sheet_cfg.fill_merged,
            "row_count": metadata.get("row_count", 0),
            "column_count": metadata.get("column_count", 0),
            "columns": metadata.get("columns", []),
            "column_profiles": metadata.get("column_profiles", []),
            "schema_version": 2,
            "created_at": get_current_time_iso(),
        }
        try:
            file_datasource_manager.save_file_datasource(file_info)
        except Exception as exc:
            logger.warning("保存Excel导入元数据失败 %s: %s", target_table, exc)

    cleanup_pending_excel(request.file_id)

    return create_success_response(
        data={
            "file_id": pending.file_id,
            "results": processed_results,
        },
        message_code=MessageCode.EXCEL_SHEETS_IMPORTED,
    )


@router.get(
    "/api/database_connections/{connection_id}",
    tags=["Database Management"],
    deprecated=True,
    summary="获取指定数据库连接（已废弃）",
    description="⚠️ 此端点已废弃，请使用 GET /api/datasources/db_{connection_id}",
)
async def get_database_connection(connection_id: str, response: Response):
    """
    获取指定数据库连接（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: GET /api/datasources/db_{connection_id}
    """
    # 添加废弃响应头
    response.headers["X-Deprecated"] = "true"
    response.headers["X-New-Endpoint"] = f"/api/datasources/db_{connection_id}"
    response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        f"使用了废弃的端点: /api/database_connections/{connection_id}, "
        f"请迁移到 /api/datasources/db_{connection_id}"
    )

    try:
        connection = db_manager.get_connection(connection_id)
        if connection:
            return create_success_response(
                data={"connection": connection},
                message_code=MessageCode.DATASOURCE_RETRIEVED,
            )
        else:
            return JSONResponse(
                status_code=404,
                content=create_error_response(
                    code=MessageCode.DATASOURCE_NOT_FOUND,
                    message="数据库连接不存在",
                    details={"connection_id": connection_id},
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取数据库连接失败: {str(e)}")


@router.put(
    "/api/database_connections/{connection_id}",
    tags=["Database Management"],
    deprecated=True,
    summary="更新数据库连接（已废弃）",
    description="⚠️ 此端点已废弃，请使用 PUT /api/datasources/databases/{connection_id}",
)
async def update_database_connection(
    connection_id: str, connection: DatabaseConnection, response: Response
):
    """
    更新数据库连接（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: PUT /api/datasources/databases/{connection_id}
    """
    # 添加废弃响应头
    response.headers["X-Deprecated"] = "true"
    response.headers["X-New-Endpoint"] = f"/api/datasources/databases/{connection_id}"
    response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        f"使用了废弃的端点: /api/database_connections/{connection_id}, "
        f"请迁移到 /api/datasources/databases/{connection_id}"
    )

    try:
        # 设置更新时间
        connection.updated_at = get_current_time()

        # 先删除旧连接
        db_manager.remove_connection(connection_id)

        # 添加新连接
        success = db_manager.add_connection(connection)
        if success:
            return create_success_response(
                data={"connection": connection},
                message_code=MessageCode.CONNECTION_UPDATED,
            )
        else:
            raise HTTPException(status_code=400, detail="Database connection update failed")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database connection update failed: {str(e)}")


@router.delete(
    "/api/database_connections/{connection_id}",
    tags=["Database Management"],
    deprecated=True,
    summary="删除数据库连接（已废弃）",
    description="⚠️ 此端点已废弃，请使用 DELETE /api/datasources/db_{connection_id}",
)
async def delete_database_connection(connection_id: str, response: Response):
    """
    删除数据库连接（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 新端点: DELETE /api/datasources/db_{connection_id}
    """
    # 添加废弃响应头
    response.headers["X-Deprecated"] = "true"
    response.headers["X-New-Endpoint"] = f"/api/datasources/db_{connection_id}"
    response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        f"使用了废弃的端点: DELETE /api/database_connections/{connection_id}, "
        f"请迁移到 DELETE /api/datasources/db_{connection_id}"
    )

    try:
        # 从内存中删除连接
        success = db_manager.remove_connection(connection_id)
        if success:
            # 直接更新配置文件，移除指定的连接
            try:
                # 读取当前配置文件
                with open(DATASOURCES_CONFIG_FILE, "r", encoding="utf-8") as f:
                    config_data = json.load(f)

                # 移除指定的连接
                if "database_sources" in config_data:
                    config_data["database_sources"] = [
                        conn
                        for conn in config_data["database_sources"]
                        if conn.get("id") != connection_id
                    ]

                # 保存更新后的配置
                with open(DATASOURCES_CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(config_data, f, indent=2, ensure_ascii=False)

                logger.info(f"数据库连接 {connection_id} 删除成功，配置文件已更新")

                # 强制重新加载配置，确保内存状态与文件同步
                db_manager._config_loaded = False
                db_manager._load_connections_from_config()

            except Exception as e:
                logger.error(f"更新配置文件失败: {str(e)}")
                raise HTTPException(
                    status_code=500, detail=f"更新配置文件失败: {str(e)}"
                )

            return create_success_response(
                data={"deleted_connection": connection_id},
                message_code=MessageCode.CONNECTION_DELETED,
                message="数据库连接删除成功",
            )
        else:
            return JSONResponse(
                status_code=404,
                content=create_error_response(
                    code=MessageCode.DATASOURCE_NOT_FOUND,
                    message="数据库连接不存在",
                    details={"connection_id": connection_id},
                ),
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除数据库连接失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"删除数据库连接失败: {str(e)}")


# 新增数据库连接接口
@router.post(
    "/api/database/connect",
    tags=["Database Management"],
    deprecated=True,
    summary="连接数据库并返回表信息（已废弃）",
    description="⚠️ 此端点已废弃，请使用 POST /api/datasources/databases + GET /databases/{id}/schemas",
)
async def connect_database(connection: DatabaseConnection, response: Response = None):
    """
    连接数据库并返回表信息（已废弃）
    ⚠️ 此端点将在 2025-06-01 移除，请迁移到新端点：
    - 创建连接: POST /api/datasources/databases
    - 获取表列表: GET /databases/{id}/schemas (PostgreSQL) 或 GET /api/database_tables/{id} (MySQL)
    """
    # 添加废弃响应头
    if response:
        response.headers["X-Deprecated"] = "true"
        response.headers["X-New-Endpoint"] = "/api/datasources/databases"
        response.headers["X-Sunset-Date"] = "2025-06-01"

    # 记录废弃警告日志
    logger.warning(
        "使用了废弃的端点: /api/database/connect, 请迁移到 /api/datasources/databases"
    )
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
            return create_success_response(
                data={
                    "connection": connection,
                    "tables": tables,
                },
                message_code=MessageCode.CONNECTION_CREATED,
                message="Database connection successful",
            )
        else:
            raise HTTPException(status_code=400, detail="Database connection creation failed")
    except HTTPException:
        raise
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
        from core.common.config_manager import config_manager

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

        # 获取配置的超时时间
        from core.common.config_manager import config_manager

        app_config = config_manager.get_app_config()

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
            # 获取schema参数，默认为public
            schema = connection.params.get("schema", "public")

            # 获取表列表
            cursor.execute(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s
            """,
                (schema,),
            )
            tables = cursor.fetchall()

            table_info = []
            for table in tables:
                table_name = table[0]

                # 获取表行数
                cursor.execute(f'SELECT COUNT(*) FROM "{schema}"."{table_name}"')
                row_count = cursor.fetchone()[0]

                # 获取表结构
                cursor.execute(
                    """
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_name = %s AND table_schema = %s
                    ORDER BY ordinal_position
                """,
                    (table_name, schema),
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
