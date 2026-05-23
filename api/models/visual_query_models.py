"""
Pivot / visual-query API models (POST /api/visual-query/*).

Set-operation models live in ``set_operation_models.py``.
"""

# pylint: disable=no-member,duplicate-code,not-an-iterable,unused-variable
from enum import Enum
from typing import List, Optional, Dict, Union, Literal, ClassVar, Set
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


class VisualQueryMode(str, Enum):
    """Visual analysis modes (pivot Tab only)."""

    PIVOT = "pivot"


class FilterConfig(BaseModel):
    """Pivot filter: column, operator, and constant value(s)."""

    column: str = Field(..., description="Column name to filter")
    operator: FilterOperator = Field(..., description="Filter operator")
    value: Optional[Union[str, int, float]] = Field(None, description="Filter value")
    value2: Optional[Union[str, int, float]] = Field(
        None, description="Second value for BETWEEN operator"
    )
    logic_operator: LogicOperator = Field(
        LogicOperator.AND, description="Logic operator for combining with other filters"
    )

    @field_validator("column")
    @classmethod
    def validate_column(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()

    @model_validator(mode="after")
    def validate_filter_values(self):
        if self.operator in (FilterOperator.IS_NULL, FilterOperator.IS_NOT_NULL):
            return self
        if self.operator == FilterOperator.BETWEEN:
            if self.value is None or self.value2 is None:
                raise ValueError("BETWEEN operator requires both value and value2")
            return self
        if self.value is None:
            raise ValueError(f"Operator {self.operator} requires a value")
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
