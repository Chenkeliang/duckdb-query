"""
Visual Query Models

Pydantic models for visual query configuration and validation.
Supports Chinese display labels and comprehensive validation logic.
"""

# pylint: disable=no-member,too-many-lines,duplicate-code,not-an-iterable,unused-variable
from enum import Enum
from typing import List, Optional, Dict, Any, Union, Literal, ClassVar, Set
from pydantic import BaseModel, Field, field_validator, model_validator

from models.query_models import AttachDatabase



class AggregationFunction(str, Enum):
    """Supported aggregation functions"""

    # Basic aggregation functions
    SUM = "SUM"
    AVG = "AVG"
    COUNT = "COUNT"
    MIN = "MIN"
    MAX = "MAX"
    COUNT_DISTINCT = "COUNT_DISTINCT"


class FilterOperator(str, Enum):
    """Supported filter operators"""

    EQUAL = "="
    NOT_EQUAL = "!="
    GREATER_THAN = ">"
    LESS_THAN = "<"
    GREATER_EQUAL = ">="
    LESS_EQUAL = "<="
    LIKE = "LIKE"
    ILIKE = "ILIKE"
    IS_NULL = "IS NULL"
    IS_NOT_NULL = "IS NOT NULL"
    BETWEEN = "BETWEEN"


class LogicOperator(str, Enum):
    """Logic operators for combining conditions"""

    AND = "AND"
    OR = "OR"


class FilterValueType(str, Enum):
    """Types of filter value comparisons"""

    CONSTANT = "constant"
    COLUMN = "column"
    EXPRESSION = "expression"


class VisualQueryMode(str, Enum):
    """Visual analysis modes (pivot Tab only)."""

    PIVOT = "pivot"


class FilterConfig(BaseModel):
    """Configuration for filter conditions"""

    column: Optional[str] = Field(None, description="Column name to filter")
    operator: FilterOperator = Field(..., description="Filter operator")
    value: Optional[Union[str, int, float]] = Field(None, description="Filter value")
    value2: Optional[Union[str, int, float]] = Field(
        None, description="Second value for BETWEEN operator"
    )
    logic_operator: LogicOperator = Field(
        LogicOperator.AND, description="Logic operator for combining with other filters"
    )
    value_type: FilterValueType = Field(
        FilterValueType.CONSTANT,
        description="类型：常量、列或者表达式",
    )
    right_column: Optional[str] = Field(
        None, description="The column name used when comparing column vs column"
    )
    expression: Optional[str] = Field(
        None, description="Expression used when value_type == expression"
    )
    expression_result_type: Optional[
        Literal["number", "string", "boolean", "date"]
    ] = Field(
        None,
        description="Optional result type hint for expression value_type",
    )
    cast: Optional[str] = Field(
        None,
        description="TRY_CAST target applied to the filter expression or column",
    )

    @field_validator("column")
    @classmethod
    def validate_column(cls, v):
        if v is None:
            return None
        if not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()
    @field_validator("cast")
    @classmethod
    def validate_cast(cls, v):
        if v is None:
            return None
        cleaned = v.strip()
        if not cleaned:
            return None
        return cleaned.upper()

    @model_validator(mode="after")
    def validate_filter_values(self):
        operator = self.operator
        value = self.value
        value2 = self.value2

        # Check if value is required for the operator
        if operator in [FilterOperator.IS_NULL, FilterOperator.IS_NOT_NULL]:
            # These operators don't need values
            pass
        elif operator == FilterOperator.BETWEEN:
            if value is None or value2 is None:
                raise ValueError("BETWEEN operator requires both value and value2")
        else:
            if (
                self.value_type == FilterValueType.CONSTANT
                and value is None
                and not (self.value_type == FilterValueType.EXPRESSION and self.expression)
            ):
                raise ValueError(f"Operator {operator} requires a value")

        return self

    @model_validator(mode="after")
    def validate_value_type(self):
        value_type = self.value_type

        if value_type == FilterValueType.COLUMN:
            if not self.right_column or not str(self.right_column).strip():
                raise ValueError("Column comparison requires right_column")
            if self.operator in {FilterOperator.BETWEEN, FilterOperator.LIKE, FilterOperator.ILIKE}:
                raise ValueError(
                    f"Operator {self.operator.value} does not support column-to-column comparison"
                )
            if not self.column or not str(self.column).strip():
                raise ValueError("Column comparison requires column")
        elif value_type == FilterValueType.EXPRESSION:
            if not self.expression or not str(self.expression).strip():
                raise ValueError("Expression comparison requires expression text")
            if self.operator in {FilterOperator.IS_NULL, FilterOperator.IS_NOT_NULL}:
                raise ValueError("IS NULL / IS NOT NULL does not support expression type")
            if self.operator == FilterOperator.BETWEEN:
                raise ValueError("BETWEEN does not support expression comparison")
            # 表达式可以在没有 column 的情况下直接使用
        else:
            # CONSTANT
            if not self.column or not str(self.column).strip():
                raise ValueError("Constant comparison requires column name")

        return self


class PivotValueConfig(BaseModel):
    """Configuration for a single pivot value metric."""

    column: str = Field(..., description="Column to aggregate for the pivot value")
    aggregation: AggregationFunction = Field(
        ..., description="Aggregation function applied to the column"
    )
    alias: Optional[str] = Field(
        None, description="Alias for the pivoted metric column"
    )
    typeConversion: Optional[str] = Field(
        None,
        description="Type conversion for the column before aggregation (e.g., 'decimal', 'double')",
    )

    # Use ClassVar to prevent Pydantic from treating this as a model field/private attr
    _allowed_aggregations: ClassVar[Set[AggregationFunction]] = {
        AggregationFunction.SUM,
        AggregationFunction.AVG,
        AggregationFunction.COUNT,
        AggregationFunction.COUNT_DISTINCT,
        AggregationFunction.MIN,
        AggregationFunction.MAX,
    }

    @field_validator("column")
    @classmethod
    def validate_column(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Pivot value column cannot be empty")
        return value.strip()

    @field_validator("alias")
    @classmethod
    def validate_alias(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("Pivot value alias cannot be empty")
        return value.strip() if value else None

    @field_validator("aggregation")
    @classmethod
    def validate_aggregation(cls, value: AggregationFunction) -> AggregationFunction:
        if value not in cls._allowed_aggregations:
            raise ValueError(f"Aggregation {value} is not supported for pivot values")
        return value


class PivotConfig(BaseModel):
    """Configuration model describing a pivot operation."""

    rows: List[str] = Field(
        default_factory=list, description="Row dimension fields for the pivot"
    )
    columns: List[str] = Field(
        default_factory=list, description="Column dimension fields for the pivot"
    )
    values: List[PivotValueConfig] = Field(
        default_factory=list, description="Metrics to compute in the pivot"
    )
    include_subtotals: bool = Field(
        False, description="Whether subtotal rows/columns should be included"
    )
    include_grand_totals: bool = Field(
        False, description="Whether grand total rows/columns should be included"
    )
    manual_column_values: Optional[List[str]] = Field(
        None,
        description="Optional explicit list of column dimension values to enforce ordering",
    )
    strategy: Optional[Literal["auto", "extension", "native"]] = Field(
        "native",
        description="Pivot strategy preference: auto|extension|native (native requires manual_column_values)",
    )
    column_value_limit: Optional[int] = Field(
        None,
        description="Optional max number of distinct values allowed for the first column dimension",
    )

    @model_validator(mode="after")
    def validate_pivot_config(self):
        if not self.rows and not self.columns:
            raise ValueError("Pivot configuration requires at least one dimension")

        if not self.values:
            raise ValueError("Pivot configuration must include at least one value")

        self.rows = [value.strip() for value in self.rows if value and value.strip()]
        self.columns = [
            value.strip() for value in self.columns if value and value.strip()
        ]

        if self.manual_column_values is not None:
            cleaned_values = []
            for value in self.manual_column_values:
                if value is None:
                    continue
                value_str = str(value).strip()
                if value_str:
                    cleaned_values.append(value_str)
            self.manual_column_values = cleaned_values or None

        # Validate column_value_limit
        if self.column_value_limit is not None:
            if (
                not isinstance(self.column_value_limit, int)
                or self.column_value_limit <= 0
            ):
                raise ValueError(
                    "column_value_limit must be a positive integer if provided"
                )

        return self


class ResolvedTypeCast(BaseModel):
    """用户确认的类型转换设置"""

    column: str = Field(..., description="目标列名")
    cast: str = Field(..., description="TRY_CAST 目标类型表达式")
    table: Optional[str] = Field(None, description="所属表，可选")


class VisualQueryConfig(BaseModel):
    """Pivot base-query configuration (table, filters, optional limit)."""

    table_name: str = Field(..., description="Name of the table to query")
    filters: List[FilterConfig] = Field(
        default_factory=list, description="List of filter configurations"
    )
    limit: Optional[int] = Field(None, description="Maximum number of rows to return")

    @field_validator("table_name")
    @classmethod
    def validate_table_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Table name cannot be empty")
        return v.strip()

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Limit must be a positive integer")
        return v


class VisualQueryRequest(BaseModel):
    """Request model for visual query generation"""

    config: VisualQueryConfig = Field(..., description="Visual query configuration")
    pivot_config: PivotConfig = Field(..., description="Pivot configuration")
    resolved_casts: List[ResolvedTypeCast] = Field(
        default_factory=list, description="可视化查询生成时应用的 TRY_CAST 设置"
    )
    attach_databases: Optional[List[AttachDatabase]] = Field(
        None, description="联邦透视/预览需 ATTACH 的外部库"
    )


class ColumnStatistics(BaseModel):
    """Statistics for a column"""

    column_name: str = Field(..., description="Name of the column")
    data_type: str = Field(..., description="Data type of the column")
    null_count: int = Field(..., description="Number of null values")
    distinct_count: int = Field(..., description="Number of distinct values")
    min_value: Optional[Union[str, int, float]] = Field(
        None, description="Minimum value"
    )
    max_value: Optional[Union[str, int, float]] = Field(
        None, description="Maximum value"
    )
    avg_value: Optional[float] = Field(
        None, description="Average value (for numeric columns)"
    )
    sample_values: List[str] = Field(default_factory=list, description="Sample values")


class TableMetadata(BaseModel):
    """Metadata for a table"""

    table_name: str = Field(..., description="Name of the table")
    row_count: int = Field(..., description="Total number of rows")
    column_count: int = Field(..., description="Number of columns")
    columns: List[ColumnStatistics] = Field(..., description="Column statistics")


class PreviewRequest(BaseModel):
    """Request model for data preview"""

    config: VisualQueryConfig = Field(..., description="Visual query configuration")
    pivot_config: PivotConfig = Field(..., description="Pivot configuration")
    limit: Optional[int] = Field(
        None, description="Number of rows to preview (default from config)"
    )
    resolved_casts: List[ResolvedTypeCast] = Field(
        default_factory=list, description="预览阶段应用的 TRY_CAST 设置"
    )
    attach_databases: Optional[List[AttachDatabase]] = Field(
        None, description="联邦预览需 ATTACH 的外部库"
    )


# ==================== 集合操作相关模型 ====================


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
        # 移除空字符串并去除空白
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
        """验证操作配置"""
        operation_type = self.operation_type
        use_by_name = self.use_by_name
        tables = self.tables

        # 验证BY NAME模式
        if use_by_name:
            if operation_type not in [
                SetOperationType.UNION,
                SetOperationType.UNION_ALL,
            ]:
                raise ValueError("Only UNION and UNION ALL support BY NAME mode")

        # 验证列兼容性（非BY NAME模式）
        if not use_by_name:
            self._validate_column_compatibility(tables)

        return self

    def _validate_column_compatibility(self, tables: List[TableConfig]):
        """验证列兼容性（位置模式）"""
        if not tables:
            return

        first_table = tables[0]
        first_columns = first_table.selected_columns or []

        for i, table in enumerate(tables[1:], 1):
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
        """验证请求"""
        config = self.config

        # 验证表数量
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


# 集合操作中文标签映射
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
