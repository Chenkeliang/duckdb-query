"""Transfer remote results without floating-point conversion or remote writes."""

from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import uuid4

import duckdb

from core.common.config_manager import config_manager
from core.common.sql_identifiers import escape_string_literal, quote_identifier
from core.database.connection_registry import connection_registry
from core.database.federated_attach import execute_sql_and_persist


def quack_source_metadata(service_id: str) -> dict:
    """Snapshot public source identity without retaining endpoint credentials."""
    from core.services.quack_service import quack_service

    service = quack_service.get_service(service_id)
    return {
        "quack_service_id": service_id,
        "quack_service_revision": service["updated_at"],
        "source": {
            "type": "quack", "connectionId": service_id,
            "connectionName": service["name"],
        },
    }


def _requires_text_transport(data_type: Any) -> bool:
    """Use documented text for lossy Parquet types; never erase UNION tags."""
    if data_type.id == "union":
        from core.services.quack_service import QuackError

        raise QuackError(
            "QUACK_UNSUPPORTED_PARQUET_TYPE",
            "UNION columns cannot be exported as Parquet; use CSV or save a local table",
        )
    children = []
    if data_type.id in {"list", "array", "struct", "map"}:
        # Inspect every child: an earlier text-only field must not hide a UNION.
        children = [
            _requires_text_transport(child)
            for _name, child in data_type.children
            if hasattr(child, "id")
        ]
    return data_type.id in {
        "hugeint", "uhugeint", "interval", "time with time zone", "variant",
        "enum", "bit", "array",
    } or any(children)


def quack_parquet_projection(
    connection, embedded_sql: str, temp_directory: str
) -> tuple[str, list]:
    """Materialize once locally and map lossy Parquet columns to text.

    Describing Quack's query macro executes its remote SQL, so schema discovery
    must inspect the same completed native temporary table used by COPY. The
    owned spill directory and existing application limits bound local staging.
    This is a local CTAS: the connection never switches via CONNECT.
    Native local saves use their own DuckDB file, never this export projection.
    """
    config = config_manager.get_app_config()
    connection.execute("SET temp_directory = ?", [temp_directory])
    if config.duckdb_memory_limit:
        connection.execute("SET memory_limit = ?", [config.duckdb_memory_limit])
    if config.duckdb_max_temp_directory_size:
        connection.execute(
            "SET max_temp_directory_size = ?", [config.duckdb_max_temp_directory_size]
        )
    source = "_quack_result_transfer"
    connection.execute(f"CREATE TEMP TABLE {source} AS (\n{embedded_sql}\n)")
    schema = connection.execute(f"DESCRIBE {source}").fetchall()
    columns = []
    projection = []
    for name, type_name, *_rest in schema:
        data_type = duckdb.sqltype(type_name)
        quoted = quote_identifier(name)
        as_text = _requires_text_transport(data_type)
        projection.append(
            f"CAST({quoted} AS VARCHAR) AS {quoted}" if as_text else quoted
        )
        columns.append((name, str(data_type), as_text))
    return f"SELECT {', '.join(projection)} FROM {source}", columns


def persist_quack_query(
    sql: str,
    table_name: str,
    service_id: str,
    query_id: str,
    *,
    overwrite: bool = False,
    expected_revision: str | None = None,
) -> dict:
    """Materialize once remotely, then atomically publish a local DuckDB table.

    Remote and local phases use the same cancellation ID. Accepted task
    cancellation survives their connection handoff; final publication uses the
    existing staging/collision guard. The caller finalizes task/HTTP ownership.
    """
    from core.services.quack_service import quack_query_context

    with TemporaryDirectory(
        prefix="quack-result-", dir=config_manager.get_exports_dir()
    ) as directory:
        path = Path(directory) / "result.duckdb"
        literal = escape_string_literal(path)
        alias = "_quack_transfer_" + uuid4().hex
        quoted_alias = quote_identifier(alias)
        with quack_query_context(
            service_id, sql, query_id, expected_revision=expected_revision
        ) as (connection, remote_sql):
            connection.execute(
                f"ATTACH '{literal}' AS {quoted_alias} (STORAGE_VERSION 'v2.0.0')"
            )
            try:
                connection.execute(
                    f"CREATE TABLE {quoted_alias}.main.result AS (\n{remote_sql}\n)"
                )
                if connection_registry.is_cancel_requested(query_id):
                    raise duckdb.InterruptException("Query cancelled before local persistence")
            finally:
                connection.execute(f"DETACH {quoted_alias}")
        return execute_sql_and_persist(
            f"SELECT * FROM {quoted_alias}.main.result",
            table_name,
            query_id=query_id,
            overwrite=overwrite,
            native_source=(alias, str(path)),
        )
