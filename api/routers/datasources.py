# pylint: disable=duplicate-code,missing-response-helper-import
"""
统一数据源管理 API

提供统一的数据源列表、查询、删除等功能
"""
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from models.datasource_models import (
    DataSourceResponse,
    DataSourceType,
    DataSourceStatus,
    DataSourceFilter,
    DataSourceErrorCode,
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
        from models.query_models import ConnectionTestRequest, DataSourceType
        from core.database.database_manager import db_manager
        from utils.response_helpers import create_success_response, MessageCode

        # 构建测试请求
        test_request = ConnectionTestRequest(
            type=DataSourceType(request.get("type")),
            params=request.get("params", {}),
        )

        # 执行测试
        result = db_manager.test_connection(test_request)

        logger.info(f"测试数据库连接: {request.get('type')} - {result.success}")

        return create_success_response(
            data={
                "connection_test": {
                    "success": result.success,
                    "message": result.message,
                    "details": result.details if hasattr(result, "details") else None,
                }
            },
            message_code=MessageCode.CONNECTION_TEST_SUCCESS
        )

    except Exception as e:
        logger.error(f"测试数据库连接失败: {e}")

        # 使用统一的错误响应格式
        from utils.response_helpers import create_error_response
        
        error_response = create_error_response(
            code="CONNECTION_TEST_FAILED",
            message=f"连接测试失败: {str(e)}",
            details={"error": str(e)}
        )
        
        return JSONResponse(status_code=500, content=error_response)


@router.post("/databases/{id}/refresh", tags=["Unified Data Sources"])
async def refresh_database_connection(id: str):
    """
    刷新数据库连接（重新测试并更新状态）
    
    ID 格式: 可以是 "db_{id}" 或直接 "{id}"
    """
    try:
        from models.query_models import ConnectionTestRequest, ConnectionStatus
        from core.database.database_manager import db_manager
        from core.common.timezone_utils import get_current_time

        # 移除 db_ 前缀（如果有）
        conn_id = id.replace("db_", "")

        # 获取连接
        connection = db_manager.get_connection(conn_id)
        if not connection:
            raise HTTPException(status_code=404, detail=f"数据库连接不存在: {conn_id}")

        logger.info(f"开始刷新数据库连接: {conn_id}")

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
                        logger.warning(f"释放旧引擎时出现警告: {dispose_error}")

                engine = db_manager._create_engine(connection.type, connection.params)
                db_manager.engines[conn_id] = engine
                connection.status = ConnectionStatus.ACTIVE
                success = True
                message = test_result.message or "连接测试成功"
                logger.info(f"数据库连接 {conn_id} 刷新成功")
            except Exception as engine_error:
                logger.error(f"连接测试成功但初始化引擎失败: {engine_error}")
                connection.status = ConnectionStatus.ERROR
                message = f"连接成功但初始化失败: {engine_error}"
        else:
            connection.status = ConnectionStatus.ERROR
            message = test_result.message or "连接测试失败"
            if conn_id in db_manager.engines:
                try:
                    db_manager.engines[conn_id].dispose()
                except Exception as dispose_error:
                    logger.warning(f"释放引擎时出现警告: {dispose_error}")
                db_manager.engines.pop(conn_id, None)
            logger.warning(f"数据库连接 {conn_id} 刷新失败: {message}")

        # 保存更新
        db_manager.connections[conn_id] = connection

        from utils.response_helpers import create_success_response, MessageCode

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
                    "refresh_success": success
                },
                message_code=MessageCode.CONNECTION_REFRESHED,
                message=message
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"刷新数据库连接失败: {e}")
        raise HTTPException(status_code=500, detail=f"刷新数据库连接失败: {str(e)}")


@router.post("/databases", tags=["Unified Data Sources"])
async def create_database_connection(connection: dict):
    """
    创建数据库连接
    
    请求体示例:
    {
        "id": "my_mysql_conn",
        "name": "我的MySQL数据库",
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
        from models.query_models import DatabaseConnection, DataSourceType
        from core.database.database_manager import db_manager
        from core.common.timezone_utils import get_current_time

        # 构建 DatabaseConnection 对象
        db_conn = DatabaseConnection(
            id=connection.get("id"),
            name=connection.get("name"),
            type=DataSourceType(connection.get("type")),
            params=connection.get("params", {}),
            created_at=get_current_time(),
            updated_at=get_current_time(),
        )

        # 添加连接
        success = db_manager.add_connection(db_conn)

        if success:
            # 保存到配置文件
            from utils.response_helpers import create_success_response, MessageCode

            logger.info(f"成功创建数据库连接: {db_conn.id}")

            return JSONResponse(
                content=create_success_response(
                    data={
                        "connection": {
                            "id": db_conn.id,
                            "name": db_conn.name,
                            "type": db_conn.type.value,
                            "status": db_conn.status.value,
                        }
                    },
                    message_code=MessageCode.CONNECTION_CREATED
                )
            )
        else:
            from utils.response_helpers import create_error_response
            error_response = create_error_response(
                code="OPERATION_FAILED",
                message="数据库连接创建失败"
            )
            raise HTTPException(status_code=400, detail=error_response)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建数据库连接失败: {e}")
        raise HTTPException(status_code=500, detail=f"创建数据库连接失败: {str(e)}")


@router.put("/databases/{id}", tags=["Unified Data Sources"])
async def update_database_connection(id: str, connection: dict):
    """
    更新数据库连接
    
    ID 格式: 可以是 "db_{id}" 或直接 "{id}"
    """
    try:
        from models.query_models import DatabaseConnection, DataSourceType
        from core.database.database_manager import db_manager
        from core.common.timezone_utils import get_current_time

        # 移除 db_ 前缀（如果有）
        conn_id = id.replace("db_", "")

        # 检查连接是否存在
        existing = db_manager.get_connection(conn_id)
        if not existing:
            raise HTTPException(status_code=404, detail=f"数据库连接不存在: {conn_id}")

        # 更新连接信息
        existing.name = connection.get("name", existing.name)
        existing.params = connection.get("params", existing.params)
        existing.updated_at = get_current_time()

        # 如果类型改变，需要重新创建
        new_type = connection.get("type")
        if new_type and new_type != existing.type.value:
            existing.type = DataSourceType(new_type)

        # 更新连接
        db_manager.connections[conn_id] = existing

        # 保存到配置文件
        from utils.response_helpers import create_success_response, MessageCode

        logger.info(f"成功更新数据库连接: {conn_id}")

        return JSONResponse(
            content=create_success_response(
                data={
                    "connection": {
                        "id": existing.id,
                        "name": existing.name,
                        "type": existing.type.value,
                        "status": existing.status.value,
                    }
                },
                message_code=MessageCode.CONNECTION_UPDATED
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新数据库连接失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新数据库连接失败: {str(e)}")


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
        from utils.response_helpers import create_list_response, MessageCode
        
        filters = DataSourceFilter(
            type=DataSourceType.DATABASE, subtype=subtype, status=status
        )

        datasources = await datasource_aggregator.list_all_datasources(filters)

        logger.info(f"列出数据库数据源: 共 {len(datasources)} 个")

        # 转换为字典列表
        items = [ds.dict() for ds in datasources]
        
        return create_list_response(
            items=items,
            total=len(items),
            message_code=MessageCode.DATASOURCES_RETRIEVED
        )

    except Exception as e:
        logger.error(f"列出数据库数据源失败: {e}")
        from utils.response_helpers import create_error_response
        error_response = create_error_response(
            code="OPERATION_FAILED",
            message=f"获取数据库数据源列表失败: {str(e)}"
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
        from utils.response_helpers import create_list_response, MessageCode
        
        filters = DataSourceFilter(
            type=DataSourceType.FILE, subtype=subtype, status=status
        )

        datasources = await datasource_aggregator.list_all_datasources(filters)

        logger.info(f"列出文件数据源: 共 {len(datasources)} 个")

        # 转换为字典列表
        items = [ds.dict() for ds in datasources]
        
        return create_list_response(
            items=items,
            total=len(items),
            message_code=MessageCode.DATASOURCES_RETRIEVED
        )

    except Exception as e:
        logger.error(f"列出文件数据源失败: {e}")
        from utils.response_helpers import create_error_response
        error_response = create_error_response(
            code="OPERATION_FAILED",
            message=f"获取文件数据源列表失败: {str(e)}"
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
        from utils.response_helpers import create_list_response, MessageCode
        
        filters = DataSourceFilter(
            type=type, subtype=subtype, status=status, search=search
        )

        datasources = await datasource_aggregator.list_all_datasources(filters)

        logger.info(
            f"列出数据源: 共 {len(datasources)} 个 (type={type}, subtype={subtype}, status={status}, search={search})"
        )

        # 转换为字典列表
        items = [ds.dict() for ds in datasources]
        
        return create_list_response(
            items=items,
            total=len(items),
            message_code=MessageCode.DATASOURCES_RETRIEVED
        )

    except Exception as e:
        logger.error(f"列出数据源失败: {e}")
        from utils.response_helpers import create_error_response
        error_response = create_error_response(
            code="OPERATION_FAILED",
            message=f"获取数据源列表失败: {str(e)}"
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
        from utils.response_helpers import create_success_response, create_error_response, MessageCode
        
        datasource = await datasource_aggregator.get_datasource(id)

        if not datasource:
            error_response = create_error_response(
                code="DATASOURCE_NOT_FOUND",
                message=f"数据源不存在: {id}"
            )
            raise HTTPException(status_code=404, detail=error_response)

        logger.info(f"获取数据源: {id}")
        
        return create_success_response(
            data=datasource.dict(),
            message_code=MessageCode.DATASOURCE_RETRIEVED
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取数据源 {id} 失败: {e}")
        error_response = create_error_response(
            code="OPERATION_FAILED",
            message=f"获取数据源失败: {str(e)}"
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
                    "message": f"数据源不存在: {id}",
                },
            )

        # 删除数据源
        success = await datasource_aggregator.delete_datasource(id)

        if not success:
            raise HTTPException(
                status_code=500,
                detail={
                    "error_code": DataSourceErrorCode.BATCH_OPERATION_FAILED,
                    "message": f"删除数据源失败: {id}",
                },
            )

        logger.info(f"删除数据源: {id}")

        from utils.response_helpers import create_success_response, MessageCode
        
        return JSONResponse(
            content=create_success_response(
                data={
                    "id": id,
                    "name": datasource.name
                },
                message_code=MessageCode.DATASOURCE_DELETED,
                message=f"数据源已删除: {datasource.name}"
            )
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除数据源 {id} 失败: {e}")
        raise HTTPException(status_code=500, detail=f"删除数据源失败: {str(e)}")
