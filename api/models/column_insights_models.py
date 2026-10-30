"""Read-only table insight configuration."""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from models.pivot_query_models import FilterConfig
from models.query_models import AttachDatabase

Aggregation = Literal["COUNT_ROWS", "COUNT", "COUNT_DISTINCT", "SUM", "AVG", "MIN", "MAX"]
ExtractionType = Literal["VARCHAR", "BIGINT", "DOUBLE", "BOOLEAN", "DATE", "TIMESTAMP", "JSON"]


class InsightTableRequest(BaseModel):
    """Identify one local or attached table."""

    table_name: str = Field(min_length=1, max_length=1024)
    attach_databases: list[AttachDatabase] = Field(default_factory=list, max_length=1)


class JsonPathsRequest(InsightTableRequest):
    """Discover bounded paths from actual column values."""

    column: str = Field(min_length=1, max_length=1024)
    filters: list[FilterConfig] = Field(default_factory=list, max_length=20)


class InsightMetric(BaseModel):
    """One aggregate selected by the user."""

    column: str | None = None
    aggregation: Aggregation
    alias: str = Field(min_length=1, max_length=256)


class JsonExtraction(BaseModel):
    """One JSON Pointer projected as a typed column."""

    column: str = Field(min_length=1, max_length=1024)
    pointer: str = Field(max_length=4096)
    target_type: ExtractionType = "VARCHAR"
    alias: str = Field(min_length=1, max_length=256)


class InsightQueryRequest(InsightTableRequest):
    """Generate either metrics or JSON projection, never execute it."""

    metrics: list[InsightMetric] = Field(default_factory=list, max_length=16)
    extractions: list[JsonExtraction] = Field(default_factory=list, max_length=16)
    filters: list[FilterConfig] = Field(default_factory=list, max_length=20)
    keep_original: bool = True

    @model_validator(mode="after")
    def require_one_operation(self):
        """Require exactly one nonempty operation."""
        if bool(self.metrics) == bool(self.extractions):
            raise ValueError("Choose either metrics or JSON extractions")
        return self
