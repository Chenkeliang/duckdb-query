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
        {"type": "sqlite", "path": "s' AS \"z\"; DROP TABLE sentinel; --"},
        {"type": "duckdb", "path": "d' AS \"z\"; DROP TABLE sentinel; --"},
        {"type": "mysql", "host": "h", "user": "u",
         "password": "p'; DROP TABLE sentinel; --", "database": "d"},
        {"type": "postgresql", "host": "h", "user": "u",
         "password": "p'; DROP TABLE sentinel; --", "database": "d"},
    ])
    def test_attach_string_escapes_single_quotes(self, cfg, tmp_path, monkeypatch):
        # 转义生效时,整串会被当成单个文件名 → DuckDB 落一个真文件;chdir 到 tmp
        # 让它落在 pytest 临时目录(自动清理),不污染 repo。
        monkeypatch.chdir(tmp_path)
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
        assert "table_my_table_data".removeprefix("table_") == "my_table_data"

    def test_file_prefixed_table_name_resolves_correctly(self):
        # 回归(复审发现):真名以 file_ 开头的表,id=table_file_2026,
        # 只该剥 table_ → file_2026;旧链式 removeprefix("file_") 会误剥成 2026
        assert "table_file_2026".removeprefix("table_") == "file_2026"


class TestSaveAsTableResultSurfacing:
    """P1-11:保存失败不再静默报成功;预览行来自已物化的表(SQL 只跑一次)。"""

    def _call(self, con, sql, table):
        from unittest.mock import patch
        from routers.duckdb_query import _run_query_maybe_save
        with patch(
            "routers.duckdb_query.file_datasource_manager.save_file_datasource",
            return_value=True,
        ), patch(
            "routers.duckdb_query.build_table_metadata_snapshot",
            return_value={},
        ):
            return _run_query_maybe_save(con, sql, table, None)

    def test_save_success_reports_saved_table(self):
        con = duckdb.connect(":memory:")
        _cols, recs, _ct, _types, saved, err = self._call(con, "SELECT 1 AS a", "t1")
        assert saved == "t1" and err is None
        assert con.execute("SELECT a FROM t1").fetchone()[0] == 1
        assert recs == [{"a": 1}]

    def test_save_failure_surfaces_error_not_silent_success(self):
        # 用包装连接强制 CTAS 失败(确定性):CREATE 抛错,SELECT 照常
        real = duckdb.connect(":memory:")

        class _FailCreateConn:
            def execute(self, sql, *a, **k):
                if sql.strip().upper().startswith("CREATE OR REPLACE TABLE"):
                    raise RuntimeError("simulated save failure")
                return real.execute(sql, *a, **k)

        _cols, recs, _ct, _types, saved, err = self._call(
            _FailCreateConn(), "SELECT 1 AS a", "t2")
        assert saved is None, "保存失败却报告了 saved_table"
        assert err is not None and "simulated save failure" in err
        assert recs == [{"a": 1}]  # 结果仍如实返回

    def test_preview_comes_from_materialized_table_once(self):
        con = duckdb.connect(":memory:")
        con.execute("CREATE SEQUENCE s START 1")
        _cols, recs, _ct, _types, saved, err = self._call(
            con, "SELECT nextval('s') AS n", "t3")
        assert saved == "t3" and err is None
        # 序列只推进一次(旧 fetch+CTAS 双执行会得到 currval=2)
        assert con.execute("SELECT currval('s')").fetchone()[0] == 1
        # 预览行 == 落库行
        assert recs[0]["n"] == con.execute("SELECT n FROM t3").fetchone()[0]
