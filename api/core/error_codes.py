"""
统一错误代码定义模块
包含所有后端API可能返回的错误代码和对应的中文消息
"""

from enum import Enum
from typing import Dict, Tuple


class ErrorCode(Enum):
    """错误代码枚举"""

    # 通用错误
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    VALIDATION_ERROR = "VALIDATION_ERROR"

    # SQL/数据库相关错误
    TABLE_NOT_FOUND = "TABLE_NOT_FOUND"
    COLUMN_NOT_FOUND = "COLUMN_NOT_FOUND"
    SQL_SYNTAX_ERROR = "SQL_SYNTAX_ERROR"
    TYPE_CONVERSION_ERROR = "TYPE_CONVERSION_ERROR"
    QUERY_TIMEOUT = "QUERY_TIMEOUT"
    DUPLICATE_KEY_ERROR = "DUPLICATE_KEY_ERROR"
    CONSTRAINT_VIOLATION = "CONSTRAINT_VIOLATION"

    # 连接和网络错误
    CONNECTION_ERROR = "CONNECTION_ERROR"
    DATABASE_CONNECTION_ERROR = "DATABASE_CONNECTION_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    TIMEOUT_ERROR = "TIMEOUT_ERROR"

    # 权限和认证错误
    PERMISSION_DENIED = "PERMISSION_DENIED"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    AUTHORIZATION_FAILED = "AUTHORIZATION_FAILED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"

    # 资源相关错误
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    RESOURCE_ALREADY_EXISTS = "RESOURCE_ALREADY_EXISTS"
    INSUFFICIENT_MEMORY = "INSUFFICIENT_MEMORY"
    DISK_SPACE_INSUFFICIENT = "DISK_SPACE_INSUFFICIENT"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"

    # 业务逻辑错误
    INVALID_OPERATION = "INVALID_OPERATION"
    OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED"
    CONCURRENT_MODIFICATION = "CONCURRENT_MODIFICATION"
    DATA_INTEGRITY_ERROR = "DATA_INTEGRITY_ERROR"


# 错误代码到中文消息和HTTP状态码的映射
ERROR_MESSAGES: Dict[ErrorCode, Tuple[str, int]] = {
    # 通用错误 (message, http_status_code)
    ErrorCode.UNKNOWN_ERROR: ("未知错误", 500),
    ErrorCode.INTERNAL_ERROR: ("服务器内部错误", 500),
    ErrorCode.VALIDATION_ERROR: ("数据验证失败", 400),
    # SQL/数据库相关错误
    ErrorCode.TABLE_NOT_FOUND: ("表不存在", 404),
    ErrorCode.COLUMN_NOT_FOUND: ("列不存在", 404),
    ErrorCode.SQL_SYNTAX_ERROR: ("SQL语法错误", 400),
    ErrorCode.TYPE_CONVERSION_ERROR: ("数据类型转换错误", 400),
    ErrorCode.QUERY_TIMEOUT: ("查询超时", 408),
    ErrorCode.DUPLICATE_KEY_ERROR: ("主键或唯一约束冲突", 409),
    ErrorCode.CONSTRAINT_VIOLATION: ("数据约束违反", 400),
    # 连接和网络错误
    ErrorCode.CONNECTION_ERROR: ("连接失败", 503),
    ErrorCode.DATABASE_CONNECTION_ERROR: ("数据库连接失败", 503),
    ErrorCode.NETWORK_ERROR: ("网络错误", 503),
    ErrorCode.TIMEOUT_ERROR: ("请求超时", 408),
    # 权限和认证错误
    ErrorCode.PERMISSION_DENIED: ("权限不足", 403),
    ErrorCode.AUTHENTICATION_FAILED: ("身份验证失败", 401),
    ErrorCode.AUTHORIZATION_FAILED: ("授权失败", 403),
    ErrorCode.TOKEN_EXPIRED: ("访问令牌已过期", 401),
    # 资源相关错误
    ErrorCode.RESOURCE_NOT_FOUND: ("资源不存在", 404),
    ErrorCode.RESOURCE_ALREADY_EXISTS: ("资源已存在", 409),
    ErrorCode.INSUFFICIENT_MEMORY: ("内存不足", 507),
    ErrorCode.DISK_SPACE_INSUFFICIENT: ("磁盘空间不足", 507),
    ErrorCode.FILE_NOT_FOUND: ("文件不存在", 404),
    ErrorCode.FILE_TOO_LARGE: ("文件过大", 413),
    # 业务逻辑错误
    ErrorCode.INVALID_OPERATION: ("无效操作", 400),
    ErrorCode.OPERATION_NOT_ALLOWED: ("操作不被允许", 405),
    ErrorCode.CONCURRENT_MODIFICATION: ("并发修改冲突", 409),
    ErrorCode.DATA_INTEGRITY_ERROR: ("数据完整性错误", 400),
}


def get_error_message(error_code: ErrorCode) -> str:
    """获取错误代码对应的中文消息"""
    return ERROR_MESSAGES.get(error_code, ("未知错误", 500))[0]


def get_http_status_code(error_code: ErrorCode) -> int:
    """获取错误代码对应的HTTP状态码"""
    return ERROR_MESSAGES.get(error_code, ("未知错误", 500))[1]


def create_error_response(
    error_code: ErrorCode, original_error: str = None, sql: str = None
) -> dict:
    """创建标准化的错误响应"""
    message, status_code = ERROR_MESSAGES.get(error_code, ("未知错误", 500))

    response = {
        "code": error_code.value,
        "message": message,
        "details": {
            "error_type": type(Exception).__name__,
            "timestamp": __import__("time").time(),
        },
    }

    # 添加原始错误信息
    if original_error:
        response["details"]["original_error"] = original_error

    # 添加SQL信息（如果有）
    if sql:
        response["details"]["sql"] = sql[:200] + "..." if len(sql) > 200 else sql

    return response


def analyze_error_type(error_message: str) -> ErrorCode:
    """根据错误消息分析错误类型"""
    error_msg_lower = error_message.lower()

    # 表不存在错误
    if "does not exist" in error_msg_lower and "table" in error_msg_lower:
        return ErrorCode.TABLE_NOT_FOUND

    # 列不存在错误
    elif "column" in error_msg_lower and "does not exist" in error_msg_lower:
        return ErrorCode.COLUMN_NOT_FOUND

    # 语法错误
    elif "syntax error" in error_msg_lower or "parser error" in error_msg_lower:
        return ErrorCode.SQL_SYNTAX_ERROR

    # 类型转换错误
    elif "conversion error" in error_msg_lower or "cast" in error_msg_lower:
        return ErrorCode.TYPE_CONVERSION_ERROR

    # 权限错误
    elif "permission" in error_msg_lower or "access" in error_msg_lower:
        return ErrorCode.PERMISSION_DENIED

    # 内存不足
    elif "memory" in error_msg_lower or "out of memory" in error_msg_lower:
        return ErrorCode.INSUFFICIENT_MEMORY

    # 连接错误
    elif "connection" in error_msg_lower or "network" in error_msg_lower:
        return ErrorCode.CONNECTION_ERROR

    # 超时错误
    elif "timeout" in error_msg_lower:
        return ErrorCode.QUERY_TIMEOUT

    # 约束违反
    elif "constraint" in error_msg_lower or "unique" in error_msg_lower:
        return ErrorCode.CONSTRAINT_VIOLATION

    # 文件相关错误
    elif "file not found" in error_msg_lower or "no such file" in error_msg_lower:
        return ErrorCode.FILE_NOT_FOUND

    elif "file too large" in error_msg_lower or "size limit" in error_msg_lower:
        return ErrorCode.FILE_TOO_LARGE

    # 默认返回未知错误
    else:
        return ErrorCode.UNKNOWN_ERROR




