"""MySQL ATTACH 远端取消回归（2026-07）。

覆盖历史问题：DuckDB ``interrupt()`` 在 mysql_scanner 阻塞取数时不能及时
终止 MySQL 服务端 SQL，必须登记远端会话并通过第二条连接执行 ``KILL QUERY``。
"""

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
