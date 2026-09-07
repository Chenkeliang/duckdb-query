"""Extract stable editor coordinates from DuckDB parser and binder errors."""

from __future__ import annotations

import re
from typing import Optional


_LINE_RE = re.compile(r"^LINE\s+(\d+):\s?(.*)$")


def parse_sql_error_location(message: str, sql: str) -> Optional[dict[str, int]]:
    """Return one-based line/column coordinates when DuckDB prints a caret."""
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
