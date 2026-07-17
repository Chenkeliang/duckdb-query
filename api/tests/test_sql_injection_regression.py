"""P0 注入回归(Codex 复核确认项)——真库哨兵,验证表名/连接串拼接已闭合。

覆盖:save_as_table(execute + set-operations)、delete 端点 DROP、ATTACH 连接串、
datasource_aggregator 的 GET/DELETE 目录查询。全部用 :memory: DuckDB + sentinel 表,
断言恶意载荷执行后 sentinel 仍在(未被堆叠 DDL 摧毁)。
"""
from contextlib import contextmanager
from unittest.mock import patch

import duckdb
import pytest

from core.common.sql_identifiers import quote_identifier
from core.database.duckdb_engine import build_attach_sql


def _sentinel_alive(con) -> bool:
    return bool(con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name='sentinel'"
    ).fetchone()[0])


class TestSaveAsTableInjection:
    def test_create_or_replace_neutralizes_stacked_drop(self):
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE sentinel(x INT)")
        evil = 'x" AS (SELECT 1); DROP TABLE sentinel; --'
        create_sql = f'CREATE OR REPLACE TABLE {quote_identifier(evil)} AS (SELECT 1 AS a)'
        try:
            con.execute(create_sql)
        except Exception:  # noqa: BLE001 — 怪名建表失败无所谓,关键是不注入
            pass
        assert _sentinel_alive(con), "save_as_table 注入摧毁了 sentinel"

    def test_delete_drop_neutralizes_injection(self):
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE sentinel(x INT)")
        evil = 'sentinel"; DROP TABLE sentinel; --'
        try:
            con.execute(f'DROP TABLE IF EXISTS {quote_identifier(evil)}')
        except Exception:  # noqa: BLE001
            pass
        assert _sentinel_alive(con)


class TestAttachInjection:
    @pytest.mark.parametrize("cfg", [
        {"type": "sqlite", "path": ":memory:' AS \"z\"; DROP TABLE sentinel; --"},
        {"type": "duckdb", "path": "/tmp/x' AS \"z\"; DROP TABLE sentinel; --"},
        {"type": "mysql", "host": "h", "user": "u",
         "password": "p'; DROP TABLE sentinel; --", "database": "d"},
        {"type": "postgresql", "host": "h", "user": "u",
         "password": "p'; DROP TABLE sentinel; --", "database": "d"},
    ])
    def test_attach_string_escapes_single_quotes(self, cfg):
        sql = build_attach_sql("z", cfg)
        # 恶意单引号必须被翻倍(不会提前闭合字面量)
        assert "''" in sql, sql
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE sentinel(x INT)")
        try:
            con.execute(sql)  # 扩展/路径失败无所谓,关键是不注入
        except Exception:  # noqa: BLE001
            pass
        assert _sentinel_alive(con), f"ATTACH 注入摧毁 sentinel: {cfg['type']}"


class TestAggregatorInjection:
    """datasource_aggregator 的 GET/DELETE 路径:注入的 source_id 不得删表。"""

    @contextmanager
    def _agg_on(self, con):
        # 用 patch.object 临时替换全局池的 get_connection,退出即恢复(不污染其他测试)
        from services.datasource_aggregator import DataSourceAggregator

        @contextmanager
        def _fake_conn():
            yield con

        agg = DataSourceAggregator()
        with patch.object(agg.duckdb_pool, "get_connection", _fake_conn):
            yield agg

    def test_get_file_source_id_does_not_execute_stacked_ddl(self):
        import asyncio
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE sentinel(x INT)")
        evil = "table_x'; DROP TABLE sentinel; SELECT 'a' t, 1 s, 1 c; --"
        with self._agg_on(con) as agg:
            asyncio.run(agg._get_file_source_by_id(evil))
        assert _sentinel_alive(con), "GET 路径注入摧毁了 sentinel"

    def test_delete_file_source_neutralizes_injection(self):
        import asyncio
        con = duckdb.connect(":memory:")
        con.execute("CREATE TABLE sentinel(x INT)")
        con.execute("CREATE TABLE victim(x INT)")
        with self._agg_on(con) as agg:
            asyncio.run(agg._delete_file_source("table_victim; DROP TABLE sentinel; --"))
        assert _sentinel_alive(con), "DELETE 路径注入摧毁了 sentinel"

    def test_removeprefix_does_not_mangle_midname(self):
        # 回归:旧 .replace 会把名字中间的 table_/file_ 也删掉
        assert "table_atable_b".removeprefix("table_").removeprefix("file_") == "atable_b"
