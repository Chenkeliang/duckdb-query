import datetime
import re
from enum import Enum
from typing import List, Dict, Any, Optional, Union

from pydantic import BaseModel, Field, field_validator


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
    left_cast: Optional[str] = Field(
        None, description="对左列应用的TRY_CAST类型，例如 VARCHAR、DECIMAL(18,4)"
    )
    right_cast: Optional[str] = Field(
        None, description="对右列应用的TRY_CAST类型，例如 VARCHAR、DECIMAL(18,4)"
    )

    @field_validator("left_cast", "right_cast")
    @classmethod
    def validate_cast(cls, value: Optional[str]):
        if value is None:
            return None
        cleaned = value.strip().upper()
        if not cleaned:
            return None
        if not re.fullmatch(r"[A-Z0-9_(),\s]+", cleaned):
            raise ValueError("Invalid cast type")
        return cleaned


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


class AttachDatabase(BaseModel):
    """外部数据库连接信息，用于联邦查询"""

    alias: str = Field(..., description="SQL 中使用的数据库别名")
    connection_id: str = Field(..., description="已保存的数据库连接 ID")


class FederatedQueryRequest(BaseModel):
    """联邦查询请求模型

    用于执行跨数据库的联邦查询，支持 ATTACH 外部数据库后执行 SQL。
    """

    sql: str = Field(..., description="SQL 查询语句")
    attach_databases: Optional[List[AttachDatabase]] = Field(
        None, description="需要 ATTACH 的外部数据库列表"
    )
    is_preview: Optional[bool] = Field(
        True, description="是否为预览模式，预览模式限制返回行数"
    )
    save_as_table: Optional[str] = Field(
        None, description="将结果保存为 DuckDB 表的表名"
    )
    timeout: Optional[int] = Field(
        30000, description="查询超时时间（毫秒）"
    )

    @field_validator("sql")
    @classmethod
    def validate_sql(cls, value: str):
        """验证 SQL 不为空"""
        if not value or not value.strip():
            raise ValueError("SQL query cannot be empty")
        return value.strip()


class FederatedQueryResponse(BaseModel):
    """联邦查询响应模型"""

    success: bool = Field(..., description="查询是否成功")
    columns: List[str] = Field(default_factory=list, description="列名列表")
    data: List[Dict[str, Any]] = Field(default_factory=list, description="查询结果数据")
    row_count: int = Field(0, description="返回的行数")
    execution_time_ms: float = Field(0, description="执行时间（毫秒）")
    attached_databases: List[str] = Field(
        default_factory=list, description="成功 ATTACH 的数据库别名列表"
    )
    message: str = Field("", description="附加消息")
    sql_query: Optional[str] = Field(None, description="执行的 SQL 语句")
    warnings: Optional[List[str]] = Field(None, description="警告信息列表")


class QueryRequest(BaseModel):
    sources: List[DataSource]
    joins: List[Join]
    select_columns: Optional[List[str]] = None
    where_conditions: Optional[str] = None
    order_by: Optional[str] = None
    limit: Optional[int] = None
    is_preview: Optional[bool] = (
        True  # 新增字段，用于标记是否为预览查询，默认为True返回1万条
    )
    # 联邦查询支持：需要 ATTACH 的外部数据库列表
    attach_databases: Optional[List[AttachDatabase]] = None


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
    """查询响应模型"""

    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None
    rowCount: Optional[int] = None
    error: Optional[str] = None
    sql_query: Optional[str] = None
    execution_time: Optional[float] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    can_save_to_duckdb: Optional[bool] = False


class AsyncQueryRequest(BaseModel):
    """异步查询请求模型"""

    query: str
    sources: Optional[List[str]] = None
    joins: Optional[List[Dict[str, Any]]] = None
    limit: Optional[int] = 1000
    timeout: Optional[int] = 300


class AsyncQueryResponse(BaseModel):
    """异步查询响应模型"""

    task_id: str
    status: str
    message: str
    created_at: Optional[datetime.datetime] = None


class QueryResult(BaseModel):
    """查询结果模型"""

    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None
    row_count: Optional[int] = None
    error: Optional[str] = None
    execution_time: Optional[float] = None
