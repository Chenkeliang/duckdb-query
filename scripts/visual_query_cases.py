"""
Visual query SQL regression script.

Generates representative WHERE / HAVING / Group By / Calculated-field
configurations, produces SQL through the backend generator, executes the SQL
against a DuckDB in-memory dataset, and validates the results.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Iterable, List, Sequence, Tuple

import duckdb

# Ensure api/ modules can be imported when the script is run directly
REPO_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = REPO_ROOT / "api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from core.visual_query_generator import generate_sql_from_config
from models.visual_query_models import (
    AggregationConfig,
    CalculatedFieldConfig,
    CalculatedFieldType,
    ConditionalCondition,
    ConditionalFieldConfig,
    ConditionalFieldType,
    FilterConfig,
    FilterOperator,
    FilterValueType,
    LogicOperator,
    SortConfig,
    SortDirection,
    VisualQueryConfig,
)


DATA_ROWS = [
    (1, "华东", "A", 1200.0, 800.0, 1000.0, "REFUND"),
    (2, "华东", "B", 400.0, 300.0, 500.0, "COMPLETED"),
    (3, "华南", "A", 600.0, 650.0, 700.0, "REFUND"),
    (4, "华北", "A", 900.0, 400.0, 600.0, "COMPLETED"),
    (5, "华南", "B", 300.0, 200.0, 400.0, "COMPLETED"),
    (6, "华北", "B", 1500.0, 1200.0, 1300.0, "REFUND"),
]


def make_base_config(**overrides: Any) -> VisualQueryConfig:
    base = dict(
        table_name="orders",
        selected_columns=["region"],
        aggregations=[AggregationConfig(column="amount", function="SUM", alias="total_amount")],
        filters=[],
        having=[],
        group_by=["region"],
        order_by=[],
        limit=None,
        calculated_fields=[],
    )
    base.update(overrides)
    return VisualQueryConfig(**base)


def canonicalize(rows: Iterable[Sequence[Any]]) -> List[Tuple[Any, ...]]:
    normalized = []
    for row in rows:
        normalized.append(
            tuple(float(value) if isinstance(value, (int, float)) else value for value in row)
        )
    return normalized


def prepare_connection() -> duckdb.DuckDBPyConnection:
    conn = duckdb.connect(database=":memory:")
    conn.execute(
        """
        CREATE TABLE orders (
            order_id INTEGER,
            region TEXT,
            category TEXT,
            amount DOUBLE,
            cost DOUBLE,
            budget DOUBLE,
            status TEXT
        )
        """
    )
    conn.executemany(
        "INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?)",
        DATA_ROWS,
    )
    return conn


def run_cases() -> None:
    conn = prepare_connection()

    cases = {
        "where_all_modes": make_base_config(
            filters=[
                FilterConfig(
                    column="region",
                    operator=FilterOperator.EQUAL,
                    value="华东",
                    value_type=FilterValueType.CONSTANT,
                ),
                FilterConfig(
                    column="amount",
                    operator=FilterOperator.GREATER_THAN,
                    value_type=FilterValueType.COLUMN,
                    right_column="cost",
                    logic_operator=LogicOperator.AND,
                ),
                FilterConfig(
                    column="amount",
                    operator=FilterOperator.LESS_EQUAL,
                    value_type=FilterValueType.EXPRESSION,
                    expression="(budget * 1.2)",
                    logic_operator=LogicOperator.AND,
                ),
            ]
        ),
        "having_constant": make_base_config(
            having=[
                FilterConfig(
                    column="total_amount",
                    operator=FilterOperator.GREATER_EQUAL,
                    value=1000,
                    value_type=FilterValueType.CONSTANT,
                )
            ]
        ),
        "having_column_logic": make_base_config(
            aggregations=[
                AggregationConfig(column="amount", function="SUM", alias="total_amount"),
                AggregationConfig(column="cost", function="SUM", alias="total_cost"),
            ],
            having=[
                FilterConfig(
                    column="total_amount",
                    operator=FilterOperator.GREATER_THAN,
                    value_type=FilterValueType.COLUMN,
                    right_column="total_cost",
                ),
                FilterConfig(
                    column="SUM(amount)",
                    operator=FilterOperator.BETWEEN,
                    value=500,
                    value2=2000,
                    value_type=FilterValueType.CONSTANT,
                    logic_operator=LogicOperator.OR,
                ),
            ],
        ),
        "having_expression": make_base_config(
            having=[
                FilterConfig(
                    column="SUM(amount)",
                    operator=FilterOperator.GREATER_EQUAL,
                    value_type=FilterValueType.EXPRESSION,
                    expression="(SELECT AVG(amount) FROM orders)",
                )
            ]
        ),
        "manual_group_by": make_base_config(
            selected_columns=["category"],
            group_by=["region", "category"],
            having=[
                FilterConfig(
                    column="SUM(amount)",
                    operator=FilterOperator.GREATER_EQUAL,
                    value=100,
                    value_type=FilterValueType.CONSTANT,
                )
            ],
        ),
        "calculated_field_usage": make_base_config(
            calculated_fields=[
                CalculatedFieldConfig(
                    id="amount_minus_cost",
                    name="amount_minus_cost",
                    expression="SUM(amount) - SUM(cost)",
                    type=CalculatedFieldType.MATHEMATICAL,
                    operation="combine",
                )
            ],
            having=[
                FilterConfig(
                    column="amount_minus_cost",
                    operator=FilterOperator.GREATER_THAN,
                    value=0,
                    value_type=FilterValueType.CONSTANT,
                )
            ],
            order_by=[
                SortConfig(column="amount_minus_cost", direction=SortDirection.DESC, priority=0)
            ],
        ),
        "calculated_field_multi_ops": make_base_config(
            calculated_fields=[
                CalculatedFieldConfig(
                    id="amount_plus_adjust",
                    name="amount_plus_adjust",
                    expression="SUM(amount) + SUM(cost) * 0.1",
                    type=CalculatedFieldType.MATHEMATICAL,
                    operation="combine",
                )
            ],
            order_by=[SortConfig(column="amount_plus_adjust", direction=SortDirection.DESC, priority=0)],
        ),
        "conditional_case_field": VisualQueryConfig(
            table_name="orders",
            selected_columns=["order_id", "region"],
            aggregations=[],
            calculated_fields=[],
            conditional_fields=[
                ConditionalFieldConfig(
                    id="refund_flag",
                    name="refund_flag",
                    type=ConditionalFieldType.CONDITIONAL,
                    conditions=[
                        ConditionalCondition(
                            column="status",
                            operator=FilterOperator.EQUAL,
                            value="REFUND",
                            result="Y",
                        )
                    ],
                    default_value="N",
                )
            ],
            filters=[],
            having=[],
            group_by=[],
            order_by=[],
            limit=None,
        ),
        "window_function_rank": VisualQueryConfig(
            table_name="orders",
            selected_columns=["order_id", "region"],
            aggregations=[],
            calculated_fields=[
                CalculatedFieldConfig(
                    id="amount_rank",
                    name="amount_rank",
                    expression="ROW_NUMBER() OVER (ORDER BY amount)",
                    type=CalculatedFieldType.MATHEMATICAL,
                    operation="window",
                )
            ],
            conditional_fields=[],
            filters=[],
            having=[],
            group_by=[],
            order_by=[SortConfig(column="amount_rank", direction=SortDirection.ASC, priority=0)],
            limit=None,
        ),
    }

    expected_results = {
        "where_all_modes": [("华东", 1600.0)],
        "having_constant": [("华东", 1600.0), ("华北", 2400.0)],
        "having_column_logic": [
            ("华东", 1600.0, 1100.0),
            ("华南", 900.0, 850.0),
            ("华北", 2400.0, 1600.0),
        ],
        "having_expression": [
            ("华东", 1600.0),
            ("华南", 900.0),
            ("华北", 2400.0),
        ],
        "manual_group_by": [
            ("A", 1200.0),
            ("B", 400.0),
            ("A", 600.0),
            ("B", 300.0),
            ("A", 900.0),
            ("B", 1500.0),
        ],
        "calculated_field_usage": [
            ("华北", 800.0, 2400.0),
            ("华东", 500.0, 1600.0),
            ("华南", 50.0, 900.0),
        ],
        "calculated_field_multi_ops": [
            ("华北", 2560.0, 2400.0),
            ("华东", 1710.0, 1600.0),
            ("华南", 985.0, 900.0),
        ],
        "conditional_case_field": [
            (1, "华东", "Y"),
            (2, "华东", "N"),
            (3, "华南", "Y"),
            (4, "华北", "N"),
            (5, "华南", "N"),
            (6, "华北", "Y"),
        ],
        "window_function_rank": [
            (1, "华东", 5.0),
            (2, "华东", 2.0),
            (3, "华南", 3.0),
            (4, "华北", 4.0),
            (5, "华南", 1.0),
            (6, "华北", 6.0),
        ],
    }

    order_sensitive = set()
    failures: List[str] = []

    for name, config in cases.items():
        sql = generate_sql_from_config(config)
        expected = expected_results[name]
        expected_rows = canonicalize(expected)

        result_rows = conn.execute(sql).fetchall()
        normalized_actual = canonicalize(result_rows)
        normalized_expected = canonicalize(expected)

        if name not in order_sensitive:
            normalized_actual.sort()
            normalized_expected.sort()

        print(f"== {name} ==")
        print("Generated SQL:")
        print(sql)
        print("Expected result rows:")
        for row in expected_rows:
            print("  ", row)
        print("Actual result rows:")
        for row in normalized_actual:
            print("  ", row)
        print("")

        if normalized_actual != normalized_expected:
            failures.append(
                f"{name}: result mismatch\n  expected={normalized_expected}\n  actual={normalized_actual}"
            )

    if failures:
        print("FAILURES:")
        for failure in failures:
            print(f" - {failure}")
        sys.exit(1)

    print("All visual query SQL scenarios passed.")


if __name__ == "__main__":
    run_cases()
