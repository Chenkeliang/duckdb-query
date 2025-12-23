"""
统一响应格式辅助函数

提供标准化的 API 响应格式，支持国际化（i18n）
"""

from datetime import datetime
from typing import Any, Optional
from enum import Enum


class MessageCode(str, Enum):
    """消息代码枚举（用于国际化）"""
    
    # 通用成功
    OPERATION_SUCCESS = "OPERATION_SUCCESS"
    
    # 连接相关
    CONNECTION_TEST_SUCCESS = "CONNECTION_TEST_SUCCESS"
    CONNECTION_TEST_FAILED = "CONNECTION_TEST_FAILED"
    CONNECTION_CREATED = "CONNECTION_CREATED"
    CONNECTION_UPDATED = "CONNECTION_UPDATED"
    CONNECTION_DELETED = "CONNECTION_DELETED"
    CONNECTION_REFRESHED = "CONNECTION_REFRESHED"
    
    # 数据源相关
    DATASOURCES_RETRIEVED = "DATASOURCES_RETRIEVED"
    DATASOURCE_RETRIEVED = "DATASOURCE_RETRIEVED"
    DATASOURCE_DELETED = "DATASOURCE_DELETED"
    
    # 批量操作相关
    BATCH_DELETE_SUCCESS = "BATCH_DELETE_SUCCESS"
    BATCH_TEST_SUCCESS = "BATCH_TEST_SUCCESS"
    
    # 错误相关
    CONNECTION_FAILED = "CONNECTION_FAILED"
    DATASOURCE_NOT_FOUND = "DATASOURCE_NOT_FOUND"
    INVALID_REQUEST = "INVALID_REQUEST"
    OPERATION_FAILED = "OPERATION_FAILED"
    BATCH_OPERATION_FAILED = "BATCH_OPERATION_FAILED"
    
    # 查询相关（新增）
    QUERY_SUCCESS = "QUERY_SUCCESS"
    TABLE_CREATED = "TABLE_CREATED"
    TABLE_DELETED = "TABLE_DELETED"
    EXPORT_SUCCESS = "EXPORT_SUCCESS"
    
    # 异步任务相关（新增）
    TASK_SUBMITTED = "TASK_SUBMITTED"
    TASK_CANCELLED = "TASK_CANCELLED"
    
    # 文件相关（新增）
    FILE_UPLOADED = "FILE_UPLOADED"
    
    # 验证错误（新增）
    VALIDATION_ERROR = "VALIDATION_ERROR"
    CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT"


# 默认消息文本映射（中文）
DEFAULT_MESSAGES = {
    # 通用
    MessageCode.OPERATION_SUCCESS: "操作成功",
    
    # 连接相关
    MessageCode.CONNECTION_TEST_SUCCESS: "连接测试完成",
    MessageCode.CONNECTION_TEST_FAILED: "连接测试失败",
    MessageCode.CONNECTION_CREATED: "数据库连接创建成功",
    MessageCode.CONNECTION_UPDATED: "数据库连接更新成功",
    MessageCode.CONNECTION_DELETED: "数据库连接已删除",
    MessageCode.CONNECTION_REFRESHED: "连接刷新成功",
    
    # 数据源相关
    MessageCode.DATASOURCES_RETRIEVED: "获取数据源列表成功",
    MessageCode.DATASOURCE_RETRIEVED: "获取数据源成功",
    MessageCode.DATASOURCE_DELETED: "数据源已删除",
    
    # 批量操作相关
    MessageCode.BATCH_DELETE_SUCCESS: "批量删除完成",
    MessageCode.BATCH_TEST_SUCCESS: "批量测试完成",
    
    # 错误相关
    MessageCode.CONNECTION_FAILED: "连接失败",
    MessageCode.DATASOURCE_NOT_FOUND: "数据源不存在",
    MessageCode.INVALID_REQUEST: "请求参数无效",
    MessageCode.OPERATION_FAILED: "操作失败",
    MessageCode.BATCH_OPERATION_FAILED: "批量操作失败",
    
    # 查询相关（新增）
    MessageCode.QUERY_SUCCESS: "查询成功",
    MessageCode.TABLE_CREATED: "表创建成功",
    MessageCode.TABLE_DELETED: "表已删除",
    MessageCode.EXPORT_SUCCESS: "导出成功",
    
    # 异步任务相关（新增）
    MessageCode.TASK_SUBMITTED: "任务已提交",
    MessageCode.TASK_CANCELLED: "任务已取消",
    
    # 文件相关（新增）
    MessageCode.FILE_UPLOADED: "文件上传成功",
    
    # 验证错误（新增）
    MessageCode.VALIDATION_ERROR: "参数验证失败",
    MessageCode.CONNECTION_TIMEOUT: "连接超时",
}


def create_success_response(
    data: Any,
    message_code: MessageCode,
    message: Optional[str] = None
) -> dict:
    """
    创建统一的成功响应
    
    Args:
        data: 要返回的数据
        message_code: 消息代码（用于国际化）
        message: 可选的消息文本（如果不提供，使用默认消息）
        
    Returns:
        统一格式的响应字典
        
    Example:
        >>> create_success_response(
        ...     data={"connection": {"id": "db_001", "name": "MySQL"}},
        ...     message_code=MessageCode.CONNECTION_CREATED
        ... )
        {
            "success": True,
            "data": {"connection": {"id": "db_001", "name": "MySQL"}},
            "messageCode": "CONNECTION_CREATED",
            "message": "数据库连接创建成功",
            "timestamp": "2024-12-02T19:08:05.123456Z"
        }
    """
    return {
        "success": True,
        "data": data,
        "messageCode": message_code.value,
        "message": message or DEFAULT_MESSAGES.get(message_code, ""),
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def create_error_response(
    code: str,
    message: str,
    details: Optional[dict] = None
) -> dict:
    """
    创建统一的错误响应
    
    Args:
        code: 错误代码（用于国际化）
        message: 错误消息
        details: 额外的错误详情
        
    Returns:
        统一格式的错误响应字典
        
    Example:
        >>> create_error_response(
        ...     code="CONNECTION_FAILED",
        ...     message="无法连接到数据库",
        ...     details={"error_type": "auth"}
        ... )
        {
            "success": False,
            "error": {
                "code": "CONNECTION_FAILED",
                "message": "无法连接到数据库",
                "details": {"error_type": "auth"}
            },
            "messageCode": "CONNECTION_FAILED",
            "message": "无法连接到数据库",
            "timestamp": "2024-12-02T19:08:05.123456Z"
        }
    """
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details or {}
        },
        "messageCode": code,
        "message": message,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def create_list_response(
    items: list,
    total: int,
    message_code: MessageCode,
    message: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> dict:
    """
    创建统一的列表响应
    
    Args:
        items: 数据项列表
        total: 总数量
        message_code: 消息代码（用于国际化）
        message: 可选的消息文本
        page: 当前页码（可选）
        page_size: 每页大小（可选）
        
    Returns:
        统一格式的列表响应字典
        
    Example:
        >>> create_list_response(
        ...     items=[{"id": "db_001", "name": "MySQL"}],
        ...     total=1,
        ...     message_code=MessageCode.DATASOURCES_RETRIEVED
        ... )
        {
            "success": True,
            "data": {
                "items": [{"id": "db_001", "name": "MySQL"}],
                "total": 1
            },
            "messageCode": "DATASOURCES_RETRIEVED",
            "message": "获取数据源列表成功",
            "timestamp": "2024-12-02T19:08:05.123456Z"
        }
    """
    data = {
        "items": items,
        "total": total
    }
    
    if page is not None:
        data["page"] = page
    if page_size is not None:
        data["pageSize"] = page_size
    
    return create_success_response(
        data=data,
        message_code=message_code,
        message=message
    )
