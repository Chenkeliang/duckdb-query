"""
统一异常处理模块
定义项目中使用的自定义异常类和异常处理器
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


logger = logging.getLogger(__name__)


def _get_utc_timestamp() -> str:
    """获取 UTC 时间戳（ISO 8601 格式）"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class BaseAPIException(Exception):
    """API异常基类"""
    
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        error_code: str = "INTERNAL_ERROR",
        details: Optional[Dict[str, Any]] = None
    ):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(BaseAPIException):
    """数据验证异常"""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="VALIDATION_ERROR",
            details=details
        )


class AuthenticationError(BaseAPIException):
    """认证异常"""
    
    def __init__(self, message: str = "认证失败"):
        super().__init__(
            message=message,
            status_code=401,
            error_code="AUTHENTICATION_ERROR"
        )


class AuthorizationError(BaseAPIException):
    """授权异常"""
    
    def __init__(self, message: str = "权限不足"):
        super().__init__(
            message=message,
            status_code=403,
            error_code="AUTHORIZATION_ERROR"
        )


class ResourceNotFoundError(BaseAPIException):
    """资源未找到异常"""
    
    def __init__(self, resource_type: str, resource_id: str):
        message = f"{resource_type} '{resource_id}' 未找到"
        super().__init__(
            message=message,
            status_code=404,
            error_code="RESOURCE_NOT_FOUND",
            details={"resource_type": resource_type, "resource_id": resource_id}
        )


class DatabaseConnectionError(BaseAPIException):
    """数据库连接异常"""
    
    def __init__(self, message: str, connection_id: Optional[str] = None):
        super().__init__(
            message=message,
            status_code=503,
            error_code="DATABASE_CONNECTION_ERROR",
            details={"connection_id": connection_id} if connection_id else {}
        )


class QueryExecutionError(BaseAPIException):
    """查询执行异常"""
    
    def __init__(self, message: str, sql: Optional[str] = None):
        super().__init__(
            message=message,
            status_code=500,
            error_code="QUERY_EXECUTION_ERROR",
            details={"sql": sql[:200] + "..." if sql and len(sql) > 200 else sql} if sql else {}
        )


class FileProcessingError(BaseAPIException):
    """文件处理异常"""
    
    def __init__(self, message: str, filename: Optional[str] = None):
        super().__init__(
            message=message,
            status_code=422,
            error_code="FILE_PROCESSING_ERROR",
            details={"filename": filename} if filename else {}
        )


class SecurityError(BaseAPIException):
    """安全异常"""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            message=message,
            status_code=400,
            error_code="SECURITY_ERROR",
            details=details
        )


class CacheError(BaseAPIException):
    """缓存异常"""
    
    def __init__(self, message: str):
        super().__init__(
            message=message,
            status_code=500,
            error_code="CACHE_ERROR"
        )


class ConfigurationError(BaseAPIException):
    """配置异常"""
    
    def __init__(self, message: str, config_key: Optional[str] = None):
        super().__init__(
            message=message,
            status_code=500,
            error_code="CONFIGURATION_ERROR",
            details={"config_key": config_key} if config_key else {}
        )


async def api_exception_handler(request: Request, exc: BaseAPIException) -> JSONResponse:
    """API异常处理器"""

    logger.error(
        "API异常: %s - %s",
        exc.error_code,
        exc.message,
        extra={
            "status_code": exc.status_code,
            "error_code": exc.error_code,
            "details": exc.details,
            "path": request.url.path,
            "method": request.method
        }
    )

    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "detail": exc.message,
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details
            },
            "messageCode": exc.error_code,
            "message": exc.message,
            "timestamp": _get_utc_timestamp()
        }
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """HTTP异常处理器"""
    
    logger.warning(
        "HTTP异常: %s - %s",
        exc.status_code,
        exc.detail,
        extra={
            "status_code": exc.status_code,
            "path": request.url.path,
            "method": request.method
        }
    )

    
    # 检查 detail 是否已经是标准格式（防止二次包装）
    if isinstance(exc.detail, dict) and exc.detail.get("success") is False:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.detail
        )
    
    # 根据状态码映射错误代码
    error_code_map = {
        400: "INVALID_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "RESOURCE_NOT_FOUND",
        408: "TIMEOUT_ERROR",
        422: "VALIDATION_ERROR",
        500: "INTERNAL_ERROR",
        502: "NETWORK_ERROR",
        503: "INTERNAL_ERROR",
    }
    error_code = error_code_map.get(exc.status_code, "OPERATION_FAILED")
    message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "detail": message,
            "error": {
                "code": error_code,
                "message": message,
                "details": {}
            },
            "messageCode": error_code,
            "message": message,
            "timestamp": _get_utc_timestamp()
        }
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """通用异常处理器"""
    
    logger.error(
        "未处理的异常: %s - %s",
        type(exc).__name__,
        str(exc),
        extra={
            "path": request.url.path,
            "method": request.method
        },
        exc_info=True
    )

    
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "detail": "服务器内部错误",
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "服务器内部错误",
                "details": {}
            },
            "messageCode": "INTERNAL_ERROR",
            "message": "服务器内部错误",
            "timestamp": _get_utc_timestamp()
        }
    )


def setup_exception_handlers(app):
    """设置异常处理器"""
    app.add_exception_handler(BaseAPIException, api_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
