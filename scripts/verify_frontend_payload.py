"""
Quick verification script that mirrors the sanitisation logic used in
`VisualAnalysisPanel` when preparing payloads for validation/preview.

It demonstrates how column-vs-column and expression filters are transformed,
and prints the resulting payload along with the derived column profile list.
"""

from __future__ import annotations

from typing import Any, Dict, List


FILTER_COLUMN = {
    "column": "序号",
    "operator": "=",
    "value": None,
    "value2": None,
    "valueType": "column",
    "logicOperator": "AND",
    "rightColumn": "销售退货计划单",
}

FILTER_EXPRESSION = {
    "column": "货主",
    "operator": "=",
    "value": None,
    "value2": None,
    "valueType": "expression",
    "logicOperator": "AND",
    "expression": "\"卖家应退运费\" + \"实际应退金额\"",
}

TABLE_COLUMNS = [
    {"name": "序号"},
    {"name": "销售退货计划单"},
    {"name": "货主"},
    {"name": "卖家应退运费"},
    {"name": "实际应退金额"},
]


def extract_columns_from_expression(expr: str) -> List[str]:
    if not expr:
        return []
    result = []
    current = ""
    inside_quotes = False
    for char in expr:
        if char == '"':
            inside_quotes = not inside_quotes
            if not inside_quotes and current:
                result.append(current)
                current = ""
        elif inside_quotes:
            current += char
    if current:
        result.append(current)
    return result


def normalize_filter(filter_config: Dict[str, Any], available_columns: List[str]) -> Dict[str, Any]:
    value_type = (filter_config.get("valueType") or filter_config.get("value_type") or "constant").lower()
    normalized = {
        "column": filter_config.get("column"),
        "operator": filter_config.get("operator"),
        "value": filter_config.get("value"),
        "value2": filter_config.get("value2"),
        "valueType": value_type,
        "logicOperator": filter_config.get("logicOperator") or filter_config.get("logic_operator") or "AND",
        "rightColumn": filter_config.get("rightColumn") or filter_config.get("right_column") or "",
        "expression": filter_config.get("expression") or "",
    }

    candidates = [col for col in available_columns if col and col != normalized["column"]]

    if value_type == "column":
        if not normalized["rightColumn"] and candidates:
            normalized["rightColumn"] = candidates[0]
        normalized["value"] = normalized["rightColumn"] or None
        normalized["value2"] = None
        normalized["expression"] = ""
    elif value_type == "expression":
        expr = (normalized["expression"] or normalized["value"] or "") or ""
        expr = expr.strip()
        normalized["expression"] = expr
        normalized["value"] = expr or "0"
        normalized["value2"] = None
        normalized["rightColumn"] = ""
    else:
        if isinstance(normalized["value"], str) and not normalized["value"].strip():
            normalized["value"] = None
        if isinstance(normalized["value2"], str) and not normalized["value2"].strip():
            normalized["value2"] = None

    return normalized


def collect_columns(filters: List[Dict[str, Any]]) -> List[str]:
    used = set()
    for f in filters:
        if f.get("column"):
            used.add(f["column"])
        if f.get("valueType") == "column" and f.get("rightColumn"):
            used.add(f["rightColumn"])
        if f.get("valueType") == "expression" and f.get("expression"):
            for col in extract_columns_from_expression(f["expression"]):
                used.add(col)
    return sorted(used)


def verify(filters: List[Dict[str, Any]]) -> None:
    available_columns = [col["name"] for col in TABLE_COLUMNS]
    normalised_filters = [normalize_filter(filter_conf, available_columns) for filter_conf in filters]
    columns_for_validation = collect_columns(normalised_filters)

    payload = {
        "config": {
            "table_name": "query_result_demo",
            "filters": [
                {
                    "column": f["column"],
                    "operator": f["operator"],
                    "value": f["value"],
                    "value2": f["value2"],
                    "logic_operator": f["logicOperator"],
                    "value_type": f["valueType"],
                    "right_column": f["rightColumn"] or None,
                    "expression": f["expression"] or None,
                }
                for f in normalised_filters
            ],
            "selected_columns": [],
            "aggregations": [],
            "calculated_fields": [],
            "conditional_fields": [],
            "having": [],
            "group_by": [],
            "order_by": [],
            "limit": None,
            "is_distinct": False,
        },
        "column_profiles": [
            col
            for col in TABLE_COLUMNS
            if not columns_for_validation or col["name"] in columns_for_validation
        ],
        "resolved_casts": [],
    }

    print("=== Normalised Filters ===")
    for f in normalised_filters:
        print(f)

    print("\n=== Columns for Validation ===")
    print(columns_for_validation)

    print("\n=== Payload ===")
    print(payload)
    print("\n\n")


if __name__ == "__main__":
    print(">>> Column vs Column example")
    verify([FILTER_COLUMN])

    print(">>> Expression example")
    verify([FILTER_EXPRESSION])

    print(">>> Mixed example")
    verify([FILTER_COLUMN, FILTER_EXPRESSION])
