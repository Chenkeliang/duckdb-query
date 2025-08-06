"""
统一异常处理模块
定义项目中使用的自定义异常类和异常处理器
"""

from typing import Any, Dict, Optional
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
import logging

logger = logging.getLogger(__name__)


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
        f"API异常: {exc.error_code} - {exc.message}",
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
            "error": {
                "code": exc.error_code,
                "message": exc.message,
                "details": exc.details
            },
            "timestamp": logger.handlers[0].formatter.formatTime(logger.makeRecord(
                name="", level=0, pathname="", lineno=0, msg="", args=(), exc_info=None
            )) if logger.handlers else None
        }
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """HTTP异常处理器"""
    logger.warning(
        f"HTTP异常: {exc.status_code} - {exc.detail}",
        extra={
            "status_code": exc.status_code,
            "path": request.url.path,
            "method": request.method
        }
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "error": {
                "code": "HTTP_ERROR",
                "message": exc.detail,
                "details": {}
            }
        }
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """通用异常处理器"""
    logger.error(
        f"未处理的异常: {type(exc).__name__} - {str(exc)}",
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
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "服务器内部错误",
                "details": {}
            }
        }
    )


def setup_exception_handlers(app):
    """设置异常处理器"""
    app.add_exception_handler(BaseAPIException, api_exception_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
