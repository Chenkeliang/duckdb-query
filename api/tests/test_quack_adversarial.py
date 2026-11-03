"""2026-11-03 independent cross-tests, owned localhost Quack and temp data only."""

import base64
import uuid
from concurrent.futures import ThreadPoolExecutor
import threading
import time

import duckdb
from fastapi.testclient import TestClient
import pytest

from core.common.config_manager import config_manager
from core.database.connection_registry import connection_registry
from core.database.duckdb_engine import with_duckdb_connection
from core.services.quack_results import persist_quack_query
from core.services.quack_service import QuackError, QuackService
from main import app
from models.quack_models import QuackServiceConfig
from test_quack_results import remote  # noqa: F401
from test_quack_service import connected, quack_server, service  # noqa: F401
from utils.encryption_utils import EncryptionUtils


@pytest.mark.parametrize("expression", [
    "'blue'::ENUM('red','blue')",
    "union_value(label := 'hello')::UNION(label VARCHAR, n INTEGER)",
    "union_value(n := '170141183460469231731687303715884105727'::HUGEINT)::UNION(label VARCHAR, n HUGEINT)",
    "[1,2,3]::INTEGER[3]",
    "TIME '12:34:56.123456'",
    "TIMETZ '12:34:56.123456+05:30'",
    "TIMESTAMP_NS '2026-11-03 12:34:56.123456789'",
    "INTERVAL '1 month 2 days 3 microseconds'",
    "{'n':'170141183460469231731687303715884105727'::HUGEINT,'s':'quoted, '' text'}",
    "MAP(['key'], ['340282366920938463463374607431768211455'::UHUGEINT])",
    "'101001'::BIT",
    "'\\x00\\xFF'::BLOB",
    "{'n':'170141183460469231731687303715884105727'::HUGEINT}::VARIANT",
], ids=["enum", "union", "union_hugeint", "array", "time", "timetz", "timestamp_ns",
        "interval_month", "struct_hugeint", "map_uhugeint", "bit", "blob", "variant"])
def test_native_save_preserves_type_and_sql_value(remote, expression):
    """2026-11-03: save must retain native schema and SQL values across staging."""
    _instance, identifier, info = remote
    sql = f"SELECT {expression} AS value"
    expected_type = str(info["server"].execute(sql).description[0][1])
    # SQL casts retain precision not expressible by Python datetime/timedelta.
    expected_text = info["server"].execute(f"SELECT CAST(value AS VARCHAR) FROM ({sql})").fetchone()[0]
    name = "adversarial_save_" + uuid.uuid4().hex
    query_id = "adversarial-save-" + uuid.uuid4().hex
    try:
        result = persist_quack_query(sql, name, identifier, query_id)
        assert result["row_count"] == 1
        with with_duckdb_connection() as local:
            actual_type = local.execute(f'DESCRIBE "{name}"').fetchone()[1]
            actual_text = local.execute(f'SELECT CAST(value AS VARCHAR) FROM "{name}"').fetchone()[0]
        assert (actual_type, actual_text) == (expected_type, expected_text)
    finally:
        connection_registry.forget_publication(query_id)
        with with_duckdb_connection() as local:
            local.execute(f'DROP TABLE IF EXISTS "{name}"')


def test_native_union_hugeint_save_preserves_member_tag(remote):
    """2026-11-03: equal rendered UNION values can conceal a changed active member."""
    _instance, identifier, _info = remote
    name = "adversarial_union_" + uuid.uuid4().hex
    query_id = "adversarial-union-" + uuid.uuid4().hex
    big = 2**127 - 1
    sql = f"SELECT union_value(n := '{big}'::HUGEINT)::UNION(label VARCHAR,n HUGEINT) AS value"
    try:
        persist_quack_query(sql, name, identifier, query_id)
        with with_duckdb_connection() as local:
            actual = local.execute(f'SELECT union_tag(value)::VARCHAR, union_extract(value,\'n\') FROM "{name}"').fetchone()
        assert actual == ("n", big)
    finally:
        connection_registry.forget_publication(query_id)
        with with_duckdb_connection() as local:
            local.execute(f'DROP TABLE IF EXISTS "{name}"')


@pytest.mark.parametrize("format", ["csv", "parquet"])
def test_native_interval_export_keeps_microseconds_and_rowcount(remote, format):
    """2026-11-03: successful exports must not silently truncate interval values."""
    _instance, identifier, _info = remote
    sql = "SELECT INTERVAL '1 month 2 days 3 microseconds' AS value FROM range(3)"
    response = TestClient(app).post("/api/query-results/export", json={
        "sql": sql, "format": format, "quack_service_id": identifier,
    })
    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    path = config_manager.get_exports_dir() / f'{payload["file_id"]}.{format}'
    try:
        assert payload["row_count_estimate"] == 3
        with duckdb.connect() as reader:
            if format == "parquet":
                actual = reader.execute("SELECT value::VARCHAR FROM read_parquet(?)", [str(path)]).fetchall()
            else:
                actual = reader.execute("SELECT value::VARCHAR FROM read_csv(?,all_varchar=true)", [str(path)]).fetchall()
        assert actual == [("1 month 2 days 00:00:00.000003",)] * 3
    finally:
        path.unlink(missing_ok=True)


@pytest.mark.parametrize("format", ["csv", "parquet"])
def test_native_variant_export_preserves_nested_hugeint(remote, format):
    """2026-11-03: a readable VARIANT containing HUGEINT must remain exportable."""
    _instance, identifier, _info = remote
    big = str(2**127 - 1)
    sql = f"SELECT {{'n':'{big}'::HUGEINT}}::VARIANT AS value"
    response = TestClient(app).post("/api/query-results/export", json={
        "sql": sql, "format": format, "quack_service_id": identifier,
    })
    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    path = config_manager.get_exports_dir() / f'{payload["file_id"]}.{format}'
    try:
        assert payload["row_count_estimate"] == 1
        with duckdb.connect() as reader:
            if format == "parquet":
                actual = reader.execute("SELECT value::VARCHAR FROM read_parquet(?)", [str(path)]).fetchone()[0]
            else:
                actual = reader.execute("SELECT value FROM read_csv(?,all_varchar=true)", [str(path)]).fetchone()[0]
        assert big in actual
    finally:
        path.unlink(missing_ok=True)


@pytest.mark.parametrize("alias", ["query", "nextval", "quack_totals", "daily_query"])
def test_native_readonly_table_alias_is_not_function_dispatch(remote, alias):
    """2026-11-03: a quoted table alias plus column list is not a SQL function."""
    _instance, identifier, info = remote
    sql = f'SELECT n FROM range(3) AS "{alias}"(n) ORDER BY n'
    assert info["server"].execute(sql).fetchall() == [(0,), (1,), (2,)]
    response = TestClient(app).post(f"/api/quack/services/{identifier}/execute", json={
        "sql": sql, "is_preview": False,
    })
    assert response.status_code == 200, response.text
    assert response.json()["data"]["data"] == [{"n": 0}, {"n": 1}, {"n": 2}]


def test_native_cancel_uses_captured_credentials_after_config_edit(remote):
    """2026-11-03: in-flight control callback must retain its original credentials."""
    instance, identifier, info = remote
    sql = "SELECT sum(sin(i)) AS n FROM range(1000000000000) r(i)"
    request_id = "adversarial-edit-" + uuid.uuid4().hex
    query_id = f"sync:{request_id}"
    runners = []
    ready = threading.Event()

    def on_ready(runner):
        runners.append(runner)
        ready.set()

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(instance.execute, identifier, sql, False, request_id, on_ready)
        try:
            assert ready.wait(5)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                active = info["server"].execute("SELECT query FROM quack_active_connections()").fetchall()
                if any("sin(i)" in (row[0] or "") for row in active):
                    break
                time.sleep(0.01)
            else:
                pytest.fail("Owned query never reached the synthetic server")
            instance.save_service(QuackServiceConfig(
                name="Updated while active", uri=info["uri"], token="different-synthetic-token",
            ), identifier)
            assert runners[0].cancel()
            with pytest.raises(QuackError) as exc:
                future.result(timeout=10)
            assert exc.value.code == "QUERY_CANCELLED"
            assert not runners[0].cancel()
        finally:
            if runners:
                runners[0].cancel()
            connection_registry.forget_publication(query_id)
            instance.save_service(QuackServiceConfig(
                name="Synthetic server", uri=info["uri"], token=info["token"],
            ), identifier)
    assert instance.execute(identifier, "SELECT 42 AS n", False)["data"] == [{"n": 42}]


def test_native_malformed_credential_error_does_not_echo_secret_prefix(remote, caplog):
    """2026-11-03: native parser excerpts must not disclose a truncated credential."""
    instance, identifier, info = remote
    prefix = "adversarial-sensitive-credential-prefix"
    token = prefix + "\x00sensitive-suffix"
    instance.save_service(QuackServiceConfig(
        name="Synthetic invalid credential", uri=info["uri"], token=token,
    ), identifier)
    response = TestClient(app).post(f"/api/quack/services/{identifier}/execute", json={"sql": "SELECT 1"})
    assert response.status_code == 400
    assert prefix not in response.text + caplog.text


@pytest.mark.parametrize("token", ["a" * 48, "v2:" + "a" * 48], ids=["base64_hex", "v2_like_plaintext"])
def test_default_encrypt_passthrough_rejects_base64_plaintext(tmp_path, monkeypatch, token):
    """2026-11-03: Base64-shaped plaintext must not bypass encryption failure checks."""
    instance = QuackService(config_path=tmp_path / "services.json")
    assert EncryptionUtils.is_encrypted(token)
    monkeypatch.setattr(EncryptionUtils, "encrypt_password", classmethod(lambda _cls, value: value))
    with pytest.raises(QuackError) as exc:
        instance.save_service(QuackServiceConfig(name="Synthetic", uri="quack:localhost", token=token))
    assert exc.value.code == "QUACK_CONFIG_ERROR"
    assert not instance._path().exists()


@pytest.mark.parametrize("fault", ["utility_exception", "invalid_utf8_payload"])
def test_default_decryption_failure_is_local_before_native_attach(quack_server, tmp_path, monkeypatch, fault):
    """2026-11-03: failed XOR-v2 decoding must not send stored ciphertext as a Token."""
    instance = QuackService(config_path=tmp_path / "services.json",
                            extension_directory=quack_server["extension_directory"])
    item = instance.save_service(QuackServiceConfig(
        name="Synthetic default cipher", uri=quack_server["uri"], token=quack_server["token"],
    ))
    if fault == "invalid_utf8_payload":
        rows = instance._read()
        # An otherwise valid Base64 payload that XOR-decodes to invalid UTF-8.
        corrupt = bytes([EncryptionUtils._KEY.encode("utf-8")[0] ^ 0xFF])
        rows[0]["token"] = "v2:" + base64.b64encode(corrupt).decode("ascii")
        instance._write(rows)
    stored = instance._get(item["id"])["token"]
    assert stored.startswith("v2:") and stored != quack_server["token"]
    attached_tokens = []
    attach = instance._attach

    def attach_probe(connection, config, allow_install):
        attached_tokens.append(config["token"] == stored)
        return attach(connection, config, allow_install)

    def fail_xor(_cls, _data, _key):
        raise ValueError("Synthetic decryption failure")

    monkeypatch.setattr(instance, "_attach", attach_probe)
    if fault == "utility_exception":
        monkeypatch.setattr(EncryptionUtils, "_xor_encrypt_decrypt", classmethod(fail_xor))
    with pytest.raises(QuackError) as exc:
        instance.execute(item["id"], "SELECT 1", False)
    assert (exc.value.code, attached_tokens) == ("QUACK_CONFIG_ERROR", [])


@pytest.mark.parametrize("sql", [
    'SELECT n FROM range(3) "query"(n) ORDER BY n',
    'WITH "query"(n) AS (SELECT * FROM range(3)) SELECT n FROM "query" ORDER BY n',
    'WITH first AS (SELECT 7), "nextval"(n) AS (SELECT * FROM range(3)) SELECT n FROM "nextval" ORDER BY n',
    'SELECT n FROM (SELECT * FROM range(3)) "daily_query"(n) ORDER BY n',
])
def test_native_readonly_cte_and_implicit_aliases(remote, sql):
    """2026-11-03: native alias classification must handle CTEs and omitted AS."""
    _instance, identifier, info = remote
    assert info["server"].execute(sql).fetchall() == [(0,), (1,), (2,)]
    response = TestClient(app).post(f"/api/quack/services/{identifier}/execute", json={"sql": sql})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["data"] == [{"n": 0}, {"n": 1}, {"n": 2}]


@pytest.mark.parametrize("sql", [
    'WITH "query"(n) AS (SELECT nextval(\'seq\')) SELECT n FROM "query"',
    'SELECT * FROM main."query"(\'SELECT 1\') AS "query"(n)',
    'SELECT * FROM (SELECT * FROM "query_table"(\'records\')) "query"(n)',
    'EXPLAIN SELECT * FROM main."query"(\'SELECT 1\')',
])
def test_readonly_alias_exceptions_do_not_allow_real_dynamic_calls(sql):
    """2026-11-03: alias disambiguation cannot exempt real nested/quoted calls."""
    from core.services.quack_service import validate_quack_sql

    with pytest.raises(QuackError) as exc:
        validate_quack_sql(sql)
    assert exc.value.code == "QUACK_READ_ONLY_REQUIRED"


@pytest.mark.parametrize("expression", [
    'union_value(n := 42)::UNION(n INTEGER,label VARCHAR)',
    "{'big':1::HUGEINT,'nested':union_value(n := 42)::UNION(n INTEGER,label VARCHAR)}",
])
def test_native_parquet_union_export_is_explicit_and_leaves_no_file(remote, expression):
    """2026-11-03: Parquet must reject UNION even after a text-only sibling field."""
    _instance, identifier, _info = remote
    exports = config_manager.get_exports_dir()
    before = set(exports.glob("*.parquet"))
    response = TestClient(app).post("/api/query-results/export", json={
        "sql": f"SELECT {expression} AS value", "format": "parquet", "quack_service_id": identifier,
    })
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "QUACK_UNSUPPORTED_PARQUET_TYPE"
    assert set(exports.glob("*.parquet")) == before


@pytest.mark.parametrize("expression", [
    "TIMETZ '12:34:56.123456+05:30'",
    "[INTERVAL '3 microseconds',NULL]",
])
def test_native_parquet_lossy_types_are_documented_text(remote, expression):
    """2026-11-03: explicit VARCHAR mapping preserves offset and nested microseconds."""
    _instance, identifier, info = remote
    # DuckDB's own renderer defines the nested text representation.
    expected = info["server"].execute(f"SELECT ({expression})::VARCHAR").fetchone()[0]
    response = TestClient(app).post("/api/query-results/export", json={
        "sql": f"SELECT {expression} AS value", "format": "parquet", "quack_service_id": identifier,
    })
    assert response.status_code == 200, response.text
    payload = response.json()["data"]
    path = config_manager.get_exports_dir() / f'{payload["file_id"]}.parquet'
    try:
        with duckdb.connect() as reader:
            cursor = reader.execute("SELECT value FROM read_parquet(?)", [str(path)])
            assert str(cursor.description[0][1]) == "VARCHAR"
            assert cursor.fetchone() == (expected,)
    finally:
        path.unlink(missing_ok=True)


@pytest.mark.parametrize("outcome", ["success", "binding_error", "cancelled"])
def test_native_source_readonly_detaches_and_preserves_publication(tmp_path, monkeypatch, outcome):
    """2026-11-03: native-source leases must detach after success, failure and cancel."""
    from core.database import federated_attach

    source = tmp_path / "source.duckdb"
    alias = "_quack_transfer_" + uuid.uuid4().hex
    target = "adversarial_native_" + uuid.uuid4().hex
    query_id = "adversarial-native-" + uuid.uuid4().hex
    with duckdb.connect(str(source)) as writer:
        writer.execute("CREATE TABLE result AS SELECT 42 AS n")
    with with_duckdb_connection() as local:
        local.execute(f'CREATE TABLE "{target}" AS SELECT 77 AS n')
    original = federated_attach.create_query_staging_table
    observed = []

    def stage(connection, sql, staging_name=None):
        observed.append(connection.execute("SELECT readonly FROM duckdb_databases() WHERE database_name=?", [alias]).fetchone())
        assert connection_registry.get(query_id).connection is connection
        if outcome == "cancelled":
            assert connection_registry.interrupt_with_remote(query_id)
        return original(connection, sql, staging_name)

    monkeypatch.setattr(federated_attach, "create_query_staging_table", stage)
    table = "missing" if outcome == "binding_error" else "result"
    try:
        arguments = dict(query_id=query_id, native_source=(alias, str(source)))
        sql = f'SELECT * FROM "{alias}".main.{table}'
        if outcome == "success":
            assert federated_attach.execute_sql_and_persist(sql, target, **arguments)["row_count"] == 1
        else:
            with pytest.raises(duckdb.Error):
                federated_attach.execute_sql_and_persist(sql, target, **arguments)
        assert observed == [(True,)]
        with with_duckdb_connection() as local:
            assert local.execute("SELECT count(*) FROM duckdb_databases() WHERE database_name=?", [alias]).fetchone() == (0,)
            assert local.execute(f'SELECT n FROM "{target}"').fetchone() == ((42,) if outcome == "success" else (77,))
    finally:
        connection_registry.forget_publication(query_id)
        with with_duckdb_connection() as local:
            local.execute(f'DROP TABLE IF EXISTS "{target}"')


def test_native_explain_readonly_alias_is_allowed(remote):
    """2026-11-03: scanning EXPLAIN's body must still allow table aliases."""
    _instance, identifier, _info = remote
    response = TestClient(app).post(f"/api/quack/services/{identifier}/execute", json={
        "sql": 'EXPLAIN SELECT n FROM range(3) AS "query"(n)',
    })
    assert response.status_code == 200, response.text
    assert response.json()["data"]["row_count"] > 0


def test_native_concurrent_saves_keep_union_tags_and_detach_sources(remote):
    """2026-11-03: per-save native attachments cannot collide in the local pool."""
    _instance, identifier, _info = remote
    names = ["adversarial_parallel_" + uuid.uuid4().hex for _ in range(4)]
    query_ids = ["adversarial-parallel-" + uuid.uuid4().hex for _ in names]

    def save(index):
        sql = f"SELECT union_value(n := '{2**127 - 1 - index}'::HUGEINT)::UNION(n HUGEINT,label VARCHAR) AS value"
        return persist_quack_query(sql, names[index], identifier, query_ids[index])

    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(save, range(len(names))))
        assert [item["row_count"] for item in results] == [1] * len(names)
        with with_duckdb_connection() as local:
            for index, name in enumerate(names):
                assert local.execute(f'SELECT union_tag(value)::VARCHAR, union_extract(value,\'n\') FROM "{name}"').fetchone() == ("n", 2**127 - 1 - index)
            assert not local.execute("SELECT database_name FROM duckdb_databases() WHERE starts_with(database_name,'_quack_transfer_')").fetchall()
    finally:
        for query_id in query_ids:
            connection_registry.forget_publication(query_id)
        with with_duckdb_connection() as local:
            for name in names:
                local.execute(f'DROP TABLE IF EXISTS "{name}"')


@pytest.mark.parametrize("executor", [
    "json_execute_serialized_sql",
    '"json_execute_serialized_sql"',
    'main."json_execute_serialized_sql"',
])
@pytest.mark.parametrize("prefix", ["", "EXPLAIN "])
def test_native_serialized_executor_cannot_advance_sequence(remote, executor, prefix):
    """2026-11-03: serialized SELECT can hide nextval behind a dynamic executor."""
    from core.common.sql_identifiers import escape_string_literal

    _instance, identifier, info = remote
    server = info["server"]
    sequence = "adversarial_sequence_" + uuid.uuid4().hex
    server.execute(f'CREATE SEQUENCE "{sequence}"')
    try:
        body = server.execute("SELECT json_serialize_sql(?)", [f"SELECT nextval('{sequence}') AS n"]).fetchone()[0]
        sql = f"{prefix}SELECT * FROM {executor}('{escape_string_literal(body)}')"
        response = TestClient(app).post(f"/api/quack/services/{identifier}/execute", json={
            "sql": sql, "is_preview": False,
        })
        last = server.execute("SELECT last_value FROM duckdb_sequences() WHERE sequence_name=?", [sequence]).fetchone()[0]
        assert (response.status_code, last) == (400, None), response.text
        assert response.json()["error"]["code"] == "QUACK_READ_ONLY_REQUIRED"
    finally:
        server.execute(f'DROP SEQUENCE "{sequence}"')


@pytest.mark.parametrize("sql", [
    'SELECT n FROM range(3) AS "json_execute_serialized_sql"(n) ORDER BY n',
    'SELECT n FROM range(3) "json_execute_serialized_sql"(n) ORDER BY n',
    'WITH "json_execute_serialized_sql"(n) AS (SELECT * FROM range(3)) SELECT n FROM "json_execute_serialized_sql" ORDER BY n',
])
def test_native_serialized_executor_name_remains_valid_as_alias(remote, sql):
    """2026-11-03: blocking an executor name must not block its harmless aliases."""
    _instance, identifier, _info = remote
    response = TestClient(app).post(f"/api/quack/services/{identifier}/execute", json={
        "sql": sql, "is_preview": False,
    })
    assert response.status_code == 200, response.text
    assert response.json()["data"]["data"] == [{"n": 0}, {"n": 1}, {"n": 2}]


@pytest.mark.parametrize("outcome", ["cancel", "timeout"])
def test_native_adopted_sync_query_keeps_cancel_and_timeout_status(remote, outcome):
    """2026-11-03: sync cancel after adoption must not turn its task into FAILED."""
    from core.services.task_manager import TaskStatus, task_manager

    instance, identifier, info = remote
    if outcome == "timeout":
        instance.save_service(QuackServiceConfig(
            name="Synthetic deadline", uri=info["uri"], token=info["token"], timeout_seconds=3,
        ), identifier)
    request_id = "adversarial-adoption-" + uuid.uuid4().hex
    query_id = f"sync:{request_id}"
    client = TestClient(app)
    sql = "SELECT sum(sin(i)) AS n FROM range(1000000000000) r(i)"
    task_id = None
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(client.post, f"/api/quack/services/{identifier}/execute",
                                 json={"sql": sql, "is_preview": False},
                                 headers={"X-Request-ID": request_id})
        try:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                active = info["server"].execute("SELECT query FROM quack_active_connections()").fetchall()
                if any("1000000000000" in (row[0] or "") for row in active):
                    break
                time.sleep(0.01)
            else:
                pytest.fail("Owned slow query did not reach Quack")
            adopted = client.post(f"/api/query/background/{request_id}")
            assert adopted.status_code == 200, adopted.text
            task_id = adopted.json()["data"]["task_id"]
            assert task_manager.get_task(task_id).status == TaskStatus.RUNNING
            if outcome == "cancel":
                cancelled = client.post(f"/api/query/cancel/{request_id}")
                assert cancelled.status_code == 200, cancelled.text
            response = future.result(timeout=10)
            expected_code = "QUERY_CANCELLED" if outcome == "cancel" else "QUERY_TIMEOUT"
            assert response.status_code == (499 if outcome == "cancel" else 504), response.text
            assert response.json()["error"]["code"] == expected_code
            detail = client.get(f"/api/async-tasks/{task_id}")
            assert detail.status_code == 200, detail.text
            expected_status = TaskStatus.CANCELLED if outcome == "cancel" else TaskStatus.FAILED
            assert detail.json()["data"]["task"]["status"] == expected_status.value
            assert task_manager.get_task(task_id).status == expected_status
            assert not (config_manager.get_exports_dir() / f"task-{task_id}-snapshot.json").exists()
        finally:
            if not future.done():
                client.post(f"/api/query/cancel/{request_id}")
                future.result(timeout=10)
            connection_registry.forget_publication(query_id)


@pytest.mark.parametrize("as_json", [False, True], ids=["dict", "json_response"])
@pytest.mark.parametrize("code,message,expected", [
    ("QUERY_CANCELLED", "Stopped by the caller", "cancelled"),
    ("QUERY_TIMEOUT", "Query cancelled after deadline", "failed"),
    ("QUACK_QUERY_FAILED", "Query cancelled is merely text here", "failed"),
])
def test_adopted_failure_status_depends_on_error_code_not_message(as_json, code, message, expected):
    """2026-11-03: cancel classification uses stable error.code, including dict errors."""
    from fastapi.responses import JSONResponse
    from core.services.foreground_queries import ForegroundQueries
    from core.services.task_manager import task_manager

    registry = ForegroundQueries()
    request_id = "adversarial-code-" + uuid.uuid4().hex
    registry.begin(request_id, "SELECT 1")
    task_id = registry.promote(request_id)
    payload = {"success": False, "error": {"code": code, "message": message}, "message": message}
    response = JSONResponse(payload) if as_json else payload
    registry.finish(request_id, response=response)
    assert task_manager.get_task(task_id).status.value == expected
    assert request_id not in registry._active
