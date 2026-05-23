"""Pydantic models for set operations (UNION / EXCEPT / INTERSECT)."""

from enum import Enum
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class SetOperationType(str, Enum):
    """支持的集合操作类型"""

    UNION = "UNION"
    UNION_ALL = "UNION ALL"
    UNION_BY_NAME = "UNION BY NAME"
    UNION_ALL_BY_NAME = "UNION ALL BY NAME"
    EXCEPT = "EXCEPT"
    INTERSECT = "INTERSECT"


class ColumnMapping(BaseModel):
    """列映射配置，用于BY NAME模式"""

    source_column: str = Field(..., description="源表列名")
    target_column: str = Field(..., description="目标列名")

    @field_validator("source_column")
    @classmethod
    def validate_source_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Source column name cannot be empty")
        return v.strip()

    @field_validator("target_column")
    @classmethod
    def validate_target_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Target column name cannot be empty")
        return v.strip()


class TableConfig(BaseModel):
    """表配置，用于集合操作"""

    table_name: str = Field(..., description="表名")
    selected_columns: List[str] = Field(default_factory=list, description="选择的列")
    column_mappings: Optional[List[ColumnMapping]] = Field(
        None, description="列映射（BY NAME模式使用）"
    )
    alias: Optional[str] = Field(None, description="表别名")

    @field_validator("table_name")
    @classmethod
    def validate_table_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Table name cannot be empty")
        return v.strip()

    @field_validator("selected_columns")
    @classmethod
    def validate_selected_columns(cls, v):
        return [col.strip() for col in v if col and col.strip()]

    @field_validator("alias")
    @classmethod
    def validate_alias(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Alias cannot be empty string")
        return v.strip() if v else None


class SetOperationConfig(BaseModel):
    """集合操作配置"""

    operation_type: SetOperationType = Field(..., description="集合操作类型")
    tables: List[TableConfig] = Field(..., description="参与操作的表列表")
    use_by_name: bool = Field(False, description="是否使用BY NAME模式")

    @field_validator("tables")
    @classmethod
    def validate_tables(cls, v):
        if not v or len(v) < 2:
            raise ValueError("Set operation requires at least two tables")
        return v

    @model_validator(mode="after")
    def validate_operation_config(self):
        operation_type = self.operation_type
        use_by_name = self.use_by_name
        tables = self.tables

        if use_by_name:
            if operation_type not in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                raise ValueError("Only UNION and UNION ALL support BY NAME mode")

        if not use_by_name:
            self._validate_column_compatibility(tables)

        return self

    def _validate_column_compatibility(self, tables: List[TableConfig]):
        if not tables:
            return

        first_table = tables[0]
        first_columns = first_table.selected_columns or []

        for table in tables[1:]:
            table_columns = table.selected_columns or []
            if len(first_columns) != len(table_columns):
                raise ValueError(
                    f"Table {table.table_name} column count ({len(table_columns)}) "
                    f"does not match first table {first_table.table_name} column count ({len(first_columns)})"
                )


class SetOperationRequest(BaseModel):
    """集合操作请求模型"""

    config: SetOperationConfig = Field(..., description="集合操作配置")
    preview: bool = Field(False, description="是否为预览请求")
    save_as_table: Optional[str] = Field(None, description="保存为表名（可选）")
    include_metadata: bool = Field(True, description="是否包含元数据")

    @model_validator(mode="after")
    def validate_request(self):
        config = self.config
        if len(config.tables) < 2:
            raise ValueError("Set operation requires at least two tables")
        if len(config.tables) > 10:
            raise ValueError("Set operation supports at most 10 tables")
        return self


class UnionOperationRequest(BaseModel):
    """UNION操作请求模型（简化版）"""

    tables: List[str] = Field(..., description="表名列表")
    operation_type: SetOperationType = Field(
        SetOperationType.UNION, description="操作类型"
    )
    use_by_name: bool = Field(False, description="是否使用BY NAME模式")
    column_mappings: Optional[Dict[str, List[ColumnMapping]]] = Field(
        None, description="列映射（按表名分组）"
    )

    @field_validator("tables")
    @classmethod
    def validate_tables(cls, v):
        if not v or len(v) < 2:
            raise ValueError("At least two tables are required")
        return [table.strip() for table in v if table and table.strip()]


SET_OPERATION_LABELS = {
    SetOperationType.UNION: "并集",
    SetOperationType.UNION_ALL: "并集(保留重复)",
    SetOperationType.UNION_BY_NAME: "按列名并集",
    SetOperationType.UNION_ALL_BY_NAME: "按列名并集(保留重复)",
    SetOperationType.EXCEPT: "差集",
    SetOperationType.INTERSECT: "交集",
}


class SetOperationExportRequest(BaseModel):
    """集合操作导出请求模型"""

    config: SetOperationConfig
    format: Literal["excel", "csv", "parquet"] = Field(..., description="导出格式")
    filename: Optional[str] = Field(None, description="自定义文件名（可选）")
