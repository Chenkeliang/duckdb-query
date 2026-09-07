"""Real MySQL/PostgreSQL semantic matrix (2026-09-07).

The normal backend suite skips these tests.  CI supplies isolated service
containers so an unavailable database can never be mistaken for a passing
semantic matrix.
"""

from decimal import Decimal
import os
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


def test_mysql_decimal_aggregate_is_exact_and_remote_catalog_is_read_only():
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
                "(id BIGINT PRIMARY KEY, amount DECIMAL(20,4))"
            )
            cursor.executemany(
                "INSERT INTO duckquery_semantic_orders VALUES (%s, %s)",
                [
                    (1, "12.3456"),
                    (2, "8.0000"),
                    (3, "9007199254740993.1234"),
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
            with pytest.raises(duckdb.Error):
                connection.execute(
                    "INSERT INTO mysql_remote.duckquery_semantic_orders "
                    "VALUES (4, 1.0000)"
                )
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
                "(id BIGINT PRIMARY KEY, amount NUMERIC(20,4))"
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
