from pydantic import BaseModel
from typing import List, Dict, Any, Optional


class DataSource(BaseModel):
    id: str
    type: str  # 'file', 'db', 'mysql', 'postgresql', 'sqlite', 'duckdb', 'csv'
    params: Dict[str, Any]
    columns: Optional[List[str]] = None


class DatabaseConnection(BaseModel):
    type: str  # 'mysql', 'postgresql', 'sqlite', 'duckdb', 'csv'
    params: Dict[str, Any]
    id: str


class MySQLConfig(BaseModel):
    """MySQL配置模型，用于本地持久化"""

    id: str
    type: str = "mysql"  # 固定为 'mysql'
    params: Dict[str, Any]
    name: Optional[str] = None  # 配置的显示名称


class Join(BaseModel):
    left_source_id: str
    right_source_id: str
    left_on: str
    right_on: str
    how: str  # 'left', 'right', 'inner', 'outer'


class QueryRequest(BaseModel):
    sources: List[DataSource]
    joins: List[Join]


class QueryResponse(BaseModel):
    columns: List[str]
    data: List[Dict[str, Any]]
