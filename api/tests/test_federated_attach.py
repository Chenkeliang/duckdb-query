"""federated_attach 工具测试"""

from unittest.mock import MagicMock, patch

from core.database.duckdb_engine import with_duckdb_connection
from core.database.federated_attach import (
    _is_database_already_attached_error,
    attach_databases_on_connection,
    execute_sql_and_persist,
    federated_source_sql_alias,
    format_qualified_table_reference,
)


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
                existing = con.execute("SHOW TABLES").fetchdf()["name"].tolist()
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
                existing = con.execute("SHOW TABLES").fetchdf()["name"].tolist()
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
                existing = con.execute("SHOW TABLES").fetchdf()["name"].tolist()
            assert not any(name.startswith("__stage_") for name in existing)
        finally:
            self._drop(table_name)
