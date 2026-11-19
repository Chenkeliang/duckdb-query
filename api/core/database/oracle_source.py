"""Oracle connection and metadata via the signed DuckDB community scanner."""

import re
import uuid
from contextlib import contextmanager
from typing import Any, Iterator

import duckdb

from core.common.config_manager import config_manager
from core.common.exceptions import DatabaseConnectionError, ResourceNotFoundError, ValidationError
from core.common.sql_identifiers import quote_identifier
from core.security.encryption import password_encryptor

ORACLE_EXTENSION = "oracle_scanner"
_PROBE_ALIAS = "oracle_catalog"


def load_oracle_scanner(connection: Any) -> None:
    """Load an installed scanner without asking DuckDB to install one implicitly."""
    installed = connection.execute(
        "SELECT installed FROM duckdb_extensions() WHERE extension_name = ?",
        [ORACLE_EXTENSION],
    ).fetchone()
    if not installed or not installed[0]:
        raise DatabaseConnectionError("Install oracle_scanner from the Extensions page first")
    try:
        connection.execute("LOAD oracle_scanner")
        # Each mount uses a one-time secret. The read pool retains sessions for
        # these secrets after DETACH, so pooled DuckDB connections exhaust Oracle.
        connection.execute("SET oracle_session_pool_size = 0")
    except duckdb.Error:
        raise DatabaseConnectionError(
            "Unable to load oracle_scanner. Check its DuckDB version, platform and installation"
        ) from None


def attach_oracle(connection: Any, alias: str, config: dict) -> None:
    """Mount a read-only catalog and release the temporary connection secret."""
    host = str(config.get("host") or "").strip()
    service_name = str(config.get("service_name") or "").strip()
    user = str(config.get("user") or config.get("username") or "").strip()
    password = config.get("password") or ""
    port = str(config.get("port", 1521))
    if not port.isascii() or not port.isdecimal() or len(port) > 5 or not 1 <= int(port) <= 65535:
        raise ValidationError("Oracle port must be an integer between 1 and 65535")
    if not host or not service_name or not user or not isinstance(password, str) or not password:
        raise ValidationError("Oracle host, service name, username and password are required")
    if password_encryptor.is_encrypted(password):
        password = password_encryptor.decrypt_password(password)

    load_oracle_scanner(connection)
    app = config_manager.get_app_config()
    secret = f"dq_oracle_{uuid.uuid4().hex}"
    try:
        connection.execute(
            f"CREATE TEMPORARY SECRET {quote_identifier(secret)} (TYPE oracle, "
            "HOST ?, PORT ?, SERVICE_NAME ?, USER ?, PASSWORD ?, CONNECT_TIMEOUT ?, READ_TIMEOUT ?)",
            [
                host, int(port), service_name, user, password,
                max(1, int(app.db_connect_timeout)), max(1, int(app.db_read_timeout)),
            ],
        )
    except duckdb.Error:
        # Keep driver and binder messages outside the API response.
        raise DatabaseConnectionError("Unable to configure the Oracle connection") from None
    try:
        connection.execute(
            f"ATTACH '{secret}' AS {quote_identifier(alias)} (TYPE oracle_scanner, READ_ONLY)"
        )
    except duckdb.InterruptException:
        raise
    except duckdb.Error as exc:
        if isinstance(exc, duckdb.BinderException) and "already exists" in str(exc).lower():
            raise DatabaseConnectionError(
                "The Oracle connection alias is in use by another query. Retry after it completes"
            ) from None
        code = re.search(r"\b(?:ORA|TNS)-\d{5}\b", str(exc))
        suffix = f" ({code.group()})" if code else ""
        raise DatabaseConnectionError(f"Unable to connect to Oracle{suffix}") from None
    finally:
        connection.execute(f"DROP SECRET IF EXISTS {quote_identifier(secret)}")


@contextmanager
def open_oracle_catalog(config: dict) -> Iterator[Any]:
    """Keep metadata requests independent of the main DuckDB connection pool."""
    paths = config_manager.get_duckdb_paths(ensure_dirs=False)
    with duckdb.connect(config={
        "extension_directory": str(paths.extension_dir),
        "autoinstall_known_extensions": False,
    }) as connection:
        attach_oracle(connection, _PROBE_ALIAS, config)
        yield connection


def oracle_schemas(config: dict) -> list[dict]:
    """List the schemas the scanner discovered for the connected account."""
    with open_oracle_catalog(config) as connection:
        rows = connection.execute(
            "SELECT schema_name FROM duckdb_schemas() WHERE database_name = ? "
            "ORDER BY schema_name",
            [_PROBE_ALIAS],
        ).fetchall()
    return [{"name": name} for (name,) in rows]


def oracle_tables(config: dict, schema: str) -> list[dict]:
    """Enumerate table and view names without reading rows from those objects."""
    # The scanner exposes remote views as scan tables in DuckDB's catalog.
    # Ask Oracle's dictionary for the original object kind.
    query = """
        SELECT object_name, object_type FROM all_objects
        WHERE owner = NVL(:owner, SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA'))
          AND object_type IN ('TABLE', 'VIEW')
        ORDER BY object_name
    """
    with open_oracle_catalog(config) as connection:
        rows = connection.execute(
            "SELECT * FROM oracle_query_transaction_typed(?, ?, "
            "['OBJECT_NAME', 'OBJECT_TYPE'], ['VARCHAR', 'VARCHAR'], "
            "{'owner': CAST(? AS VARCHAR)})",
            [_PROBE_ALIAS, query, None if schema == "main" else schema],
        ).fetchall()
    return [{"name": name, "type": kind} for name, kind in rows]


def oracle_columns(config: dict, schema: str, table: str) -> list[dict]:
    """Describe the actual DuckDB projection, including precision and nullability."""
    relation = ".".join(quote_identifier(part) for part in (_PROBE_ALIAS, schema, table))
    with open_oracle_catalog(config) as connection:
        try:
            rows = connection.execute(f"DESCRIBE {relation}").fetchall()
        except duckdb.CatalogException:
            raise ResourceNotFoundError("Oracle table", table) from None
    return [
        {"name": name, "type": kind, "nullable": nullable != "NO", "null": nullable}
        for name, kind, nullable, *_ in rows
    ]
