"""ai_sql_guard 绕过语料回归:承重墙测试。

背景(2026-07-23 实证):引擎级沙箱在共享池上不可行(enable_external_access
为实例级且不可逆、同进程无法二连 main.db),文件/URL/系统面的边界全部由
本闸强制。按 AGENTS §10:放行样例必须在真实 DuckDB 上执行并断言结果值。
"""

import duckdb
import pytest

from core.services.ai_sql_guard import ScopeLimits, check_sql

ALIASES = ["sorder", "demo_duck"]

FORBIDDEN = [
    ("SELECT * FROM read_csv('/etc/passwd')", "table function"),
    ("SELECT * FROM read_text('/etc/hosts')", "table function"),
    ("SELECT * FROM read_json_auto('x.json')", "table function"),
    ("SELECT * FROM read_parquet('a.pq')", "table function"),
    ("SELECT * FROM glob('/etc/*')", "table function"),
    ("SELECT * FROM parquet_scan('a.pq')", "table function"),
    ("SELECT * FROM 'https://evil.example.com/x.parquet'", "URL"),
    ("SELECT * FROM '/tmp/x.csv'", "file path"),
    ("SELECT * FROM \"dir/inner.csv\"", "file path"),
    ("SELECT * FROM system_app_settings", "system table"),
    ("SELECT * FROM main.system_table_registry", "system table"),
    ("SELECT * FROM rogue_alias.some_table", "unauthorized"),
    ("SELECT * FROM pragma_database_list()", "table function"),
    ("PRAGMA database_list", "PRAGMA"),
    ("SELECT getenv('HOME')", "function"),
    ("SELECT 1; SELECT 2", "one statement"),
    # CTE 深处的表函数不得漏网
    ("WITH x AS (SELECT * FROM t) SELECT * FROM x JOIN read_parquet('a.pq') r ON 1=1",
     "table function"),
]

ALLOWED = [
    "SELECT 1 AS v",
    "SELECT * FROM guard_orders WHERE status = 'paid'",
    'SELECT count(*) AS n FROM "guard_订单表"',
    "SELECT * FROM main.guard_orders LIMIT 5",
    "WITH x AS (SELECT * FROM guard_orders) SELECT count(*) AS n FROM x",
    "SELECT * FROM (VALUES (1),(2)) t(a)",
    "FROM guard_orders",  # DuckDB 简写
    "SELECT g.status, count(*) AS n FROM guard_orders g GROUP BY 1 ORDER BY 2 DESC",
    # 无害生成器表函数(模型脚手架正当用法)必须放行
    "SELECT count(*) AS n FROM range(10)",
    "SELECT * FROM generate_series(1, 3)",
]


@pytest.mark.parametrize("sql,reason_hint", FORBIDDEN)
def test_forbidden_statements_rejected(sql, reason_hint):
    allowed, reason = check_sql(sql, ALIASES)
    assert allowed is False, f"应拒绝: {sql}"
    assert reason


def test_authorized_alias_qualifier_allowed():
    allowed, reason = check_sql("SELECT * FROM sorder.iget_order LIMIT 3", ALIASES)
    assert allowed is True, reason


# ---- 三段名 catalog.schema.table(PostgreSQL 多 schema;旧实现把 schema 段当别名判定,全拒) ----

@pytest.mark.parametrize("sql", [
    "SELECT * FROM sorder.public.orders LIMIT 3",
    "SELECT * FROM demo_duck.analytics.fact_sales LIMIT 3",
    # 跨源 JOIN:本地表 × 远端三段名
    "SELECT o.id FROM guard_orders o JOIN sorder.public.orders p ON p.id = o.id",
])
def test_three_part_name_with_authorized_catalog_allowed(sql):
    allowed, reason = check_sql(sql, ALIASES)
    assert allowed is True, f"误伤三段名: {sql} -> {reason}"


@pytest.mark.parametrize("sql,hint", [
    # 首段不是授权别名 → 仍然拒绝(授权边界不能被三段名绕过)
    ("SELECT * FROM rogue.public.orders", "unauthorized"),
    # 首段合法但第二段是系统/元数据 schema → 拒绝
    ("SELECT * FROM sorder.information_schema.tables", "system schema"),
    ("SELECT * FROM main_db.pg_catalog.pg_tables", "system schema"),
    ("SELECT * FROM sorder.mysql.user", "system schema"),
    # 两段名的元数据 schema 也照旧拒绝
    ("SELECT * FROM information_schema.tables", "unauthorized"),
])
def test_three_part_name_boundaries_still_rejected(sql, hint):
    allowed, reason = check_sql(sql, ALIASES)
    assert allowed is False, f"应拒绝: {sql}"
    assert hint in reason, f"{sql} -> {reason}"


@pytest.fixture(name="con")
def _con():
    c = duckdb.connect()
    c.execute("CREATE TABLE guard_orders(id INTEGER, status VARCHAR)")
    c.execute("INSERT INTO guard_orders VALUES (1,'paid'),(2,'paid'),(3,'refunded')")
    c.execute('CREATE TABLE "guard_订单表"(x INTEGER)')
    c.execute('INSERT INTO "guard_订单表" VALUES (7)')
    yield c
    c.close()


@pytest.mark.parametrize("sql", ALLOWED)
def test_allowed_statements_pass_and_execute(con, sql):
    """放行的形态必须真的能在 DuckDB 上执行(防闸误伤把产品打残)。"""
    allowed, reason = check_sql(sql, ALIASES)
    assert allowed is True, f"误伤: {sql} -> {reason}"
    rows = con.execute(sql).fetchall()
    assert rows is not None


def test_allowed_aggregation_returns_correct_value(con):
    sql = "SELECT count(*) AS n FROM guard_orders WHERE status = 'paid'"
    assert check_sql(sql, [])[0] is True
    assert con.execute(sql).fetchone()[0] == 2


def test_unparseable_sql_fail_closed():
    allowed, reason = check_sql("SELECT ((( FROM", [])
    assert allowed is False
    assert "reject" in reason or "statement" in reason


# ---- 用户选定的问数范围(ScopeLimits):选了就是边界,不是提示 ----

def test_no_limits_keeps_everything_allowed():
    """默认(一张没勾)= 整库可问,与收紧前逐字一致。"""
    assert check_sql("SELECT * FROM guard_orders", ALIASES, None)[0] is True
    assert check_sql("SELECT * FROM sorder.iget_order", ALIASES, ScopeLimits())[0] is True


def test_local_scope_rejects_table_outside_selection():
    limits = ScopeLimits(local_tables=["guard_orders"])
    assert check_sql("SELECT * FROM guard_orders", ALIASES, limits)[0] is True
    allowed, reason = check_sql("SELECT * FROM other_table", ALIASES, limits)
    assert allowed is False
    assert "outside the scope" in reason and "other_table" in reason


def test_local_scope_is_case_insensitive_and_covers_qualified_names():
    limits = ScopeLimits(local_tables=["Guard_Orders"])
    assert check_sql("SELECT * FROM guard_orders", ALIASES, limits)[0] is True
    assert check_sql("SELECT * FROM main.guard_orders", ALIASES, limits)[0] is True
    assert check_sql("SELECT * FROM main.other_table", ALIASES, limits)[0] is False


def test_empty_local_scope_rejects_every_local_table():
    """本地被移出范围 = 一张都不放行(纯对话)。空集 != None。"""
    limits = ScopeLimits(local_tables=[])
    assert check_sql("SELECT * FROM guard_orders", ALIASES, limits)[0] is False
    assert check_sql("SELECT 1 AS v", ALIASES, limits)[0] is True  # 不碰表照常可跑


def test_alias_scope_narrows_a_connection_to_picked_tables():
    limits = ScopeLimits(alias_tables={"sorder": ["iget_order"]})
    assert check_sql("SELECT * FROM sorder.iget_order", ALIASES, limits)[0] is True
    allowed, reason = check_sql("SELECT * FROM sorder.crm_order", ALIASES, limits)
    assert allowed is False
    assert "outside the scope" in reason


def test_alias_scope_absent_alias_stays_whole_database():
    """只收窄 sorder;未列出的 demo_duck 仍是整库(全库模式与选表模式共存)。"""
    limits = ScopeLimits(alias_tables={"sorder": ["iget_order"]})
    assert check_sql("SELECT * FROM demo_duck.anything", ALIASES, limits)[0] is True


def test_scope_applies_inside_cte_and_join():
    limits = ScopeLimits(local_tables=["guard_orders"])
    sql = "WITH x AS (SELECT * FROM other_table) SELECT * FROM guard_orders g JOIN x ON 1=1"
    assert check_sql(sql, ALIASES, limits)[0] is False


def test_cte_name_is_not_mistaken_for_an_out_of_scope_table():
    limits = ScopeLimits(local_tables=["guard_orders"])
    sql = "WITH tmp AS (SELECT * FROM guard_orders) SELECT count(*) AS n FROM tmp"
    assert check_sql(sql, ALIASES, limits)[0] is True
