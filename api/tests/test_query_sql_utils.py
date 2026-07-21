"""query_sql_utils:预览模式补 LIMIT 的语句类型判断。

设计背景(2026-07):原实现是"拒绝关键词黑名单",每出现一种新的 DuckDB 语句
(INSTALL/SUMMARIZE/RESET 等相继踩过)就要先在生产环境炸一次语法错误才能补上
一条黑名单前缀,失败模式本身就是错的。现改为"AST 分类白名单":用 sqlglot 解析
后按顶层节点类型判定——只有 SELECT/WITH/VALUES/PIVOT/UNPIVOT/集合运算/子查询
才会被追加 LIMIT;sqlglot 解析失败或退化成 Command(RESET/LOAD/EXPLAIN/CALL/
VACUUM 等 DuckDB 专有语句均如此)一律判定为"不接受"——未识别的语句默认不补
LIMIT,而不是默认接受再冒语法错误的风险。
"""

from unittest.mock import Mock, patch

import pytest

from routers.query_sql_utils import (
    apply_row_limit_choice,
    ensure_query_has_limit,
    statement_accepts_limit,
)


@pytest.mark.parametrize(
    "sql",
    [
        # 扩展/库管理:sqlglot 解析成专属类型(Install/Command)或直接解析失败
        "INSTALL inet",
        "install spatial from community",
        "FORCE INSTALL httpfs",
        "LOAD inet",
        "ATTACH 'other.db' AS other",
        "DETACH other",
        "COPY tbl TO 'out.parquet'",
        "EXPORT DATABASE 'dir'",
        "CHECKPOINT",
        "VACUUM",
        "ANALYZE",
        # DDL/DML
        "CREATE TABLE t AS SELECT 1",
        "DROP TABLE t",
        "INSERT INTO t VALUES (1)",
        "UPDATE t SET a = 1",
        "DELETE FROM t",
        # 元数据/会话类:各自有专属 AST 类型,均不在白名单里
        "DESCRIBE t",
        "DESC t",
        "SHOW TABLES",
        "PRAGMA table_info('t')",
        "SET memory_limit='2GB'",
        # 回归(2026-07): AI 生成 SUMMARIZE 被补 LIMIT 后语法错误
        "SUMMARIZE tbl",
        "summarize duckdb_demo.orders",
        # 回归(2026-07): RESET 与 SET 同族,补 LIMIT 后语法错误(sqlglot 退化成 Command)
        "RESET memory_limit",
        "reset memory_limit",
        # sqlglot 不识别其 duckdb 专有语法、退化成 Command,天然落入"不接受"
        "EXPLAIN SELECT 1",
        "CALL some_func()",
        # 完全解析失败
        "EXPORT DATABASE 'dir' (FORMAT PARQUET)",
        "",
        "   ",
    ],
)
def test_statement_rejects_limit(sql):
    assert not statement_accepts_limit(sql)
    assert ensure_query_has_limit(sql, 100) == sql  # 原样返回,不补 LIMIT


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM t",
        "  select 1",
        "WITH x AS (SELECT 1) SELECT * FROM x",
        # PIVOT/UNPIVOT 编译成同一 AST 类型(exp.Pivot),真机验证过都能接 LIMIT
        "PIVOT orders ON product USING sum(amount) GROUP BY city",
        "UNPIVOT orders ON a, b INTO NAME k VALUE v",
        # 集合运算链(真机验证:顶层 AST 落在 Union/Except/Intersect 均可接 LIMIT)
        "SELECT 1 UNION ALL SELECT 2",
        "SELECT 1 UNION SELECT 2 EXCEPT SELECT 3",
        "SELECT 1 INTERSECT SELECT 2 UNION SELECT 3",
        # DuckDB 友好语法:FROM 在前、隐式 SELECT *
        "FROM t SELECT a, b",
        "FROM t",
        # 裸值列表
        "VALUES (1, 'a'), (2, 'b')",
        # 括号包裹的顶层查询(真机验证:旧黑名单实现下这个从未被拒绝过、确实能接 LIMIT)
        "(SELECT * FROM t)",
        "(WITH x AS (SELECT 1 AS a) SELECT * FROM x)",
        # DuckDB `TABLE t` 简写(sqlglot 认不出,单独用正则识别,避免相对旧实现的回归)
        "TABLE t",
        "table t;",
    ],
)
def test_statement_accepts_limit(sql):
    assert statement_accepts_limit(sql)


def test_ensure_query_has_limit_appends_for_select():
    # 换行追加(行尾注释安全);已有最外层 LIMIT 不重复补
    assert ensure_query_has_limit("SELECT * FROM t", 100) == "SELECT * FROM t\nLIMIT 100"
    assert ensure_query_has_limit("SELECT * FROM t LIMIT 5", 100) == "SELECT * FROM t LIMIT 5"


def test_ensure_query_has_limit_sql_boundaries():
    """验收 #18/#20/#21:行尾注释、子查询用户 LIMIT、分号/CTE/UNION/ORDER BY——
    最外层判定走 sqlglot AST,不用末尾数字正则。全部真实执行验证。"""
    import duckdb

    con = duckdb.connect(":memory:")

    # 18: 已有最外层 LIMIT + 行尾注释 → 原样(旧正则会追加出双 LIMIT 语法错误)
    sql = "SELECT * FROM range(20000) LIMIT 5 -- comment"
    assert ensure_query_has_limit(sql, 100) == sql
    assert len(con.execute(sql).fetchall()) == 5

    # 无 LIMIT 但以注释结尾 → 换行追加,可执行
    out = ensure_query_has_limit("SELECT * FROM range(20000) -- note", 100)
    assert len(con.execute(out).fetchall()) == 100

    # 20: 用户写在子查询里的 LIMIT 原样保留;外层默认仍应用
    out = ensure_query_has_limit(
        "SELECT * FROM (SELECT * FROM range(20000) LIMIT 7) s", 100
    )
    assert "LIMIT 7" in out
    assert len(con.execute(out).fetchall()) == 7  # 内层 7 < 外层 100

    # 21: 结尾分号 / CTE / UNION / ORDER BY 均正确生成最外层 LIMIT
    out = ensure_query_has_limit("SELECT * FROM range(20000);", 100)
    assert out.endswith("LIMIT 100;")
    assert len(con.execute(out.rstrip(";")).fetchall()) == 100

    out = ensure_query_has_limit("WITH c AS (SELECT * FROM range(20000)) SELECT * FROM c", 100)
    assert len(con.execute(out).fetchall()) == 100
    # CTE 内用户 LIMIT 不算最外层
    out = ensure_query_has_limit("WITH c AS (SELECT * FROM range(20000) LIMIT 7) SELECT * FROM c", 100)
    assert len(con.execute(out).fetchall()) == 7

    out = ensure_query_has_limit(
        "SELECT * FROM range(200) UNION ALL SELECT * FROM range(200)", 100
    )
    assert len(con.execute(out).fetchall()) == 100  # LIMIT 作用于整个集合最外层

    out = ensure_query_has_limit("SELECT * FROM range(20000) ORDER BY 1 DESC", 100)
    rows = con.execute(out).fetchall()
    assert len(rows) == 100 and rows[0][0] == 19999


def test_apply_row_limit_choice_full_is_verbatim():
    """复审 P1:全量(apply_limit=False)逐字执行,尊重用户自己写的 LIMIT——绝不再按
    'LIMIT 值==上限' 猜测删除(旧 remove_auto_added_limit 会把 LIMIT 10000 静默删成全表)。"""
    # 无 LIMIT → 保持无 LIMIT(全量)
    assert apply_row_limit_choice("SELECT * FROM range(20000)", False) == "SELECT * FROM range(20000)"
    # 用户手写的 LIMIT(即便等于常见上限)→ 原样保留
    assert (
        apply_row_limit_choice("SELECT * FROM range(20000) LIMIT 10000", False)
        == "SELECT * FROM range(20000) LIMIT 10000"
    )


def test_apply_row_limit_choice_limited_default_not_cap():
    """验收 #5/#6/#7:勾选"限制"= 用户未写最外层 LIMIT 时补默认 max_query_rows;
    用户写了(更小或更大)都用用户值——默认值是兜底,不是硬上限,绝不把 12000 压成 10000。
    真实 DuckDB 执行验证。"""
    import duckdb

    con = duckdb.connect(":memory:")
    with patch("core.common.config_manager.config_manager") as mgr:
        mgr.get_app_config.return_value = Mock(max_query_rows=500)

        # 无 LIMIT → 最外层补默认 500
        sql1 = apply_row_limit_choice("SELECT * FROM range(20000)", True)
        assert len(con.execute(sql1).fetchall()) == 500

        # 用户 LIMIT 更小(5)→ 用 5
        sql2 = apply_row_limit_choice("SELECT * FROM range(20000) LIMIT 5", True)
        assert sql2 == "SELECT * FROM range(20000) LIMIT 5"
        assert len(con.execute(sql2).fetchall()) == 5

        # 行尾注释 + 已有 LIMIT → 原样(旧正则会拼出双 LIMIT 语法错误)
        sql3 = apply_row_limit_choice(
            "SELECT * FROM range(20000) LIMIT 5 -- user limit", True
        )
        assert len(con.execute(sql3).fetchall()) == 5

        # 用户 LIMIT 更大(1200 > 默认 500)→ 用用户的 1200,不封顶
        sql4 = apply_row_limit_choice("SELECT * FROM range(20000) LIMIT 1200", True)
        assert sql4 == "SELECT * FROM range(20000) LIMIT 1200"
        assert len(con.execute(sql4).fetchall()) == 1200

        # 非查询语句(不接受 LIMIT)原样返回
        assert apply_row_limit_choice("INSTALL httpfs", True) == "INSTALL httpfs"


def test_double_semicolon_left_untouched():
    """回归:旧黑名单实现会对 'SELECT * FROM t;;' 之类畸形输入盲目补 LIMIT,
    产出 'SELECT * FROM t;; LIMIT 100' 这种真机验证过的语法错误。新实现里
    多语句(sqlglot 解析成 Block)不在白名单内,原样返回、不引入新的错误。"""
    sql = "SELECT * FROM t;;"
    assert not statement_accepts_limit(sql)
    assert ensure_query_has_limit(sql, 100) == sql
