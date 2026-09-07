"""Extract stable editor coordinates from DuckDB parser and binder errors."""

from __future__ import annotations

from contextlib import contextmanager
import hashlib
import json
import logging
import re
from typing import Any, Iterator, Optional


_LINE_RE = re.compile(r"^LINE\s+(\d+):\s?(.*)$")
_JSON_LOCATION_RE = re.compile(r"^\[(\d+),(\d+)\]$")
logger = logging.getLogger(__name__)


def _embedded_error_payload(message: str) -> Optional[dict[str, Any]]:
    """Return the first valid DuckDB structured-error object in text."""
    decoder = json.JSONDecoder()
    for index, character in enumerate(str(message)):
        if character != "{":
            continue
        try:
            payload, _end = decoder.raw_decode(str(message)[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict) and isinstance(
            payload.get("exception_message"), str
        ):
            return payload
    return None


def duckdb_error_message(error: Any) -> str:
    """Return a human-readable message without exposing raw JSON envelopes."""
    message = str(error)
    payload = _embedded_error_payload(message)
    if payload:
        return str(payload["exception_message"])
    return message


@contextmanager
def structured_duckdb_errors(connection: Any) -> Iterator[None]:
    """Enable structured errors for one connection lease and restore its state."""
    row = connection.execute(
        "SELECT current_setting('errors_as_json')"
    ).fetchone()
    previous = bool(row[0]) if isinstance(row, (tuple, list)) and row else False
    connection.execute("SET errors_as_json=true")
    try:
        yield
    finally:
        try:
            connection.execute(
                f"SET errors_as_json={'true' if previous else 'false'}"
            )
        except Exception as restore_error:  # pylint: disable=broad-exception-caught
            logger.error(
                "Failed to restore DuckDB structured-error setting: %s",
                restore_error,
            )
            raise


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
    payload = _embedded_error_payload(message)
    if payload and "position" in payload:
        try:
            start = int(payload["position"])
        except (TypeError, ValueError):
            return None

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


def _location_within_original(
    location: dict[str, int], original_sql: str
) -> bool:
    lines = original_sql.splitlines() or [original_sql]
    line = location["line"]
    if line < 1 or line > len(lines):
        return False
    return location["column"] <= _utf16_length(lines[line - 1]) + 1


def build_sql_error_details(
    error: Any,
    original_sql: str,
    execution_sql: Optional[str] = None,
    query_id: Optional[str] = None,
) -> dict[str, Any]:
    """Bind a mapped SQL diagnostic to the exact submitted statement identity."""
    original = str(original_sql or "")
    actual_execution = getattr(error, "duckquery_execution_sql", execution_sql)
    execution = str(actual_execution if actual_execution is not None else original)
    details: dict[str, Any] = {
        "sql_identity": {
            "sha256": hashlib.sha256(original.encode("utf-8")).hexdigest(),
        }
    }
    if query_id:
        details["sql_identity"]["query_id"] = query_id

    message = str(error)
    location = parse_sql_error_location(message, execution)
    if location and (
        execution == original
        or (execution.startswith(original) and _location_within_original(location, original))
    ):
        details["sql_location"] = location
        return details

    payload = _embedded_error_payload(message)
    if not payload or "position" not in payload or not original:
        return details
    try:
        execution_start = int(payload["position"])
    except (TypeError, ValueError):
        return details
    source_slice = None
    candidates = [original]
    trimmed = original.strip()
    if trimmed and trimmed not in candidates:
        candidates.append(trimmed)
    statement = trimmed.rstrip(";").rstrip()
    if statement and statement not in candidates:
        candidates.append(statement)
    for candidate in candidates:
        execution_character_start = execution.find(candidate)
        original_character_start = original.find(candidate)
        if execution_character_start >= 0 and original_character_start >= 0:
            source_slice = (
                len(execution[:execution_character_start].encode("utf-8")),
                len(original[:original_character_start].encode("utf-8")),
                len(candidate.encode("utf-8")),
            )
            break
    if source_slice is None:
        return details
    execution_slice_start, original_slice_start, slice_length = source_slice
    relative_start = execution_start - execution_slice_start
    if not 0 <= relative_start <= slice_length:
        return details
    length = 1
    location_value = payload.get("location")
    if isinstance(location_value, str):
        match = _JSON_LOCATION_RE.fullmatch(location_value.replace(" ", ""))
        if match and int(match.group(1)) == execution_start:
            length = int(match.group(2))
    elif (
        isinstance(location_value, list)
        and len(location_value) == 2
        and all(isinstance(value, int) for value in location_value)
        and location_value[0] == execution_start
    ):
        length = location_value[1]
    mapped = _location_from_utf8_bytes(
        original,
        original_slice_start + relative_start,
        length,
    )
    if mapped:
        details["sql_location"] = mapped
    return details


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
