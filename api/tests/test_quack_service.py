"""Quack regression coverage (2026-11-03): isolation, precision and inner writes.

All native tests run against an owned localhost in-memory server with synthetic
rows. They never install extensions or use the developer's App/database paths.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
from pathlib import Path
import os
import socket
import threading
import time

import duckdb
import pytest
from pydantic import ValidationError

from core.database.connection_registry import connection_registry
from core.security.encryption import PasswordEncryptor
from core.services.quack_service import QuackError, QuackService, validate_quack_sql
from models.quack_models import QuackServiceConfig


@pytest.fixture(scope="module")
def quack_server():
    """Owned native Quack 2.0 server; cached official extensions only."""
    configured = os.environ.get("DUCKQUERY_QUACK_TEST_EXTENSIONS")
    if not configured:
        pytest.skip("Set DUCKQUERY_QUACK_TEST_EXTENSIONS to installed official Quack extensions")
    directory = Path(configured)
    version = duckdb.__version__
    if not directory.exists():
        pytest.skip("Set DUCKQUERY_QUACK_TEST_EXTENSIONS to installed official Quack extensions")
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    uri = f"quack:127.0.0.1:{port}"
    token = "quack-synthetic-'private-token"
    with duckdb.connect(":memory:", config={
        "extension_directory": str(directory), "autoinstall_known_extensions": "false",
    }) as server:
        try:
            server.execute("LOAD httpfs")
            server.execute("LOAD quack")
        except duckdb.Error as exc:
            pytest.skip(f"Native Quack extensions unavailable for DuckDB {version}: {type(exc).__name__}")
        server.execute("CREATE TABLE records AS SELECT i::INTEGER AS id, (i % 3)::INTEGER AS status FROM range(100001) r(i)")
        server.execute("CREATE TABLE exact_values AS SELECT '1234567890123456789.1234567890123456789'::DECIMAL(38,19) AS amount, "
                       "'170141183460469231731687303715884105727'::HUGEINT AS big, [1,2,NULL] AS items, "
                       "{'code': 'x', 'n': 3} AS obj, DATE '2026-11-03' AS day")
        server.execute('CREATE SCHEMA "odd\'schema"')
        server.execute('CREATE TABLE "odd\'schema"."a\'table" ("v\'column" VARCHAR)')
        server.execute("CREATE VIEW recent_records AS SELECT * FROM records WHERE id < 10")
        server.execute("CALL quack_serve(?, token=?)", [uri, token])
        catalog = server.execute("SELECT current_database()").fetchone()[0]
        try:
            yield {"uri": uri, "token": token, "catalog": catalog,
                   "extension_directory": directory, "server": server}
        finally:
            server.execute("CALL quack_stop(?)", [uri])


@pytest.fixture
def service(tmp_path):
    """Per-test config/key separate from any installed application."""
    from cryptography.fernet import Fernet
    return QuackService(tmp_path / "quack-services.json", tmp_path / "extensions", PasswordEncryptor(Fernet.generate_key()))


@pytest.fixture
def connected(service, quack_server):
    """Register a server without triggering extension installation."""
    service._extension_directory = quack_server["extension_directory"]
    item = service.save_service(QuackServiceConfig(name="Synthetic server", uri=quack_server["uri"], token=quack_server["token"]))
    return service, item["id"], quack_server


def test_configuration_encrypted_atomic_and_omitted_token_retained(service):
    """2026-11-03: credentials must not leak through public CRUD or disk."""
    item = service.save_service(QuackServiceConfig(name="One", uri="quack:localhost", token="private-original"))
    assert item["has_token"] and "token" not in item
    raw = service._path().read_text()
    assert "private-original" not in raw
    assert service._cipher().is_encrypted(json.loads(raw)["services"][0]["token"])
    assert service._path().stat().st_mode & 0o777 == 0o600
    updated = service.save_service(QuackServiceConfig(name="Renamed", uri="quack:localhost:9494"), item["id"])
    assert updated["created_at"] == item["created_at"]
    assert service._credentials(item["id"])["token"] == "private-original"
    assert service.list_services() == [updated]
    service.save_service(QuackServiceConfig(name="Empty", uri="quack:localhost", token=""), item["id"])
    assert not service.get_service(item["id"])["has_token"]
    service.delete_service(item["id"])
    assert service.list_services() == []
    with pytest.raises(QuackError, match="not found"):
        service.get_service(item["id"])


def test_crud_does_not_load_extensions_or_open_network(service, monkeypatch):
    """2026-11-03: listing/configuration must stay offline."""
    monkeypatch.setattr(duckdb, "connect", lambda *_a, **_k: pytest.fail("CRUD opened DuckDB"))
    assert service.list_services() == []
    item = service.save_service(QuackServiceConfig(name="Offline", uri="quack:example.invalid"))
    service.delete_service(item["id"])


def test_atomic_config_failure_preserves_old_file(service, monkeypatch):
    """2026-11-03: failed replace may not truncate saved services."""
    item = service.save_service(QuackServiceConfig(name="One", uri="quack:localhost"))
    original = service._path().read_bytes()
    def fail(*_args):
        raise OSError("Synthetic disk failure")
    monkeypatch.setattr(os, "replace", fail)
    with pytest.raises(OSError):
        service.save_service(QuackServiceConfig(name="Two", uri="quack:localhost"), item["id"])
    assert service._path().read_bytes() == original
    assert list(service._path().parent.glob("*.tmp")) == []


def test_encryption_failure_never_saves_plaintext(service, monkeypatch):
    """2026-11-03: legacy encryptor's plaintext fallback must be rejected."""
    monkeypatch.setattr(service._cipher(), "encrypt_password", lambda text: text)
    with pytest.raises(QuackError, match="encrypt"):
        service.save_service(QuackServiceConfig(name="One", uri="quack:localhost", token="private"))
    assert not service._path().exists()


def test_default_cipher_reuses_machine_local_xor_v2(tmp_path):
    """2026-11-03: Quack must not activate the legacy Fernet write path."""
    from utils.encryption_utils import EncryptionUtils
    implementation = QuackService(config_path=tmp_path / "services.json")
    item = implementation.save_service(QuackServiceConfig(name="Default", uri="quack:localhost", token="machine-local-private"))
    encrypted = json.loads(implementation._path().read_text())["services"][0]["token"]
    assert encrypted.startswith("v2:")
    assert EncryptionUtils.decrypt_password(encrypted) == "machine-local-private"
    assert implementation._credentials(item["id"])["token"] == "machine-local-private"


@pytest.mark.parametrize("uri", ["mysql:localhost", "quack:user:password@host", "quack:host/db", "quack:host?token=secret", "quack:host:0", "quack:host:65536", "quack:host'; SELECT 1", "quack:host#token"])
def test_invalid_endpoint(uri):
    """2026-11-03: endpoint strings cannot embed credentials or SQL."""
    with pytest.raises(ValidationError):
        QuackServiceConfig(name="Test", uri=uri)


@pytest.mark.parametrize("uri", ["quack:localhost", "quack://host:9494", "quack:[::1]:9000"])
def test_valid_endpoint(uri):
    assert QuackServiceConfig(name=" Test ", uri=uri).name == "Test"


@pytest.mark.parametrize("sql", [
    "INSERT INTO records VALUES (1,1)", "SELECT 1; DELETE FROM records", "EXPLAIN ANALYZE DELETE FROM records",
    "WITH t AS (SELECT 1) DELETE FROM records", "CALL quack_serve()", "CONNECT _quack", "COPY records TO 'x.csv'",
    "SELECT * FROM query('DELETE FROM records RETURNING *')",
    'SELECT * FROM "query"(\'DELETE FROM records RETURNING *\')',
    'SELECT * FROM other."query"(\'DELETE FROM records RETURNING *\')',
    "SELECT * FROM quack_query('quack:x','DELETE FROM records RETURNING *')",
    'SELECT * FROM "quack_query_by_name"(\'x\',\'DROP TABLE records\')',
    "SELECT * FROM postgres_query('x','DELETE FROM records RETURNING *')",
    'SELECT * FROM "mysql_query"(\'x\',\'DELETE FROM records\')',
    "SELECT * FROM (SELECT * FROM db.query('INSERT INTO records VALUES (1,1)')) t",
    "SELECT nextval('seq')", "PRAGMA database_list", "SELECT 1 /* comment */; SELECT 2",
])
def test_readonly_guard_rejects_nested_writes(sql):
    """2026-11-03: outer SELECT may hide dynamic remote writes."""
    with pytest.raises(QuackError) as error:
        validate_quack_sql(sql)
    assert error.value.code == "QUACK_READ_ONLY_REQUIRED"


@pytest.mark.parametrize("sql", ["SELECT 1", "WITH t AS (SELECT 1) FROM t", "SELECT 'query(DELETE)' AS text", 'SELECT "query" FROM records', "SELECT 1; -- trailing", "DESCRIBE records", "SHOW TABLES", "EXPLAIN SELECT 1", "SELECT * FROM range(3)"])
def test_readonly_guard_accepts_native_queries(sql):
    validate_quack_sql(sql)


def test_native_precision_and_duplicate_names(connected):
    """2026-11-03: remote DECIMAL38/HUGEINT must survive HTTP JSON exactly."""
    service, identifier, _server = connected
    result = service.execute(identifier, "SELECT *, 1 AS id, 2 AS id FROM exact_values", False)
    row = result["data"][0]
    assert row["amount"] == "1234567890123456789.1234567890123456789"
    assert row["big"] == "170141183460469231731687303715884105727"
    assert json.loads(row["items"]) == [1, 2, None]
    assert json.loads(row["obj"]) == {"code": "x", "n": 3}
    assert row["day"] == "2026-11-03 00:00:00"
    assert row["id"] == 1 and row["id_1"] == 2
    assert result["column_types"][0] == {"name": "amount", "duckdb_type": "DECIMAL(38,19)"}


def test_native_complex_values_match_existing_lossless_encoder(connected):
    """2026-11-03: remote transport must preserve native types before encoding."""
    from core.common.utils import records_from_cursor
    service, identifier, info = connected
    sql = """SELECT '-170141183460469231731687303715884105728'::HUGEINT AS minimum,
        '340282366920938463463374607431768211455'::UHUGEINT AS maximum,
        '0.0000000000000000001'::DECIMAL(38,19) AS small_decimal,
        TIMESTAMPTZ '2026-11-03 10:20:30.123456+08:00' AS stamp,
        INTERVAL '3 days 4 hours' AS duration,
        UUID '123e4567-e89b-12d3-a456-426614174000' AS uuid_value,
        MAP([1,2], ['a','b']) AS mapping,
        ['9007199254740993'::BIGINT, NULL] AS nested_ints,
        {'value': '0.0000000000000000001'::DECIMAL(38,19)} AS nested_decimal,
        TRUE AS enabled, NULL::INTEGER AS missing, 'NaN'::DOUBLE AS non_finite"""
    cursor = info["server"].execute(sql)
    expected_types = [str(column[1]) for column in cursor.description]
    names, expected = records_from_cursor(cursor)
    result = service.execute(identifier, sql, False)
    assert result["columns"] == names
    assert result["data"] == expected
    assert [column["duckdb_type"] for column in result["column_types"]] == expected_types
    assert result["data"][0]["minimum"] == "-170141183460469231731687303715884105728"
    assert result["data"][0]["maximum"] == "340282366920938463463374607431768211455"
    from decimal import Decimal
    assert Decimal(result["data"][0]["small_decimal"]) == Decimal("0.0000000000000000001")


def test_native_metadata_and_escaped_names(connected):
    """2026-11-03: metadata executes remotely and escapes literal identifiers."""
    service, identifier, info = connected
    catalogs = service.catalogs(identifier)
    assert {"name": info["catalog"], "type": "duckdb"} in catalogs
    assert {"name": "main", "catalog": info["catalog"]} in service.schemas(identifier, info["catalog"])
    tables = service.tables(identifier, info["catalog"], "main")
    assert any(item["name"] == "recent_records" and item["type"] == "VIEW" for item in tables)
    columns = service.columns(identifier, info["catalog"], "odd'schema", "a'table")
    assert columns == [{"name": "v'column", "type": "VARCHAR", "nullable": True, "ordinal_position": 1}]
    assert service.tables(identifier, "' OR TRUE --", "main") == []


def test_native_preview_and_explicit_limits(connected):
    """2026-11-03: preview only adds a missing outer limit, never replaces one."""
    from core.common.config_manager import config_manager
    service, identifier, _server = connected
    maximum = config_manager.get_app_config().max_query_rows
    preview = service.execute(identifier, "SELECT * FROM records -- trailing comment")
    assert preview["row_count"] == maximum
    assert preview["preview_limit_applied"] == maximum
    explicit = service.execute(identifier, "SELECT * FROM records LIMIT 12000")
    assert explicit["row_count"] == 12000 and explicit["preview_limit_applied"] is None
    aggregate = service.execute(identifier, "SELECT count(*) AS total FROM records")
    assert aggregate["data"] == [{"total": 100001}]
    full = service.execute(identifier, "SELECT * FROM records", False)
    assert full["row_count"] == 100001


def test_native_context_isolated_and_readonly_before_network(connected, monkeypatch):
    """2026-11-03: remote state must not leak to another query or local pool."""
    service, identifier, _info = connected
    with service.query_context(identifier, "SELECT count(*) n FROM records") as (connection, sql):
        assert connection.execute("SELECT current_database()").fetchone()[0] == "memory"
        assert connection.execute(sql).fetchone() == (100001,)
    with service.query_context(identifier, "SELECT 1") as (second, _sql):
        assert second.execute("SHOW TABLES").fetchall() == []
    monkeypatch.setattr(service, "_connection", lambda *_a, **_k: pytest.fail("Unsafe SQL reached network"))
    with pytest.raises(QuackError):
        service.execute(identifier, "SELECT * FROM db.query('DELETE FROM records RETURNING *')")


def test_native_remote_cancel_and_next_query(connected):
    """2026-11-03: cancel interrupts server work through a second connection."""
    service, identifier, info = connected
    ready = threading.Event()
    runners = []
    def on_ready(runner):
        runners.append(runner)
        ready.set()
    request_id = "quack-native-cancel"
    def execute():
        with pytest.raises(QuackError) as error:
            service.execute(identifier, "SELECT sum(sin(i)) FROM range(1000000000000) t(i)", False, request_id, on_ready)
        return error.value.code
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(execute)
        assert ready.wait(10)
        remote_id = runners[0].remote_connection_id
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            active = info["server"].execute("SELECT connection_id, query FROM quack_active_connections()").fetchall()
            if any(row[0] == remote_id and "sin(i)" in (row[1] or "") for row in active):
                break
            time.sleep(0.01)
        else:
            pytest.fail("Synthetic query did not reach remote server")
        assert connection_registry.interrupt_with_remote(f"sync:{request_id}")
        assert future.result(timeout=10) == "QUERY_CANCELLED"
    assert connection_registry.get(f"sync:{request_id}") is None
    assert info["server"].execute(
        "SELECT count(*) FROM quack_active_connections() WHERE connection_id=?", [remote_id],
    ).fetchone()[0] == 0
    assert runners[0].cancel() is False
    assert service.execute(identifier, "SELECT 42 AS answer", False)["data"] == [{"answer": 42}]
    connection_registry.forget_publication(f"sync:{request_id}")


def test_native_timeout_cancels_server_and_allows_next_query(connected):
    """2026-11-03: a timed-out request must also stop remote computation."""
    service, identifier, info = connected
    service.save_service(QuackServiceConfig(name="Timeout", uri=info["uri"], timeout_seconds=1), identifier)
    runners = []
    with pytest.raises(QuackError) as error:
        service.execute(identifier, "SELECT sum(sin(i)) FROM range(1000000000000) t(i)", False, on_ready=runners.append)
    assert error.value.code == "QUERY_TIMEOUT"
    assert info["server"].execute(
        "SELECT count(*) FROM quack_active_connections() WHERE connection_id=?", [runners[0].remote_connection_id],
    ).fetchone()[0] == 0
    assert service.execute(identifier, "SELECT 7 AS n", False)["data"] == [{"n": 7}]


def test_native_pending_cancel_prevents_remote_execution(connected):
    """2026-11-03: cancellation queued before registration must win."""
    service, identifier, _info = connected
    query_id = "sync:quack-pre-registration"
    connection_registry.interrupt_with_remote(query_id, pending_if_missing=True)
    try:
        with pytest.raises(QuackError) as error:
            service.execute(identifier, "SELECT 999 AS n", False, "quack-pre-registration")
        assert error.value.code == "QUERY_CANCELLED"
    finally:
        connection_registry.forget_publication(query_id)


def test_native_client_applies_existing_resource_limits_and_cleans_spill(connected, monkeypatch):
    """2026-11-03: isolated native clients must retain application budgets."""
    from dataclasses import replace
    from core.common.config_manager import config_manager
    config = replace(config_manager.get_app_config(), duckdb_threads=2, duckdb_memory_limit="64MB", duckdb_max_temp_directory_size="128MB")
    monkeypatch.setattr(config_manager, "get_app_config", lambda: config)
    service, identifier, _info = connected
    with service.query_context(identifier, "SELECT 1") as (connection, _sql):
        settings = connection.execute("SELECT current_setting('threads'), current_setting('memory_limit'), current_setting('max_temp_directory_size'), current_setting('temp_directory')").fetchone()
        assert settings[0] == 2
        with duckdb.connect(":memory:", config={"memory_limit": "64MB", "max_temp_directory_size": "128MB"}) as expected:
            assert settings[1:3] == expected.execute("SELECT current_setting('memory_limit'), current_setting('max_temp_directory_size')").fetchone()
        spill = Path(settings[3])
        assert spill.is_dir() and spill.name.startswith("quack-client-")
    assert not spill.exists()


def test_native_errors_redact_token(connected):
    """2026-11-03: native errors may echo SQL literals containing credentials."""
    service, identifier, info = connected
    token = info["token"]
    from core.common.sql_identifiers import escape_string_literal
    with pytest.raises(QuackError) as error:
        service.execute(identifier, f"SELECT CAST('{escape_string_literal(token)}' AS INTEGER)", False)
    assert token not in str(error.value)
    assert escape_string_literal(token) not in str(error.value)
    assert "[REDACTED]" in str(error.value)


def test_queries_never_install_extensions(service):
    """2026-11-03: loading missing extensions fails without implicit downloads."""
    item = service.save_service(QuackServiceConfig(name="Missing", uri="quack:localhost"))
    with pytest.raises(QuackError) as error:
        service.execute(item["id"], "SELECT 1")
    assert error.value.code == "QUACK_EXTENSION_REQUIRED"


@pytest.mark.parametrize("pin_matches", [True, False], ids=["correct-certificate-pin", "wrong-certificate-pin"])
def test_native_https_certificate_pin(service, quack_server, tmp_path, caplog, pin_matches):
    """2026-11-03: HTTPS must honor the saved pin without weakening TLS checks."""
    server = quack_server["server"]
    certificates = tmp_path / "tls-keys"
    certificates.mkdir()
    cursor = server.execute("CALL quack_generate_keys(directory = ?)", [str(certificates)])
    generated = dict(zip([column[0] for column in cursor.description], cursor.fetchone()))
    cert_file, key_file = Path(generated["cert_file"]), Path(generated["key_file"])
    assert cert_file.is_relative_to(certificates) and key_file.is_relative_to(certificates)
    assert cert_file.is_file() and key_file.is_file()
    fingerprint = generated["fingerprint"]
    if not pin_matches:
        # Change one hex digit while keeping a syntactically valid SHA-256 pin.
        fingerprint = ("0" if fingerprint[0] != "0" else "1") + fingerprint[1:]
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    uri = f"quack:127.0.0.1:{port}"
    server.execute(
        "CALL quack_serve(?, token = ?, disable_ssl = false, ssl_cert_file = ?, ssl_key_file = ?)",
        [uri, quack_server["token"], str(cert_file), str(key_file)],
    )
    service._extension_directory = quack_server["extension_directory"]
    saved = service.save_service(QuackServiceConfig(
        name="Local HTTPS", uri=uri, token=quack_server["token"],
        disable_ssl=False, ssl_fingerprint=fingerprint, timeout_seconds=5,
    ))
    try:
        assert saved["disable_ssl"] is False and saved["ssl_fingerprint"] == fingerprint
        assert "token" not in saved
        if pin_matches:
            result = service.execute(saved["id"], "SELECT amount, big FROM exact_values", False)
            assert result["data"] == [{
                "amount": "1234567890123456789.1234567890123456789",
                "big": "170141183460469231731687303715884105727",
            }]
        else:
            with pytest.raises(QuackError) as error:
                service.execute(saved["id"], "SELECT 42 AS answer", False)
            assert error.value.status_code == 400
            assert error.value.code == "QUACK_QUERY_FAILED"
            assert any(word in str(error.value).lower() for word in ("fingerprint", "certificate"))
            from core.common.sql_identifiers import escape_string_literal
            assert quack_server["token"] not in str(error.value) + caplog.text
            assert escape_string_literal(quack_server["token"]) not in str(error.value) + caplog.text
    finally:
        server.execute("CALL quack_stop(?)", [uri])
