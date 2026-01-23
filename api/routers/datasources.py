# pylint: disable=duplicate-code,missing-response-helper-import
"""
统一数据源管理 API

提供统一的数据源列表、查询、删除等功能
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from models.datasource_models import (
    DataSourceErrorCode,
    DataSourceFilter,
    DataSourceStatus,
    DataSourceType,
)
from services.datasource_aggregator import datasource_aggregator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/datasources", tags=["Unified Data Sources"])


# ==================== 数据库连接管理端点（必须在通用路由之前） ====================


@router.post("/databases/test", tags=["Unified Data Sources"])
async def test_database_connection(request: dict):
    """
    测试数据库连接（未保存的配置）

    请求体示例:
    {
        "type": "mysql",
        "params": {
            "host": "localhost",
            "port": 3306,
            "username": "root",
            "password": "password",
            "database": "mydb"
        }
    }
    """
    try:
        from core.database.database_manager import db_manager
        from models.query_models import ConnectionTestRequest, DataSourceType
        from utils.response_helpers import (
            MessageCode,
            create_error_response,
            create_success_response,
        )

        # 构建测试请求
        test_request_params = request.get("params", {})

        # [Fix] 支持 update 时的测试：如果提供了 ID 且 params 中无密码，尝试从旧连接获取密码
        conn_id = request.get("id")
        if conn_id and not test_request_params.get("password"):
            stripped_id = conn_id.replace("db_", "")
            existing_conn = db_manager.get_connection(stripped_id)
            if existing_conn and existing_conn.params:
                # 只有当 params 中确实没有密码时才合并，且确保其他参数（如host/user）使用前端传来的新值
                old_password = existing_conn.params.get("password")
                if old_password:
                    test_request_params["password"] = old_password
                    logger.info(f"Test connection {stripped_id}: using existing password for test")

        test_request = ConnectionTestRequest(
            type=DataSourceType(request.get("type")),
            params=test_request_params,
        )

        # 执行测试
        result = db_manager.test_connection(test_request)
        result_details = getattr(result, "details", None)

        logger.info(f"Test database connection: {request.get('type')} - {result.success}")

        if result.success:
            return create_success_response(
                data={
                    "connection_test": {
                        "success": True,
                        "message": result.message,
                        "details": result_details,
                    }
                },
                message_code=MessageCode.CONNECTION_TEST_SUCCESS,
                message="Connection test successful",
            )
        else:
            # 测试失败：返回标准错误响应，外层 success=false，并携带测试详情
            error_response = create_error_response(
                code=MessageCode.CONNECTION_TEST_FAILED,
                message=result.message or "Connection test failed",
                details={
                    "connection_test": {
                        "success": False,
                        "message": result.message,
                        "details": result_details,
                    }
                },
            )
            return JSONResponse(status_code=400, content=error_response)

    except Exception as e:
        logger.error(f"Test database connection failed: {e}")

        # 使用统一的错误响应格式
        from utils.response_helpers import create_error_response

        error_response = create_error_response(
            code="CONNECTION_TEST_FAILED",
            message=f"Connection test failed: {str(e)}",
            details={"error": str(e)},
        )

        return JSONResponse(status_code=500, content=error_response)


@router.post("/databases/{id}/refresh", tags=["Unified Data Sources"])
async def refresh_database_connection(id: str):
    """
    刷新数据库连接（重新测试并更新状态）

    ID 格式: 可以是 "db_{id}" 或直接 "{id}"
    """
    try:
        from core.common.timezone_utils import get_current_time
        from core.database.database_manager import db_manager
        from models.query_models import ConnectionStatus, ConnectionTestRequest

        # 移除 db_ 前缀（如果有）
        conn_id = id.replace("db_", "")

        # 获取连接
        connection = db_manager.get_connection(conn_id)
        if not connection:
            raise HTTPException(status_code=404, detail=f"Database connection not found: {conn_id}")

        logger.info(f"Starting to refresh database connection: {conn_id}")

        # 构建测试请求
        test_request = ConnectionTestRequest(
            type=connection.type, params=connection.params
        )

        # 执行测试
        test_result = db_manager.test_connection(test_request)

        # 更新连接状态
        now = get_current_time()
        connection.last_tested = now
        connection.updated_at = now

        success = False
        message = test_result.message or ""

        if test_result.success:
            try:
                # 重新初始化引擎
                if conn_id in db_manager.engines:
                    try:
                        db_manager.engines[conn_id].dispose()
                    except Exception as dispose_error:
                        logger.warning(f"Warning when disposing old engine: {dispose_error}")

                engine = db_manager._create_engine(connection.type, connection.params)
                db_manager.engines[conn_id] = engine
                connection.status = ConnectionStatus.ACTIVE
                success = True
                message = test_result.message or "Connection test successful"
                logger.info(f"Database connection {conn_id} refreshed successfully")
            except Exception as engine_error:
                logger.error(f"Connection test succeeded but engine initialization failed: {engine_error}")
                connection.status = ConnectionStatus.ERROR
                message = f"Connection succeeded but initialization failed: {engine_error}"
        else:
            connection.status = ConnectionStatus.ERROR
            message = test_result.message or "Connection test failed"
            if conn_id in db_manager.engines:
                try:
                    db_manager.engines[conn_id].dispose()
                except Exception as dispose_error:
                    logger.warning(f"Warning when disposing engine: {dispose_error}")
                db_manager.engines.pop(conn_id, None)
            logger.warning(f"Database connection {conn_id} refresh failed: {message}")

        # 保存更新
        db_manager.connections[conn_id] = connection

        from utils.response_helpers import (
            MessageCode,
            create_error_response,
            create_success_response,
        )

        if not success:
            return JSONResponse(
                status_code=400,
                content=create_error_response(
                    code=MessageCode.CONNECTION_TEST_FAILED,
                    message=message or "Connection test failed",
                    details={
                        "connection": {
                            "id": connection.id,
                            "name": connection.name,
                            "type": connection.type.value,
                            "status": connection.status.value,
                        },
                        "test_result": {
                            "success": test_result.success,
                            "message": test_result.message,
                        },
                        "refresh_success": success,
                    },
                ),
            )

        return JSONResponse(
            content=create_success_response(
                data={
                    "connection": {
                        "id": connection.id,
                        "name": connection.name,
                        "type": connection.type.value,
                        "status": connection.status.value,
                    },
                    "test_result": {
                        "success": test_result.success,
                        "message": test_result.message,
                    },
                    "refresh_success": success,
                },
                message_code=MessageCode.CONNECTION_REFRESHED,
                message=message,
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Refresh database connection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Refresh database connection failed: {str(e)}")


async def _handle_save_connection(db_conn, test_connection: bool = True):
    """处理连接保存的公共逻辑（含测试和响应构造）"""
    from core.database.database_manager import db_manager
    from fastapi.responses import JSONResponse
    from utils.response_helpers import (
        MessageCode,
        create_error_response,
        create_success_response,
    )

    # 执行核心逻辑：添加/更新 + 测试 + 清理 old engine + 持久化
    success, test_result = db_manager.add_connection(
        db_conn, test_connection=test_connection
    )

    if success:
        # 成功保存（可能是测试通过，也可能是跳过测试，或者测试失败但配置已保存）
        logger.info(f"Successfully saved database connection: {db_conn.id} (Test: {test_connection})")

        response_data = {
            "connection": {
                "id": db_conn.id,
                "name": db_conn.name,
                "type": db_conn.type.value,
                "status": db_conn.status.value,
            }
        }

        # 如果进行了测试，包含测试结果
        if test_result:
            response_data["test_result"] = {
                "success": test_result.success,
                "message": test_result.message,
                "latency_ms": test_result.latency_ms,
                "error_details": getattr(test_result, "error_details", None),
            }

        # 特殊处理：保存成功但测试失败 -> 返回错误响应（带连接数据）
        # 只有在明确要求测试且测试失败时才报错误
        if test_connection and test_result and not test_result.success:
            error_details = {
                "connection": response_data["connection"],
                "test_result": response_data["test_result"],
            }

            return JSONResponse(
                content=create_error_response(
                    code=MessageCode.CONNECTION_TEST_FAILED,
                    message=f"Configuration saved, but connection test failed: {test_result.message}",
                    details=error_details,
                )
            )

        # 正常成功（测试通过 或 跳过测试）
        message_code = (
            MessageCode.CONNECTION_CREATED
            if test_connection
            else MessageCode.CONNECTION_UPDATED
        )
        return JSONResponse(
            content=create_success_response(
                data=response_data,
                message_code=message_code,
                message=test_result.message
                if (test_result and test_result.message)
                else "Connection configuration saved",
            )
        )
    else:
        # 保存失败（通常是系统/IO错误）
        error_response = create_error_response(
            code="OPERATION_FAILED", message="Failed to save database connection"
        )
        raise HTTPException(status_code=500, detail=error_response)


@router.post("/databases", tags=["Unified Data Sources"])
async def create_database_connection(
    connection: dict, test_connection: bool = Query(True, description="是否测试连接")
):
    """
    创建/更新数据库连接

    - test_connection=true: 保存并测试（默认）。失败会返回 test_result.success=false 的错误。
    - test_connection=false: 仅保存配置。
    """
    try:
        from core.common.timezone_utils import get_current_time
        from models.query_models import DatabaseConnection, DataSourceType

        # 构建 DatabaseConnection 对象
        db_conn = DatabaseConnection(
            id=connection.get("id"),
            name=connection.get("name"),
            type=DataSourceType(connection.get("type")),
            params=connection.get("params", {}),
            created_at=get_current_time(),
            updated_at=get_current_time(),
        )

        return await _handle_save_connection(db_conn, test_connection)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create database connection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Create database connection failed: {str(e)}")


@router.put("/databases/{id}", tags=["Unified Data Sources"])
async def update_database_connection(
    id: str,
    connection: dict,
    test_connection: bool = Query(True, description="是否测试连接"),
):
    """
    更新数据库连接

    复用创建逻辑，支持完整的测试和资源清理。
    """
    try:
        from core.common.timezone_utils import get_current_time
        from core.database.database_manager import db_manager
        from models.query_models import DataSourceType

        # 移除 db_ 前缀
        conn_id = id.replace("db_", "")

        # 检查是否存在
        existing = db_manager.get_connection(conn_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"Database connection not found: {conn_id}")

        # 构建更新后的连接对象（不修改现有对象，以便 add_connection 可以对比旧数据）
        from models.query_models import DatabaseConnection

        updated_conn = DatabaseConnection(
            id=existing.id,
            name=connection.get("name", existing.name),
            type=DataSourceType(connection.get("type", existing.type) or existing.type),
            params=connection.get("params", existing.params),
            created_at=existing.created_at,
            updated_at=get_current_time(),
            last_tested=existing.last_tested,
            status=existing.status,
        )

        return await _handle_save_connection(updated_conn, test_connection)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update database connection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Update database connection failed: {str(e)}")


@router.get("/databases/list")
async def list_database_datasources(
    subtype: Optional[str] = Query(None, description="按数据库类型过滤"),
    status: Optional[DataSourceStatus] = Query(None, description="按状态过滤"),
):
    """
    列出所有数据库类型的数据源

    快捷方式，等同于 GET /datasources?type=database
    """
    try:
        from utils.response_helpers import MessageCode, create_list_response

        filters = DataSourceFilter(
            type=DataSourceType.DATABASE, subtype=subtype, status=status
        )

        datasources = await datasource_aggregator.list_all_datasources(filters)

        logger.info(f"List database datasources: total {len(datasources)}")

        # 转换为字典列表
        items = [ds.dict() for ds in datasources]

        return create_list_response(
            items=items,
            total=len(items),
            message_code=MessageCode.DATASOURCES_RETRIEVED,
        )

    except Exception as e:
        logger.error(f"List database datasources failed: {e}")
        from utils.response_helpers import create_error_response

        error_response = create_error_response(
            code="OPERATION_FAILED", message=f"Failed to get database datasource list: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=error_response)


@router.get("/files/list")
async def list_file_datasources(
    subtype: Optional[str] = Query(None, description="按文件类型过滤"),
    status: Optional[DataSourceStatus] = Query(None, description="按状态过滤"),
):
    """
    列出所有文件类型的数据源（DuckDB 表）

    快捷方式，等同于 GET /datasources?type=file
    """
    try:
        from utils.response_helpers import MessageCode, create_list_response

        filters = DataSourceFilter(
            type=DataSourceType.FILE, subtype=subtype, status=status
        )

        datasources = await datasource_aggregator.list_all_datasources(filters)

        logger.info(f"List file datasources: total {len(datasources)}")

        # 转换为字典列表
        items = [ds.dict() for ds in datasources]

        return create_list_response(
            items=items,
            total=len(items),
            message_code=MessageCode.DATASOURCES_RETRIEVED,
        )

    except Exception as e:
        logger.error(f"List file datasources failed: {e}")
        from utils.response_helpers import create_error_response

        error_response = create_error_response(
            code="OPERATION_FAILED", message=f"Failed to get file datasource list: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=error_response)


# ==================== 通用数据源端点 ====================


@router.get("")
async def list_datasources(
    type: Optional[DataSourceType] = Query(None, description="按类型过滤"),
    subtype: Optional[str] = Query(None, description="按子类型过滤"),
    status: Optional[DataSourceStatus] = Query(None, description="按状态过滤"),
    search: Optional[str] = Query(None, description="搜索关键词"),
):
    """
    列出所有数据源

    支持过滤：
    - type: database, file, url
    - subtype: mysql, postgresql, sqlite, csv, excel, json, parquet
    - status: active, inactive, error
    - search: 搜索数据源名称或元数据
    """
    try:
        from utils.response_helpers import MessageCode, create_list_response

        filters = DataSourceFilter(
            type=type, subtype=subtype, status=status, search=search
        )

        datasources = await datasource_aggregator.list_all_datasources(filters)

        logger.info(
            f"List datasources: total {len(datasources)} (type={type}, subtype={subtype}, status={status}, search={search})"
        )

        # 转换为字典列表
        items = [ds.dict() for ds in datasources]

        return create_list_response(
            items=items,
            total=len(items),
            message_code=MessageCode.DATASOURCES_RETRIEVED,
        )

    except Exception as e:
        logger.error(f"List datasources failed: {e}")
        from utils.response_helpers import create_error_response

        error_response = create_error_response(
            code="OPERATION_FAILED", message=f"Failed to get datasource list: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=error_response)


@router.get("/{id}")
async def get_datasource(id: str):
    """
    获取单个数据源详情

    ID 格式：
    - 数据库连接: db_{connection_id}
    - DuckDB 表: table_{table_name}
    """
    try:
        from utils.response_helpers import (
            MessageCode,
            create_error_response,
            create_success_response,
        )

        datasource = await datasource_aggregator.get_datasource(id)

        if not datasource:
            error_response = create_error_response(
                code="DATASOURCE_NOT_FOUND", message=f"Datasource not found: {id}"
            )
            raise HTTPException(status_code=404, detail=error_response)

        logger.info(f"Get datasource: {id}")

        return create_success_response(
            data=datasource.dict(), message_code=MessageCode.DATASOURCE_RETRIEVED
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get datasource {id} failed: {e}")
        error_response = create_error_response(
            code="OPERATION_FAILED", message=f"Failed to get datasource: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=error_response)


@router.delete("/{id}")
async def delete_datasource(id: str):
    """
    删除数据源

    - 数据库连接: 删除连接配置
    - DuckDB 表: 删除表
    """
    try:
        # 先检查数据源是否存在
        datasource = await datasource_aggregator.get_datasource(id)
        if not datasource:
            raise HTTPException(
                status_code=404,
                detail={
                    "error_code": DataSourceErrorCode.NOT_FOUND,
                    "message": f"Datasource not found: {id}",
                },
            )

        # 删除数据源
        success = await datasource_aggregator.delete_datasource(id)

        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "error_code": DataSourceErrorCode.BATCH_OPERATION_FAILED,
                    "message": f"Failed to delete datasource: {id}",
                },
            )

        logger.info(f"Delete datasource: {id}")

        from utils.response_helpers import MessageCode, create_success_response

        return JSONResponse(
            content=create_success_response(
                data={"id": id, "name": datasource.name},
                message_code=MessageCode.DATASOURCE_DELETED,
                message=f"Datasource deleted: {datasource.name}",
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete datasource {id} failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete datasource: {str(e)}")
