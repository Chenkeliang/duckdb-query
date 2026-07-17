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
        # 这些串最终原样拼进 TRY_CAST(... AS X):字符集正则只能挡引号类注入,
        # 挡不住 "VARCHAR),(1" 这种括号构形——必须走规范类型白名单
        # (别名归一,裸 DECIMAL 拒绝),返回规范拼写。
        from core.common.duckdb_types import validate_cast_type

        return validate_cast_type(cleaned)


class Join(BaseModel):
    left_source_id: str
    right_source_id: str
    join_type: JoinType = JoinType.INNER
    conditions: List[JoinCondition]
    alias_left: Optional[str] = None
    alias_right: Optional[str] = None


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
    # 注:曾有 timeout 字段(标注"查询超时ms"),但端点从不读取它——真正的
    # 超时是服务端看门狗 federated_query_timeout(配置项),已移除以免误导。

    @field_validator("sql")
    @classmethod
    def validate_sql(cls, value: str):
        """验证 SQL 不为空"""
        if not value or not value.strip():
            raise ValueError("SQL query cannot be empty")
        return value.strip()


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
