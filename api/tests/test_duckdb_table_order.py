"""DuckDB table-list ordering regressions.

2026-07-23 起排序唯一权威 = system_table_registry.sort_seq(序列,单调持久):
- table_oid 在库文件重建/重启后漂移(2026-07-22 实测,重启即洗牌)
- created_at 受时区/同秒/精度影响,只用于展示
迁移(登记表为空)时按元数据 created_at 冻结初始顺序,无元数据的按目录序垫底;
此后新面孔 nextval 置顶,托管链路替换表也拿新序号置顶。
"""

from contextlib import contextmanager

import duckdb
import pytest

from core.database.duckdb_pool import with_system_connection
from core.services import table_registry
from models.query_models import FederatedQueryRequest
from models.set_operation_models import (
    SetOperationConfig,
    SetOperationRequest,
    SetOperationType,
    TableConfig,
)
from routers import duckdb_query, set_operations


@pytest.fixture(autouse=True)
def _clean_registry():
    """每个用例从空登记表出发(system.db 为 pytest 会话隔离实例)。"""
    with with_system_connection() as conn:
        table_registry._ensure_schema(conn)
        conn.execute("DELETE FROM system_table_registry")
    yield


def _install_fake_metadata(monkeypatch, store=None):
    store = store or {}
    monkeypatch.setattr(
        duckdb_query.file_datasource_manager, "get_file_datasource", store.get
    )
    return store


def _list_table_names(monkeypatch, connection):
    @contextmanager
    def _connection():
        yield connection

    monkeypatch.setattr(duckdb_query, "with_duckdb_connection", _connection)
    response = duckdb_query.list_duckdb_tables_summary()
    assert response["success"] is True
    return [item["table_name"] for item in response["data"]["items"]]


def test_newly_created_table_is_listed_first(monkeypatch):
    """Regression 2026-07-21: missing created_at fell back to name order."""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE a_old (id INTEGER)")
        connection.execute("CREATE TABLE z_new (id INTEGER)")

        assert _list_table_names(monkeypatch, connection) == ["z_new", "a_old"]
    finally:
        connection.close()


def test_replaced_table_becomes_newest(monkeypatch):
    """Regression 2026-07-21: replacing a table must move it to the top."""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE z_old (id INTEGER)")
        connection.execute("CREATE TABLE a_new (id INTEGER)")
        connection.execute("CREATE OR REPLACE TABLE z_old AS SELECT 1 AS id")

        assert _list_table_names(monkeypatch, connection) == ["z_old", "a_new"]
    finally:
        connection.close()


def test_migration_seeds_order_from_metadata_created_at(monkeypatch):
    """Regression 2026-07-22: 迁移种子按元数据 created_at 冻结,压过目录(oid)序。"""
    _install_fake_metadata(monkeypatch, {
        "meta_old": {"created_at": "2026-07-22T08:49:51"},
        "meta_new": {"created_at": "2026-07-20T00:00:00"},
    })
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE meta_old (id INTEGER)")
        connection.execute("CREATE TABLE meta_new (id INTEGER)")  # oid 更新

        assert _list_table_names(monkeypatch, connection) == ["meta_old", "meta_new"]
    finally:
        connection.close()


def test_order_survives_catalog_oid_shuffle(monkeypatch):
    """Regression 2026-07-22: oid 漂移(以建表顺序相反的新目录模拟)不得洗牌。"""
    _install_fake_metadata(monkeypatch)
    first = duckdb.connect(":memory:")
    try:
        first.execute("CREATE TABLE t_alpha (id INTEGER)")
        first.execute("CREATE TABLE t_beta (id INTEGER)")
        order_before = _list_table_names(monkeypatch, first)
        assert order_before == ["t_beta", "t_alpha"]
    finally:
        first.close()

    second = duckdb.connect(":memory:")
    try:
        second.execute("CREATE TABLE t_beta (id INTEGER)")
        second.execute("CREATE TABLE t_alpha (id INTEGER)")
        assert _list_table_names(monkeypatch, second) == order_before
    finally:
        second.close()


def test_new_table_after_first_sync_goes_top(monkeypatch):
    """迁移后新面孔 nextval 置顶(序列全程共用,序号必然高于迁移批)。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE t_first (id INTEGER)")
        assert _list_table_names(monkeypatch, connection) == ["t_first"]

        connection.execute("CREATE TABLE t_second (id INTEGER)")
        assert _list_table_names(monkeypatch, connection) == ["t_second", "t_first"]
    finally:
        connection.close()


def test_flow_replace_bumps_to_top(monkeypatch):
    """托管链路替换表(record_creation)拿新序号 → 置顶。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE t_x (id INTEGER)")
        connection.execute("CREATE TABLE t_y (id INTEGER)")
        assert _list_table_names(monkeypatch, connection)[0] == "t_y"

        table_registry.record_creation("t_x")  # 模拟导入流程覆盖重建 t_x
        assert _list_table_names(monkeypatch, connection) == ["t_x", "t_y"]
    finally:
        connection.close()


def test_direct_sql_replace_after_sync_bumps_to_top(monkeypatch):
    """Regression 2026-07-23: SQL 直写替换已登记表也必须拿新序号置顶。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE t_x (id INTEGER)")
        connection.execute("CREATE TABLE t_y (id INTEGER)")
        assert _list_table_names(monkeypatch, connection) == ["t_y", "t_x"]

        duckdb_query._run_query_maybe_save(
            connection,
            "CREATE OR REPLACE TABLE t_x AS SELECT 2 AS id",
            None,
            None,
        )

        assert _list_table_names(monkeypatch, connection) == ["t_x", "t_y"]
    finally:
        connection.close()


def test_direct_sql_if_not_exists_does_not_bump_existing_table(monkeypatch):
    """Regression 2026-07-23:未发生建表时不能伪造一次新创建顺序。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute('CREATE TABLE "MixedCase" (id INTEGER)')
        connection.execute("CREATE TABLE t_y (id INTEGER)")
        assert _list_table_names(monkeypatch, connection) == ["t_y", "MixedCase"]
        with with_system_connection() as system_conn:
            before = system_conn.execute(
                "SELECT sort_seq FROM system_table_registry WHERE table_name = ?",
                ["MixedCase"],
            ).fetchone()[0]

        duckdb_query._run_query_maybe_save(
            connection,
            "CREATE TABLE IF NOT EXISTS mixedcase AS SELECT 2 AS id",
            None,
            None,
        )

        with with_system_connection() as system_conn:
            rows = system_conn.execute(
                "SELECT table_name, sort_seq FROM system_table_registry "
                "WHERE lower(table_name) = lower(?)",
                ["MixedCase"],
            ).fetchall()
        assert rows == [("MixedCase", before)]
        assert _list_table_names(monkeypatch, connection) == ["t_y", "MixedCase"]
        assert connection.execute('SELECT * FROM "MixedCase"').fetchall() == []
    finally:
        connection.close()


def test_direct_sql_registers_only_persistent_main_tables():
    """Regression 2026-07-23:临时表和其它 schema 不得污染 main 排序登记。"""
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE SCHEMA extra")
        duckdb_query._run_query_maybe_save(
            connection,
            "CREATE TEMP TABLE temp_result AS SELECT 1 AS id",
            None,
            None,
        )
        duckdb_query._run_query_maybe_save(
            connection,
            "CREATE TABLE extra.other_result AS SELECT 2 AS id",
            None,
            None,
        )

        with with_system_connection() as system_conn:
            names = system_conn.execute(
                "SELECT table_name FROM system_table_registry"
            ).fetchall()
        assert names == []
    finally:
        connection.close()


def test_direct_sql_if_not_exists_keeps_unicode_identifiers_distinct(monkeypatch):
    """Regression 2026-07-23:DuckDB 仅折叠 ASCII，Ä/ä 可并存且都须登记。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute('CREATE TABLE "Ä" (id INTEGER)')
        assert _list_table_names(monkeypatch, connection) == ["Ä"]

        duckdb_query._run_query_maybe_save(
            connection,
            'CREATE TABLE IF NOT EXISTS "ä" AS SELECT 2 AS id',
            None,
            None,
        )

        assert _list_table_names(monkeypatch, connection) == ["ä", "Ä"]
    finally:
        connection.close()


def test_set_operation_replace_after_sync_bumps_to_top(monkeypatch):
    """Regression 2026-07-23:集合运算保存替换不得绕过稳定排序登记。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE set_left AS SELECT 1 AS id")
        connection.execute("CREATE TABLE set_right AS SELECT 2 AS id")
        connection.execute("CREATE TABLE set_result AS SELECT 0 AS id")
        connection.execute("CREATE TABLE set_newer AS SELECT 9 AS id")
        assert _list_table_names(monkeypatch, connection)[0] == "set_newer"

        @contextmanager
        def _connection(_request, _query_id=None):
            yield connection, None

        monkeypatch.setattr(set_operations, "_set_operation_connection", _connection)
        request = SetOperationRequest(
            config=SetOperationConfig(
                operation_type=SetOperationType.UNION_ALL,
                tables=[
                    TableConfig(table_name="set_left", selected_columns=["id"]),
                    TableConfig(table_name="set_right", selected_columns=["id"]),
                ],
            ),
            save_as_table="set_result",
        )
        response = set_operations.execute_set_operation(request)
        assert response["success"] is True
        assert _list_table_names(monkeypatch, connection)[0] == "set_result"
    finally:
        connection.close()


def test_federated_save_replace_after_sync_bumps_to_top(monkeypatch):
    """Regression 2026-07-23:联邦保存替换不得绕过稳定排序登记。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE fed_result AS SELECT 0 AS id")
        connection.execute("CREATE TABLE fed_newer AS SELECT 9 AS id")
        assert _list_table_names(monkeypatch, connection)[0] == "fed_newer"

        @contextmanager
        def _connection(_query_id, _sql):
            yield connection

        monkeypatch.setattr(duckdb_query, "interruptible_connection", _connection)
        response = duckdb_query.execute_federated_query(
            FederatedQueryRequest(
                sql="SELECT 3 AS id",
                is_preview=False,
                save_as_table="fed_result",
            )
        )
        assert response["success"] is True
        assert _list_table_names(monkeypatch, connection)[0] == "fed_result"
    finally:
        connection.close()


def test_dropped_table_cleaned_and_recreate_goes_top(monkeypatch):
    """删表清登记;同名重建视为新面孔 → 置顶(旧序号不得残留)。"""
    _install_fake_metadata(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE t_keep (id INTEGER)")
        connection.execute("CREATE TABLE t_gone (id INTEGER)")
        assert _list_table_names(monkeypatch, connection) == ["t_gone", "t_keep"]

        connection.execute("DROP TABLE t_gone")
        assert _list_table_names(monkeypatch, connection) == ["t_keep"]

        connection.execute("CREATE TABLE t_gone (id INTEGER)")
        assert _list_table_names(monkeypatch, connection) == ["t_gone", "t_keep"]
    finally:
        connection.close()


def test_migration_prefers_name_embedded_ms_over_stale_metadata(monkeypatch):
    """升级用户场景:历史元数据 created_at 带旧版时区缺陷(本地钟面伪 UTC),
    而 粘贴数据_/export_<毫秒> 名字里的时间戳是普适真值 —— 迁移种子必须以
    名字毫秒为准(2026-07-23)。1784710162377ms = 2026-07-22 08:49:22 UTC。"""
    _install_fake_metadata(monkeypatch, {
        # 伪 UTC(实为 +08 本地钟面):若被采信,会把这张表排到 plain 之上
        "粘贴数据_1784710162377": {"created_at": "2026-07-22T16:49:25"},
        "plain_meta": {"created_at": "2026-07-22T09:00:00"},  # 真 UTC 09:00
    })
    connection = duckdb.connect(":memory:")
    try:
        connection.execute('CREATE TABLE "粘贴数据_1784710162377" (id INTEGER)')
        connection.execute("CREATE TABLE plain_meta (id INTEGER)")

        # 名字真值 08:49 UTC < plain_meta 09:00 UTC → plain_meta 更新
        names = _list_table_names(monkeypatch, connection)
        assert names == ["plain_meta", "粘贴数据_1784710162377"]

        response = duckdb_query.list_duckdb_tables_summary()
        item = next(
            i for i in response["data"]["items"]
            if i["table_name"] == "粘贴数据_1784710162377"
        )
        # 展示时间来自名字真值(UTC 08:49:22 → 应用时区 16:49:22)
        assert item["created_at"].startswith("2026-07-22T16:49:22")
    finally:
        connection.close()


def test_name_timestamp_requires_product_generated_prefix():
    """Regression 2026-07-23:普通业务表的13位编号不能伪装成创建毫秒。"""
    assert table_registry._created_at_from_name("orders_1234567890123") is None
    assert table_registry._created_at_from_name("export_1784710162377") is not None
    assert table_registry._created_at_from_name("粘贴数据_1784710162377") is not None


def test_created_at_returned_in_app_timezone(monkeypatch):
    """created_at 存储 UTC、响应应用时区 ISO(§7.3):08:49 UTC → 16:49+08:00。"""
    _install_fake_metadata(monkeypatch, {
        "tz_probe": {"created_at": "2026-07-22T08:49:51"},
    })
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE tz_probe (id INTEGER)")

        @contextmanager
        def _connection():
            yield connection

        monkeypatch.setattr(duckdb_query, "with_duckdb_connection", _connection)
        response = duckdb_query.list_duckdb_tables_summary()
        item = next(
            i for i in response["data"]["items"] if i["table_name"] == "tz_probe"
        )
        assert item["created_at"].startswith("2026-07-22T16:49:51")
    finally:
        connection.close()
