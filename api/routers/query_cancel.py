"""
同步查询取消 API 路由
提供取消正在执行的同步查询的能力
"""

import logging
from fastapi import APIRouter

from core.database.connection_registry import connection_registry
from utils.response_helpers import (
    MessageCode,
    create_success_response,
    error_json_response,
)

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

    logger.info("Received cancel request for query: %s (full_id: %s)", request_id, full_query_id)

    # 尝试中断查询
    success = connection_registry.interrupt(full_query_id)

    if success:
        logger.info("Query %s cancelled successfully", request_id)
        return create_success_response(
            data={"request_id": request_id},
            message_code=MessageCode.QUERY_CANCELLED,
            message="Cancel request submitted"
        )

    logger.warning("Query %s not found or already completed", request_id)
    return error_json_response(
        404,
        MessageCode.QUERY_NOT_FOUND,
        "Query does not exist or has already completed",
        details={"request_id": request_id},
    )
