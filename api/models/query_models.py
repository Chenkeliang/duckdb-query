from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional, Union, Literal
from enum import Enum
import datetime


class DataSourceType(str, Enum):
    """数据源类型枚举"""

    FILE = "file"
    CSV = "csv"
    EXCEL = "excel"
    JSON = "json"
    PARQUET = "parquet"
    MYSQL = "mysql"
    POSTGRESQL = "postgresql"
    SQLITE = "sqlite"
    DUCKDB = "duckdb"


class JoinType(str, Enum):
    """JOIN类型枚举"""

    INNER = "inner"
    LEFT = "left"
    RIGHT = "right"
    OUTER = "outer"  # 添加支持用户使用的"outer"
    FULL_OUTER = "full_outer"
    CROSS = "cross"


class ConnectionStatus(str, Enum):
    """连接状态枚举"""

    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    TESTING = "testing"


class DataSource(BaseModel):
    id: str
    name: Optional[str] = None
    type: Union[DataSourceType, str]  # 允许字符串类型
    table_name: Optional[str] = None
    columns: Optional[List[Dict[str, Any]]] = None  # 支持列的详细信息
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    sourceType: Optional[str] = None  # 前端使用的字段
    params: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None


class DatabaseConnection(BaseModel):
    type: DataSourceType
    params: Dict[str, Any]
    id: str
    name: Optional[str] = None
    status: ConnectionStatus = ConnectionStatus.INACTIVE
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    last_tested: Optional[datetime.datetime] = None


class MySQLConfig(BaseModel):
    """MySQL配置模型，用于本地持久化"""

    id: str
    type: str = "mysql"
    params: Dict[str, Any]
    name: Optional[str] = None
    status: ConnectionStatus = ConnectionStatus.INACTIVE
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None


class PostgreSQLConfig(BaseModel):
    """PostgreSQL配置模型"""

    id: str
    type: str = "postgresql"
    params: Dict[str, Any]
    name: Optional[str] = None
    status: ConnectionStatus = ConnectionStatus.INACTIVE
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None


class SQLiteConfig(BaseModel):
    """SQLite配置模型"""

    id: str
    type: str = "sqlite"
    params: Dict[str, Any]
    name: Optional[str] = None
    status: ConnectionStatus = ConnectionStatus.INACTIVE
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None


class JoinCondition(BaseModel):
    """JOIN条件模型"""

    left_column: str
    right_column: str
    operator: str = "="  # 支持 =, !=, <, >, <=, >=


class Join(BaseModel):
    left_source_id: str
    right_source_id: str
    join_type: JoinType = JoinType.INNER
    conditions: List[JoinCondition]
    alias_left: Optional[str] = None
    alias_right: Optional[str] = None


class MultiTableJoin(BaseModel):
    """多表JOIN配置"""

    tables: List[str]  # 表ID列表
    joins: List[Join]  # JOIN关系列表
    select_columns: Optional[List[str]] = None  # 选择的列
    where_conditions: Optional[str] = None  # WHERE条件
    order_by: Optional[str] = None  # 排序
    limit: Optional[int] = None  # 限制行数


class QueryRequest(BaseModel):
    sources: List[DataSource]
    joins: List[Join]
    select_columns: Optional[List[str]] = None
    where_conditions: Optional[str] = None
    order_by: Optional[str] = None
    limit: Optional[int] = None
    is_preview: Optional[bool] = True  # 新增字段，用于标记是否为预览查询


class ExportFormat(str, Enum):
    """导出格式枚举"""

    CSV = "csv"
    EXCEL = "excel"
    JSON = "json"
    PARQUET = "parquet"


class ExportRequest(BaseModel):
    """导出请求模型"""

    query_request: QueryRequest
    format: ExportFormat
    filename: Optional[str] = None
    chunk_size: Optional[int] = 10000  # 分块大小
    include_headers: bool = True


class ExportTask(BaseModel):
    """导出任务模型"""

    id: str
    status: str  # 'pending', 'processing', 'completed', 'failed'
    format: ExportFormat
    filename: str
    progress: float = 0.0
    created_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None
    error_message: Optional[str] = None
    file_size: Optional[int] = None


class ConnectionTestRequest(BaseModel):
    """连接测试请求"""

    type: DataSourceType
    params: Dict[str, Any]


class ConnectionTestResponse(BaseModel):
    """连接测试响应"""

    success: bool
    message: str
    latency_ms: Optional[float] = None
    database_info: Optional[Dict[str, Any]] = None


class FileUploadResponse(BaseModel):
    """文件上传响应"""

    success: bool
    file_id: str
    filename: str
    file_size: int
    columns: List[str]
    row_count: int
    preview_data: List[Dict[str, Any]]


class QueryExecutionResponse(BaseModel):
    """查询执行响应"""

    success: bool
    data: List[Dict[str, Any]]
    columns: List[str]
    row_count: int
    execution_time_ms: float
    sql: Optional[str] = None
    warnings: Optional[List[str]] = None


class QueryResponse(BaseModel):
    columns: List[str]
    data: List[Dict[str, Any]]
