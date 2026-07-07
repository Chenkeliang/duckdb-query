"""query_sql_utils:预览模式补 LIMIT 的语句类型判断。

回归背景(2026-07):INSTALL/LOAD 等扩展管理语句被追加 LIMIT 后变成语法错误
(INSTALL inet LIMIT 10000),导致桌面端无法通过 SQL 显式安装扩展。
"""

import pytest

from routers.query_sql_utils import ensure_query_has_limit, statement_accepts_limit


@pytest.mark.parametrize(
    "sql",
    [
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
        "CREATE TABLE t AS SELECT 1",
        "DROP TABLE t",
        # 回归(2026-07): AI 生成 SUMMARIZE 被补 LIMIT 后语法错误
        "SUMMARIZE tbl",
        "summarize duckdb_demo.orders",
        # 回归(2026-07): RESET 与 SET 同族,补 LIMIT 后语法错误
        "RESET memory_limit",
        "reset memory_limit",
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
        # PIVOT/UNPIVOT 编译成 SELECT,可以接 LIMIT(真机验证过裸 PIVOT ... LIMIT 可执行)
        "PIVOT orders ON product USING sum(amount) GROUP BY city",
    ],
)
def test_statement_accepts_limit(sql):
    assert statement_accepts_limit(sql)


def test_ensure_query_has_limit_appends_for_select():
    assert ensure_query_has_limit("SELECT * FROM t", 100) == "SELECT * FROM t LIMIT 100"
    # 已有 LIMIT 不重复补
    assert ensure_query_has_limit("SELECT * FROM t LIMIT 5", 100) == "SELECT * FROM t LIMIT 5"
