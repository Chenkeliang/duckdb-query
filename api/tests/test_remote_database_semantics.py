"""Real MySQL/PostgreSQL semantic matrix (2026-09-07).

The normal backend suite skips these tests.  CI supplies isolated service
containers so an unavailable database can never be mistaken for a passing
semantic matrix.
"""

from decimal import Decimal
from contextlib import contextmanager
import os
import threading
import time
from types import SimpleNamespace

import duckdb
import psycopg2
import pymysql
import pytest

from core.database.duckdb_engine import (
    _apply_perf_and_remote_settings,
    build_attach_sql,
    fetch_query_records,
)
from core.database.connection_registry import ConnectionRegistry
from core.database import federated_attach
from core.database.federated_attach import remote_cancellation_scope


def _runtime_config():
    return SimpleNamespace(
        duckdb_enable_profiling=False,
        duckdb_prefer_range_joins=False,
        duckdb_enable_object_cache=False,
        duckdb_preserve_insertion_order=True,
        duckdb_enable_progress_bar=False,
        duckdb_profiling_output=None,
        duckdb_remote_settings={},
    )


def _required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        pytest.skip(f"{name} is required by the real remote semantic matrix")
    return value


def test_mysql_decimal_aggregate_is_exact_and_remote_catalog_is_read_only(monkeypatch):
    host = _required_env("DUCKQUERY_TEST_MYSQL_HOST")
    port = int(_required_env("DUCKQUERY_TEST_MYSQL_PORT"))
    password = _required_env("DUCKQUERY_TEST_MYSQL_PASSWORD")
    database = _required_env("DUCKQUERY_TEST_MYSQL_DATABASE")
    connection_args = {
        "host": host,
        "port": port,
        "user": "root",
        "password": password,
        "database": database,
    }
    mysql = pymysql.connect(**connection_args, autocommit=True)
    try:
        with mysql.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS duckquery_semantic_orders")
            cursor.execute(
                "CREATE TABLE duckquery_semantic_orders "
                "(id BIGINT PRIMARY KEY, amount DECIMAL(20,4), label VARCHAR(20))"
            )
            cursor.executemany(
                "INSERT INTO duckquery_semantic_orders VALUES (%s, %s, %s)",
                [
                    (1, "12.3456", "a"),
                    (2, "8.0000", "A"),
                    (3, "9007199254740993.1234", "ä"),
                    (4, None, None),
                ],
            )

        with duckdb.connect(
            ":memory:", config={"autoinstall_known_extensions": "false"}
        ) as connection:
            connection.execute("LOAD mysql")
            _apply_perf_and_remote_settings(connection, _runtime_config())
            connection.execute(
                build_attach_sql(
                    "mysql_remote", {"type": "mysql", **connection_args}
                )
            )
            sql = "SELECT sum(amount) AS total FROM mysql_remote.duckquery_semantic_orders"
            plan = connection.execute(f"EXPLAIN {sql}").fetchone()[1]
            columns, records, cursor_types = fetch_query_records(connection, sql)

            assert "MYSQL_QUERY" not in plan.upper()
            assert columns == ["total"]
            assert records == [{"total": "9007199254741013.4690"}]
            assert cursor_types == [("total", "DECIMAL(38,4)")]
            assert connection.execute(
                "SELECT id, label FROM mysql_remote.duckquery_semantic_orders "
                "WHERE label = 'a' ORDER BY id"
            ).fetchall() == [(1, "a")]
            assert connection.execute(
                "SELECT id, label FROM mysql_remote.duckquery_semantic_orders "
                "ORDER BY label NULLS FIRST, id"
            ).fetchall() == [(4, None), (2, "A"), (1, "a"), (3, "ä")]
            empty_columns, empty_records, empty_types = fetch_query_records(
                connection,
                "SELECT sum(amount) AS total "
                "FROM mysql_remote.duckquery_semantic_orders WHERE false",
            )
            assert empty_columns == ["total"]
            assert empty_records == [{"total": None}]
            assert empty_types == [("total", "DECIMAL(38,4)")]
            with pytest.raises(duckdb.Error):
                connection.execute(
                    "INSERT INTO mysql_remote.duckquery_semantic_orders "
                    "VALUES (5, 1.0000, 'write')"
                )

            @contextmanager
            def shared_connection():
                yield connection

            monkeypatch.setattr(
                federated_attach,
                "resolve_attach_configs",
                lambda _attached: [("mysql_remote", connection_args | {"type": "mysql"})],
            )
            monkeypatch.setattr(
                federated_attach,
                "with_duckdb_connection",
                shared_connection,
            )
            snapshot = federated_attach.execute_sql_and_persist(
                "SELECT id, amount FROM mysql_remote.duckquery_semantic_orders "
                "ORDER BY id",
                "local_mysql_snapshot",
                [{"connection_id": "integration"}],
            )
            assert snapshot["row_count"] == 4
            assert connection.execute(
                "SELECT id, amount FROM local_mysql_snapshot ORDER BY id"
            ).fetchall() == [
                (1, Decimal("12.3456")),
                (2, Decimal("8.0000")),
                (3, Decimal("9007199254740993.1234")),
                (4, None),
            ]
    finally:
        with mysql.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS duckquery_semantic_orders")
        mysql.close()


def test_postgres_deadline_stops_remote_work_and_catalog_is_read_only():
    host = _required_env("DUCKQUERY_TEST_POSTGRES_HOST")
    port = int(_required_env("DUCKQUERY_TEST_POSTGRES_PORT"))
    password = _required_env("DUCKQUERY_TEST_POSTGRES_PASSWORD")
    database = _required_env("DUCKQUERY_TEST_POSTGRES_DATABASE")
    connection_args = {
        "host": host,
        "port": port,
        "user": "postgres",
        "password": password,
        "database": database,
    }
    postgres = psycopg2.connect(**connection_args)
    postgres.autocommit = True
    try:
        with postgres.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS duckquery_semantic_orders")
            cursor.execute(
                "CREATE TABLE duckquery_semantic_orders "
                "(id BIGINT PRIMARY KEY, amount NUMERIC(20,4), "
                "tags INTEGER[], payload JSONB)"
            )
            cursor.execute(
                "INSERT INTO duckquery_semantic_orders VALUES "
                "(1, 9007199254740993.1234, ARRAY[1,2], "
                "'{\"z\":1,\"a\":2}'::jsonb), "
                "(2, NULL, ARRAY[]::integer[], 'null'::jsonb)"
            )

        with duckdb.connect(
            ":memory:", config={"autoinstall_known_extensions": "false"}
        ) as connection:
            connection.execute("LOAD postgres")
            connection.execute(
                build_attach_sql(
                    "pg_remote",
                    {
                        "type": "postgres",
                        **connection_args,
                        "_statement_timeout_ms": 250,
                    },
                )
            )
            columns, records, cursor_types = fetch_query_records(
                connection,
                "SELECT * FROM pg_remote.public.duckquery_semantic_orders "
                "ORDER BY id",
            )
            assert columns == ["id", "amount", "tags", "payload"]
            assert records == [
                {
                    "id": 1,
                    "amount": "9007199254740993.1234",
                    "tags": "[1, 2]",
                    "payload": '{"a": 2, "z": 1}',
                },
                {"id": 2, "amount": None, "tags": "[]", "payload": "null"},
            ]
            assert cursor_types == [
                ("id", "BIGINT"),
                ("amount", "DECIMAL(20,4)"),
                ("tags", "INTEGER[]"),
                ("payload", "VARCHAR"),
            ]
            assert fetch_query_records(
                connection,
                "SELECT sum(amount) AS total "
                "FROM pg_remote.public.duckquery_semantic_orders",
            )[1] == [{"total": "9007199254740993.1234"}]
            started = time.monotonic()
            with pytest.raises(duckdb.Error, match="statement timeout"):
                connection.execute(
                    "SELECT * FROM postgres_query"
                    "('pg_remote', 'SELECT pg_sleep(2)')"
                ).fetchall()
            assert time.monotonic() - started < 1.5
            with pytest.raises(duckdb.Error):
                connection.execute(
                    "INSERT INTO pg_remote.public.duckquery_semantic_orders "
                    "VALUES (1, 1.0000)"
                )
    finally:
        with postgres.cursor() as cursor:
            cursor.execute("DROP TABLE IF EXISTS duckquery_semantic_orders")
        postgres.close()


def test_postgres_user_cancel_stops_query_owned_remote_session(monkeypatch):
    """Real regression: user cancellation must stop the owned PG backend promptly."""
    host = _required_env("DUCKQUERY_TEST_POSTGRES_HOST")
    port = int(_required_env("DUCKQUERY_TEST_POSTGRES_PORT"))
    password = _required_env("DUCKQUERY_TEST_POSTGRES_PASSWORD")
    database = _required_env("DUCKQUERY_TEST_POSTGRES_DATABASE")
    config = {
        "type": "postgresql",
        "host": host,
        "port": port,
        "user": "postgres",
        "password": password,
        "database": database,
    }
    query_id = "integration:postgres-user-cancel"
    application_name = federated_attach._postgres_application_name(query_id)
    registry = ConnectionRegistry()
    monkeypatch.setattr(federated_attach, "connection_registry", registry)
    started = threading.Event()
    errors = []

    with duckdb.connect(
        ":memory:", config={"autoinstall_known_extensions": "false"}
    ) as connection:
        connection.execute("LOAD postgres")
        attach_config = dict(config)
        attach_config["_statement_timeout_ms"] = 10_000
        attach_config["_application_name"] = application_name
        connection.execute(build_attach_sql("pg_cancel", attach_config))
        registry.register(query_id, connection, "SELECT pg_sleep(5)")

        def run_query():
            try:
                with remote_cancellation_scope(
                    connection,
                    query_id,
                    [("pg_cancel", config)],
                ):
                    started.set()
                    connection.execute(
                        "SELECT * FROM postgres_query"
                        "('pg_cancel', 'SELECT pg_sleep(5)')"
                    ).fetchall()
            except duckdb.Error as exc:
                errors.append(exc)

        worker = threading.Thread(target=run_query)
        began = time.monotonic()
        worker.start()
        assert started.wait(2)
        time.sleep(0.2)
        assert registry.interrupt_with_remote(query_id)
        worker.join(2)
        elapsed = time.monotonic() - began

        assert not worker.is_alive()
        assert errors
        assert elapsed < 2.5
        registry.unregister(query_id)
        connection.execute("DETACH pg_cancel")

    postgres = psycopg2.connect(
        host=host,
        port=port,
        user="postgres",
        password=password,
        database=database,
    )
    try:
        with postgres.cursor() as cursor:
            cursor.execute(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE application_name = %s AND state <> 'idle'",
                [application_name],
            )
            assert cursor.fetchone() == (0,)
    finally:
        postgres.close()
