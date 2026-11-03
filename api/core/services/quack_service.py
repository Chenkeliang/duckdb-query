"""Independent Quack services and isolated, cancellable remote query sessions.

No local database pool or CONNECT state is used. Extension installation is only
allowed by the explicit connection-test operation and uses the official core
repository. This client's SQL policy does not confer server-side privileges.
"""

from __future__ import annotations

from contextlib import contextmanager
import json
import os
from pathlib import Path
import tempfile
import threading
import time
from typing import Any, Callable, Iterator
from uuid import uuid4

import duckdb
import sqlglot

from core.common.paths import get_config_dir
from core.common.sql_identifiers import escape_string_literal
from core.common.timezone_utils import get_current_time_iso
from core.common.utils import records_from_cursor
from core.database.connection_registry import connection_registry
from core.database.federated_attach import finalize_query_if_not_cancelled
from models.quack_models import QuackServiceConfig
from routers.query_sql_utils import ensure_query_has_limit, has_top_level_limit, statement_accepts_limit
from utils.encryption_utils import EncryptionUtils as password_encryptor


class QuackError(Exception):
    """Public, credential-free error translated by the dedicated router."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def validate_quack_sql(sql: str) -> None:
    """Fail closed on writes and nested dynamic SQL, including quoted names."""
    try:
        tokens = sqlglot.tokenize(sql, read="duckdb")
        select_sql = sql
        if tokens and tokens[0].text.upper() == "EXPLAIN":
            # sqlglot tokenizes an EXPLAIN body as one opaque STRING token.
            select_sql = sql[tokens[0].end + 1:]
            tokens = sqlglot.tokenize(select_sql, read="duckdb")
        blocked_names = set()
        for index, token in enumerate(tokens[:-1]):
            if tokens[index + 1].token_type != sqlglot.TokenType.L_PAREN:
                continue
            if token.token_type == sqlglot.TokenType.STRING:
                continue
            name = str(token.text).lower()
            if (name in {"query", "query_table", "execute", "eval", "nextval", "setval", "dblink", "dblink_exec", "json_execute_serialized_sql", "checkpoint", "force_checkpoint", "write_log"}
                    or name.startswith("quack_") or name.endswith(("_query", "_execute"))):
                blocked_names.add(name)
        with duckdb.connect(":memory:") as parser:
            # Classify EXPLAIN's body too: its outer type can hide a write.
            # Native classification also accepts legal keyword-named aliases.
            statements = parser.extract_statements(select_sql)
            if blocked_names:
                # Native parsing distinguishes real calls from table/CTE aliases
                # with column lists, including implicit aliases and quoted names.
                tree = json.loads(parser.execute("SELECT json_serialize_sql(?)", [select_sql]).fetchone()[0])
                if tree.get("error"):
                    raise QuackError("QUACK_READ_ONLY_REQUIRED", "Unable to verify SQL function calls")
                pending = [tree]
                while pending:
                    node = pending.pop()
                    if isinstance(node, dict):
                        if node.get("class") == "FUNCTION" and str(node.get("function_name", "")).lower() in blocked_names:
                            raise QuackError("QUACK_READ_ONLY_REQUIRED", "Dynamic or mutating SQL functions are not allowed")
                        pending.extend(node.values())
                    elif isinstance(node, list):
                        pending.extend(node)
        if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
            raise QuackError("QUACK_READ_ONLY_REQUIRED", "Only one read-only SQL statement is allowed")
    except QuackError:
        raise
    except Exception:
        raise QuackError("QUACK_READ_ONLY_REQUIRED", "Unable to verify a single read-only SQL statement") from None


_config_lock = threading.RLock()
_extension_lock = threading.Lock()


class QuackService:
    """Separate service configuration and per-operation native connections."""

    def __init__(self, config_path: Path | None = None, extension_directory: Path | None = None,
                 encryptor: Any = None):
        self._config_path = config_path
        self._extension_directory = extension_directory
        self._encryptor = encryptor

    def _path(self) -> Path:
        return self._config_path or get_config_dir() / "quack-services.json"

    def _cipher(self) -> Any:
        return self._encryptor or password_encryptor

    def _read(self) -> list[dict]:
        path = self._path()
        if not path.exists():
            return []
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or not isinstance(payload.get("services"), list):
                raise ValueError("Invalid service configuration")
            return payload["services"]
        except Exception:
            raise QuackError("QUACK_CONFIG_ERROR", "Unable to read Quack service configuration", 500) from None

    def _write(self, services: list[dict]) -> None:
        path = self._path()
        path.parent.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix="quack-services-", suffix=".tmp", dir=path.parent)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                json.dump({"version": 1, "services": services}, handle, ensure_ascii=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            Path(temporary).unlink(missing_ok=True)

    @staticmethod
    def _public(item: dict) -> dict:
        return {key: value for key, value in item.items() if key != "token"} | {"has_token": bool(item.get("token"))}

    def list_services(self) -> list[dict]:
        """List saved services without loading extensions or connecting."""
        with _config_lock:
            return [self._public(item) for item in self._read()]

    def _get(self, service_id: str) -> dict:
        with _config_lock:
            for item in self._read():
                if item["id"] == service_id:
                    return dict(item)
        raise QuackError("QUACK_SERVICE_NOT_FOUND", "Quack service not found", 404)

    def get_service(self, service_id: str) -> dict:
        """Get public metadata for source attribution."""
        return self._public(self._get(service_id))

    def save_service(self, config: QuackServiceConfig, service_id: str | None = None) -> dict:
        """Create or update configuration, atomically and without network access."""
        with _config_lock:
            items = self._read()
            old = self._get(service_id) if service_id else {}
            now = get_current_time_iso()
            item = config.model_dump(exclude={"token"}) | {
                "id": service_id or str(uuid4()), "created_at": old.get("created_at", now),
                "updated_at": now, "token": old.get("token", ""),
            }
            if config.token is not None:
                plaintext = config.token.get_secret_value()
                encrypted = self._cipher().encrypt_password(plaintext)
                if plaintext and (encrypted == plaintext or not self._cipher().is_encrypted(encrypted)):
                    raise QuackError("QUACK_CONFIG_ERROR", "Unable to encrypt Quack credential", 500)
                item["token"] = encrypted
            self._write([row for row in items if row["id"] != item["id"]] + [item])
            return self._public(item)

    def delete_service(self, service_id: str) -> None:
        """Delete only the local registration, never remote data."""
        with _config_lock:
            self._get(service_id)
            self._write([item for item in self._read() if item["id"] != service_id])

    def _credentials(self, service_id: str) -> dict:
        item = self._get(service_id)
        encrypted = item.get("token", "")
        if encrypted and not self._cipher().is_encrypted(encrypted):
            raise QuackError("QUACK_CONFIG_ERROR", "Unable to decrypt Quack credential", 500)
        item["token"] = self._cipher().decrypt_password(encrypted)
        if encrypted and item["token"] == encrypted:
            raise QuackError("QUACK_CONFIG_ERROR", "Unable to decrypt Quack credential", 500)
        return item

    def _extension_path(self) -> Path:
        if self._extension_directory is not None:
            return self._extension_directory
        from core.common.config_manager import config_manager
        return config_manager.get_duckdb_paths().extension_dir

    @contextmanager
    def _connection(self, config: dict, allow_install: bool = False) -> Iterator[Any]:
        """Own every handle; disable implicit extension downloads globally here."""
        from core.common.config_manager import config_manager
        application = config_manager.get_app_config()
        paths = config_manager.get_duckdb_paths()
        paths.temp_dir.mkdir(parents=True, exist_ok=True)
        options = {
            "extension_directory": str(self._extension_path()),
            "autoinstall_known_extensions": "false", "autoload_known_extensions": "false",
            "threads": application.duckdb_threads,
        }
        if application.duckdb_memory_limit:
            options["memory_limit"] = application.duckdb_memory_limit
        if application.duckdb_max_temp_directory_size:
            options["max_temp_directory_size"] = application.duckdb_max_temp_directory_size
        with tempfile.TemporaryDirectory(prefix="quack-client-", dir=paths.temp_dir) as spill:
            options["temp_directory"] = spill
            with duckdb.connect(":memory:", config=options) as connection:
                self._attach(connection, config, allow_install)
                yield connection

    def _attach(self, connection: Any, config: dict, allow_install: bool) -> None:
        """Load explicitly and attach using an in-memory URI-scoped secret."""
        try:
            with _extension_lock:
                for extension in ("httpfs", "quack"):
                    if allow_install:
                        connection.execute(f"INSTALL {extension} FROM core")
                    connection.execute(f"LOAD {extension}")
        except Exception:
            raise QuackError("QUACK_EXTENSION_REQUIRED", "Test the connection to install the required official Quack extensions", 409) from None
        timeout = int(config.get("timeout_seconds", 30))
        connection.execute(f"SET http_timeout={timeout}")
        connection.execute("SET http_retries=0")
        token = config.get("token", "")
        if token:
            connection.execute(
                "CREATE SECRET _quack_auth (TYPE quack, "
                f"TOKEN '{escape_string_literal(token)}', SCOPE '{escape_string_literal(config['uri'])}')"
            )
        options = ["TYPE quack"]
        if config.get("disable_ssl") is not None:
            options.append("DISABLE_SSL " + str(bool(config["disable_ssl"])).lower())
        if config.get("ssl_fingerprint"):
            options.append(f"SSL_FINGERPRINT '{escape_string_literal(config['ssl_fingerprint'])}'")
        connection.execute(f"ATTACH '{escape_string_literal(config['uri'])}' AS _quack ({', '.join(options)})")

    @staticmethod
    def _error(error: Exception, config: dict, cancelled: bool = False) -> QuackError:
        if isinstance(error, QuackError):
            return error
        if cancelled or isinstance(error, duckdb.InterruptException):
            return QuackError("QUERY_CANCELLED", "Query was cancelled", 499)
        message = str(error)
        token = config.get("token", "")
        if token:
            message = message.replace(escape_string_literal(token), "[REDACTED]").replace(token, "[REDACTED]")
        if "timeout" in message.lower() or "timed out" in message.lower():
            return QuackError("QUERY_TIMEOUT", "Quack query timed out", 504)
        return QuackError("QUACK_QUERY_FAILED", message[:4000])

    @contextmanager
    def query_context(self, service_id: str, sql: str, query_id: str | None = None,
                      on_ready: Callable[[Any], None] | None = None, *,
                      expected_revision: str | None = None) -> Iterator[tuple[Any, str]]:
        """Yield a local connection and remote SELECT; caller owns publication."""
        validate_quack_sql(sql)
        config = self._credentials(service_id)
        if expected_revision is not None and config["updated_at"] != expected_revision:
            raise QuackError(
                "QUACK_SERVICE_CHANGED",
                "Quack service configuration changed after task acceptance; retry to use the current configuration",
                409,
            )
        registered = False
        runner = None
        try:
            with self._connection(config) as connection:
                timer = None
                try:
                    if query_id:
                        connection_registry.register(query_id, connection, sql, retain_publication=True)
                        registered = True
                    remote_id = connection.execute("SELECT quack_connection_id('_quack')").fetchone()[0]
                    runner = QuackQueryRunner(self, config, remote_id, connection)
                    if query_id and not connection_registry.register_remote_interrupt(query_id, runner.cancel):
                        raise QuackError("QUERY_CANCELLED", "Query was cancelled", 499)
                    timer = threading.Timer(config.get("timeout_seconds", 30), runner.timeout)
                    timer.daemon = True
                    timer.start()
                    if on_ready:
                        on_ready(runner)
                    if runner.cancelled or (query_id and connection_registry.is_cancel_requested(query_id)):
                        raise QuackError("QUERY_CANCELLED", "Query was cancelled", 499)
                    yield connection, f"SELECT * FROM _quack.query('{escape_string_literal(sql)}')"
                    if runner.cancelled or (query_id and connection_registry.is_cancel_requested(query_id)):
                        raise QuackError("QUERY_CANCELLED", "Query was cancelled", 499)
                except Exception as exc:
                    if runner and self._error(exc, config).code == "QUERY_TIMEOUT":
                        runner.timeout()
                    raise
                finally:
                    if timer:
                        timer.cancel()
                    if runner:
                        runner.close()
                    if registered:
                        connection_registry.unregister(query_id)
        except Exception as exc:
            if runner and runner.timed_out:
                raise QuackError("QUERY_TIMEOUT", "Quack query timed out", 504) from None
            cancelled = bool(runner and runner.cancelled) or bool(query_id and connection_registry.is_cancel_requested(query_id))
            raise self._error(exc, config, cancelled) from None

    def execute(self, service_id: str, sql: str, is_preview: bool = True,
                request_id: str | None = None, on_ready: Callable[[Any], None] | None = None) -> dict:
        """Execute remotely and encode exact native scalars with existing utility."""
        validate_quack_sql(sql)
        limit = None
        executed = sql
        if is_preview and statement_accepts_limit(sql) and not has_top_level_limit(sql):
            from core.common.config_manager import config_manager
            limit = config_manager.get_app_config().max_query_rows
            executed = ensure_query_has_limit(sql, limit)
        started = time.monotonic()
        query_id = f"sync:{request_id}" if request_id else None
        runners = []
        def ready(runner):
            runners.append(runner)
            if on_ready:
                on_ready(runner)
        with self.query_context(service_id, executed, query_id, ready) as (connection, remote_sql):
            cursor = connection.execute(remote_sql)
            description = cursor.description
            columns, records = records_from_cursor(cursor, description)
            result = {
                "columns": columns, "data": records,
                "column_types": [{"name": name, "duckdb_type": str(column[1])} for name, column in zip(columns, description)],
                "row_count": len(records), "preview_limit_applied": limit,
                "sql_executed": executed, "execution_time_ms": (time.monotonic() - started) * 1000,
                "quack_service_id": service_id,
            }
            runners[0].finalize(query_id)
            return result

    def test_connection(self, service_id: str | None = None, config: QuackServiceConfig | None = None) -> dict:
        """Explicitly install official extensions and test authentication."""
        settings = self._credentials(service_id) if service_id else config.model_dump(exclude={"token"})
        if not service_id:
            settings["token"] = config.token.get_secret_value() if config.token else ""
        try:
            with self._connection(settings, allow_install=True) as connection:
                version = connection.execute("SELECT * FROM _quack.query('SELECT version() AS version')").fetchone()[0]
            return {"connected": True, "server_version": version,
                    "application_read_only": True, "server_read_only_verified": False}
        except Exception as exc:
            error = self._error(exc, settings)
            if error.code == "QUACK_QUERY_FAILED":
                error.code = "QUACK_CONNECTION_FAILED"
            raise error from None

    def catalogs(self, service_id: str) -> list[dict]:
        """List real remote catalog types, without guessing from names."""
        return self.execute(service_id, "SELECT database_name AS name, type FROM duckdb_databases() WHERE NOT internal ORDER BY name", False)["data"]

    def schemas(self, service_id: str, catalog: str) -> list[dict]:
        """List remote schemas in the requested catalog."""
        return self.execute(service_id, "SELECT schema_name AS name, catalog_name AS catalog FROM information_schema.schemata "
                            f"WHERE catalog_name='{escape_string_literal(catalog)}' AND schema_name NOT IN ('information_schema','pg_catalog') ORDER BY name", False)["data"]

    def tables(self, service_id: str, catalog: str, schema: str) -> list[dict]:
        """List remote tables and views without scanning their rows."""
        return self.execute(service_id, "SELECT table_name AS name, table_catalog AS catalog, table_schema AS schema, table_type AS type "
                            f"FROM information_schema.tables WHERE table_catalog='{escape_string_literal(catalog)}' "
                            f"AND table_schema='{escape_string_literal(schema)}' ORDER BY name", False)["data"]

    def columns(self, service_id: str, catalog: str, schema: str, table: str) -> list[dict]:
        """List native types and nullability from remote information_schema."""
        return self.execute(service_id, "SELECT column_name AS name, data_type AS type, (is_nullable='YES') AS nullable, ordinal_position "
                            f"FROM information_schema.columns WHERE table_catalog='{escape_string_literal(catalog)}' "
                            f"AND table_schema='{escape_string_literal(schema)}' AND table_name='{escape_string_literal(table)}' ORDER BY ordinal_position", False)["data"]


class QuackQueryRunner:
    """Attempt-scoped cancellation through a second independent control session."""

    def __init__(self, service: QuackService, config: dict, remote_id: str, connection: Any):
        self._service = service
        self._config = config
        self.remote_connection_id = remote_id
        self.connection = connection
        self._lock = threading.RLock()
        self._active = True
        self.cancelled = False
        self.timed_out = False

    def cancel(self) -> bool:
        """Cancel only this remote session, not another service's computation."""
        with self._lock:
            if not self._active:
                return False
            self.cancelled = True
            self.connection.interrupt()
            try:
                with self._service._connection(self._config) as control:
                    row = control.execute("SELECT * FROM quack_cancel('_quack', ?)", [self.remote_connection_id]).fetchone()
                    return bool(row and row[-1])
            except Exception:
                return False

    def timeout(self) -> None:
        """Bound the entire remote execution, including streaming its result."""
        with self._lock:
            if self._active:
                self.timed_out = True
                self.cancel()

    def finalize(self, query_id: str | None) -> None:
        """Commit successful results before retiring deadline/cancel callbacks."""
        with self._lock:
            if self.cancelled:
                raise QuackError("QUERY_CANCELLED", "Query was cancelled", 499)
            finalize_query_if_not_cancelled(query_id)
            self._active = False

    def close(self) -> None:
        """Retire the callback before the native connection closes."""
        with self._lock:
            self._active = False


quack_service = QuackService()


@contextmanager
def quack_query_context(service_id: str, sql: str, query_id: str | None = None, *,
                        expected_revision: str | None = None) -> Iterator[tuple[Any, str]]:
    """Shared remote-read context for local COPY export and typed persistence."""
    with quack_service.query_context(service_id, sql, query_id, expected_revision=expected_revision) as context:  # pylint: disable=contextmanager-generator-missing-cleanup
        yield context
