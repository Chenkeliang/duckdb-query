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
