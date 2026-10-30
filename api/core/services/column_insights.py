"""Schema-driven aggregates and lossless JSON field projection."""

import json
import re

from core.common.sql_identifiers import escape_string_literal, quote_identifier
from core.services.pivot_query_sql_common import _build_where_clause
from models.column_insights_models import InsightQueryRequest

SAMPLE_LIMIT = 100
JSON_BYTE_LIMIT = 100_000
PATH_LIMIT = 200
DEPTH_LIMIT = 16


def column_insight(name: str, data_type: str) -> dict:
    """Recommend supported operations by actual type, without name heuristics."""
    kind = data_type.upper().strip()
    structured = kind.startswith(("JSON", "VARIANT", "STRUCT", "MAP", "UNION")) or "[" in kind
    text = kind.startswith(("VARCHAR", "CHAR", "TEXT", "STRING"))
    numeric = bool(re.fullmatch(
        r"(?:U?(?:TINYINT|SMALLINT|INTEGER|INT|BIGINT|HUGEINT)|FLOAT|DOUBLE|REAL|DECIMAL\(\d+,\d+\)|NUMERIC\(\d+,\d+\))", kind
    ))
    temporal = kind.startswith(("DATE", "TIME", "INTERVAL"))
    operations = ["COUNT"]
    if not structured:
        operations.append("COUNT_DISTINCT")
    if numeric:
        operations.extend(["SUM", "AVG", "MIN", "MAX"])
    elif temporal:
        operations.extend(["MIN", "MAX"])
    return {"name": name, "type": data_type, "aggregations": operations,
            "json_candidate": structured or text}


def discover_json_paths(values: list[str | None]) -> dict:
    """Merge bounded JSON Pointer paths across sampled rows, never return values."""
    paths: dict[str, dict] = {}
    valid = 0
    truncated = False
    for raw in values:
        if raw is None or len(raw.encode("utf-8")) > JSON_BYTE_LIMIT:
            continue
        try:
            value = json.loads(raw)
        except (ValueError, RecursionError):
            continue
        valid += 1
        stack = [("", value, 0)]
        while stack:
            pointer, item, depth = stack.pop()
            kind = ("null" if item is None else "boolean" if isinstance(item, bool)
                    else "object" if isinstance(item, dict) else "array" if isinstance(item, list)
                    else "number" if isinstance(item, (int, float)) else "string")
            if pointer not in paths:
                if len(paths) >= PATH_LIMIT:
                    truncated = True
                    continue
                paths[pointer] = {"pointer": pointer, "types": set(), "occurrences": 0}
            paths[pointer]["types"].add(kind)
            paths[pointer]["occurrences"] += 1
            if depth >= DEPTH_LIMIT:
                truncated = truncated or isinstance(item, (dict, list))
                continue
            children = item.items() if isinstance(item, dict) else enumerate(item) if isinstance(item, list) else []
            # Never allocate an unbounded worklist for a very wide object/array.
            for index, (key, child) in enumerate(children):
                if index >= PATH_LIMIT:
                    truncated = True
                    break
                segment = str(key).replace("~", "~0").replace("/", "~1")
                stack.append((f"{pointer}/{segment}", child, depth + 1))
    return {
        "paths": [{**entry, "types": sorted(entry["types"])} for entry in paths.values()],
        "sampled_rows": len(values), "valid_rows": valid,
        "skipped_rows": len(values) - valid, "sample_limit": SAMPLE_LIMIT,
        "truncated": truncated,
    }


def generate_insight_sql(request: InsightQueryRequest, table_ref: str, schema: dict[str, str]) -> str:
    """Build one read-only SELECT after validating actual columns and types."""
    aliases = set(schema.keys()) if request.extractions and request.keep_original else set()
    aliases = {name.casefold() for name in aliases}
    expressions = ["*"] if request.extractions and request.keep_original else []
    for metric in request.metrics:
        if metric.aggregation == "COUNT_ROWS":
            expression = "count(*)"
        else:
            if metric.column not in schema:
                raise ValueError("Metric column does not exist")
            allowed = column_insight(metric.column, schema[metric.column])["aggregations"]
            if metric.aggregation not in allowed:
                raise ValueError("Aggregation is not supported for this column type")
            column = quote_identifier(metric.column)
            expression = (f"count(DISTINCT {column})" if metric.aggregation == "COUNT_DISTINCT"
                          else f"{metric.aggregation.lower()}({column})")
        if metric.alias.casefold() in aliases:
            raise ValueError("Output aliases must be unique")
        aliases.add(metric.alias.casefold())
        expressions.append(f"{expression} AS {quote_identifier(metric.alias)}")
    for extraction in request.extractions:
        if extraction.column not in schema or not column_insight(
            extraction.column, schema[extraction.column]
        )["json_candidate"]:
            raise ValueError("Choose a JSON-compatible column")
        if extraction.pointer and (
            not extraction.pointer.startswith("/") or re.search(r"~(?![01])", extraction.pointer)
        ):
            raise ValueError("Expected a JSON Pointer path")
        if extraction.alias.casefold() in aliases:
            raise ValueError("Output aliases must be unique and not replace original columns")
        aliases.add(extraction.alias.casefold())
        function = "json_extract" if extraction.target_type == "JSON" else "json_extract_string"
        expression = (
            f"{function}(TRY_CAST({quote_identifier(extraction.column)} AS JSON), "
            f"'{escape_string_literal(extraction.pointer)}')"
        )
        if extraction.target_type not in ("JSON", "VARCHAR"):
            expression = f"TRY_CAST({expression} AS {extraction.target_type})"
        expressions.append(f"{expression} AS {quote_identifier(extraction.alias)}")
    for condition in request.filters:
        if condition.column not in schema:
            raise ValueError("Filter column does not exist")
    where = _build_where_clause(request.filters)
    return f"SELECT {', '.join(expressions)}\nFROM {table_ref}" + (f"\n{where}" if where else "")
