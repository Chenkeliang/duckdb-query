"""
Visual Query Models

Pydantic models for visual query configuration and validation.
Supports Chinese display labels and comprehensive validation logic.
"""

from typing import List, Optional, Dict, Any, Union, Literal, ClassVar, Set
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum


class AggregationFunction(str, Enum):
    """Supported aggregation functions"""

    # Basic aggregation functions
    SUM = "SUM"
    AVG = "AVG"
    COUNT = "COUNT"
    MIN = "MIN"
    MAX = "MAX"
    COUNT_DISTINCT = "COUNT_DISTINCT"

    # Statistical functions
    MEDIAN = "MEDIAN"
    MODE = "MODE"
    STDDEV_SAMP = "STDDEV_SAMP"
    VAR_SAMP = "VAR_SAMP"
    PERCENTILE_CONT_25 = "PERCENTILE_CONT_25"
    PERCENTILE_CONT_75 = "PERCENTILE_CONT_75"
    PERCENTILE_DISC_25 = "PERCENTILE_DISC_25"
    PERCENTILE_DISC_75 = "PERCENTILE_DISC_75"

    # Window functions
    ROW_NUMBER = "ROW_NUMBER"
    RANK = "RANK"
    DENSE_RANK = "DENSE_RANK"
    PERCENT_RANK = "PERCENT_RANK"
    CUME_DIST = "CUME_DIST"

    # Trend analysis functions
    SUM_OVER = "SUM_OVER"
    AVG_OVER = "AVG_OVER"
    LAG = "LAG"
    LEAD = "LEAD"
    FIRST_VALUE = "FIRST_VALUE"
    LAST_VALUE = "LAST_VALUE"


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


class SortDirection(str, Enum):
    """Sort directions"""

    ASC = "ASC"
    DESC = "DESC"


class VisualQueryMode(str, Enum):
    """Modes supported by the visual analysis workflow"""

    REGULAR = "regular"
    PIVOT = "pivot"


class CalculatedFieldType(str, Enum):
    """Types of calculated fields"""

    MATHEMATICAL = "mathematical"
    DATE = "date"
    STRING = "string"


class ConditionalFieldType(str, Enum):
    """Types of conditional fields"""

    CONDITIONAL = "conditional"
    BINNING = "binning"


class AggregationConfig(BaseModel):
    """Configuration for aggregation functions"""

    column: str = Field(..., description="Column name to aggregate")
    function: AggregationFunction = Field(
        ..., description="Aggregation function to apply"
    )
    alias: Optional[str] = Field(None, description="Optional alias for the result")

    @field_validator("column")
    @classmethod
    def validate_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()

    @field_validator("alias")
    @classmethod
    def validate_alias(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Alias cannot be empty string")
        return v.strip() if v else None


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
                    f"Operator {self.operator.value} 不支持列对列比较"
                )
            if not self.column or not str(self.column).strip():
                raise ValueError("Column comparison requires column")
        elif value_type == FilterValueType.EXPRESSION:
            if not self.expression or not str(self.expression).strip():
                raise ValueError("Expression comparison requires expression text")
            if self.operator in {FilterOperator.IS_NULL, FilterOperator.IS_NOT_NULL}:
                raise ValueError("IS NULL / IS NOT NULL 不支持表达式类型")
            if self.operator == FilterOperator.BETWEEN:
                raise ValueError("BETWEEN 不支持表达式比较")
            # 表达式可以在没有 column 的情况下直接使用
        else:
            # CONSTANT
            if not self.column or not str(self.column).strip():
                raise ValueError("Constant comparison requires column name")

        return self


class SortConfig(BaseModel):
    """Configuration for sorting"""

    column: str = Field(..., description="Column name to sort by")
    direction: SortDirection = Field(SortDirection.ASC, description="Sort direction")
    priority: int = Field(
        0, description="Sort priority (lower numbers have higher priority)"
    )

    @field_validator("column")
    @classmethod
    def validate_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v):
        if v < 0:
            raise ValueError("Priority cannot be negative")
        return v


class CalculatedFieldConfig(BaseModel):
    """Configuration for calculated fields"""

    id: str = Field(..., description="Unique identifier for the field")
    name: str = Field(..., description="Name of the calculated field")
    expression: str = Field(..., description="SQL expression for the calculation")
    type: CalculatedFieldType = Field(..., description="Type of calculation")
    operation: str = Field(..., description="Specific operation within the type")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Field name cannot be empty")
        return v.strip()

    @field_validator("expression")
    @classmethod
    def validate_expression(cls, v):
        if not v or not v.strip():
            raise ValueError("Expression cannot be empty")
        return v.strip()


class ConditionalCondition(BaseModel):
    """Single condition for conditional fields"""

    column: str = Field(..., description="Column name for the condition")
    operator: FilterOperator = Field(..., description="Condition operator")
    value: Optional[Union[str, int, float]] = Field(None, description="Condition value")
    result: str = Field(..., description="Result value when condition is true")

    @field_validator("column")
    @classmethod
    def validate_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()

    @field_validator("result")
    @classmethod
    def validate_result(cls, v):
        if not v or not v.strip():
            raise ValueError("Result value cannot be empty")
        return v.strip()


class ConditionalFieldConfig(BaseModel):
    """Configuration for conditional fields"""

    id: str = Field(..., description="Unique identifier for the field")
    name: str = Field(..., description="Name of the conditional field")
    type: ConditionalFieldType = Field(..., description="Type of conditional field")

    # For conditional type
    conditions: Optional[List[ConditionalCondition]] = Field(
        None, description="List of conditions"
    )
    default_value: Optional[str] = Field(
        None, description="Default value when no conditions match"
    )

    # For binning type
    column: Optional[str] = Field(None, description="Column to bin (for binning type)")
    bins: Optional[int] = Field(None, description="Number of bins (for binning type)")
    binning_type: Optional[str] = Field(None, description="Type of binning")

    @field_validator("name")
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Field name cannot be empty")
        return v.strip()

    @model_validator(mode="after")
    def validate_conditional_config(self):
        field_type = self.type

        if field_type == ConditionalFieldType.CONDITIONAL:
            conditions = self.conditions
            if not conditions or len(conditions) == 0:
                raise ValueError("Conditional fields must have at least one condition")
        elif field_type == ConditionalFieldType.BINNING:
            column = self.column
            bins = self.bins
            if not column or not column.strip():
                raise ValueError("Binning fields must specify a column")
            if not bins or bins < 2:
                raise ValueError("Binning fields must have at least 2 bins")

        return self


class PivotValueAxis(str, Enum):
    """Axis placement for pivot values."""

    ROWS = "rows"
    COLUMNS = "columns"


class PivotValueConfig(BaseModel):
    """Configuration for a single pivot value metric."""

    column: str = Field(..., description="Column to aggregate for the pivot value")
    aggregation: AggregationFunction = Field(
        ..., description="Aggregation function applied to the column"
    )
    alias: Optional[str] = Field(
        None, description="Alias for the pivoted metric column"
    )
    display_name: Optional[str] = Field(
        None, description="Optional display label for UI presentation"
    )
    value_format: Optional[str] = Field(
        None, description="Optional formatting key used by the UI"
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
    value_axis: PivotValueAxis = Field(
        PivotValueAxis.COLUMNS,
        description="Which axis should display value labels when the extension supports it",
    )
    fill_value: Optional[Union[int, float, str]] = Field(
        None, description="Value used to fill null cells in the pivot output"
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


class JSONTableColumnConfig(BaseModel):
    """Definition of a column emitted by JSON_TABLE."""

    name: str = Field(..., description="Result column alias exposed to the query")
    path: Optional[str] = Field(
        None, description="JSON path used to extract this column's value"
    )
    data_type: str = Field(
        "VARCHAR", description="DuckDB data type assigned to the extracted column"
    )
    default: Optional[str] = Field(
        None, description="Optional default literal when the JSON path is absent"
    )
    ordinal: bool = Field(
        False,
        description="Emit FOR ORDINALITY column instead of extracting from a path",
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("JSON_TABLE column name cannot be empty")
        return value.strip()

    @field_validator("data_type")
    @classmethod
    def normalize_type(cls, value: str) -> str:
        if not value or not value.strip():
            return "VARCHAR"
        return value.strip().upper()

    @field_validator("path")
    @classmethod
    def normalize_path(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class JSONTableConfig(BaseModel):
    """Configuration describing a JSON_TABLE lateral join."""

    source_column: str = Field(
        ..., description="Column/expression containing the JSON payload"
    )
    alias: Optional[str] = Field(
        None, description="Alias assigned to the expanded JSON_TABLE"
    )
    root_path: Optional[str] = Field(
        "$", description="Root JSON path enumerated into rows"
    )
    outer_join: bool = Field(
        True, description="LEFT JOIN (True) or INNER JOIN (False) the JSON table"
    )
    columns: List[JSONTableColumnConfig] = Field(
        default_factory=list, description="Column definitions emitted from JSON_TABLE"
    )

    @field_validator("source_column")
    @classmethod
    def validate_source_column(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("JSON_TABLE source column cannot be empty")
        return value.strip()

    @field_validator("alias")
    @classmethod
    def normalize_alias(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None

    @field_validator("root_path")
    @classmethod
    def normalize_root_path(cls, value: Optional[str]) -> str:
        if value is None:
            return "$"
        cleaned = value.strip()
        return cleaned or "$"

    @model_validator(mode="after")
    def validate_columns(self):
        if not self.columns:
            raise ValueError("JSON_TABLE 配置必须至少包含一个列定义")
        return self


class ColumnProfilePayload(BaseModel):
    """前端回传的列类型信息"""

    name: str = Field(..., description="列名")
    duckdb_type: Optional[str] = Field(None, description="DuckDB 推断类型")
    raw_type: Optional[str] = Field(None, description="前端原始类型描述")
    normalized_type: Optional[str] = Field(None, description="前端归一化类型")
    precision: Optional[int] = Field(None, description="数值精度")
    scale: Optional[int] = Field(None, description="数值小数位")


class ResolvedTypeCast(BaseModel):
    """用户确认的类型转换设置"""

    column: str = Field(..., description="目标列名")
    cast: str = Field(..., description="TRY_CAST 目标类型表达式")
    table: Optional[str] = Field(None, description="所属表，可选")


class ColumnTypeReference(BaseModel):
    """类型冲突报告中的列引用"""

    table: Optional[str] = Field(None, description="表名")
    column: str = Field(..., description="列名")
    duckdb_type: Optional[str] = Field(None, description="DuckDB 类型")
    normalized_type: Optional[str] = Field(None, description="归一化类型")


class TypeConflictModel(BaseModel):
    """类型冲突描述"""

    operation: Literal["aggregation", "join", "filter"] = Field(
        ..., description="冲突所属操作"
    )
    message: str = Field(..., description="提示信息")
    left: ColumnTypeReference = Field(..., description="主要列信息")
    right: Optional[ColumnTypeReference] = Field(
        None, description="对端列信息（JOIN 时使用）"
    )
    function: Optional[str] = Field(None, description="相关函数或操作符")
    recommended_casts: List[str] = Field(
        default_factory=list, description="推荐的 TRY_CAST 选项"
    )
    severity: Literal["error", "warning"] = Field(
        "error", description="冲突严重程度"
    )


class VisualQueryConfig(BaseModel):
    """Main configuration for visual query"""

    table_name: str = Field(..., description="Name of the table to query")
    selected_columns: List[str] = Field(
        default_factory=list, description="List of selected columns"
    )
    aggregations: List[AggregationConfig] = Field(
        default_factory=list, description="List of aggregation configurations"
    )
    calculated_fields: List[CalculatedFieldConfig] = Field(
        default_factory=list, description="List of calculated fields"
    )
    conditional_fields: List[ConditionalFieldConfig] = Field(
        default_factory=list, description="List of conditional fields"
    )
    filters: List[FilterConfig] = Field(
        default_factory=list, description="List of filter configurations"
    )
    having: List[FilterConfig] = Field(
        default_factory=list, description="List of HAVING filter configurations"
    )
    group_by: List[str] = Field(
        default_factory=list, description="List of columns to group by"
    )
    order_by: List[SortConfig] = Field(
        default_factory=list, description="List of sort configurations"
    )
    limit: Optional[int] = Field(None, description="Maximum number of rows to return")
    is_distinct: bool = Field(False, description="Whether to return distinct rows only")
    json_tables: List[JSONTableConfig] = Field(
        default_factory=list,
        description="Optional JSON_TABLE expansions applied before aggregation",
    )

    @field_validator("table_name")
    @classmethod
    def validate_table_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Table name cannot be empty")
        return v.strip()

    @field_validator("selected_columns", mode="before")
    @classmethod
    def coerce_selected_columns(cls, v):
        """Accept either list[str] or list[object] and coerce to list[str].
        Object items may look like {name, column, id, ...} coming from UI.
        """
        if v is None:
            return []
        result: List[str] = []
        for item in v:
            if isinstance(item, str):
                candidate = item.strip()
            elif isinstance(item, dict):
                candidate = str(
                    item.get("name") or item.get("column") or item.get("id") or ""
                ).strip()
            else:
                candidate = str(item).strip()
            if candidate:
                result.append(candidate)
        return result

    @field_validator("group_by")
    @classmethod
    def validate_group_by(cls, v):
        # Remove empty strings and strip whitespace
        return [col.strip() for col in v if col and col.strip()]

    @field_validator("limit")
    @classmethod
    def validate_limit(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Limit must be a positive integer")
        return v

    @model_validator(mode="after")
    def validate_query_logic(self):
        """Validate the overall query logic"""
        aggregations = self.aggregations
        selected_columns = self.selected_columns
        group_by = self.group_by

        # If we have aggregations and selected columns, we need group by
        if aggregations and selected_columns and not group_by:
            # Auto-add selected columns to group by
            self.group_by = selected_columns.copy()

        return self


class VisualQueryValidationRequest(BaseModel):
    """可视化查询配置校验请求"""

    config: VisualQueryConfig = Field(..., description="可视化查询配置")
    column_profiles: List[ColumnProfilePayload] = Field(
        default_factory=list, description="前端收集的列类型信息"
    )
    resolved_casts: List[ResolvedTypeCast] = Field(
        default_factory=list, description="用户已确认的 TRY_CAST 设置"
    )


class VisualQueryValidationResponse(BaseModel):
    """可视化查询配置校验响应"""

    success: bool = Field(..., description="校验是否执行成功")
    is_valid: bool = Field(..., description="配置是否通过基础校验")
    errors: List[str] = Field(default_factory=list, description="错误信息")
    warnings: List[str] = Field(default_factory=list, description="警告信息")
    complexity_score: int = Field(..., description="复杂度评分")
    conflicts: List[TypeConflictModel] = Field(
        default_factory=list, description="类型冲突详情"
    )
    suggested_casts: Dict[str, List[str]] = Field(
        default_factory=dict, description="推荐的类型转换选项"
    )


class VisualQueryRequest(BaseModel):
    """Request model for visual query generation"""

    config: VisualQueryConfig = Field(..., description="Visual query configuration")
    pivot_config: Optional["PivotConfig"] = Field(
        None, description="Optional pivot configuration when mode is pivot"
    )
    mode: VisualQueryMode = Field(
        VisualQueryMode.REGULAR, description="Visual analysis mode"
    )
    preview: bool = Field(False, description="Whether this is a preview request")
    include_metadata: bool = Field(
        True, description="Whether to include query metadata"
    )
    resolved_casts: List[ResolvedTypeCast] = Field(
        default_factory=list, description="可视化查询生成时应用的 TRY_CAST 设置"
    )


class VisualQueryResponse(BaseModel):
    """Response model for visual query generation"""

    success: bool = Field(..., description="Whether the operation was successful")
    sql: Optional[str] = Field(None, description="Generated SQL query")
    base_sql: Optional[str] = Field(
        None, description="Base SQL prior to any pivot transformation"
    )
    pivot_sql: Optional[str] = Field(
        None, description="SQL fragment representing the pivot transformation"
    )
    errors: List[str] = Field(
        default_factory=list, description="List of error messages"
    )
    warnings: List[str] = Field(
        default_factory=list, description="List of warning messages"
    )
    metadata: Optional[Dict[str, Any]] = Field(None, description="Query metadata")
    mode: VisualQueryMode = Field(
        VisualQueryMode.REGULAR, description="Executed visual analysis mode"
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
    pivot_config: Optional[PivotConfig] = Field(
        None, description="Optional pivot configuration when previewing pivot mode"
    )
    mode: VisualQueryMode = Field(
        VisualQueryMode.REGULAR, description="Visual analysis mode"
    )
    limit: Optional[int] = Field(
        None, description="Number of rows to preview (default from config)"
    )
    resolved_casts: List[ResolvedTypeCast] = Field(
        default_factory=list, description="预览阶段应用的 TRY_CAST 设置"
    )


class PreviewResponse(BaseModel):
    """Response model for data preview"""

    success: bool = Field(..., description="Whether the operation was successful")
    data: Optional[List[Dict[str, Any]]] = Field(None, description="Preview data")
    columns: Optional[List[str]] = Field(
        None, description="List of columns returned in the preview"
    )
    row_count: Optional[int] = Field(
        None, description="Total number of rows that would be returned"
    )
    estimated_time: Optional[float] = Field(
        None, description="Estimated execution time in seconds"
    )
    sql: Optional[str] = Field(None, description="Executed SQL query")
    base_sql: Optional[str] = Field(
        None, description="Base SQL prior to pivot transformation"
    )
    pivot_sql: Optional[str] = Field(
        None, description="SQL fragment representing the pivot transformation"
    )
    mode: VisualQueryMode = Field(
        VisualQueryMode.REGULAR, description="Mode used for preview generation"
    )
    errors: List[str] = Field(
        default_factory=list, description="List of error messages"
    )
    warnings: List[str] = Field(
        default_factory=list, description="List of warning messages"
    )


# Chinese display labels mapping
AGGREGATION_LABELS = {
    # Basic aggregation functions
    AggregationFunction.SUM: "求和",
    AggregationFunction.AVG: "平均值",
    AggregationFunction.COUNT: "计数",
    AggregationFunction.MIN: "最小值",
    AggregationFunction.MAX: "最大值",
    AggregationFunction.COUNT_DISTINCT: "去重计数",
    # Statistical functions
    AggregationFunction.MEDIAN: "中位数",
    AggregationFunction.MODE: "众数",
    AggregationFunction.STDDEV_SAMP: "标准差",
    AggregationFunction.VAR_SAMP: "方差",
    AggregationFunction.PERCENTILE_CONT_25: "第一四分位数",
    AggregationFunction.PERCENTILE_CONT_75: "第三四分位数",
    AggregationFunction.PERCENTILE_DISC_25: "第一四分位数(离散)",
    AggregationFunction.PERCENTILE_DISC_75: "第三四分位数(离散)",
    # Window functions
    AggregationFunction.ROW_NUMBER: "行号",
    AggregationFunction.RANK: "排名",
    AggregationFunction.DENSE_RANK: "密集排名",
    AggregationFunction.PERCENT_RANK: "百分比排名",
    AggregationFunction.CUME_DIST: "累积分布",
    # Trend analysis functions
    AggregationFunction.SUM_OVER: "累计求和",
    AggregationFunction.AVG_OVER: "移动平均",
    AggregationFunction.LAG: "前一行值",
    AggregationFunction.LEAD: "后一行值",
    AggregationFunction.FIRST_VALUE: "首值",
    AggregationFunction.LAST_VALUE: "末值",
}

FILTER_OPERATOR_LABELS = {
    FilterOperator.EQUAL: "等于",
    FilterOperator.NOT_EQUAL: "不等于",
    FilterOperator.GREATER_THAN: "大于",
    FilterOperator.LESS_THAN: "小于",
    FilterOperator.GREATER_EQUAL: "大于等于",
    FilterOperator.LESS_EQUAL: "小于等于",
    FilterOperator.LIKE: "包含",
    FilterOperator.ILIKE: "包含(忽略大小写)",
    FilterOperator.IS_NULL: "为空",
    FilterOperator.IS_NOT_NULL: "不为空",
    FilterOperator.BETWEEN: "介于...之间",
}

LOGIC_OPERATOR_LABELS = {LogicOperator.AND: "且", LogicOperator.OR: "或"}

SORT_DIRECTION_LABELS = {SortDirection.ASC: "升序", SortDirection.DESC: "降序"}


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
            raise ValueError("源列名不能为空")
        return v.strip()

    @field_validator("target_column")
    @classmethod
    def validate_target_column(cls, v):
        if not v or not v.strip():
            raise ValueError("目标列名不能为空")
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
            raise ValueError("表名不能为空")
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
            raise ValueError("别名不能为空字符串")
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
            raise ValueError("集合操作至少需要两个表")
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
                raise ValueError("只有UNION和UNION ALL支持BY NAME模式")

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
                    f"表 {table.table_name} 的列数量({len(table_columns)}) "
                    f"与第一个表 {first_table.table_name} 的列数量({len(first_columns)})不匹配"
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
            raise ValueError("集合操作至少需要两个表")

        if len(config.tables) > 10:
            raise ValueError("集合操作最多支持10个表")

        return self


class SetOperationResponse(BaseModel):
    """集合操作响应模型"""

    success: bool = Field(..., description="操作是否成功")
    sql: Optional[str] = Field(None, description="生成的SQL查询")
    errors: List[str] = Field(default_factory=list, description="错误信息列表")
    warnings: List[str] = Field(default_factory=list, description="警告信息列表")
    metadata: Optional[Dict[str, Any]] = Field(None, description="查询元数据")
    estimated_rows: Optional[int] = Field(None, description="预估结果行数")


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
            raise ValueError("至少需要两个表")
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


class QueryType(str, Enum):
    """查询类型枚举"""

    SINGLE_TABLE = "single_table"  # 单表查询
    MULTI_TABLE_JOIN = "multi_table_join"  # 多表JOIN
    SET_OPERATION = "set_operation"  # 集合操作
    VISUAL_ANALYSIS = "visual_analysis"  # 数据分析
    CUSTOM_SQL = "custom_sql"  # 自定义SQL


class UniversalExportRequest(BaseModel):
    """通用导出请求模型"""

    query_type: QueryType = Field(..., description="查询类型")
    sql_query: str = Field(..., description="原始SQL查询")
    format: Literal["excel", "csv", "parquet"] = Field(..., description="导出格式")
    filename: Optional[str] = Field(None, description="自定义文件名（可选）")

    # 可选参数，根据查询类型使用
    original_datasource: Optional[Dict[str, Any]] = Field(
        None, description="原始数据源信息"
    )
    set_operation_config: Optional[SetOperationConfig] = Field(
        None, description="集合操作配置"
    )
    visual_analysis_config: Optional[VisualQueryConfig] = Field(
        None, description="数据分析配置"
    )

    # 备用数据（当SQL无法执行时使用）
    fallback_data: Optional[List[Dict[str, Any]]] = Field(None, description="备用数据")
    fallback_columns: Optional[List[str]] = Field(None, description="备用列信息")
