from core.database.federated_optimizer import plan_semijoins


def test_inner_join_local_reduces_remote():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"
    plans = plan_semijoins(sql, {"mysql_db"})
    assert len(plans) == 1
    p = plans[0]
    assert (p.remote_alias, p.remote_col) == ("o", "id")
    assert (p.local_table_sql, p.local_col) == ("local_t AS l", "oid")


def test_left_join_reduces_only_non_preserved_right():
    sql = "SELECT * FROM local_t l LEFT JOIN mysql_db.orders o ON l.oid = o.id"
    plans = plan_semijoins(sql, {"mysql_db"})
    assert len(plans) == 1 and plans[0].remote_alias == "o"


def test_left_join_preserved_remote_not_reduced():
    sql = "SELECT * FROM mysql_db.orders o LEFT JOIN local_t l ON o.id = l.oid"
    assert plan_semijoins(sql, {"mysql_db"}) == []


def test_both_remote_skipped_v1():
    sql = "SELECT * FROM mysql_db.a a JOIN pg.b b ON a.id = b.id"
    assert plan_semijoins(sql, {"mysql_db", "pg"}) == []


def test_full_outer_skipped():
    sql = "SELECT * FROM local_t l FULL JOIN mysql_db.orders o ON l.oid = o.id"
    assert plan_semijoins(sql, {"mysql_db"}) == []


from core.database.federated_optimizer import apply_semijoin_pushdown


def test_apply_rewrites_remote_with_in_list():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"

    def keys(local_sql, col, limit):
        assert "local_t" in local_sql and col == "oid"
        return [1, 2, 3]

    out_sql, reports = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=keys, threshold=100)
    assert "IN (1, 2, 3)" in out_sql
    assert "FROM mysql_db.orders" in out_sql and " AS o" in out_sql
    assert any(r["pushed"] for r in reports)


def test_cardinality_guard_skips_when_too_many():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"

    def keys(local_sql, col, limit):
        return None  # provider 表示超阈值

    out_sql, reports = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=keys, threshold=100)
    assert "IN (" not in out_sql
    assert all(not r["pushed"] for r in reports)


def test_string_keys_quoted():
    sql = "SELECT * FROM mysql_db.t x JOIN local_t l ON x.code = l.code"
    out_sql, _ = apply_semijoin_pushdown(
        sql, {"mysql_db"}, key_provider=lambda *a: ["A", "B"], threshold=100)
    assert "IN ('A', 'B')" in out_sql


def test_unparseable_sql_returns_original():
    sql = "SELECT FROM WHERE )("  # 故意坏
    out_sql, reports = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=lambda *a: [1], threshold=100)
    assert out_sql == sql
    assert reports == [{"error": "parse_failed", "pushed": False}]


def test_no_pushdown_returns_sql_verbatim():
    """回归(2026-07): 无改写也走 tree.sql() 往返,把 USING SAMPLE 排到 LIMIT 后变语法错误。
    没有实际下推时必须逐字返回原 SQL。"""
    sql = "SELECT * FROM mysql_db.orders USING SAMPLE 50 ROWS LIMIT 10000"
    out_sql, _ = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=lambda *a: [1], threshold=100)
    assert out_sql == sql
    # 无 JOIN 的普通查询同样逐字放行
    sql2 = "SELECT * FROM mysql_db.orders LIMIT 10"
    out_sql2, _ = apply_semijoin_pushdown(sql2, {"mysql_db"}, key_provider=lambda *a: [1], threshold=100)
    assert out_sql2 == sql2


def test_sample_clause_skips_pushdown_even_with_join():
    """含采样子句的查询直接放行:即便存在可下推 JOIN 也不做 sqlglot 往返。"""
    sql = ("SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid "
           "USING SAMPLE 10 ROWS")
    out_sql, reports = apply_semijoin_pushdown(sql, {"mysql_db"}, key_provider=lambda *a: [1, 2], threshold=100)
    assert out_sql == sql
    assert reports == []


from core.database.federated_optimizer import build_time_bound_suggestions


def _schema(_ref):
    return [{"name": "id", "type": "BIGINT"}, {"name": "created_at", "type": "TIMESTAMP"}]


def test_suggests_when_no_time_predicate():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"
    sugg = build_time_bound_suggestions(sql, {"mysql_db"}, schema_provider=_schema)
    assert len(sugg) == 1
    s = sugg[0]
    assert s["table"] == "mysql_db.orders" and s["column"] == "created_at"
    assert s["type"] == "time_bound" and "created_at" in s["hint"]


def test_no_suggestion_when_time_predicate_present():
    sql = "SELECT * FROM mysql_db.orders o WHERE o.created_at >= '2026-01-01'"
    assert build_time_bound_suggestions(sql, {"mysql_db"}, schema_provider=_schema) == []


def test_no_suggestion_without_audit_column():
    sql = "SELECT * FROM mysql_db.orders o"
    flat = lambda _ref: [{"name": "id", "type": "BIGINT"}, {"name": "qty", "type": "INT"}]
    assert build_time_bound_suggestions(sql, {"mysql_db"}, schema_provider=flat) == []


def test_no_suggestion_when_unqualified_time_predicate():
    sql = "SELECT * FROM mysql_db.orders o WHERE created_at >= '2026-01-01'"  # 无表前缀
    assert build_time_bound_suggestions(sql, {"mysql_db"}, schema_provider=_schema) == []


def test_left_join_preserved_remote_reversed_on_not_reduced():
    # remote 在保留(LEFT)侧,ON 写成 local=remote(反序) → 仍不能缩 remote
    sql = "SELECT * FROM mysql_db.orders o LEFT JOIN local_t l ON l.oid = o.id"
    assert plan_semijoins(sql, {"mysql_db"}) == []


def test_left_join_reduces_non_preserved_remote_reversed_on():
    # remote 在非保留(右)侧,ON 反序(o 在左) → 仍应缩 remote
    sql = "SELECT * FROM local_t l LEFT JOIN mysql_db.orders o ON o.id = l.oid"
    plans = plan_semijoins(sql, {"mysql_db"})
    assert len(plans) == 1 and plans[0].remote_alias == "o"


def test_or_in_on_clause_skips_pushdown():
    """回归: ON 里的 OR 分支等值曾被当作必要条件下推,静默丢掉走另一分支匹配的行。"""
    sql = (
        "SELECT * FROM mysql_db.orders o JOIN local_t l "
        "ON o.id = l.oid OR o.id = l.alt_oid"
    )
    assert plan_semijoins(sql, {"mysql_db"}) == []


def test_not_wrapped_eq_skips_pushdown():
    sql = (
        "SELECT * FROM mysql_db.orders o JOIN local_t l "
        "ON NOT (o.id = l.oid)"
    )
    assert plan_semijoins(sql, {"mysql_db"}) == []


def test_and_chain_with_extra_predicate_still_pushes():
    """顶层 AND 链上的等值仍应下推(AND 中每个条件都是必要条件)。"""
    sql = (
        "SELECT * FROM mysql_db.orders o JOIN local_t l "
        "ON o.id = l.oid AND l.status = 'x'"
    )
    plans = plan_semijoins(sql, {"mysql_db"})
    assert len(plans) == 1 and plans[0].remote_col == "id"


def test_and_containing_or_branch_only_uses_and_level_eq():
    """AND(eq1, OR(eq2,...)): eq1 是必要条件可推,OR 里的 eq2 不可作为下推键。"""
    sql = (
        "SELECT * FROM mysql_db.orders o JOIN local_t l "
        "ON o.id = l.oid AND (o.uid = l.uid OR l.flag = 1)"
    )
    plans = plan_semijoins(sql, {"mysql_db"})
    assert len(plans) == 1 and plans[0].remote_col == "id"


def test_sample_keyword_in_string_literal_does_not_block_pushdown():
    """回归(2026-07): 采样判定曾用原文正则,字面量里的 TABLESAMPLE 会误伤可下推查询。"""
    sql = ("SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid "
           "WHERE o.note = 'try TABLESAMPLE now'")
    out_sql, reports = apply_semijoin_pushdown(
        sql, {"mysql_db"}, key_provider=lambda *a: [1, 2], threshold=100)
    assert "IN (1, 2)" in out_sql          # 下推正常发生,不再被字面量拦下
    assert any(r["pushed"] for r in reports)


from core.database.federated_optimizer import optimize_federated_sql


class _CfgStub:
    federated_semijoin_threshold = 100


class _ConnStub:
    """按 SQL 形状分流:DESCRIBE 给 schema,DISTINCT 键查询给键集。记录调用供断言。"""

    def __init__(self):
        self.queries = []

    def execute(self, q):
        self.queries.append(q)

        class _R:
            def __init__(self, rows):
                self._rows = rows

            def fetchall(self):
                return self._rows

        if q.strip().upper().startswith("DESCRIBE"):
            return _R([("id", "BIGINT", None, None, None, None),
                       ("created_at", "TIMESTAMP", None, None, None, None)])
        return _R([(1,), (2,)])


def test_optimize_sample_query_skips_both_phases_without_touching_conn():
    """采样查询在 optimize 层整体放行:不下推、不出建议、连接零调用(conn=None 也不炸)。"""
    sql = "SELECT * FROM mysql_db.orders USING SAMPLE 50 ROWS"
    out_sql, suggestions, warnings = optimize_federated_sql(None, sql, {"mysql_db"}, _CfgStub())
    assert out_sql == sql
    assert suggestions == [] and warnings == []


def test_optimize_suggestions_computed_before_tree_mutation():
    """单次 parse 共享树:建议必须先于下推改写计算,否则远端表已被换成子查询、建议丢失。"""
    conn = _ConnStub()
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"
    out_sql, suggestions, warnings = optimize_federated_sql(conn, sql, {"mysql_db"}, _CfgStub())
    assert "IN (1, 2)" in out_sql                      # 下推发生了(树被改写)
    assert len(suggestions) == 1                       # 建议仍基于改写前的裸远端表
    assert suggestions[0]["table"] == "mysql_db.orders"
    assert suggestions[0]["column"] == "created_at"


def test_optimize_parse_failure_keeps_warning_shape():
    """整体 parse 失败:原样放行且保留 parse_failed 告警(与旧行为一致)。"""
    out_sql, suggestions, warnings = optimize_federated_sql(
        None, "SELECT FROM WHERE )(", {"mysql_db"}, _CfgStub())
    assert out_sql == "SELECT FROM WHERE )("
    assert suggestions == []
    assert warnings == [{"error": "parse_failed", "pushed": False}]


def test_optimize_pushes_same_mysql_star_join_as_one_remote_query():
    """历史回归（2026-07-28）：同一 MySQL 的多表 JOIN 不应分表拉回 DuckDB。

    SELECT * 必须按远端 schema 展开并复用结果层的去重口径，否则 mysql_query
    会因 id/created_at 等重复列名在绑定阶段失败。
    """
    conn = _ConnStub()
    sql = (
        'SELECT * FROM "mysql_db"."orders" o '
        'JOIN "mysql_db"."items" i ON o.id = i.order_id '
        'WHERE o.id >= 1 AND i.id > 0 LIMIT 100'
    )

    out_sql, _suggestions, warnings = optimize_federated_sql(
        conn,
        sql,
        {"mysql_db"},
        _CfgStub(),
        mysql_aliases={"mysql_db"},
    )

    assert out_sql.startswith("SELECT * FROM mysql_query('mysql_db', '")
    assert "FROM `orders` AS o JOIN `items` AS i" in out_sql
    assert "WHERE o.id >= 1 AND i.id > 0" in out_sql
    assert "o.id AS `id`" in out_sql
    assert "i.id AS `id_1`" in out_sql
    assert "i.created_at AS `created_at_1`" in out_sql
    assert warnings == []
