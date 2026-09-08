"""Real isolated MySQL regressions for shared execution (2026-09-08).

Requires the existing DUCKQUERY_TEST_MYSQL_* fixture environment and explicit
DUCKQUERY_TEST_MYSQL_ISOLATED=1. Never point this fixture at a business database.
"""
import datetime
import asyncio
import os
import threading
import time
import uuid
from contextlib import contextmanager
from decimal import Decimal

import duckdb
import pymysql
import pytest

from core.common.sql_identifiers import quote_identifier
from core.database.duckdb_engine import build_attach_sql, fetch_query_records
from core.database.federated_execution import federated_execution_scope


@pytest.fixture(scope="module", params=["utf8_general_ci", "utf8mb4_general_ci", "utf8mb4_bin"])
def mysql_fixture(request):
    if os.getenv("DUCKQUERY_TEST_MYSQL_ISOLATED") != "1":
        pytest.skip("An explicitly isolated MySQL fixture is required")
    config = {
        "type": "mysql", "host": os.environ["DUCKQUERY_TEST_MYSQL_HOST"],
        "port": int(os.environ["DUCKQUERY_TEST_MYSQL_PORT"]),
        "user": os.getenv("DUCKQUERY_TEST_MYSQL_USER", "root"),
        "password": os.environ["DUCKQUERY_TEST_MYSQL_PASSWORD"],
        "database": os.environ["DUCKQUERY_TEST_MYSQL_DATABASE"],
    }
    connection = pymysql.connect(**{k: v for k, v in config.items() if k != "type"}, charset="utf8mb4", autocommit=True)
    table = "dq_scope_" + uuid.uuid4().hex[:12]
    charset = "utf8" if request.param == "utf8_general_ci" else "utf8mb4"
    values = ["ord", "ORD ", "ORD", "ORD", "", " ", "a\\b", "a'b", "é", "e", "中文", None]
    with connection.cursor() as cursor:
        cursor.execute(
            f"CREATE TABLE `{table}` (id BIGINT UNSIGNED PRIMARY KEY, code VARCHAR(64) CHARACTER SET {charset} COLLATE {request.param}, "
            "amount DECIMAL(20,4), note VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin, payload VARBINARY(8), created DATETIME(6), fixed CHAR(4), KEY idx_code(code))"
        )
        rows = [
            (index, value, Decimal("9007199254740993.1234"), "中文", b"\x00\xff", datetime.datetime(2026, 9, 8, 1, 2, 3, 123456), "X")
            for index, value in enumerate(values, 1)
        ]
        cursor.executemany(f"INSERT INTO `{table}` VALUES(%s,%s,%s,%s,%s,%s,%s)", rows)
        cursor.execute(f"SELECT * FROM `{table}` ORDER BY id")
        stored = cursor.fetchall()
    try:
        yield config, table, stored
    finally:
        with connection.cursor() as cursor:
            cursor.execute(f"DROP TABLE `{table}`")
        connection.close()


@pytest.fixture
def environment(mysql_fixture):
    config, table, rows = mysql_fixture
    with duckdb.connect(":memory:") as connection:
        connection.execute("LOAD mysql")
        connection.execute("SET disabled_optimizers='remote_pushdown'")
        connection.execute("SET threads=4")
        connection.execute(build_attach_sql("m", config))
        connection.execute("CREATE TABLE reference(id UBIGINT, code VARCHAR, amount DECIMAL(20,4), note VARCHAR, payload BLOB, created TIMESTAMP, fixed VARCHAR)")
        connection.executemany("INSERT INTO reference VALUES (?,?,?,?,?,?,?)", rows)
        yield connection, [("m", config)], f"m.{quote_identifier(table)}"


@pytest.mark.parametrize("predicate", [
    "code='ORD'", "'ORD'=code", "code IN ('ORD','é')", "code IN ('ORD',NULL)",
    "code IN ('ORD',NULL::VARCHAR)", "code IN ('ORD',CAST(NULL AS VARCHAR))",
    "code IN ('ORD',TRY_CAST(NULL AS VARCHAR))", "code IN (NULL::VARCHAR)",
    "code=CAST(NULL AS VARCHAR)", "CAST(NULL AS VARCHAR)=code",
    "code IN (NULL)", "code=''", "code='ORD '", "code IN ('a\\b','a''b')", "code='😀'",
])
def test_candidate_values_types_and_cleanup(environment, predicate):
    """2026-09-08: candidate reads retain exact strings, decimals and types."""
    connection, configs, table = environment
    projection = "id,code,amount,note,payload,created"
    expected = connection.execute(f"SELECT {projection} FROM reference WHERE {predicate} ORDER BY id").fetchall()
    with federated_execution_scope(connection, f"SELECT {projection} FROM {table} WHERE {predicate} ORDER BY id", configs) as execution:
        assert execution.candidate_count == 1
        assert connection.execute(execution.sql).fetchall() == expected
    assert connection.execute("SELECT current_setting('disabled_optimizers')").fetchone() == ("remote_pushdown",)
    assert connection.execute("SELECT current_setting('threads')").fetchone() == (4,)
    assert not connection.execute("SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '__mysql_candidate_%'").fetchall()


@pytest.mark.parametrize("predicate", ["code NOT IN ('ORD')", "code>'ORD'", "code='ORD' OR id=9"])
def test_unsupported_predicates_remain_exact_local_filters(environment, predicate):
    """2026-09-08: declining optimization must not retain unsafe native filters."""
    connection, configs, table = environment
    expected = connection.execute(f"SELECT id,code FROM reference WHERE {predicate} ORDER BY id").fetchall()
    with federated_execution_scope(connection, f"SELECT id,code FROM {table} WHERE {predicate} ORDER BY id", configs) as execution:
        assert execution.candidate_count == 0
        assert connection.execute(execution.sql).fetchall() == expected


def test_limit_is_after_exact_filter(environment):
    """2026-09-08: CI false positives before ORD must not consume LIMIT 1."""
    connection, configs, table = environment
    with federated_execution_scope(connection, f"SELECT id,code FROM {table} WHERE code='ORD' ORDER BY id LIMIT 1", configs) as execution:
        assert connection.execute(execution.sql).fetchall() == [(3, "ORD")]


def test_local_keys_and_left_join_keep_unmatched_rows(environment):
    """2026-09-08: a NULL or missing key on the preserved side must survive."""
    connection, configs, table = environment
    connection.execute("CREATE TABLE keys(code VARCHAR)")
    connection.execute("INSERT INTO keys VALUES('ORD'),('missing'),(NULL)")
    query = f"SELECT l.code,r.id FROM keys l LEFT JOIN {table} r ON l.code=r.code ORDER BY l.code,r.id"
    expected = connection.execute(query.replace(table, "reference")).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert execution.candidate_count == 1
        assert connection.execute(execution.sql).fetchall() == expected


def test_same_mysql_join_does_not_bypass_duckdb_semantics(environment):
    """2026-09-08: whole-join CI pushdown previously returned extra matches."""
    connection, configs, table = environment
    query = f"SELECT * FROM {table} l JOIN {table} r ON l.code=r.code WHERE l.id=3 ORDER BY r.id"
    expected = connection.execute(query.replace(table, "reference")).fetchall()
    with federated_execution_scope(connection, query, configs, include_suggestions=True) as execution:
        assert connection.execute(execution.sql).fetchall() == expected


def test_opaque_mysql_query_preserves_nanoseconds_and_order(environment, mysql_fixture):
    """2026-09-08: opaque results are materialized once before type inspection."""
    connection, configs, _ = environment
    _, table, _ = mysql_fixture
    query = f"SELECT r.id,TIMESTAMP_NS '2026-09-08 01:02:03.123456789' AS ts FROM mysql_query('m','SELECT id FROM {table} WHERE id IN (3,4)') r ORDER BY r.id DESC"
    with federated_execution_scope(connection, query, configs) as execution:
        _, records, types = fetch_query_records(connection, execution.sql)
        assert records == [{"id": 4, "ts": "2026-09-08 01:02:03.123456789"}, {"id": 3, "ts": "2026-09-08 01:02:03.123456789"}]
        assert types == [("id", "UBIGINT"), ("ts", "TIMESTAMP_NS")]


def test_execution_error_cleans_candidates_and_restores_settings(environment):
    """2026-09-08: final-expression errors must not leak candidates into a lease."""
    connection, configs, table = environment
    query = f"SELECT CAST('invalid' AS INTEGER) FROM {table} WHERE code='ORD'"
    with pytest.raises(duckdb.ConversionException) as caught:
        with federated_execution_scope(connection, query, configs) as execution:
            assert execution.candidate_count == 1
            connection.execute(execution.sql).fetchall()
    assert "__mysql_candidate_" in caught.value.duckquery_execution_sql
    assert not connection.execute("SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '__mysql_candidate_%'").fetchall()
    assert connection.execute("SELECT current_setting('disabled_optimizers')").fetchone() == ("remote_pushdown",)


def test_cancel_after_candidate_read_does_not_execute_final_query(environment, monkeypatch):
    """2026-09-08: cancellation during preparation wins before user evaluation."""
    from core.database import federated_execution
    from core.database.connection_registry import connection_registry

    connection, configs, table = environment
    task_id = "candidate-cancel-" + uuid.uuid4().hex
    connection_registry.register(task_id, connection)
    original = federated_execution._temporary_table

    def cancel_after_read(*args):
        result = original(*args)
        connection_registry.interrupt_with_remote(task_id)
        return result

    monkeypatch.setattr(federated_execution, "_temporary_table", cancel_after_read)
    try:
        with pytest.raises(duckdb.InterruptException):
            with federated_execution_scope(connection, f"SELECT id FROM {table} WHERE code='ORD'", configs, task_id):
                pytest.fail("Cancelled preparation must not yield executable SQL")
        assert not connection.execute("SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '__mysql_candidate_%'").fetchall()
    finally:
        connection_registry.unregister(task_id)


def test_explain_does_not_materialize_candidates(environment, monkeypatch):
    """2026-09-08: EXPLAIN alone must not run a remote candidate data read."""
    from core.database import federated_execution

    connection, configs, table = environment

    def unexpected_read(*_args):
        pytest.fail("EXPLAIN must not materialize candidates")

    monkeypatch.setattr(federated_execution, "_temporary_table", unexpected_read)
    with federated_execution_scope(connection, f"EXPLAIN SELECT id FROM {table} WHERE code='ORD'", configs) as execution:
        assert execution.candidate_count == 0
        assert execution.warnings
        assert connection.execute(execution.sql).fetchall()


@pytest.mark.parametrize("shape", ["using", "natural", "row", "alias-list"])
def test_implicit_schema_bindings_remain_unchanged(environment, shape):
    """2026-09-08: implicit keys, row structs and positional aliases keep bindings."""
    connection, configs, table = environment
    connection.execute("CREATE TABLE local_keys AS SELECT id,code FROM reference WHERE id=3")
    queries = {
        "using": f"SELECT l.id FROM local_keys l JOIN {table} r USING(id) WHERE r.code='ORD'",
        "natural": f"SELECT l.id FROM local_keys l NATURAL JOIN {table} r WHERE r.code='ORD'",
        "row": f"SELECT r FROM {table} r WHERE r.code='ORD' ORDER BY r.id",
        "alias-list": f"SELECT r.code,r.id FROM {table} r(code,id) WHERE r.code=3",
    }
    query = queries[shape]
    expected = connection.execute(query.replace(table, "reference")).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert connection.execute(execution.sql).fetchall() == expected


def test_opaque_result_uses_standard_duplicate_column_names(environment, mysql_fixture):
    """2026-09-08: materialization must match the existing API's name deduplication."""
    connection, configs, _ = environment
    _, table, _ = mysql_fixture
    query = f"SELECT 1 AS a,2 AS a,3 AS a_1 FROM mysql_query('m','SELECT id FROM {table} WHERE id=3')"
    expected = fetch_query_records(connection, query, describe_before_execute=False)
    with federated_execution_scope(connection, query, configs) as execution:
        assert fetch_query_records(connection, execution.sql) == expected


def test_database_native_consumer_keeps_opaque_output_schema(environment, mysql_fixture, tmp_path):
    """2026-09-08: COPY consumes opaque SQL directly, avoiding extra CTAS/schema changes."""
    connection, configs, _ = environment
    _, table, _ = mysql_fixture
    query = f"SELECT 1 AS a,2 AS a,3 AS a_1 FROM mysql_query('m','SELECT id FROM {table} WHERE id=3')"
    expected_file = tmp_path / "expected.csv"
    actual_file = tmp_path / "actual.csv"
    connection.execute(f"COPY ({query}) TO '{expected_file}' (FORMAT CSV)")
    with federated_execution_scope(connection, query, configs, materialize_result=False) as execution:
        assert execution.sql == query
        connection.execute(f"COPY ({execution.sql}) TO '{actual_file}' (FORMAT CSV)")
    assert actual_file.read_bytes() == expected_file.read_bytes()


@pytest.mark.parametrize("entry", ["sync", "inline-save", "persist", "export", "agent"])
def test_execution_entries_share_exact_mysql_preparation(environment, monkeypatch, tmp_path, entry):
    """2026-09-08: actual query/save/export/AI consumers share the same semantics."""
    from core.database import federated_attach
    from core.database.connection_registry import connection_registry
    from core.services import ai_agent_tools
    from models.query_models import FederatedQueryRequest
    from routers import duckdb_query, query_export

    connection, configs, table = environment
    query = f"SELECT id,code,TIMESTAMP_NS '2026-09-08 01:02:03.123456789' AS ts FROM {table} WHERE code='ORD' ORDER BY id"
    attachments = [{"alias": "m", "connection_id": "isolated-fixture"}]
    expected = [(3, "ORD", "2026-09-08 01:02:03.123456789"), (4, "ORD", "2026-09-08 01:02:03.123456789")]
    ids = []

    @contextmanager
    def lease(query_id, sql="", **kwargs):
        ids.append(query_id)
        connection_registry.register(query_id, connection, sql, **kwargs)
        try:
            yield connection
        finally:
            connection_registry.unregister(query_id)

    @contextmanager
    def settings():
        yield connection

    for module in [federated_attach, duckdb_query, query_export, ai_agent_tools]:
        monkeypatch.setattr(module, "interruptible_connection", lease)
        monkeypatch.setattr(module, "attach_databases_on_connection", lambda *_args, **_kwargs: ["m"])
        monkeypatch.setattr(module, "detach_databases_on_connection", lambda *_args: None)
    for module in [federated_attach, duckdb_query, query_export]:
        monkeypatch.setattr(module, "resolve_attach_configs", lambda *_args: configs)
    monkeypatch.setattr(federated_attach, "with_duckdb_connection", settings)
    monkeypatch.setattr(duckdb_query, "_log_query_metrics_in_conn", lambda *_args: 0.0)
    monkeypatch.setattr(query_export.config_manager, "get_exports_dir", lambda: tmp_path)
    try:
        if entry in {"sync", "inline-save"}:
            result = duckdb_query.execute_federated_query(
                FederatedQueryRequest(sql=query, attach_databases=attachments, is_preview=False,
                                      save_as_table="saved_scope_result" if entry == "inline-save" else None),
                x_request_id="scope-entry-" + uuid.uuid4().hex,
            )
            assert result["success"]
            assert [(row["id"], row["code"], row["ts"]) for row in result["data"]["data"]] == expected
            assert "__mysql_candidate_" not in result["data"]["optimized_sql"]
        elif entry == "persist":
            result = federated_attach.execute_sql_and_persist(
                query, "saved_scope_result", attachments, query_id="scope-save-" + uuid.uuid4().hex,
            )
            assert result["row_count"] == 2
        elif entry == "export":
            result = query_export.export_query_results(
                query_export.QueryResultExportRequest(sql=query, attach_databases=attachments, format="parquet"),
                x_request_id="scope-export-" + uuid.uuid4().hex,
            )
            assert result["success"]
            path = tmp_path / (result["data"]["file_id"] + ".parquet")
            assert connection.execute("SELECT id,code,CAST(ts AS VARCHAR) FROM read_parquet(?) ORDER BY id", [str(path)]).fetchall() == expected
        else:
            ctx = ai_agent_tools.AgentRunCtx(run_id="scope-agent-" + uuid.uuid4().hex, authorized_aliases=["m"], attach_configs=configs)
            result = asyncio.run(ai_agent_tools.run_query_async(ctx, ai_agent_tools.RunQueryArgs(sql=query), 5, query_id="q1"))
            assert result.ok, result.model_text
            assert ".123456789" in result.model_text
            assert "returned 2 rows" in result.ui_summary
            assert ctx.executed_queries["q1"].sql == query
        if entry in {"inline-save", "persist"}:
            assert connection.execute("SELECT id,code,CAST(ts AS VARCHAR) FROM saved_scope_result ORDER BY id").fetchall() == expected
        assert not connection.execute("SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '__mysql_candidate_%'").fetchall()
    finally:
        for query_id in ids:
            connection_registry.forget_publication(query_id)


def test_default_collation_cannot_narrow_remote_candidates(environment):
    """2026-09-08: NOCASE equality must retain upper-case remote binary keys."""
    connection, configs, table = environment
    connection.execute("SET default_collation='nocase'")
    query = f"SELECT id,code FROM {table} WHERE code='ord' ORDER BY id"
    expected = connection.execute(query.replace(table, "reference")).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert execution.candidate_count == 0
        assert connection.execute(execution.sql).fetchall() == expected
    assert len(expected) == 3


def test_collated_local_keys_do_not_drive_a_binary_remote_filter(environment):
    """2026-09-08: DESCRIBE VARCHAR alone does not prove binary equality."""
    connection, configs, table = environment
    connection.execute("CREATE TABLE collated_keys(code VARCHAR COLLATE nocase)")
    connection.execute("INSERT INTO collated_keys VALUES('ord')")
    query = f"SELECT l.code,r.id FROM collated_keys l JOIN {table} r ON l.code=r.code ORDER BY r.id"
    expected = connection.execute(query.replace(table, "reference")).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert execution.candidate_count == 0
        assert connection.execute(execution.sql).fetchall() == expected
    assert len(expected) == 3


def test_real_remote_cancel_during_opaque_materialization(environment, mysql_fixture):
    """2026-09-08: candidate/result materialization remains in the owned cancel lease."""
    from core.database.connection_registry import connection_registry

    connection, configs, _ = environment
    config, _, _ = mysql_fixture
    task_id = "opaque-cancel-" + uuid.uuid4().hex
    marker = "scope_sleep_" + uuid.uuid4().hex
    query = f"SELECT * FROM mysql_query('m','SELECT SLEEP(3) AS asleep /* {marker} */')"
    connection_registry.register(task_id, connection)
    timer = threading.Timer(0.2, lambda: connection_registry.interrupt_with_remote(task_id))
    started = time.monotonic()
    timer.start()
    try:
        with pytest.raises(duckdb.Error):
            with federated_execution_scope(connection, query, configs, task_id):
                pytest.fail("Cancelled materialization must not yield rows")
        assert time.monotonic() - started < 2
        controller = pymysql.connect(**{k: v for k, v in config.items() if k != "type"}, autocommit=True)
        try:
            with controller.cursor() as cursor:
                cursor.execute("SELECT count(*) FROM information_schema.PROCESSLIST WHERE ID<>CONNECTION_ID() AND INFO LIKE %s", ["%" + marker + "%"])
                assert cursor.fetchone()[0] == 0
        finally:
            controller.close()
    finally:
        timer.cancel()
        timer.join(timeout=5)
        connection_registry.unregister(task_id)


@pytest.mark.parametrize("kind", ["table", "view"])
def test_temporary_collated_keys_cannot_shadow_the_metadata_check(environment, kind):
    """2026-09-08: TEMP names bind before persistent names, including case variants."""
    connection, configs, table = environment
    connection.execute("CREATE TABLE keys(code VARCHAR)")
    connection.execute("INSERT INTO keys VALUES('unmatched')")
    if kind == "table":
        connection.execute('CREATE TEMP TABLE "KEYS"(code VARCHAR COLLATE nocase)')
        connection.execute('INSERT INTO "KEYS" VALUES(\'ord\')')
    else:
        connection.execute('CREATE TEMP VIEW "KEYS" AS SELECT \'ord\' COLLATE nocase AS code')
    query = f"SELECT l.code,r.id FROM keys l JOIN {table} r ON l.code=r.code ORDER BY r.id"
    expected = connection.execute(query.replace(table, "reference")).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert execution.candidate_count == 0
        assert connection.execute(execution.sql).fetchall() == expected
    assert len(expected) == 3


def test_custom_search_path_cannot_change_sampled_key_binding(environment):
    """2026-09-08: a different schema can shadow an uncollated main table."""
    connection, configs, table = environment
    connection.execute("CREATE TABLE keys(code VARCHAR)")
    connection.execute("CREATE SCHEMA other")
    connection.execute("CREATE TABLE other.keys(code VARCHAR COLLATE nocase)")
    connection.execute("INSERT INTO other.keys VALUES('ord')")
    connection.execute("SET search_path='other,main'")
    query = f"SELECT l.code,r.id FROM keys l JOIN {table} r ON l.code=r.code ORDER BY r.id"
    expected = connection.execute(query.replace(table, "reference")).fetchall()
    with federated_execution_scope(connection, query, configs) as execution:
        assert execution.candidate_count == 0
        assert connection.execute(execution.sql).fetchall() == expected


def test_schema_named_like_mysql_catalog_does_not_rebind_a_source(environment, mysql_fixture):
    """2026-09-08: ambiguous two-part schema/catalog names keep native binding."""
    connection, configs, table = environment
    _, physical_table, _ = mysql_fixture
    connection.execute("CREATE SCHEMA m")
    connection.execute(f'CREATE TABLE "memory"."m".{quote_identifier(physical_table)}(id UBIGINT,code VARCHAR)')
    query = f"SELECT id,code FROM {table} WHERE code='ORD'"
    try:
        expected = connection.execute(query).fetchall()
        error_type = None
    except duckdb.Error as error:
        expected = None
        error_type = type(error)
    if error_type:
        with pytest.raises(error_type):
            with federated_execution_scope(connection, query, configs) as execution:
                assert execution.candidate_count == 0
                connection.execute(execution.sql).fetchall()
    else:
        with federated_execution_scope(connection, query, configs) as execution:
            assert execution.candidate_count == 0
            assert connection.execute(execution.sql).fetchall() == expected
