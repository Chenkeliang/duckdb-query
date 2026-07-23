"""_build_catalog_text 单元测试：聊天上下文"完整目录"应能看到未选中的表。

场景对应真实 bug：JOIN 页只勾选了 alerts，用户在对话里问"把 rules 也加入关联"，
AI 只看 _build_schema_text（仅选中表详细结构）会误判"当前可见的表结构里没有 rules
表"——实际上 rules 和 alerts 同属一个已挂载的 sqlite 连接（ALARM-SQLITE），只是没被
勾选。_build_catalog_text 补一份全量目录，让 AI 能看到它。
"""

import sqlite3
import uuid

import pytest

import routers.ai as ai_router
from core.database.database_manager import db_manager
from core.database.duckdb_engine import with_duckdb_connection
from models.query_models import AttachDatabase, DatabaseConnection, DataSourceType


def _register_connection(connection_id, conn_type, params):
    """直接注入内存连接（不测试、不落盘元数据），测试结束需调用方自行清理"""
    connection = DatabaseConnection(
        id=connection_id, name=connection_id, type=conn_type, params=params,
    )
    db_manager.add_connection(connection, test_connection=False, save_to_metadata=False)
    return connection


def _unregister_connection(connection_id):
    db_manager.connections.pop(connection_id, None)


@pytest.fixture
def sqlite_alarm_db(tmp_path):
    """临时 sqlite 文件：alerts + rules 两表，模拟 ALARM-SQLITE 连接。"""
    db_path = tmp_path / "alarm.db"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("CREATE TABLE alerts (id INTEGER, level TEXT)")
        conn.execute("INSERT INTO alerts VALUES (1, 'high')")
        conn.execute("CREATE TABLE rules (id INTEGER, name TEXT, threshold REAL)")
        conn.execute("INSERT INTO rules VALUES (1, 'cpu_high', 90.0)")
        conn.commit()
    finally:
        conn.close()
    return str(db_path)


@pytest.fixture
def local_tables():
    """本地 DuckDB 建两张表，测试结束清理。"""
    names = [f"cat_local_{uuid.uuid4().hex[:8]}" for _ in range(2)]
    with with_duckdb_connection() as con:
        for name in names:
            con.execute(f"CREATE TABLE \"{name}\" AS SELECT 1 AS id, 'a' AS name")
    yield names
    with with_duckdb_connection() as con:
        for name in names:
            con.execute(f'DROP TABLE IF EXISTS "{name}"')


def test_catalog_includes_local_tables_with_columns(local_tables):
    text = ai_router._build_catalog_text(set())
    assert "Local DuckDB tables (newest created first):" in text
    for name in local_tables:
        assert name in text
    assert "id INTEGER" in text


def test_catalog_lists_local_tables_newest_first(local_tables):
    """Regression (2026-07-22 实测):目录曾按表名字母序排,模型只能靠表名里的
    时间戳猜"最新的表"且猜错。无元数据时按 table_oid DESC 兜底(后建在前)。"""
    older, newer = local_tables  # fixture 按顺序创建,第二张更新
    text = ai_router._build_catalog_text(set())
    assert text.index(newer) < text.index(older)


def test_catalog_orders_by_registry_and_annotates_creation_time(monkeypatch, local_tables):
    """Regression (2026-07-22/23):目录顺序与侧边栏同口径 = 登记表 sort_seq;
    迁移种子按元数据 created_at 冻结(压过 oid 序),且逐行标注创建时间
    (存储 UTC 08:49 → 应用时区 +08 显示 16:49)。"""
    from core.database.duckdb_pool import with_system_connection
    from core.services import table_registry

    with with_system_connection() as conn:
        table_registry._ensure_schema(conn)
        conn.execute("DELETE FROM system_table_registry")

    older, newer = local_tables  # oid 序:newer 在前
    meta = {
        older: {"created_at": "2026-07-22T08:49:51"},
        newer: {"created_at": "2026-07-20T00:00:00"},
    }
    monkeypatch.setattr(
        ai_router.file_datasource_manager, "get_file_datasource", meta.get
    )
    text = ai_router._build_catalog_text(set())
    assert text.index(older) < text.index(newer)  # 迁移按元数据时间,压过 oid 序
    assert "[created 2026-07-22 16:49]" in text


def test_catalog_ignores_non_main_local_schema():
    """Regression 2026-07-23:AI 与侧边栏都只登记 main schema，避免序号反复增删。"""
    schema = f"cat_schema_{uuid.uuid4().hex[:8]}"
    table = f"cat_other_{uuid.uuid4().hex[:8]}"
    shared = f"cat_shared_{uuid.uuid4().hex[:8]}"
    with with_duckdb_connection() as con:
        con.execute(f'CREATE SCHEMA "{schema}"')
        con.execute(f'CREATE TABLE "{schema}"."{table}" AS SELECT 1 AS id')
        con.execute(f'CREATE TABLE "{shared}" AS SELECT 1 AS main_id')
        con.execute(
            f'CREATE TABLE "{schema}"."{shared}" AS SELECT 1 AS leaked_extra_column'
        )
    try:
        text = ai_router._build_catalog_text(set())
        assert table not in text
        assert shared in text
        assert "main_id INTEGER" in text
        assert "leaked_extra_column" not in text
    finally:
        with with_duckdb_connection() as con:
            con.execute(f'DROP SCHEMA "{schema}" CASCADE')
            con.execute(f'DROP TABLE "{shared}"')
        from core.services import table_registry

        table_registry.remove(table)
        table_registry.remove(shared)


def test_catalog_includes_external_db_and_rules_table(sqlite_alarm_db, local_tables):
    """核心场景：外部库里未选中的 rules 表也要出现在目录里，且带列。"""
    connection_id = f"alarm-sqlite-{uuid.uuid4().hex[:8]}"
    _register_connection(connection_id, DataSourceType.SQLITE, {"path": sqlite_alarm_db})
    try:
        attach = [AttachDatabase(alias="alarm", connection_id=connection_id)]
        text = ai_router._build_catalog_text(set(), attach)
        assert (
            "External database alarm (SQLite source, "
            "reference as alarm.table, query with DuckDB syntax):" in text
        )
        assert "rules(" in text
        assert "threshold" in text
        assert "alerts" in text
    finally:
        _unregister_connection(connection_id)


def test_selected_tables_skip_columns_in_catalog(sqlite_alarm_db, local_tables):
    """已在详细段(selected)里展示的表，目录段不重复带列，只列名。"""
    connection_id = f"alarm-sqlite-{uuid.uuid4().hex[:8]}"
    _register_connection(connection_id, DataSourceType.SQLITE, {"path": sqlite_alarm_db})
    try:
        attach = [AttachDatabase(alias="alarm", connection_id=connection_id)]
        selected = {"alerts", local_tables[0]}
        text = ai_router._build_catalog_text(selected, attach)

        # alerts 已选中：目录里只裸露表名，不应重复带出它的列(level)
        bare_lines = [ln.strip() for ln in text.splitlines()]
        assert "alerts" in bare_lines
        assert "level" not in text

        # 本地被选中的表同理只列名
        assert local_tables[0] in bare_lines

        # rules 未被选中：目录里应正常带列
        assert "rules(" in text
    finally:
        _unregister_connection(connection_id)


def test_catalog_budget_truncates_with_marker(monkeypatch, local_tables):
    """超出预算时从当前位置截断并追加尾部标记；用极小预算让截断必然触发。"""
    monkeypatch.setattr(ai_router, "_CATALOG_CHAR_BUDGET", 20)
    text = ai_router._build_catalog_text(set())
    assert text.endswith("\n  (catalog truncated)")
    assert len(text) == 20 + len("\n  (catalog truncated)")


def test_catalog_attach_failure_does_not_raise(local_tables):
    """外部连接枚举失败（如 connection_id 不存在）应被吞掉，不影响本地段输出。"""
    attach = [AttachDatabase(alias="bogus", connection_id="does-not-exist")]
    text = ai_router._build_catalog_text(set(), attach)
    assert "Local DuckDB tables (newest created first):" in text
    assert "External database" not in text
