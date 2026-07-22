"""DuckDB table-list ordering regressions.

2026-07-22 起排序规则:元数据 created_at(UTC 存储)倒序 + 表名决胜;
无元数据的表在列表接口首见时回填 created_at(按当时目录序递减 1s),
此后排序是 (created_at, name) 的纯函数,不再随 table_oid 漂移。
"""

from contextlib import contextmanager

import duckdb

from routers import duckdb_query


def _install_fake_store(monkeypatch):
    """dict 版元数据存储:隔离 system.db,同时承接首见回填的写入。"""
    store = {}
    monkeypatch.setattr(
        duckdb_query.file_datasource_manager, "get_file_datasource", store.get
    )
    monkeypatch.setattr(
        duckdb_query.file_datasource_manager,
        "save_file_datasource",
        lambda info: store.__setitem__(info["source_id"], dict(info)),
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
    _install_fake_store(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE a_old (id INTEGER)")
        connection.execute("CREATE TABLE z_new (id INTEGER)")

        assert _list_table_names(monkeypatch, connection) == ["z_new", "a_old"]
    finally:
        connection.close()


def test_replaced_table_becomes_newest(monkeypatch):
    """Regression 2026-07-21: replacing a table must move it to the top."""
    _install_fake_store(monkeypatch)
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE z_old (id INTEGER)")
        connection.execute("CREATE TABLE a_new (id INTEGER)")
        connection.execute("CREATE OR REPLACE TABLE z_old AS SELECT 1 AS id")

        assert _list_table_names(monkeypatch, connection) == ["z_old", "a_new"]
    finally:
        connection.close()


def test_metadata_created_at_overrides_catalog_order(monkeypatch):
    """Regression 2026-07-22: table_oid 在库文件重建后会漂,重启后列表洗牌,
    用户误以为新表被回退。有 created_at 元数据时必须按它倒排(与 AI 目录同口径)。"""
    store = _install_fake_store(monkeypatch)
    store["meta_old"] = {"created_at": "2026-07-22T08:49:51"}
    store["meta_new"] = {"created_at": "2026-07-20T00:00:00"}
    connection = duckdb.connect(":memory:")
    try:
        connection.execute("CREATE TABLE meta_old (id INTEGER)")
        connection.execute("CREATE TABLE meta_new (id INTEGER)")  # oid 更新

        # 元数据说 meta_old 更新 → 压过 oid 口径
        assert _list_table_names(monkeypatch, connection) == ["meta_old", "meta_new"]
    finally:
        connection.close()


def test_first_seen_backfill_makes_order_survive_oid_shuffle(monkeypatch):
    """Regression 2026-07-22: 无元数据的表按 oid 排,重启后 oid 漂移即洗牌。
    首见回填后顺序持久化;换一个建表顺序相反(模拟 oid 重排)的目录再列,
    顺序必须不变。"""
    store = _install_fake_store(monkeypatch)

    first = duckdb.connect(":memory:")
    try:
        first.execute("CREATE TABLE t_alpha (id INTEGER)")
        first.execute("CREATE TABLE t_beta (id INTEGER)")
        order_before = _list_table_names(monkeypatch, first)
        assert order_before == ["t_beta", "t_alpha"]  # 首见按目录序回填
        assert "t_alpha" in store and "t_beta" in store  # 时间戳已持久化
    finally:
        first.close()

    # "重启":新目录里建表顺序相反 → oid 序相反;但回填过的 created_at 仍在
    second = duckdb.connect(":memory:")
    try:
        second.execute("CREATE TABLE t_beta (id INTEGER)")
        second.execute("CREATE TABLE t_alpha (id INTEGER)")
        assert _list_table_names(monkeypatch, second) == order_before
    finally:
        second.close()


def test_created_at_returned_in_app_timezone(monkeypatch):
    """存储为 UTC naive,响应转应用时区 ISO(§7.3):08:49 UTC → 16:49 +08:00。"""
    store = _install_fake_store(monkeypatch)
    store["tz_probe"] = {"created_at": "2026-07-22T08:49:51"}
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
