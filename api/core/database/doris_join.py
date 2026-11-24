"""Bounded Doris inputs for queries evaluated by the local DuckDB engine."""

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Callable
from uuid import uuid4

import pymysql
import sqlglot
from pymysql.constants import FIELD_TYPE
from sqlglot import exp

from core.common.exceptions import DatabaseConnectionError, ValidationError
from core.common.sql_capabilities import is_read_only_sql
from core.common.sql_identifiers import quote_identifier
from core.common.utils import dedupe_column_names
from core.database.doris_source import (
    _COLUMN_TYPES,
    check_doris_cancelled,
    doris_columns,
    doris_native_sql,
    doris_query_cursor,
    parse_doris_read_query,
)
from core.database.mysql_predicate_candidates import (
    MySQLSource,
    _and_terms,
    find_mysql_sources,
    fold_identifier,
    mysql_identifier,
    patch_sources,
)

MAX_DORIS_JOIN_ROWS = 100_000
MAX_DORIS_JOIN_BYTES = 64 * 1024 * 1024
MAX_DORIS_NATIVE_ROWS = 1_000_000
MAX_DORIS_NATIVE_BYTES = 256 * 1024 * 1024
_NATIVE_BATCH_BYTES = 4 * 1024 * 1024
_INTEGER_TYPES = {"TINYINT", "SMALLINT", "INT", "INTEGER", "BIGINT", "LARGEINT"}
_OPERATORS = {exp.EQ: "=", exp.NEQ: "!=", exp.GT: ">", exp.GTE: ">=", exp.LT: "<", exp.LTE: "<="}
_STRUCTURED_TYPES = re.compile(
    r"^(?:(?:ARRAY|STRUCT)\s*<|MAP\s*<\s*(?:CHAR|VARCHAR|STRING|TEXT)(?:\(\d+\))?\s*,)",
    re.I,
)


def references_local_schema(sql: str, doris_alias: str) -> bool:
    """Distinguish a mixed SQL query from native Doris SQL with unqualified tables."""
    try:
        query = sqlglot.parse_one(sql, read="duckdb")
    except sqlglot.errors.SqlglotError:
        query = None
    if not isinstance(query, exp.Query):
        try:
            query = parse_doris_read_query(sql)
        except ValidationError:
            return False
    tables = list(query.find_all(exp.Table))
    alias = fold_identifier(doris_alias)
    return any(fold_identifier(table.catalog or table.db) == alias for table in tables) and any(
        fold_identifier(table.db) == "main" and fold_identifier(table.catalog) != alias
        for table in tables
    )


def native_doris_source(sql: str, configs: list[tuple[str, dict[str, Any]]]):
    """Return the sole Doris source when SQL is routed by the workbench."""
    if len(configs) != 1:
        return None
    alias, config = configs[0]
    return (alias, config) if config.get("type") == "doris" and not references_local_schema(sql, alias) else None


def _stage_batch(connection: Any, insert_sql: str, batch: list, offset: int | None = None) -> None:
    # Bind columns as vectors. Numeric text avoids DuckDB's Python binding
    # coercing a large integer to DOUBLE before the typed INSERT.
    vectors = [
        [str(value) if isinstance(value, (int, Decimal)) and not isinstance(value, bool) else value
         for value in column]
        for column in zip(*batch)
    ]
    if offset is not None:
        vectors.append(list(range(offset, offset + len(batch))))
    connection.execute(insert_sql, vectors)


def _result_type(column) -> str:
    code, width, scale = column[1], column[3], column[5]
    if code in {FIELD_TYPE.NEWDECIMAL, FIELD_TYPE.DECIMAL}:
        # The protocol field width includes the sign and decimal separator.
        if isinstance(width, int) and isinstance(scale, int):
            precision = width - 1 - int(scale > 0)
            if 1 <= precision <= 38 and 0 <= scale <= precision:
                return f"DECIMAL({precision},{scale})"
        return "VARCHAR"
    return _COLUMN_TYPES.get(code, "VARCHAR")


def stage_native_doris_result(
    connection: Any, remote_sql: str, config: dict[str, Any], names: list[str],
    query_id: str | None,
) -> str:
    """Stream the native result into a typed temporary DuckDB relation."""
    name = "__dq_doris_" + uuid4().hex
    order = "__dq_order_" + uuid4().hex
    try:
        with doris_query_cursor(config, query_id, stream=True) as cursor:
            cursor.execute(remote_sql)
            description = cursor.description
            if not description:
                raise ValidationError("Doris SQL did not return a result")
            columns = dedupe_column_names([column[0] for column in description])
            fields = ", ".join(
                f"{quote_identifier(column)} {_result_type(field)}"
                for column, field in zip(columns, description)
            )
            names.append(name)
            target = quote_identifier(name)
            order_ref = quote_identifier(order)
            connection.execute(f"CREATE TEMP TABLE {target} ({fields}, {order_ref} BIGINT)")
            values = ", ".join("unnest(?)" for _ in range(len(columns) + 1))
            insert_sql = f"INSERT INTO {target} SELECT {values}"
            offset = 0
            size = batch_size = 0
            batch = []
            check_doris_cancelled(query_id)
            for row in cursor:
                row_size = sum(
                    len(value) if isinstance(value, bytes) else len(str(value).encode("utf-8"))
                    for value in row
                )
                size += row_size
                if offset + len(batch) >= MAX_DORIS_NATIVE_ROWS or size > MAX_DORIS_NATIVE_BYTES:
                    raise ValidationError(
                        "Doris native result exceeds the staging budget. Add a filter or a row limit.",
                        details={"max_rows": MAX_DORIS_NATIVE_ROWS, "max_bytes": MAX_DORIS_NATIVE_BYTES},
                    )
                batch.append(row)
                batch_size += row_size
                if len(batch) >= 512 or batch_size >= _NATIVE_BATCH_BYTES:
                    check_doris_cancelled(query_id)
                    _stage_batch(connection, insert_sql, batch, offset)
                    offset += len(batch)
                    batch.clear()
                    batch_size = 0
            if batch:
                check_doris_cancelled(query_id)
                _stage_batch(connection, insert_sql, batch, offset)
    except pymysql.MySQLError as error:
        raise ValidationError(f"Doris query failed: {error}") from None
    return f"SELECT * EXCLUDE ({order_ref}) FROM {target} ORDER BY {order_ref}"


def _duckdb_type(doris_type: str) -> str:
    normalized = doris_type.upper().strip()
    if normalized in _INTEGER_TYPES:
        return {"INT": "INTEGER", "LARGEINT": "HUGEINT"}.get(normalized, normalized)
    if normalized in {"BOOLEAN", "FLOAT", "DOUBLE"}:
        return normalized
    if re.fullmatch(r"DATE(?:V2)?", normalized):
        return "DATE"
    if re.fullmatch(r"DATETIME(?:V2)?(?:\([0-6]\))?", normalized):
        return "TIMESTAMP"
    if re.fullmatch(r"(?:CHAR|VARCHAR)(?:\(\d+\))?|STRING|TEXT", normalized):
        return "VARCHAR"
    if normalized in {"JSON", "JSONB", "VARIANT"}:
        return "JSON"
    if _STRUCTURED_TYPES.match(normalized):
        return "JSON"
    decimal_type = re.fullmatch(r"DECIMAL(?:V[23])?\((\d+)\s*,\s*(\d+)\)", normalized)
    if decimal_type:
        width, scale = map(int, decimal_type.groups())
        if 1 <= width <= 38 and 0 <= scale <= width:
            return f"DECIMAL({width},{scale})"
    raise ValidationError(f"Doris type {doris_type} is unsupported in cross-source joins")


def _source_columns(source: MySQLSource, metadata: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # The generated JOIN wraps each projected source in a SELECT. Only use
    # columns from a scope where DuckDB's binding is unambiguous.
    if (len(source.scope.selected_sources) != 1
            or any(not isinstance(star.parent, exp.Count)
                   for star in source.scope.expression.find_all(exp.Star))):
        return metadata
    names = {fold_identifier(column.name) for column in source.scope.columns}
    if not names:
        return metadata[:1]
    selected = [column for column in metadata if fold_identifier(column["name"]) in names]
    return selected if selected and len(selected) == len(names) else metadata


def _source_filters(source: MySQLSource, fields: dict[str, str]) -> list[tuple[str, int | str]]:
    if len(source.scope.selected_sources) != 1:
        return []
    where = source.scope.expression.args.get("where")
    filters = []
    for term in _and_terms(where.this if where is not None else None):
        operator = _OPERATORS.get(type(term))
        left, right = term.this, term.expression
        if not operator or not isinstance(left, exp.Column):
            continue
        if left.table and fold_identifier(left.table) != fold_identifier(source.alias):
            continue
        dtype = fields.get(fold_identifier(left.name), "").upper().strip()
        if dtype in _INTEGER_TYPES:
            negative = isinstance(right, exp.Neg)
            literal = right.this if negative else right
            if not isinstance(literal, exp.Literal) or not literal.is_int:
                continue
            value = int(literal.this) * (-1 if negative else 1)
            if not -(2**63) <= value < 2**63:
                continue
        elif isinstance(right, exp.Literal) and right.is_string:
            value = str(right.this)
            try:
                if re.fullmatch(r"DATE(?:V2)?", dtype) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    date.fromisoformat(value)
                elif re.fullmatch(r"DATETIME(?:V2)?(?:\([0-6]\))?", dtype) and re.fullmatch(
                    r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?", value
                ):
                    # Subsecond comparisons can round against a narrower Doris
                    # type. Whole seconds fit every DATETIME precision.
                    if "." in value and not dtype.endswith("(6)"):
                        continue
                    datetime.fromisoformat(value)
                else:
                    continue
            except ValueError:
                continue
        else:
            continue
        identifier = mysql_identifier(left.name).replace("%", "%%")
        filters.append((f"{identifier} {operator} %s", value))
    return filters


def _copy_source(
    connection: Any, config: dict[str, Any], source: MySQLSource,
    columns: list[dict[str, Any]], filters: list[tuple[str, int | str]], row_budget: int,
    byte_budget: int, check_cancelled: Callable[[], None],
    query_id: str | None = None,
    sample_limit: int | None = None,
) -> tuple[int, int]:
    identifiers = [mysql_identifier(column["name"]) for column in columns]
    projection = ", ".join(
        f"TO_JSON({identifier})" if _STRUCTURED_TYPES.match(column["type"]) else identifier
        for identifier, column in zip(identifiers, columns)
    )
    remote_sql = f"SELECT {projection} FROM {mysql_identifier(source.table)}"
    if filters:
        remote_sql = remote_sql.replace("%", "%%")
        remote_sql += " WHERE " + " AND ".join(predicate for predicate, _ in filters)
    remote_limit = min(sample_limit, row_budget + 1) if sample_limit is not None else row_budget + 1
    remote_sql += f" LIMIT {remote_limit}"
    values = ", ".join("unnest(?)" for _ in columns)
    insert_sql = f"INSERT INTO {quote_identifier(source.temporary_name)} SELECT {values}"
    count = size = 0
    # Closing the remote socket also stops reading on error or cancellation.
    # SSCursor.close() would drain unread results before closing the socket.
    try:
        with doris_query_cursor(config, query_id, stream=True) as cursor:
            cursor.execute(remote_sql, tuple(value for _, value in filters) if filters else None)
            while True:
                check_cancelled()
                batch = cursor.fetchmany(512)
                if not batch:
                    break
                count += len(batch)
                size += sum(
                    len(value) if isinstance(value, bytes) else len(str(value).encode("utf-8"))
                    for row in batch for value in row
                )
                if count > row_budget or size > byte_budget:
                    raise ValidationError(
                        "Doris JOIN input exceeds the read budget (100,000 rows or 64 MiB). "
                        "Narrow the Doris source with a filter before joining."
                    )
                _stage_batch(connection, insert_sql, batch)
    except pymysql.MySQLError as error:
        code = error.args[0] if error.args else "unknown"
        raise DatabaseConnectionError(f"Unable to read Doris JOIN input ({code})") from None
    return count, size


def prepare_doris_join(
    connection: Any,
    sql: str,
    attach_configs: list[tuple[str, dict[str, Any]]],
    temporary_names: list[str],
    check_cancelled: Callable[[], None],
    query_id: str | None = None,
    sample_limit: int | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Stage only referenced Doris tables, then substitute their SQL spans."""
    if not is_read_only_sql(sql):
        raise ValidationError("Doris cross-source joins support read-only queries")
    configs = {fold_identifier(alias): config for alias, config in attach_configs
               if config.get("type") == "doris"}
    try:
        sources, tree = find_mysql_sources(sql, attach_configs, 0, source_type="doris")
    except (sqlglot.errors.SqlglotError, ValueError, UnicodeError):
        raise ValidationError("Unable to resolve Doris tables in this query") from None
    if not isinstance(tree, (exp.Query, exp.Pivot)) or len(sources) != sum(
        fold_identifier(table.catalog or table.db or "") in configs
        for table in tree.find_all(exp.Table)
    ):
        raise ValidationError("Unable to resolve Doris tables in this query")

    if sources:
        schema_rows = connection.execute(
            "SELECT schema_name FROM duckdb_schemas() WHERE database_name = current_database()"
        ).fetchall()
        schemas = {fold_identifier(name) for (name,) in schema_rows}
        if any(not source.node.catalog and fold_identifier(source.node.db) in schemas for source in sources):
            raise ValidationError("Doris connection alias conflicts with a local DuckDB schema")

    rows_left, bytes_left = MAX_DORIS_JOIN_ROWS, MAX_DORIS_JOIN_BYTES
    stats = []
    for source in sources:
        check_cancelled()
        config = configs[fold_identifier(source.connection_alias)]
        if fold_identifier(source.database) != fold_identifier(config.get("database") or ""):
            raise ValidationError("Doris joins support only the configured database")
        metadata = doris_columns(config, source.table)
        if not metadata:
            raise ValidationError(f"No columns found for Doris table {source.table}")
        columns = _source_columns(source, metadata)
        filters = _source_filters(source, {fold_identifier(c["name"]): c["type"] for c in metadata})
        definition = ", ".join(f'{quote_identifier(c["name"])} {_duckdb_type(c["type"])}' for c in columns)
        name = "__dq_doris_" + uuid4().hex
        source.temporary_name = name
        temporary_names.append(name)
        connection.execute(f"CREATE TEMP TABLE {quote_identifier(name)} ({definition})")
        names = [column["name"] for column in columns]
        where = source.scope.expression.args.get("where")
        sample_safe = (
            sample_limit is not None and len(sources) == 1 and source.scope.expression is tree
            and not any(tree.args.get(key) for key in ("order", "group", "distinct", "offset", "qualify"))
            and len(filters) == sum(1 for _ in _and_terms(where.this if where is not None else None))
        )
        count, size = _copy_source(
            connection, config, source, columns, filters, rows_left, bytes_left, check_cancelled, query_id,
            sample_limit=sample_limit if sample_safe else None,
        )
        rows_left -= count
        bytes_left -= size
        stats.append({
            "relation": f"{source.connection_alias}.{source.table}",
            "rows": count,
            "columns": names,
            "filters": len(filters),
        })
    return patch_sources(sql, sources), stats
