"""
同步查询取消 API 路由
提供取消正在执行的同步查询的能力
"""

import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from core.connection_registry import connection_registry
from utils.response_helpers import create_success_response, create_error_response, MessageCode

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Query Cancel"])


@router.post("/api/query/cancel/{request_id}")
async def cancel_sync_query(request_id: str):
    """
    取消正在执行的同步查询
    
    Args:
        request_id: 请求标识符（来自 X-Request-ID 头）
    
    Returns:
        成功: 200 + success response
        未找到: 404 + error response
    """
    # 使用 sync: 前缀区分同步查询和异步任务
    full_query_id = f"sync:{request_id}"
    
    logger.info(f"Received cancel request for query: {request_id} (full_id: {full_query_id})")
    
    # 尝试中断查询
    success = connection_registry.interrupt(full_query_id)
    
    if success:
        logger.info(f"Query {request_id} cancelled successfully")
        return create_success_response(
            data={"request_id": request_id},
            message_code=MessageCode.QUERY_CANCELLED,
            message="取消请求已提交"
        )
    else:
        logger.warning(f"Query {request_id} not found or already completed")
        # 返回 404 错误
        return JSONResponse(
            status_code=404,
            content=create_error_response(
                code="QUERY_NOT_FOUND",
                message="查询不存在或已完成",
                details={"request_id": request_id}
            )
        )
