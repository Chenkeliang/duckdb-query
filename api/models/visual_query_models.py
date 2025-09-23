"""
Visual Query Models

Pydantic models for visual query configuration and validation.
Supports Chinese display labels and comprehensive validation logic.
"""

from typing import List, Optional, Dict, Any, Union, Literal
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


class SortDirection(str, Enum):
    """Sort directions"""
    ASC = "ASC"
    DESC = "DESC"


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
    function: AggregationFunction = Field(..., description="Aggregation function to apply")
    alias: Optional[str] = Field(None, description="Optional alias for the result")
    
    @field_validator('column')
    @classmethod
    def validate_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()
    
    @field_validator('alias')
    @classmethod
    def validate_alias(cls, v):
        if v is not None and not v.strip():
            raise ValueError("Alias cannot be empty string")
        return v.strip() if v else None


class FilterConfig(BaseModel):
    """Configuration for filter conditions"""
    column: str = Field(..., description="Column name to filter")
    operator: FilterOperator = Field(..., description="Filter operator")
    value: Optional[Union[str, int, float]] = Field(None, description="Filter value")
    value2: Optional[Union[str, int, float]] = Field(None, description="Second value for BETWEEN operator")
    logic_operator: LogicOperator = Field(LogicOperator.AND, description="Logic operator for combining with other filters")
    
    @field_validator('column')
    @classmethod
    def validate_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()
    
    @model_validator(mode='after')
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
            if value is None:
                raise ValueError(f"Operator {operator} requires a value")
        
        return self


class SortConfig(BaseModel):
    """Configuration for sorting"""
    column: str = Field(..., description="Column name to sort by")
    direction: SortDirection = Field(SortDirection.ASC, description="Sort direction")
    priority: int = Field(0, description="Sort priority (lower numbers have higher priority)")
    
    @field_validator('column')
    @classmethod
    def validate_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()
    
    @field_validator('priority')
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
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Field name cannot be empty")
        return v.strip()
    
    @field_validator('expression')
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
    
    @field_validator('column')
    @classmethod
    def validate_column(cls, v):
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty")
        return v.strip()
    
    @field_validator('result')
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
    conditions: Optional[List[ConditionalCondition]] = Field(None, description="List of conditions")
    default_value: Optional[str] = Field(None, description="Default value when no conditions match")
    
    # For binning type
    column: Optional[str] = Field(None, description="Column to bin (for binning type)")
    bins: Optional[int] = Field(None, description="Number of bins (for binning type)")
    binning_type: Optional[str] = Field(None, description="Type of binning")
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Field name cannot be empty")
        return v.strip()
    
    @model_validator(mode='after')
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


class VisualQueryConfig(BaseModel):
    """Main configuration for visual query"""
    table_name: str = Field(..., description="Name of the table to query")
    selected_columns: List[str] = Field(default_factory=list, description="List of selected columns")
    aggregations: List[AggregationConfig] = Field(default_factory=list, description="List of aggregation configurations")
    calculated_fields: List[CalculatedFieldConfig] = Field(default_factory=list, description="List of calculated fields")
    conditional_fields: List[ConditionalFieldConfig] = Field(default_factory=list, description="List of conditional fields")
    filters: List[FilterConfig] = Field(default_factory=list, description="List of filter configurations")
    group_by: List[str] = Field(default_factory=list, description="List of columns to group by")
    order_by: List[SortConfig] = Field(default_factory=list, description="List of sort configurations")
    limit: Optional[int] = Field(None, description="Maximum number of rows to return")
    is_distinct: bool = Field(False, description="Whether to return distinct rows only")
    
    @field_validator('table_name')
    @classmethod
    def validate_table_name(cls, v):
        if not v or not v.strip():
            raise ValueError("Table name cannot be empty")
        return v.strip()
    
    @field_validator('selected_columns')
    @classmethod
    def validate_selected_columns(cls, v):
        # Remove empty strings and strip whitespace
        return [col.strip() for col in v if col and col.strip()]
    
    @field_validator('group_by')
    @classmethod
    def validate_group_by(cls, v):
        # Remove empty strings and strip whitespace
        return [col.strip() for col in v if col and col.strip()]
    
    @field_validator('limit')
    @classmethod
    def validate_limit(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Limit must be a positive integer")
        return v
    
    @model_validator(mode='after')
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


class VisualQueryRequest(BaseModel):
    """Request model for visual query generation"""
    config: VisualQueryConfig = Field(..., description="Visual query configuration")
    preview: bool = Field(False, description="Whether this is a preview request")
    include_metadata: bool = Field(True, description="Whether to include query metadata")


class VisualQueryResponse(BaseModel):
    """Response model for visual query generation"""
    success: bool = Field(..., description="Whether the operation was successful")
    sql: Optional[str] = Field(None, description="Generated SQL query")
    errors: List[str] = Field(default_factory=list, description="List of error messages")
    warnings: List[str] = Field(default_factory=list, description="List of warning messages")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Query metadata")


class ColumnStatistics(BaseModel):
    """Statistics for a column"""
    column_name: str = Field(..., description="Name of the column")
    data_type: str = Field(..., description="Data type of the column")
    null_count: int = Field(..., description="Number of null values")
    distinct_count: int = Field(..., description="Number of distinct values")
    min_value: Optional[Union[str, int, float]] = Field(None, description="Minimum value")
    max_value: Optional[Union[str, int, float]] = Field(None, description="Maximum value")
    avg_value: Optional[float] = Field(None, description="Average value (for numeric columns)")
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
    limit: int = Field(10, description="Number of rows to preview")


class PreviewResponse(BaseModel):
    """Response model for data preview"""
    success: bool = Field(..., description="Whether the operation was successful")
    data: Optional[List[Dict[str, Any]]] = Field(None, description="Preview data")
    row_count: Optional[int] = Field(None, description="Total number of rows that would be returned")
    estimated_time: Optional[float] = Field(None, description="Estimated execution time in seconds")
    errors: List[str] = Field(default_factory=list, description="List of error messages")
    warnings: List[str] = Field(default_factory=list, description="List of warning messages")


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
    AggregationFunction.LAST_VALUE: "末值"
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
    FilterOperator.BETWEEN: "介于...之间"
}

LOGIC_OPERATOR_LABELS = {
    LogicOperator.AND: "且",
    LogicOperator.OR: "或"
}

SORT_DIRECTION_LABELS = {
    SortDirection.ASC: "升序",
    SortDirection.DESC: "降序"
}