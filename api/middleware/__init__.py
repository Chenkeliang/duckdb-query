"""
Request ID 中间件
用于为每个请求生成/提取唯一标识符，支持查询取消功能
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from contextvars import ContextVar
import uuid
import logging

logger = logging.getLogger(__name__)

# ContextVar 用于在请求处理过程中传递 request_id
current_request_id: ContextVar[str] = ContextVar('request_id', default='')


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Request ID 中间件
    
    功能：
    1. 从请求头 X-Request-ID 提取 request_id，如果不存在则生成新的 UUID
    2. 将 request_id 存入 ContextVar，供后续处理使用
    3. 在响应头中返回 X-Request-ID
    """
    
    async def dispatch(self, request: Request, call_next) -> Response:
        # 从请求头提取或生成 request_id
        request_id = request.headers.get('X-Request-ID') or str(uuid.uuid4())
        
        # 存入 ContextVar
        token = current_request_id.set(request_id)
        
        try:
            # 继续处理请求
            response = await call_next(request)
            
            # 在响应头中返回 request_id
            response.headers['X-Request-ID'] = request_id
            
            return response
        finally:
            # 重置 ContextVar
            current_request_id.reset(token)


def get_current_request_id() -> str:
    """获取当前请求的 request_id"""
    return current_request_id.get()
