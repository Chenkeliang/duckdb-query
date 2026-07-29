"""MySQL ATTACH 远端取消回归（2026-07）。

覆盖历史问题：DuckDB ``interrupt()`` 在 mysql_scanner 阻塞取数时不能及时
终止 MySQL 服务端 SQL，必须登记远端会话并通过第二条连接执行 ``KILL QUERY``。
"""

from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import duckdb
import pytest

from core.database.federated_attach import (
    kill_mysql_query,
    mysql_remote_cancellation_scope,
)
from core.database.duckdb_engine import fetch_query_records
from routers.duckdb_query import _uses_mysql_query_table_function


def test_mysql_remote_cancellation_scope_registers_same_transaction_session():
    """会话 ID 必须在包住业务查询的同一 DuckDB 事务中捕获。"""
    connection = MagicMock()
    session_result = MagicMock()
    session_result.fetchone.return_value = (12345,)

    def execute(sql):
        if "SELECT CONNECTION_ID()" in sql:
            return session_result
        return MagicMock()

    connection.execute.side_effect = execute
    config = {
        "type": "mysql",
        "host": "mysql.example",
        "port": 3306,
        "user": "reader",
        "password": "secret",
        "database": "analytics",
    }

    with patch(
        "core.database.federated_attach.connection_registry.register_remote_interrupt",
        return_value=True,
    ) as register_remote:
        with mysql_remote_cancellation_scope(
            connection,
            "sync:test-query",
            [("mysql_prod", config)],
        ):
            connection.execute("SELECT * FROM mysql_prod.analytics.orders")

    executed_sql = [call.args[0] for call in connection.execute.call_args_list]
    assert executed_sql[0] == "BEGIN TRANSACTION"
    assert "SELECT CONNECTION_ID()" in executed_sql[1]
    assert executed_sql[-1] == "COMMIT"
    register_remote.assert_called_once()
    assert register_remote.call_args.args[0] == "sync:test-query"


def test_kill_mysql_query_uses_second_connection_without_exposing_credentials():
    """远端取消使用独立 MySQL 连接，并只发送整数线程 ID。"""
    killer = MagicMock()
    cursor = MagicMock()
    killer.cursor.return_value.__enter__.return_value = cursor
    config = {
        "type": "mysql",
        "host": "mysql.example",
        "port": 3306,
        "username": "reader",
        "password": "secret",
        "database": "analytics",
    }

    with patch("core.database.federated_attach.pymysql.connect", return_value=killer):
        assert kill_mysql_query(config, 12345) is True

    cursor.execute.assert_called_once_with("KILL QUERY 12345")
    killer.close.assert_called_once_with()


def test_mysql_remote_cancellation_scope_does_not_swallow_capture_interrupt():
    """历史回归（2026-07）：捕获会话时取消必须终止，不能降级后继续执行。"""
    connection = MagicMock()

    def execute(sql):
        if "SELECT CONNECTION_ID()" in sql:
            raise duckdb.InterruptException("INTERRUPT Error: Interrupted!")
        return MagicMock()

    connection.execute.side_effect = execute
    config = {
        "type": "mysql",
        "host": "mysql.example",
        "user": "reader",
        "password": "secret",
        "database": "analytics",
    }
    body_executed = False

    with pytest.raises(duckdb.InterruptException):
        with mysql_remote_cancellation_scope(
            connection,
            "sync:cancel-during-capture",
            [("mysql_prod", config)],
        ):
            body_executed = True

    assert body_executed is False
    assert any(call.args[0] == "ROLLBACK" for call in connection.execute.call_args_list)


def test_mysql_remote_cancellation_scope_rolls_back_commit_failure():
    """历史回归（2026-07）：提交失败不得把未结束事务交还连接池。"""
    connection = MagicMock()
    session_result = MagicMock()
    session_result.fetchone.return_value = (12345,)

    def execute(sql):
        if "SELECT CONNECTION_ID()" in sql:
            return session_result
        if sql == "COMMIT":
            raise RuntimeError("commit failed")
        return MagicMock()

    connection.execute.side_effect = execute
    config = {
        "type": "mysql",
        "host": "mysql.example",
        "user": "reader",
        "password": "secret",
        "database": "analytics",
    }

    with patch(
        "core.database.federated_attach.connection_registry.register_remote_interrupt",
        return_value=True,
    ):
        with pytest.raises(RuntimeError, match="commit failed"):
            with mysql_remote_cancellation_scope(
                connection,
                "sync:commit-failure",
                [("mysql_prod", config)],
            ):
                pass

    assert any(call.args[0] == "ROLLBACK" for call in connection.execute.call_args_list)


def test_mysql_query_table_function_detection_uses_ast():
    """历史回归（2026-07）：仅真实 mysql_query 跳过远端 DESCRIBE。"""
    assert _uses_mysql_query_table_function(
        "SELECT * FROM mysql_query('db', 'SELECT 1')"
    )
    assert not _uses_mysql_query_table_function(
        "SELECT 'mysql_query(' AS text /* mysql_query('db', 'SELECT 1') */"
    )


def test_fetch_query_records_can_skip_remote_describe():
    """历史回归（2026-07）：mysql_query 的 DESCRIBE 不得先执行远端 SQL。"""
    connection = MagicMock()
    result = MagicMock()
    result.description = [("slept", "INTEGER")]
    result.fetchall.return_value = [(0,)]
    connection.execute.return_value = result

    with patch("core.database.duckdb_engine._describe_column_types") as describe:
        columns, records, cursor_types = fetch_query_records(
            connection,
            "SELECT * FROM mysql_query('db', 'SELECT SLEEP(60) AS slept')",
            describe_before_execute=False,
        )

    describe.assert_not_called()
    connection.execute.assert_called_once()
    assert columns == ["slept"]
    assert records == [{"slept": 0}]
    assert cursor_types == [("slept", "INTEGER")]


def test_federated_endpoint_retries_mysql_disconnect_after_transaction_rollback(
    monkeypatch,
):
    """历史回归（2026-07-28）：MySQL 断线会中止远程取消事务；清缓存与
    重试必须发生在回滚之后，不能被 TransactionContext Error 永久卡住。"""
    from models.query_models import AttachDatabase, FederatedQueryRequest
    from routers import duckdb_query

    connection = MagicMock()
    session_result = MagicMock()
    session_result.fetchone.return_value = (12345,)

    def execute(sql):
        if "SELECT CONNECTION_ID()" in sql:
            return session_result
        return MagicMock()

    connection.execute.side_effect = execute

    @contextmanager
    def connection_scope(_query_id, _sql):
        yield connection

    config = {
        "type": "mysql",
        "host": "mysql.example",
        "user": "reader",
        "password": "secret",
        "database": "sorting",
    }
    lost = duckdb.IOException("IO Error: Server has gone away")
    aborted = duckdb.TransactionException(
        "TransactionContext Error: Current transaction is aborted (please ROLLBACK)"
    )
    aborted.__context__ = lost

    monkeypatch.setattr(duckdb_query, "interruptible_connection", connection_scope)
    monkeypatch.setattr(
        duckdb_query, "resolve_attach_configs", lambda _attached: [("mysql_sorting", config)]
    )
    monkeypatch.setattr(
        duckdb_query,
        "attach_databases_on_connection",
        lambda _connection, _configs: ["mysql_sorting"],
    )
    monkeypatch.setattr(
        duckdb_query, "detach_databases_on_connection", lambda _connection, _aliases: None
    )
    monkeypatch.setattr(
        duckdb_query,
        "optimize_federated_sql",
        lambda _connection, sql, _aliases, _cfg, **_kwargs: (sql, [], []),
    )
    fetch = MagicMock(
        side_effect=[
            aborted,
            (["id"], [{"id": 1}], [("id", "INTEGER")]),
        ]
    )
    monkeypatch.setattr(duckdb_query, "fetch_query_records", fetch)
    monkeypatch.setattr(
        duckdb_query,
        "describe_query_column_types",
        lambda _connection, _sql: [{"name": "id", "duckdb_type": "INTEGER"}],
    )
    monkeypatch.setattr(
        duckdb_query, "_log_query_metrics_in_conn", lambda *_args: 1.0
    )

    with patch(
        "core.database.federated_attach.connection_registry.register_remote_interrupt",
        return_value=True,
    ):
        response = duckdb_query.execute_federated_query(
            FederatedQueryRequest(
                sql="SELECT id FROM mysql_sorting.sorting_info",
                attach_databases=[
                    AttachDatabase(alias="mysql_sorting", connection_id="sorting")
                ],
                is_preview=False,
            )
        )

    assert not hasattr(response, "status_code") or response.status_code == 200
    assert response["success"] is True
    assert response["data"]["data"] == [{"id": 1}]
    assert fetch.call_count == 2
    executed_sql = [call.args[0] for call in connection.execute.call_args_list]
    force_pool = "SET mysql_pool_acquire_mode = 'force'"
    disable_pool = "SET mysql_pool_size = 0"
    assert force_pool in executed_sql
    assert disable_pool in executed_sql
    assert executed_sql.index(force_pool) < executed_sql.index("BEGIN TRANSACTION")
    assert executed_sql.index(disable_pool) < executed_sql.index("BEGIN TRANSACTION")
    assert executed_sql.count("ROLLBACK") == 1
    assert executed_sql.count("CALL mysql_clear_cache()") == 1
    assert executed_sql.index("ROLLBACK") < executed_sql.index("CALL mysql_clear_cache()")


def test_federated_endpoint_temporarily_serializes_mysql_scan(monkeypatch):
    """历史回归（2026-07-28）：普通三表 MySQL 联邦查询也必须临时单线程，
    不能只在保存到 DuckDB 时规避 mysql_scanner 的并行断连。"""
    from core.database import federated_attach
    from models.query_models import AttachDatabase, FederatedQueryRequest
    from routers import duckdb_query

    events = []
    settings_connection = MagicMock()
    query_connection = MagicMock()

    def settings_execute(sql):
        events.append(sql)
        if sql == "SELECT current_setting('threads')":
            result = MagicMock()
            result.fetchone.return_value = (8,)
            return result
        return MagicMock()

    settings_connection.execute.side_effect = settings_execute

    @contextmanager
    def settings_scope():
        yield settings_connection

    @contextmanager
    def query_scope(_query_id, _sql):
        yield query_connection

    @contextmanager
    def cancellation_scope(*_args):
        yield

    mysql_config = {
        "type": "mysql",
        "host": "mysql.example",
        "user": "reader",
        "password": "secret",
        "database": "sorting",
    }
    monkeypatch.setattr(
        federated_attach, "with_duckdb_connection", settings_scope
    )
    monkeypatch.setattr(duckdb_query, "interruptible_connection", query_scope)
    monkeypatch.setattr(
        duckdb_query,
        "resolve_attach_configs",
        lambda _attached: [("mysql_sorting", mysql_config)],
    )
    monkeypatch.setattr(
        duckdb_query, "configure_mysql_fresh_connections", lambda *_args: None
    )

    def attach(_connection, _configs):
        events.append("ATTACH")
        return ["mysql_sorting"]

    monkeypatch.setattr(duckdb_query, "attach_databases_on_connection", attach)
    monkeypatch.setattr(
        duckdb_query, "detach_databases_on_connection", lambda *_args: None
    )
    monkeypatch.setattr(
        duckdb_query, "mysql_remote_cancellation_scope", cancellation_scope
    )
    monkeypatch.setattr(
        duckdb_query,
        "optimize_federated_sql",
        lambda _connection, sql, _aliases, _cfg, **_kwargs: (sql, [], []),
    )

    def fetch(_connection, _sql, **_kwargs):
        events.append("QUERY")
        return ["id"], [{"id": 1}], [("id", "INTEGER")]

    monkeypatch.setattr(duckdb_query, "fetch_query_records", fetch)
    monkeypatch.setattr(
        duckdb_query,
        "describe_query_column_types",
        lambda _connection, _sql: [{"name": "id", "duckdb_type": "INTEGER"}],
    )
    monkeypatch.setattr(
        duckdb_query, "_log_query_metrics_in_conn", lambda *_args: 1.0
    )

    response = duckdb_query.execute_federated_query(
        FederatedQueryRequest(
            sql="SELECT id FROM mysql_sorting.sorting_info",
            attach_databases=[
                AttachDatabase(alias="mysql_sorting", connection_id="sorting")
            ],
            is_preview=False,
        )
    )

    assert response["success"] is True
    assert events.index("SET GLOBAL threads=1") < events.index("QUERY")
    assert events.index("QUERY") < events.index("SET GLOBAL threads=8")
