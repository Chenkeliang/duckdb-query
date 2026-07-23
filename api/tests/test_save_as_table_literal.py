"""save_as_table CTAS 不得改动字符串字面量(复审 P1)。

旧实现从带预览 LIMIT 的文本里 str.replace(' LIMIT {n}', '') 反推原查询,是全局子串替换,
会误删字面量内的 ' LIMIT n'(如 'keep LIMIT 5' 被改成 'keep',静默改数据)。现 CTAS 直接用
原始查询 original_sql,不做任何文本反推。
"""
import duckdb

from routers.duckdb_query import _run_query_maybe_save


def test_ctas_preserves_string_literal_containing_limit():
    con = duckdb.connect(":memory:")
    # 预览态:服务端给原查询追加了 LIMIT 5;CTAS 应落原查询(字面量含 'LIMIT 5' 不被动)
    mutated = "SELECT 'keep LIMIT 5' AS note LIMIT 5"
    original = "SELECT 'keep LIMIT 5' AS note"
    _, _, _, _, saved, err = _run_query_maybe_save(
        con, mutated, "lit_tbl", 5, original_sql=original
    )
    assert saved == "lit_tbl"
    assert err is None
    assert con.execute("SELECT * FROM lit_tbl").fetchall() == [("keep LIMIT 5",)]


def test_ctas_saves_full_result_not_preview_limit():
    con = duckdb.connect(":memory:")
    # 原查询无 LIMIT;预览追加 LIMIT 3。落库应为全量(5 行),不带预览 LIMIT。
    mutated = "SELECT * FROM range(5) AS t(n) LIMIT 3"
    original = "SELECT * FROM range(5) AS t(n)"
    _, _, _, _, saved, err = _run_query_maybe_save(
        con, mutated, "full_tbl", 3, original_sql=original
    )
    assert saved == "full_tbl" and err is None
    assert con.execute("SELECT count(*) FROM full_tbl").fetchone()[0] == 5


def test_ctas_respects_user_written_limit():
    con = duckdb.connect(":memory:")
    # 用户自己写了 LIMIT 2 → limit=None(服务端未追加),original 即含用户 LIMIT,落库尊重之
    sql = "SELECT * FROM range(10) AS t(n) LIMIT 2"
    _, _, _, _, saved, err = _run_query_maybe_save(
        con, sql, "userlimit_tbl", None, original_sql=sql
    )
    assert saved == "userlimit_tbl" and err is None
    assert con.execute("SELECT count(*) FROM userlimit_tbl").fetchone()[0] == 2
