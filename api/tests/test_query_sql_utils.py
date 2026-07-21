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
    assert ensure_query_has_limit("SELECT * FROM t", 100) == "SELECT * FROM t LIMIT 100"
    # 已有 LIMIT 不重复补
    assert ensure_query_has_limit("SELECT * FROM t LIMIT 5", 100) == "SELECT * FROM t LIMIT 5"


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


def test_apply_row_limit_choice_limited_appends_when_missing():
    """限制(apply_limit=True):缺 LIMIT 补 max_query_rows;已有则保留。"""
    with patch("core.common.config_manager.config_manager") as mgr:
        mgr.get_app_config.return_value = Mock(max_query_rows=500)
        assert apply_row_limit_choice("SELECT * FROM t", True) == "SELECT * FROM t LIMIT 500"
        assert apply_row_limit_choice("SELECT * FROM t LIMIT 5", True) == "SELECT * FROM t LIMIT 5"


def test_double_semicolon_left_untouched():
    """回归:旧黑名单实现会对 'SELECT * FROM t;;' 之类畸形输入盲目补 LIMIT,
    产出 'SELECT * FROM t;; LIMIT 100' 这种真机验证过的语法错误。新实现里
    多语句(sqlglot 解析成 Block)不在白名单内,原样返回、不引入新的错误。"""
    sql = "SELECT * FROM t;;"
    assert not statement_accepts_limit(sql)
    assert ensure_query_has_limit(sql, 100) == sql
