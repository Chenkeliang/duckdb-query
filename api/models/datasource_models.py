"""
数据源管理统一模型

定义统一的数据源响应模型、批量操作模型和连接测试响应模型
"""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DataSourceType(str, Enum):
    """数据源类型枚举"""
    DATABASE = "database"
    FILE = "file"
    URL = "url"


class DataSourceStatus(str, Enum):
    """数据源状态枚举"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"


class DataSourceResponse(BaseModel):
    """统一的数据源响应模型"""
    id: str = Field(..., description="唯一标识")
    name: str = Field(..., description="显示名称")
    type: DataSourceType = Field(..., description="类型: database, file, url")
    subtype: Optional[str] = Field(None, description="子类型: mysql, postgresql, csv, excel, etc.")
    status: DataSourceStatus = Field(..., description="状态: active, inactive, error")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="类型特定的元数据")

    # 数据库特定字段
    connection_info: Optional[Dict[str, Any]] = Field(None, description="连接信息（脱敏）")

    # 文件特定字段
    file_info: Optional[Dict[str, Any]] = Field(None, description="文件信息")

    # 统计信息
    row_count: Optional[int] = Field(None, description="行数")
    column_count: Optional[int] = Field(None, description="列数")
    size_bytes: Optional[int] = Field(None, description="大小（字节）")


class BatchDeleteRequest(BaseModel):
    """批量删除请求"""
    ids: List[str] = Field(..., description="要删除的数据源 ID 列表", max_length=50)
    force: bool = Field(False, description="强制删除，忽略依赖检查")


class BatchTestRequest(BaseModel):
    """批量测试请求"""
    ids: List[str] = Field(..., description="要测试的数据源 ID 列表", max_length=50)
    timeout: int = Field(10, description="每个连接的超时时间（秒）", ge=1, le=60)


class BatchOperationResult(BaseModel):
    """单个批量操作结果"""
    id: str = Field(..., description="数据源 ID")
    success: bool = Field(..., description="操作是否成功")
    message: Optional[str] = Field(None, description="成功消息")
    error: Optional[str] = Field(None, description="错误消息")
    data: Optional[Dict[str, Any]] = Field(None, description="额外数据")


class BatchOperationResponse(BaseModel):
    """批量操作响应"""
    success_count: int = Field(..., description="成功数量")
    failure_count: int = Field(..., description="失败数量")
    total_count: int = Field(..., description="总数量")
    results: List[BatchOperationResult] = Field(..., description="详细结果列表")


class ConnectionTestResponse(BaseModel):
    """连接测试响应"""
    success: bool = Field(..., description="测试是否成功")
    message: str = Field(..., description="测试消息")
    messageCode: Optional[str] = Field(None, description="消息代码（用于 i18n）")

    # 成功时的详细信息
    connection_time_ms: Optional[int] = Field(None, description="连接耗时（毫秒）")
    database_version: Optional[str] = Field(None, description="数据库版本")
    server_info: Optional[Dict[str, Any]] = Field(None, description="服务器信息")
    table_count: Optional[int] = Field(None, description="表数量")
    schema_count: Optional[int] = Field(None, description="Schema 数量")

    # 警告信息
    warnings: List[str] = Field(default_factory=list, description="警告列表（如未启用 SSL）")

    # 失败时的诊断信息
    error_type: Optional[str] = Field(None, description="错误类型: network, auth, permission, timeout")
    error_details: Optional[str] = Field(None, description="详细错误信息")
    suggestions: List[str] = Field(default_factory=list, description="解决建议")


class DataSourceErrorCode(str, Enum):
    """数据源错误码"""
    NOT_FOUND = "DATASOURCE_NOT_FOUND"
    INVALID_TYPE = "INVALID_DATASOURCE_TYPE"
    CONNECTION_FAILED = "CONNECTION_FAILED"
    PERMISSION_DENIED = "PERMISSION_DENIED"
    BATCH_OPERATION_FAILED = "BATCH_OPERATION_FAILED"
    TIMEOUT = "TIMEOUT"
    VALIDATION_ERROR = "VALIDATION_ERROR"


class DataSourceFilter(BaseModel):
    """数据源过滤参数"""
    type: Optional[DataSourceType] = Field(None, description="按类型过滤")
    subtype: Optional[str] = Field(None, description="按子类型过滤")
    status: Optional[DataSourceStatus] = Field(None, description="按状态过滤")
    search: Optional[str] = Field(None, description="搜索关键词")
