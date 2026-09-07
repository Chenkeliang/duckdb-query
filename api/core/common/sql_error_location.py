"""Extract stable editor coordinates from DuckDB parser and binder errors."""

from __future__ import annotations

import json
import re
from typing import Optional


_LINE_RE = re.compile(r"^LINE\s+(\d+):\s?(.*)$")
_JSON_LOCATION_RE = re.compile(r"^\[(\d+),(\d+)\]$")


def _utf16_length(value: str) -> int:
    """Return the number of UTF-16 code units used by CodeMirror."""
    return len(value.encode("utf-16-le")) // 2


def _location_from_utf8_bytes(
    sql: str, start: int, length: int
) -> Optional[dict[str, int]]:
    """Convert DuckDB's UTF-8 byte range to one-based editor coordinates."""
    encoded = sql.encode("utf-8")
    if start < 0 or start > len(encoded) or length < 0:
        return None
    try:
        prefix = encoded[:start].decode("utf-8")
        token = encoded[start : min(len(encoded), start + length)].decode("utf-8")
    except UnicodeDecodeError:
        return None

    line = prefix.count("\n") + 1
    line_prefix = prefix.rsplit("\n", 1)[-1]
    column = _utf16_length(line_prefix) + 1
    if "\n" in token:
        end_column = column + 1
    else:
        end_column = column + max(1, _utf16_length(token))
    return {"line": line, "column": column, "end_column": end_column}


def _json_error_location(message: str, sql: str) -> Optional[dict[str, int]]:
    """Extract ``position``/``location`` from an embedded DuckDB JSON error."""
    decoder = json.JSONDecoder()
    for index, character in enumerate(message):
        if character != "{":
            continue
        try:
            payload, _end = decoder.raw_decode(message[index:])
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict) or "position" not in payload:
            continue
        try:
            start = int(payload["position"])
        except (TypeError, ValueError):
            continue

        length = 1
        location = payload.get("location")
        if isinstance(location, str):
            match = _JSON_LOCATION_RE.fullmatch(location.replace(" ", ""))
            if match and int(match.group(1)) == start:
                length = int(match.group(2))
        elif (
            isinstance(location, list)
            and len(location) == 2
            and all(isinstance(value, int) for value in location)
            and location[0] == start
        ):
            length = location[1]
        return _location_from_utf8_bytes(sql, start, length)
    return None


def parse_sql_error_location(message: str, sql: str) -> Optional[dict[str, int]]:
    """Return a one-based UTF-16 editor range from JSON or caret errors."""
    json_location = _json_error_location(str(message), sql)
    if json_location:
        return json_location

    message_lines = str(message).splitlines()
    sql_lines = sql.splitlines() or [sql]
    for index, message_line in enumerate(message_lines[:-1]):
        match = _LINE_RE.match(message_line)
        if not match:
            continue
        line = int(match.group(1))
        caret_line = message_lines[index + 1]
        caret_index = caret_line.find("^")
        if caret_index < 0:
            continue
        # DuckDB inserts exactly one separator after ``LINE n:``. Any additional
        # spaces belong to the SQL text and therefore count toward the column.
        content_start = message_line.find(":") + 2
        column = max(1, caret_index - content_start + 1)
        if 1 <= line <= len(sql_lines):
            column = min(column, max(1, len(sql_lines[line - 1]) + 1))
        return {"line": line, "column": column, "end_column": column + 1}
    return None
