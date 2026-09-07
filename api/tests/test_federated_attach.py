"""federated_attach 工具测试"""

from contextlib import contextmanager
from types import SimpleNamespace

import duckdb as duckdb_mod
import pytest
from unittest.mock import MagicMock, patch

from core.database.duckdb_engine import with_duckdb_connection
from core.database.federated_attach import (
    _is_database_already_attached_error,
    _quote_identifier,
    attach_databases_on_connection,
    detach_databases_on_connection,
    execute_sql_and_persist,
    federated_source_sql_alias,
    format_qualified_table_reference,
    publish_query_staging_table,
)


def _attached_aliases(conn):
    return sorted(
        r[0]
        for r in conn.execute(
            "SELECT database_name FROM duckdb_databases() "
            "WHERE database_name NOT IN ('memory', 'system', 'temp')"
        ).fetchall()
    )


def test_partial_attach_failure_cleaned_by_intended_aliases(tmp_path):
    """回归(对抗复审 #1):两个 ATTACH,第二个失败时第一个已成功挂上。路由 finally 必须按
    【意图 attach 的别名】detach——旧写法捕获实际返回的 attached 变量,partial 失败时它仍是
    初始 [],已挂上的 good_alias 就随连接漏回池。此测试锁死"按意图别名清理"能无残留。"""
    good = tmp_path / "good.duckdb"
    c0 = duckdb_mod.connect(str(good))
    c0.execute("CREATE TABLE t(id INTEGER)")
    c0.close()

    intended = ["good_alias", "bad_alias"]
    configs = [
        ("good_alias", {"type": "duckdb", "path": str(good)}),
        # 目录不存在 → ATTACH 无法创建文件 → 真实失败(非 "already exists" 复用)
        ("bad_alias", {"type": "duckdb", "path": str(tmp_path / "nope_dir" / "x.duckdb")}),
    ]

    with with_duckdb_connection() as con:
        base = _attached_aliases(con)
        try:
            with pytest.raises(Exception):  # pylint: disable=broad-exception-caught
                attach_databases_on_connection(con, configs)
            # 此刻 good_alias 已泄漏在连接上(partial attach)
            assert "good_alias" in _attached_aliases(con)
        finally:
            detach_databases_on_connection(con, intended)
        # 按意图别名清理后无残留,连接可安全放回池
        assert _attached_aliases(con) == base


def test_format_qualified_table_reference_simple():
    assert format_qualified_table_reference("sales") == '"sales"'


def test_format_qualified_table_reference_dotted():
    assert format_qualified_table_reference("mysql_db.orders") == '"mysql_db"."orders"'


def test_federated_source_sql_alias():
    assert (
        federated_source_sql_alias("mysql_sorder.iget_order", {"mysql_sorder"})
        == "iget_order"
    )


def test_format_qualified_table_reference_three_part():
    ref = format_qualified_table_reference("pg_db.public.users")
    assert ref == '"pg_db"."public"."users"'


def test_quote_identifier_escapes_embedded_quote():
    assert _quote_identifier('x"; DROP TABLE users; --') == '"x""; DROP TABLE users; --"'


def test_quote_identifier_preserves_cjk():
    assert _quote_identifier("商品统计表") == '"商品统计表"'


def test_is_database_already_attached_error():
    err = Exception(
        'Binder Error: Failed to attach database: database with name "mysql_sorder" already exists'
    )
    assert _is_database_already_attached_error(err) is True
    assert _is_database_already_attached_error(Exception("connection refused")) is False


@patch(
    "core.database.federated_attach.build_attach_sql",
    return_value="ATTACH DATABASE 'dummy' AS mysql_sorder (TYPE mysql)",
)
def test_attach_databases_on_connection_reuses_existing_alias(_mock_build_attach):
    conn = MagicMock()

    def execute_side_effect(sql: str):
        if sql.startswith('DETACH'):
            return None
        raise Exception(
            'Binder Error: Failed to attach database: database with name '
            '"mysql_sorder" already exists'
        )

    conn.execute.side_effect = execute_side_effect

    attached = attach_databases_on_connection(
        conn,
        [("mysql_sorder", {"type": "mysql", "host": "h", "database": "d"})],
    )
    assert attached == ["mysql_sorder"]


@patch(
    "core.database.federated_attach.build_attach_sql",
    return_value="ATTACH DATABASE 'dummy' AS x (TYPE mysql)",
)
def test_attach_databases_on_connection_escapes_alias_in_detach(_mock_build_attach):
    """回归:预 DETACH 用 f'DETACH "{alias}"' 裸拼接,alias 带引号能破坏语法边界。"""
    conn = MagicMock()
    seen_detach_sql = []

    def execute_side_effect(sql: str):
        if sql.startswith("DETACH"):
            seen_detach_sql.append(sql)
            return None
        return None

    conn.execute.side_effect = execute_side_effect

    malicious_alias = 'x"; DROP TABLE users; --'
    attach_databases_on_connection(
        conn, [(malicious_alias, {"type": "mysql", "host": "h", "database": "d"})]
    )
    assert seen_detach_sql == [f'DETACH {_quote_identifier(malicious_alias)}']


def test_attach_adds_postgres_server_deadline_without_mutating_saved_config(monkeypatch):
    """Regression 2026-09-07: all query surfaces using shared ATTACH must
    receive the same PostgreSQL deadline, while stored connection data stays
    unchanged."""
    from core.database import federated_attach

    original = {
        "type": "postgresql",
        "host": "postgres.example",
        "database": "analytics",
    }
    captured = []
    monkeypatch.setattr(
        federated_attach.config_manager,
        "get_app_config",
        lambda: SimpleNamespace(federated_query_timeout=7),
    )

    def build(_alias, config):
        captured.append(config)
        return "ATTACH DATABASE 'dummy' AS pg (TYPE postgres)"

    monkeypatch.setattr(federated_attach, "build_attach_sql", build)
    attach_databases_on_connection(MagicMock(), [("pg", original)])

    assert captured[0]["_statement_timeout_ms"] == 7000
    assert "_statement_timeout_ms" not in original


def test_attach_uses_remaining_deadline_and_query_owned_application_name(monkeypatch):
    """Regression 2026-09-07: ATTACH receives the remaining, not initial, budget."""
    from core.database import federated_attach

    original = {
        "type": "postgresql",
        "host": "postgres.example",
        "database": "analytics",
    }
    captured = []
    monkeypatch.setattr(federated_attach.time, "monotonic", lambda: 100.0)
    monkeypatch.setattr(
        federated_attach,
        "build_attach_sql",
        lambda _alias, config: captured.append(config)
        or "ATTACH DATABASE 'dummy' AS pg (TYPE postgres)",
    )

    attach_databases_on_connection(
        MagicMock(),
        [("pg", original)],
        deadline_monotonic=101.25,
        query_id="sync:deadline-owned",
    )

    assert captured[0]["_statement_timeout_ms"] == 1250
    assert captured[0]["_application_name"].startswith("duckquery_")
    assert "_application_name" not in original


def test_persist_disables_mysql_pool_before_attach(monkeypatch):
    """历史回归（2026-07-28）：预览/取消留下的 MySQL 会话不得被全量落表复用。"""
    from core.database import federated_attach
    from core.data import file_datasource_manager

    events = []
    connection = MagicMock()

    def execute(sql):
        events.append(sql)
        return MagicMock()

    connection.execute.side_effect = execute

    @contextmanager
    def connection_scope():
        yield connection

    mysql_configs = [("mysql_prod", {"type": "mysql"})]
    monkeypatch.setattr(
        federated_attach, "resolve_attach_configs", lambda _attached: mysql_configs
    )
    monkeypatch.setattr(federated_attach, "with_duckdb_connection", connection_scope)

    def attach(_connection, _configs, **_kwargs):
        events.append("ATTACH")
        return ["mysql_prod"]

    monkeypatch.setattr(federated_attach, "attach_databases_on_connection", attach)
    monkeypatch.setattr(
        federated_attach, "detach_databases_on_connection", lambda *_args: None
    )
    monkeypatch.setattr(
        file_datasource_manager,
        "build_table_metadata_snapshot",
        lambda *_args: {"row_count": 1},
    )

    federated_attach.execute_sql_and_persist(
        "SELECT 1", "saved_result", [{"alias": "mysql_prod"}]
    )

    force_pool = "SET mysql_pool_acquire_mode = 'force'"
    disable_pool = "SET mysql_pool_size = 0"
    assert events.index(force_pool) < events.index("ATTACH")
    assert events.index(disable_pool) < events.index("ATTACH")


def test_persist_retries_read_only_ctas_after_mysql_connection_lost(monkeypatch):
    """Regression 2026-07-28: save-to-DuckDB must retry a read-only CTAS after
    MySQL prepare fails with ``Server has gone away``, just like preview does.
    """
    from core.database import federated_attach
    from core.data import file_datasource_manager

    connection = MagicMock()
    create_attempts = 0
    clear_cache_calls = 0

    def execute(sql):
        nonlocal create_attempts, clear_cache_calls
        if sql.startswith('CREATE OR REPLACE TABLE "__stage_'):
            create_attempts += 1
            if create_attempts == 1:
                raise duckdb_mod.IOException(
                    'IO Error: Failed to prepare MySQL query "SELECT ...": '
                    "Server has gone away"
                )
        elif sql == "CALL mysql_clear_cache()":
            clear_cache_calls += 1
        return MagicMock()

    connection.execute.side_effect = execute

    @contextmanager
    def connection_scope():
        yield connection

    monkeypatch.setattr(
        federated_attach,
        "resolve_attach_configs",
        lambda _attached: [("mysql_prod", {"type": "mysql"})],
    )
    monkeypatch.setattr(federated_attach, "with_duckdb_connection", connection_scope)
    monkeypatch.setattr(
        federated_attach,
        "attach_databases_on_connection",
        lambda *_args, **_kwargs: ["mysql_prod"],
    )
    monkeypatch.setattr(
        federated_attach, "detach_databases_on_connection", lambda *_args: None
    )
    monkeypatch.setattr(
        file_datasource_manager,
        "build_table_metadata_snapshot",
        lambda *_args: {"row_count": 1},
    )

    snapshot = federated_attach.execute_sql_and_persist(
        "SELECT * FROM mysql_prod.orders", "saved_result", [{"alias": "mysql_prod"}]
    )

    assert snapshot["row_count"] == 1
    assert create_attempts == 2
    assert clear_cache_calls == 1


def test_persist_rebinds_remote_cancellation_for_each_retry_attempt(monkeypatch):
    """Regression 2026-09-07: async/save retries must retire the failed
    MySQL session cancellation lease before a new CTAS attempt starts."""
    from core.database import federated_attach
    from core.data import file_datasource_manager

    connection = MagicMock()
    events = []
    create_attempts = 0

    def execute(sql):
        nonlocal create_attempts
        if sql.startswith('CREATE OR REPLACE TABLE "__stage_'):
            create_attempts += 1
            events.append(f"ctas-{create_attempts}")
            if create_attempts == 1:
                raise duckdb_mod.IOException("IO Error: Server has gone away")
        elif sql == "CALL mysql_clear_cache()":
            events.append("clear-cache")
        return MagicMock()

    connection.execute.side_effect = execute

    @contextmanager
    def connection_scope(_query_id, _sql, **_kwargs):
        yield connection

    @contextmanager
    def cancellation_scope(_connection, query_id, _configs):
        events.append(f"cancel-enter:{query_id}")
        try:
            yield
        except Exception:
            events.append("cancel-rollback")
            raise
        else:
            events.append("cancel-commit")

    monkeypatch.setattr(
        federated_attach,
        "resolve_attach_configs",
        lambda _attached: [("mysql_prod", {"type": "mysql"})],
    )
    monkeypatch.setattr(
        federated_attach, "interruptible_connection", connection_scope
    )
    monkeypatch.setattr(
        federated_attach, "remote_cancellation_scope", cancellation_scope
    )
    monkeypatch.setattr(
        federated_attach,
        "attach_databases_on_connection",
        lambda *_args, **_kwargs: ["mysql_prod"],
    )
    monkeypatch.setattr(
        federated_attach, "detach_databases_on_connection", lambda *_args: None
    )
    monkeypatch.setattr(
        file_datasource_manager,
        "build_table_metadata_snapshot",
        lambda *_args: {"row_count": 1},
    )

    federated_attach.execute_sql_and_persist(
        "SELECT * FROM mysql_prod.orders",
        "saved_result",
        [{"alias": "mysql_prod"}],
        query_id="async:retry",
    )

    assert events[:6] == [
        "cancel-enter:async:retry",
        "ctas-1",
        "cancel-rollback",
        "clear-cache",
        "cancel-enter:async:retry",
        "ctas-2",
    ]
    assert events[6] == "cancel-commit"


def test_cancel_before_commit_rolls_back_table_replacement(monkeypatch):
    """Regression 2026-09-07: cancellation that wins the commit race must
    preserve the previous result table and leave no partial replacement."""
    from core.database import federated_attach

    with duckdb_mod.connect(":memory:") as connection:
        connection.execute("CREATE TABLE target AS SELECT 1 AS value")
        connection.execute("CREATE TABLE staging AS SELECT 2 AS value")
        monkeypatch.setattr(
            federated_attach.connection_registry,
            "commit_if_not_cancelled",
            lambda _query_id, _commit: False,
        )

        with pytest.raises(duckdb_mod.InterruptException):
            publish_query_staging_table(
                connection,
                "staging",
                "target",
                query_id="async:cancel-before-commit",
            )

        assert connection.execute("SELECT * FROM target").fetchall() == [(1,)]
        assert connection.execute("SELECT * FROM staging").fetchall() == [(2,)]


def test_persist_restores_duckdb_threads_after_mysql_ctas_failure(monkeypatch):
    """历史回归（2026-07-28）：多表 MySQL CTAS 临时串行，失败后也恢复线程数。"""
    from core.database import federated_attach

    connection = MagicMock()
    events = []

    def execute(sql):
        events.append(sql)
        if sql == "SELECT current_setting('threads')":
            result = MagicMock()
            result.fetchone.return_value = (8,)
            return result
        if sql.startswith('CREATE OR REPLACE TABLE "__stage_'):
            raise RuntimeError("simulated CTAS failure")
        return MagicMock()

    connection.execute.side_effect = execute

    @contextmanager
    def connection_scope():
        yield connection

    monkeypatch.setattr(
        federated_attach,
        "resolve_attach_configs",
        lambda _attached: [("mysql_prod", {"type": "mysql"})],
    )
    monkeypatch.setattr(federated_attach, "with_duckdb_connection", connection_scope)

    def attach(_connection, _configs, **_kwargs):
        events.append("ATTACH")
        return ["mysql_prod"]

    monkeypatch.setattr(federated_attach, "attach_databases_on_connection", attach)
    monkeypatch.setattr(
        federated_attach, "detach_databases_on_connection", lambda *_args: None
    )

    with pytest.raises(RuntimeError, match="simulated CTAS failure"):
        federated_attach.execute_sql_and_persist(
            "SELECT * FROM mysql_prod.orders",
            "saved_result",
            [{"alias": "mysql_prod"}],
        )

    ctas_index = next(
        index
        for index, sql in enumerate(events)
        if sql.startswith('CREATE OR REPLACE TABLE "__stage_')
    )
    assert events.index("SET GLOBAL threads=1") < events.index("ATTACH") < ctas_index
    assert ctas_index < events.index("SET GLOBAL threads=8")


class TestExecuteSqlAndPersist:
    """execute_sql_and_persist:先写临时表、确认后再原子替换目标表,
    不会在结果未确认前就冲掉目标表下已有的数据(回归 2026-07)。"""

    def _drop(self, table_name):
        with with_duckdb_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table_name}"')

    def test_non_empty_result_persists_and_reports_metadata(self):
        table_name = "fed_attach_persist_basic"
        try:
            snapshot = execute_sql_and_persist(
                "SELECT * FROM (VALUES (1, 'a'), (2, 'b')) AS t(id, name)", table_name
            )
            assert snapshot["row_count"] == 2
            assert snapshot["columns"] == ["id", "name"]
            with with_duckdb_connection() as con:
                rows = con.execute(f'SELECT * FROM "{table_name}" ORDER BY id').fetchall()
            assert rows == [(1, "a"), (2, "b")]
        finally:
            self._drop(table_name)

    def test_reject_empty_true_leaves_nonexistent_target_untouched(self):
        table_name = "fed_attach_reject_empty_fresh"
        self._drop(table_name)  # 确保不存在
        try:
            snapshot = execute_sql_and_persist(
                "SELECT * FROM (VALUES (1, 'a')) AS t(id, name) WHERE id = 999",
                table_name, reject_empty=True,
            )
            assert snapshot["row_count"] == 0
            with with_duckdb_connection() as con:
                existing = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
            assert table_name not in existing  # 从未创建过目标表
        finally:
            self._drop(table_name)

    def test_reject_empty_true_never_overwrites_existing_target(self):
        """核心回归用例:目标表已有真实数据,新查询意外返回 0 行——
        旧数据必须原封不动,不能被空表覆盖后再删除。"""
        table_name = "fed_attach_reject_empty_preserves_existing"
        with with_duckdb_connection() as con:
            con.execute(
                f'CREATE OR REPLACE TABLE "{table_name}" AS '
                "SELECT * FROM (VALUES (1, 'x'), (2, 'y')) AS t(id, name)"
            )
        try:
            snapshot = execute_sql_and_persist(
                "SELECT * FROM (VALUES (1, 'a')) AS t(id, name) WHERE id = 999",
                table_name, reject_empty=True,
            )
            assert snapshot["row_count"] == 0
            with with_duckdb_connection() as con:
                rows = con.execute(f'SELECT * FROM "{table_name}" ORDER BY id').fetchall()
            assert rows == [(1, "x"), (2, "y")]  # 旧数据完全未受影响
        finally:
            self._drop(table_name)

    def test_reject_empty_false_default_persists_empty_result(self):
        """reject_empty 默认 False:0 行也是合法结果,匹配 async 任务已验证过的
        CTAS 语义(接受空结果),行为由本函数的默认值而非调用方特判决定。"""
        table_name = "fed_attach_reject_empty_default_off"
        try:
            snapshot = execute_sql_and_persist(
                "SELECT * FROM (VALUES (1, 'a')) AS t(id, name) WHERE id = 999", table_name
            )
            assert snapshot["row_count"] == 0
            with with_duckdb_connection() as con:
                existing = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
            assert table_name in existing  # 空表确实被创建了
        finally:
            self._drop(table_name)

    def test_no_staging_table_left_behind_after_success(self):
        table_name = "fed_attach_no_orphan_staging"
        try:
            execute_sql_and_persist(
                "SELECT * FROM (VALUES (1, 'a')) AS t(id, name)", table_name
            )
            with with_duckdb_connection() as con:
                existing = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
            assert not any(name.startswith("__stage_") for name in existing)
        finally:
            self._drop(table_name)

    def test_table_name_with_embedded_quote_is_escaped_not_injected(self):
        """table_name 带双引号不能破坏 SQL 语法边界拼出注入
        (回归:曾经是 f'"{table_name}"' 裸拼接,不转义内嵌双引号)。"""
        malicious_name = 'fed_attach_quote_test"; SELECT 1; --'
        sentinel_table = "fed_attach_quote_sentinel"
        with with_duckdb_connection() as con:
            con.execute(f'CREATE OR REPLACE TABLE "{sentinel_table}" AS SELECT 1 AS x')
        try:
            snapshot = execute_sql_and_persist(
                "SELECT * FROM (VALUES (1, 'a')) AS t(id, name)", malicious_name
            )
            assert snapshot["row_count"] == 1
            with with_duckdb_connection() as con:
                existing = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
            assert sentinel_table in existing  # 未被注入语句误删
            assert malicious_name in existing  # 表名本身按字面量正确创建
        finally:
            with with_duckdb_connection() as con:
                con.execute(f'DROP TABLE IF EXISTS {_quote_identifier(malicious_name)}')
                con.execute(f'DROP TABLE IF EXISTS "{sentinel_table}"')

    def test_swap_failure_rolls_back_and_preserves_target(self):
        """DROP+RENAME 包在真事务里:RENAME 失败时 ROLLBACK 撤销 DROP,
        target 不会凭空消失(回归:曾经是两条不受事务保护的裸 execute)。"""
        table_name = "fed_attach_swap_rollback"
        with with_duckdb_connection() as con:
            con.execute(
                f'CREATE OR REPLACE TABLE "{table_name}" AS '
                "SELECT * FROM (VALUES (1, 'orig')) AS t(id, name)"
            )
        try:
            executed_sql = []
            import core.database.federated_attach as fed_attach_module

            def fake_with_duckdb_connection():
                from contextlib import contextmanager

                @contextmanager
                def _ctx():
                    with with_duckdb_connection() as real_conn:
                        class TrackingConn:
                            def execute(self_inner, sql, *args, **kwargs):
                                executed_sql.append(sql)
                                if sql.strip().startswith("ALTER TABLE"):
                                    raise RuntimeError("simulated interrupt")
                                return real_conn.execute(sql, *args, **kwargs)

                            def __getattr__(self_inner, name):
                                return getattr(real_conn, name)

                        yield TrackingConn()

                return _ctx()

            with patch.object(
                fed_attach_module, "with_duckdb_connection", fake_with_duckdb_connection
            ):
                try:
                    execute_sql_and_persist(
                        "SELECT * FROM (VALUES (1, 'new')) AS t(id, name)", table_name
                    )
                    assert False, "expected the simulated ALTER failure to propagate"
                except RuntimeError:
                    pass

            assert any(s.strip().startswith("ROLLBACK") for s in executed_sql)
            assert not any(s.strip().startswith("COMMIT") for s in executed_sql)
            with with_duckdb_connection() as con:
                rows = con.execute(f'SELECT * FROM "{table_name}" ORDER BY id').fetchall()
            assert rows == [(1, "orig")]  # target 完全未受影响
        finally:
            self._drop(table_name)
