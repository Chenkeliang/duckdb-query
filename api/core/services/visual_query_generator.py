# pylint: disable=duplicate-code
"""Backward-compatible exports for visual query, pivot, metadata, and set operations."""

from core.services.pivot_query_generator import (
    GeneratedVisualQuery,
    ValidationResult,
    generate_visual_query_sql,
    validate_query_config,
)
from core.services.table_metadata_service import (
    get_column_statistics,
    get_table_metadata,
)
from core.services.set_operation_generator import (
    SetOperationQueryGenerator,
    estimate_set_operation_rows,
    generate_set_operation_sql,
    set_operation_generator,
)
from core.services import pivot_query_generator as _pivot_module

# Test patches target the facade module name.
config_manager = _pivot_module.config_manager

__all__ = [
    "GeneratedVisualQuery",
    "ValidationResult",
    "generate_visual_query_sql",
    "validate_query_config",
    "get_column_statistics",
    "get_table_metadata",
    "SetOperationQueryGenerator",
    "estimate_set_operation_rows",
    "generate_set_operation_sql",
    "set_operation_generator",
]
