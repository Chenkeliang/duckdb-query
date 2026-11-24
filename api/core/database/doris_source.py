"""Read-only Doris catalog and SQL workbench access over its MySQL protocol."""

import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator
from uuid import uuid4

import duckdb
import pymysql
import sqlglot
from pymysql.constants import FIELD_TYPE
from pymysql.cursors import SSCursor
from sqlglot import exp
from sqlglot.dialects.doris import Doris
from sqlglot.generator import Generator

from core.common.config_manager import config_manager
from core.common.exceptions import BaseAPIException, DatabaseConnectionError, ValidationError
from core.common.sql_capabilities import is_read_only_sql
from core.common.utils import records_from_cursor
from core.database.connection_registry import connection_registry
from core.security.encryption import password_encryptor

DEFAULT_DORIS_PORT = 9030

_COLUMN_TYPES = {
    FIELD_TYPE.TINY: "TINYINT",
    FIELD_TYPE.SHORT: "SMALLINT",
    FIELD_TYPE.INT24: "INTEGER",
    FIELD_TYPE.LONG: "INTEGER",
    FIELD_TYPE.LONGLONG: "BIGINT",
    FIELD_TYPE.FLOAT: "FLOAT",
    FIELD_TYPE.DOUBLE: "DOUBLE",
    FIELD_TYPE.DECIMAL: "DECIMAL",
    FIELD_TYPE.NEWDECIMAL: "DECIMAL",
    FIELD_TYPE.DATE: "DATE",
    FIELD_TYPE.DATETIME: "TIMESTAMP",
    FIELD_TYPE.TIMESTAMP: "TIMESTAMP",
    FIELD_TYPE.TIME: "INTERVAL",
    FIELD_TYPE.JSON: "JSON",
}


class _DorisQueryDialect(Doris):
    class Generator(Doris.Generator):
        # SQLGlot inherits MySQL's CAST fallback. Doris 4 supports TRY_CAST.
        TRANSFORMS = {
            **Doris.Generator.TRANSFORMS,
            exp.TryCast: lambda self, expression: Generator.cast_sql(self, expression, safe_prefix="TRY_"),
        }


def render_doris_query(query: exp.Query) -> str:
    """Render a Doris query while retaining its safe cast semantics."""
    return query.sql(dialect=_DorisQueryDialect, comments=False)


def connect_doris(config: dict[str, Any]) -> pymysql.connections.Connection:
    """Open an autocommit connection without sending a transaction command."""
    app = config_manager.get_app_config()
    host = config.get("host")
    user = config.get("user") or config.get("username")
    database = config.get("database")
    if not all(isinstance(value, str) and value.strip() for value in (host, user, database)):
        raise ValidationError("Doris host, username and database are required")
    password = config.get("password") or ""
    if password_encryptor.is_encrypted(password):
        password = password_encryptor.decrypt_password(password)
    try:
        configured_port = config.get("port")
        port = DEFAULT_DORIS_PORT if configured_port is None else int(str(configured_port))
        if not 1 <= port <= 65535:
            raise ValueError
    except (ValueError, TypeError):
        raise ValidationError("Doris port must be an integer between 1 and 65535") from None
    try:
        return pymysql.connect(
            host=host, port=port, user=user, password=password, database=database,
            charset="utf8mb4", autocommit=True,
            connect_timeout=app.db_connect_timeout, read_timeout=app.db_read_timeout,
            write_timeout=app.db_write_timeout,
        )
    except pymysql.MySQLError as error:
        code = error.args[0] if error.args and isinstance(error.args[0], int) else "unknown"
        raise DatabaseConnectionError(f"Unable to connect to Doris ({code})") from None


def doris_tables(config: dict[str, Any]) -> list[dict[str, str]]:
    """List visible tables and views in the configured database."""
    with connect_doris(config) as connection, connection.cursor() as cursor:
        cursor.execute("SHOW FULL TABLES")
        return [{"name": row[0], "type": row[1]} for row in cursor.fetchall()]


def doris_columns(config: dict[str, Any], table: str) -> list[dict[str, Any]]:
    """Read catalog types from Doris without sampling table data."""
    identifier = exp.to_identifier(table, quoted=True).sql(dialect="doris")
    with connect_doris(config) as connection, connection.cursor() as cursor:
        cursor.execute(f"SHOW FULL COLUMNS FROM {identifier}")
        return [
            {"name": row[0], "type": row[1], "null": row[3], "comment": row[8]}
            for row in cursor.fetchall()
        ]


def doris_relation_columns(
    reference: str, configs: list[tuple[str, dict[str, Any]]],
) -> list[dict[str, Any]] | None:
    """Describe a resolved Doris table reference using the remote catalog."""
    doris = {alias.casefold(): config for alias, config in configs if config.get("type") == "doris"}
    if not doris:
        return None
    relation = sqlglot.parse_one(reference, into=exp.Table, read="duckdb")
    config = doris.get((relation.catalog or relation.db).casefold())
    if config is None:
        return None
    if relation.catalog and relation.db.casefold() != config["database"].casefold():
        raise ValidationError("Doris queries support only the configured database")
    return doris_columns(config, relation.name)


def parse_doris_read_query(sql: str) -> exp.Query:
    """Validate one native read query, allowing trivia around its terminal delimiter."""
    try:
        tokens = sqlglot.tokenize(sql, read="doris")
        if not tokens or any(token.token_type == sqlglot.TokenType.SEMICOLON for token in tokens[:-1]):
            raise ValidationError("Doris connections support one read-only query")
        if tokens[-1].token_type == sqlglot.TokenType.SEMICOLON:
            sql = sql[:tokens[-1].start] + sql[tokens[-1].end + 1:]
        statements = [item for item in sqlglot.parse(sql, read="doris") if item is not None]
    except sqlglot.errors.SqlglotError:
        raise ValidationError("Invalid Doris query") from None
    if len(statements) != 1 or not isinstance(statements[0], exp.Query):
        raise ValidationError("Doris connections support one read-only query")
    query = statements[0]
    if query.find(exp.Into) is not None or not is_read_only_sql(query.sql(dialect="duckdb", comments=False)):
        raise ValidationError("Doris connections support one read-only query")
    return query


def _prepare_doris_sql(sql: str, alias: str, database: str, limit: int | None) -> tuple[str, int | None]:
    query = parse_doris_read_query(sql)
    for relation in query.find_all(exp.Table):
        if relation.catalog or not isinstance(relation.this, exp.Identifier):
            raise ValidationError("Doris queries require named tables in the configured database")
        if relation.db.casefold() == alias.casefold():
            relation.set("db", exp.to_identifier(database, quoted=True))
        elif relation.db and relation.db.casefold() != database.casefold():
            raise ValidationError("Doris queries support only the configured database")
    applied_limit = None
    if limit is not None and query.args.get("limit") is None:
        query = query.limit(limit, copy=False)
        applied_limit = limit
    return render_doris_query(query), applied_limit


def check_doris_cancelled(query_id: str | None) -> None:
    """Raise the same interruption used by local query execution."""
    if query_id and connection_registry.is_cancel_requested(query_id):
        raise duckdb.InterruptException("INTERRUPT Error: Doris query cancelled")


class _DorisInterrupt:
    def __init__(self, cancel):
        self._cancel = cancel

    def interrupt(self) -> None:
        """Cancel the active native Doris query."""
        if not self._cancel():
            raise RuntimeError("Unable to interrupt the Doris session")


@contextmanager
def doris_query_cursor(
    config: dict[str, Any], query_id: str | None, *, stream: bool = False,
    standalone_sql: str | None = None,
) -> Iterator[Any]:
    """Open one query session with a cancellation ID unique across FE nodes."""
    check_doris_cancelled(query_id)
    with connect_doris(config) as connection:
        cursor = connection.cursor(SSCursor) if stream else connection.cursor()
        if not query_id:
            if stream:
                yield cursor
            else:
                with cursor as active_cursor:
                    yield active_cursor
            return
        trace_id = uuid4().hex
        cursor.execute("SET session_context = %s", (f"trace_id:{trace_id}",))
        finished = threading.Event()

        def cancel_remote() -> bool:
            if finished.is_set():
                return False
            try:
                with connect_doris(config) as killer, killer.cursor() as kill_cursor:
                    # Cancellation can arrive between registration and dispatch.
                    for _ in range(5):
                        if finished.is_set():
                            return False
                        try:
                            kill_cursor.execute('KILL QUERY "' + trace_id + '"')
                            return True
                        except pymysql.MySQLError:
                            finished.wait(0.05)
            except DatabaseConnectionError:
                return False
            return False

        standalone = standalone_sql is not None
        if standalone:
            connection_registry.register(
                query_id, _DorisInterrupt(cancel_remote), standalone_sql, remote_only=True,
            )
        elif not connection_registry.register_remote_interrupt(query_id, cancel_remote):
            check_doris_cancelled(query_id)
            raise duckdb.InterruptException("INTERRUPT Error: Doris query is no longer active")
        try:
            check_doris_cancelled(query_id)
            yield cursor
            check_doris_cancelled(query_id)
            if standalone and not connection_registry.commit_if_not_cancelled(query_id, lambda: None):
                raise duckdb.InterruptException("INTERRUPT Error: Doris query cancelled")
        except pymysql.MySQLError:
            check_doris_cancelled(query_id)
            raise
        finally:
            finished.set()
            if standalone:
                connection_registry.unregister(query_id)
            else:
                connection_registry.unregister_remote_interrupt(query_id, cancel_remote)


def doris_native_sql(
    sql: str, alias: str, config: dict[str, Any], limit: int | None = None,
) -> tuple[str, int | None]:
    """Validate and translate the workbench alias before native execution."""
    database = config.get("database")
    if not isinstance(database, str) or not database.strip():
        raise ValidationError("Doris database is required")
    return _prepare_doris_sql(sql, alias, database, limit)


def execute_doris_query(
    sql: str, alias: str, config: dict[str, Any], *, is_preview: bool,
    query_id: str | None = None,
) -> dict[str, Any]:
    """Execute a single Doris SELECT and preserve precision in HTTP records."""
    start = time.monotonic()
    limit = config_manager.get_app_config().max_query_rows if is_preview else None
    remote_sql, applied_limit = doris_native_sql(sql, alias, config, limit)
    try:
        with doris_query_cursor(config, query_id, standalone_sql=sql) as cursor:
            cursor.execute(remote_sql)
            description = [(item[0], _COLUMN_TYPES.get(item[1], "VARCHAR")) for item in cursor.description or ()]
            names, rows = records_from_cursor(cursor, description)
    except pymysql.MySQLError as error:
        raise BaseAPIException(f"Doris query failed: {error}", status_code=400,
                               error_code="QUERY_FAILED") from None
    return {
        "columns": names,
        "column_types": [{"name": name, "duckdb_type": dtype} for name, (_, dtype) in zip(names, description)],
        "data": rows,
        "row_count": len(rows),
        "execution_time_ms": (time.monotonic() - start) * 1000,
        "attached_databases": [alias],
        "sql_query": sql,
        "preview_limit_applied": applied_limit,
        "doris_native": True,
    }
