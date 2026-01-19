"""
统一响应格式辅助函数

提供标准化的 API 响应格式，支持国际化（i18n）
"""

from datetime import datetime, timezone
from typing import Any, Optional, Union
from enum import Enum


def _get_utc_timestamp() -> str:
    """获取 UTC 时间戳（ISO 8601 格式）"""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class MessageCode(str, Enum):
    """
    消息代码枚举（用于国际化）

    命名规范: RESOURCE_ACTION_STATUS

    前端根据这些代码进行 i18n 翻译。
    新增接口必须先在此枚举中登记，禁止使用硬编码字符串。
    """

    # ==================== 通用 ====================
    OPERATION_SUCCESS = "OPERATION_SUCCESS"
    ITEMS_RETRIEVED = "ITEMS_RETRIEVED"
    ITEM_CREATED = "ITEM_CREATED"
    ITEM_UPDATED = "ITEM_UPDATED"
    ITEM_DELETED = "ITEM_DELETED"

    # ==================== 连接相关 ====================
    CONNECTION_TEST_SUCCESS = "CONNECTION_TEST_SUCCESS"
    CONNECTION_TEST_FAILED = "CONNECTION_TEST_FAILED"
    CONNECTION_CREATED = "CONNECTION_CREATED"
    CONNECTION_UPDATED = "CONNECTION_UPDATED"
    CONNECTION_DELETED = "CONNECTION_DELETED"
    CONNECTION_REFRESHED = "CONNECTION_REFRESHED"
    CONNECTION_FAILED = "CONNECTION_FAILED"
    CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT"

    # ==================== 数据源相关 ====================
    DATASOURCES_RETRIEVED = "DATASOURCES_RETRIEVED"
    DATASOURCE_RETRIEVED = "DATASOURCE_RETRIEVED"
    DATASOURCE_CREATED = "DATASOURCE_CREATED"
    DATASOURCE_UPDATED = "DATASOURCE_UPDATED"
    DATASOURCE_DELETED = "DATASOURCE_DELETED"
    DATASOURCE_NOT_FOUND = "DATASOURCE_NOT_FOUND"

    # ==================== 表相关 ====================
    TABLES_RETRIEVED = "TABLES_RETRIEVED"
    TABLE_RETRIEVED = "TABLE_RETRIEVED"
    TABLE_CREATED = "TABLE_CREATED"
    TABLE_DELETED = "TABLE_DELETED"
    TABLE_REFRESHED = "TABLE_REFRESHED"
    TABLE_NOT_FOUND = "TABLE_NOT_FOUND"
    SCHEMAS_RETRIEVED = "SCHEMAS_RETRIEVED"

    # ==================== 查询相关 ====================
    QUERY_SUCCESS = "QUERY_SUCCESS"
    QUERY_EXECUTED = "QUERY_EXECUTED"
    QUERY_CANCELLED = "QUERY_CANCELLED"
    QUERY_FAILED = "QUERY_FAILED"
    QUERY_TIMEOUT = "QUERY_TIMEOUT"
    QUERY_NOT_FOUND = "QUERY_NOT_FOUND"
    QUERY_SAVED = "QUERY_SAVED"
    EXPORT_SUCCESS = "EXPORT_SUCCESS"

    # ==================== 可视化查询相关 ====================
    VISUAL_QUERY_GENERATED = "VISUAL_QUERY_GENERATED"
    VISUAL_QUERY_PREVIEWED = "VISUAL_QUERY_PREVIEWED"
    VISUAL_QUERY_VALIDATED = "VISUAL_QUERY_VALIDATED"
    VISUAL_QUERY_INVALID = "VISUAL_QUERY_INVALID"

    # ==================== 集合操作相关 ====================
    SET_OPERATION_GENERATED = "SET_OPERATION_GENERATED"
    SET_OPERATION_PREVIEWED = "SET_OPERATION_PREVIEWED"
    SET_OPERATION_VALIDATED = "SET_OPERATION_VALIDATED"
    SET_OPERATION_EXECUTED = "SET_OPERATION_EXECUTED"
    SET_OPERATION_EXPORTED = "SET_OPERATION_EXPORTED"

    # ==================== 异步任务相关 ====================
    TASK_SUBMITTED = "TASK_SUBMITTED"
    TASK_RETRIEVED = "TASK_RETRIEVED"
    TASKS_RETRIEVED = "TASKS_RETRIEVED"
    TASK_COMPLETED = "TASK_COMPLETED"
    TASK_CANCELLED = "TASK_CANCELLED"
    TASK_FAILED = "TASK_FAILED"
    TASK_NOT_FOUND = "TASK_NOT_FOUND"
    TASK_CLEANUP_SUCCESS = "TASK_CLEANUP_SUCCESS"
    TASK_RETRY_SUCCESS = "TASK_RETRY_SUCCESS"
    TASK_DOWNLOAD_SUCCESS = "TASK_DOWNLOAD_SUCCESS"
    TASK_CANCEL_NOT_ALLOWED = "TASK_CANCEL_NOT_ALLOWED"

    # ==================== 文件上传相关 ====================
    FILE_UPLOADED = "FILE_UPLOADED"
    FILE_IMPORTED = "FILE_IMPORTED"
    FILE_DOWNLOADED = "FILE_DOWNLOADED"
    FILE_DELETED = "FILE_DELETED"
    FILE_NOT_FOUND = "FILE_NOT_FOUND"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    FILE_TYPE_NOT_SUPPORTED = "FILE_TYPE_NOT_SUPPORTED"

    # ==================== 分块上传相关 ====================
    CHUNKED_UPLOAD_INIT = "CHUNKED_UPLOAD_INIT"
    CHUNKED_UPLOAD_CHUNK = "CHUNKED_UPLOAD_CHUNK"
    CHUNKED_UPLOAD_COMPLETE = "CHUNKED_UPLOAD_COMPLETE"
    CHUNKED_UPLOAD_CANCELLED = "CHUNKED_UPLOAD_CANCELLED"
    CHUNKED_UPLOAD_FAILED = "CHUNKED_UPLOAD_FAILED"

    # ==================== URL 读取相关 ====================
    URL_READ_SUCCESS = "URL_READ_SUCCESS"
    URL_INFO_RETRIEVED = "URL_INFO_RETRIEVED"
    URL_READ_FAILED = "URL_READ_FAILED"
    URL_INVALID = "URL_INVALID"

    # ==================== Excel 相关 ====================
    EXCEL_SHEETS_INSPECTED = "EXCEL_SHEETS_INSPECTED"
    EXCEL_SHEETS_IMPORTED = "EXCEL_SHEETS_IMPORTED"
    EXCEL_IMPORT_FAILED = "EXCEL_IMPORT_FAILED"

    # ==================== 粘贴数据相关 ====================
    PASTE_DATA_SUCCESS = "PASTE_DATA_SUCCESS"
    PASTE_DATA_FAILED = "PASTE_DATA_FAILED"

    # ==================== SQL 收藏相关 ====================
    FAVORITES_RETRIEVED = "FAVORITES_RETRIEVED"
    FAVORITE_RETRIEVED = "FAVORITE_RETRIEVED"
    FAVORITE_CREATED = "FAVORITE_CREATED"
    FAVORITE_UPDATED = "FAVORITE_UPDATED"
    FAVORITE_DELETED = "FAVORITE_DELETED"
    FAVORITE_USAGE_INCREMENTED = "FAVORITE_USAGE_INCREMENTED"
    FAVORITE_NOT_FOUND = "FAVORITE_NOT_FOUND"

    # ==================== 服务器文件相关 ====================
    SERVER_MOUNTS_RETRIEVED = "SERVER_MOUNTS_RETRIEVED"
    SERVER_DIRECTORY_BROWSED = "SERVER_DIRECTORY_BROWSED"
    SERVER_FILE_IMPORTED = "SERVER_FILE_IMPORTED"
    SERVER_FILE_NOT_FOUND = "SERVER_FILE_NOT_FOUND"

    # ==================== 连接池相关 ====================
    POOL_STATUS_RETRIEVED = "POOL_STATUS_RETRIEVED"
    POOL_RESET_SUCCESS = "POOL_RESET_SUCCESS"
    ERROR_STATS_RETRIEVED = "ERROR_STATS_RETRIEVED"
    ERRORS_CLEARED = "ERRORS_CLEARED"

    # ==================== 设置相关 ====================
    SETTINGS_RETRIEVED = "SETTINGS_RETRIEVED"
    SETTINGS_UPDATED = "SETTINGS_UPDATED"
    SETTINGS_RESET = "SETTINGS_RESET"
    SHORTCUTS_RETRIEVED = "SHORTCUTS_RETRIEVED"
    SHORTCUTS_UPDATED = "SHORTCUTS_UPDATED"
    SHORTCUTS_RESET = "SHORTCUTS_RESET"

    # ==================== 应用配置相关 ====================
    APP_FEATURES_RETRIEVED = "APP_FEATURES_RETRIEVED"

    # ==================== 批量操作相关 ====================
    BATCH_DELETE_SUCCESS = "BATCH_DELETE_SUCCESS"
    BATCH_TEST_SUCCESS = "BATCH_TEST_SUCCESS"
    BATCH_OPERATION_FAILED = "BATCH_OPERATION_FAILED"

    # ==================== 通用错误 ====================
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INVALID_REQUEST = "INVALID_REQUEST"
    RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NETWORK_ERROR = "NETWORK_ERROR"
    TIMEOUT_ERROR = "TIMEOUT_ERROR"
    OPERATION_FAILED = "OPERATION_FAILED"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"


# 默认消息文本映射（中文）
DEFAULT_MESSAGES = {
    # ==================== 通用 ====================
    MessageCode.OPERATION_SUCCESS: "操作成功",
    MessageCode.ITEMS_RETRIEVED: "获取列表成功",
    MessageCode.ITEM_CREATED: "创建成功",
    MessageCode.ITEM_UPDATED: "更新成功",
    MessageCode.ITEM_DELETED: "删除成功",

    # ==================== 连接相关 ====================
    MessageCode.CONNECTION_TEST_SUCCESS: "连接测试成功",
    MessageCode.CONNECTION_TEST_FAILED: "连接测试失败",
    MessageCode.CONNECTION_CREATED: "数据库连接创建成功",
    MessageCode.CONNECTION_UPDATED: "数据库连接更新成功",
    MessageCode.CONNECTION_DELETED: "数据库连接已删除",
    MessageCode.CONNECTION_REFRESHED: "连接刷新成功",
    MessageCode.CONNECTION_FAILED: "连接失败",
    MessageCode.CONNECTION_TIMEOUT: "连接超时",

    # ==================== 数据源相关 ====================
    MessageCode.DATASOURCES_RETRIEVED: "获取数据源列表成功",
    MessageCode.DATASOURCE_RETRIEVED: "获取数据源成功",
    MessageCode.DATASOURCE_CREATED: "数据源创建成功",
    MessageCode.DATASOURCE_UPDATED: "数据源更新成功",
    MessageCode.DATASOURCE_DELETED: "数据源已删除",
    MessageCode.DATASOURCE_NOT_FOUND: "数据源不存在",

    # ==================== 表相关 ====================
    MessageCode.TABLES_RETRIEVED: "获取表列表成功",
    MessageCode.TABLE_RETRIEVED: "获取表详情成功",
    MessageCode.TABLE_CREATED: "表创建成功",
    MessageCode.TABLE_DELETED: "表已删除",
    MessageCode.TABLE_REFRESHED: "表元数据刷新成功",
    MessageCode.TABLE_NOT_FOUND: "表不存在",
    MessageCode.SCHEMAS_RETRIEVED: "获取 Schema 列表成功",

    # ==================== 查询相关 ====================
    MessageCode.QUERY_SUCCESS: "查询成功",
    MessageCode.QUERY_EXECUTED: "查询执行成功",
    MessageCode.QUERY_CANCELLED: "查询已取消",
    MessageCode.QUERY_FAILED: "查询执行失败",
    MessageCode.QUERY_TIMEOUT: "查询超时",
    MessageCode.QUERY_NOT_FOUND: "查询不存在或已完成",
    MessageCode.QUERY_SAVED: "查询结果已保存",
    MessageCode.EXPORT_SUCCESS: "导出成功",

    # ==================== 可视化查询相关 ====================
    MessageCode.VISUAL_QUERY_GENERATED: "可视化查询生成成功",
    MessageCode.VISUAL_QUERY_PREVIEWED: "可视化查询预览成功",
    MessageCode.VISUAL_QUERY_VALIDATED: "可视化查询验证通过",
    MessageCode.VISUAL_QUERY_INVALID: "可视化查询配置无效",

    # ==================== 集合操作相关 ====================
    MessageCode.SET_OPERATION_GENERATED: "集合操作生成成功",
    MessageCode.SET_OPERATION_PREVIEWED: "集合操作预览成功",
    MessageCode.SET_OPERATION_VALIDATED: "集合操作验证通过",
    MessageCode.SET_OPERATION_EXECUTED: "集合操作执行成功",
    MessageCode.SET_OPERATION_EXPORTED: "集合操作导出成功",

    # ==================== 异步任务相关 ====================
    MessageCode.TASK_SUBMITTED: "任务已提交",
    MessageCode.TASK_RETRIEVED: "获取任务详情成功",
    MessageCode.TASKS_RETRIEVED: "获取任务列表成功",
    MessageCode.TASK_COMPLETED: "任务已完成",
    MessageCode.TASK_CANCELLED: "任务已取消",
    MessageCode.TASK_FAILED: "任务执行失败",
    MessageCode.TASK_NOT_FOUND: "任务不存在",
    MessageCode.TASK_CLEANUP_SUCCESS: "任务清理成功",
    MessageCode.TASK_RETRY_SUCCESS: "任务重试成功",
    MessageCode.TASK_DOWNLOAD_SUCCESS: "任务结果下载成功",
    MessageCode.TASK_CANCEL_NOT_ALLOWED: "任务无法取消",

    # ==================== 文件上传相关 ====================
    MessageCode.FILE_UPLOADED: "文件上传成功",
    MessageCode.FILE_IMPORTED: "文件导入成功",
    MessageCode.FILE_DOWNLOADED: "文件下载成功",
    MessageCode.FILE_DELETED: "文件已删除",
    MessageCode.FILE_NOT_FOUND: "文件不存在",
    MessageCode.FILE_TOO_LARGE: "文件太大",
    MessageCode.FILE_TYPE_NOT_SUPPORTED: "文件类型不支持",

    # ==================== 分块上传相关 ====================
    MessageCode.CHUNKED_UPLOAD_INIT: "分块上传初始化成功",
    MessageCode.CHUNKED_UPLOAD_CHUNK: "分块上传成功",
    MessageCode.CHUNKED_UPLOAD_COMPLETE: "分块上传完成",
    MessageCode.CHUNKED_UPLOAD_CANCELLED: "分块上传已取消",
    MessageCode.CHUNKED_UPLOAD_FAILED: "分块上传失败",

    # ==================== URL 读取相关 ====================
    MessageCode.URL_READ_SUCCESS: "URL 读取成功",
    MessageCode.URL_INFO_RETRIEVED: "URL 信息获取成功",
    MessageCode.URL_READ_FAILED: "URL 读取失败",
    MessageCode.URL_INVALID: "URL 格式无效",

    # ==================== Excel 相关 ====================
    MessageCode.EXCEL_SHEETS_INSPECTED: "Excel 表格检查成功",
    MessageCode.EXCEL_SHEETS_IMPORTED: "Excel 表格导入成功",
    MessageCode.EXCEL_IMPORT_FAILED: "Excel 导入失败",

    # ==================== 粘贴数据相关 ====================
    MessageCode.PASTE_DATA_SUCCESS: "粘贴数据成功",
    MessageCode.PASTE_DATA_FAILED: "粘贴数据失败",

    # ==================== SQL 收藏相关 ====================
    MessageCode.FAVORITES_RETRIEVED: "获取收藏列表成功",
    MessageCode.FAVORITE_RETRIEVED: "获取收藏详情成功",
    MessageCode.FAVORITE_CREATED: "收藏创建成功",
    MessageCode.FAVORITE_UPDATED: "收藏更新成功",
    MessageCode.FAVORITE_DELETED: "收藏已删除",
    MessageCode.FAVORITE_USAGE_INCREMENTED: "收藏使用次数已更新",
    MessageCode.FAVORITE_NOT_FOUND: "收藏不存在",

    # ==================== 服务器文件相关 ====================
    MessageCode.SERVER_MOUNTS_RETRIEVED: "获取挂载点列表成功",
    MessageCode.SERVER_DIRECTORY_BROWSED: "目录浏览成功",
    MessageCode.SERVER_FILE_IMPORTED: "服务器文件导入成功",
    MessageCode.SERVER_FILE_NOT_FOUND: "服务器文件不存在",

    # ==================== 连接池相关 ====================
    MessageCode.POOL_STATUS_RETRIEVED: "获取连接池状态成功",
    MessageCode.POOL_RESET_SUCCESS: "连接池重置成功",
    MessageCode.ERROR_STATS_RETRIEVED: "获取错误统计成功",
    MessageCode.ERRORS_CLEARED: "错误记录已清除",

    # ==================== 设置相关 ====================
    MessageCode.SETTINGS_RETRIEVED: "获取设置成功",
    MessageCode.SETTINGS_UPDATED: "设置更新成功",
    MessageCode.SETTINGS_RESET: "设置已重置",
    MessageCode.SHORTCUTS_RETRIEVED: "获取快捷键设置成功",
    MessageCode.SHORTCUTS_UPDATED: "快捷键设置更新成功",
    MessageCode.SHORTCUTS_RESET: "快捷键设置已重置",

    # ==================== 应用配置相关 ====================
    MessageCode.APP_FEATURES_RETRIEVED: "获取应用功能配置成功",

    # ==================== 批量操作相关 ====================
    MessageCode.BATCH_DELETE_SUCCESS: "批量删除成功",
    MessageCode.BATCH_TEST_SUCCESS: "批量测试成功",
    MessageCode.BATCH_OPERATION_FAILED: "批量操作失败",

    # ==================== 通用错误 ====================
    MessageCode.VALIDATION_ERROR: "参数验证失败",
    MessageCode.INVALID_REQUEST: "请求参数无效",
    MessageCode.RESOURCE_NOT_FOUND: "资源不存在",
    MessageCode.PERMISSION_DENIED: "权限不足",
    MessageCode.INTERNAL_ERROR: "系统内部错误",
    MessageCode.NETWORK_ERROR: "网络错误",
    MessageCode.TIMEOUT_ERROR: "请求超时",
    MessageCode.OPERATION_FAILED: "操作失败",
    MessageCode.UNAUTHORIZED: "未授权",
    MessageCode.FORBIDDEN: "禁止访问",
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
        "timestamp": _get_utc_timestamp()
    }


def create_error_response(
    code: Union[str, MessageCode],
    message: str,
    details: Optional[dict] = None
) -> dict:
    """
    创建统一的错误响应

    Args:
        code: 错误代码（用于国际化），可以是字符串或 MessageCode 枚举
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
    # 确保 code 是字符串（支持 MessageCode 枚举）
    code_str = code.value if isinstance(code, MessageCode) else str(code)

    return {
        "success": False,
        "detail": message,
        "error": {
            "code": code_str,
            "message": message,
            "details": details or {}
        },
        "messageCode": code_str,
        "message": message,
        "timestamp": _get_utc_timestamp()
    }


def create_list_response(  # pylint: disable=too-many-positional-arguments
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
