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
from routers import duckdb_query


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
