from core.database.federated_optimizer import extract_remote_targets


ALIASES = {"mysql_db", "pg"}


def _names(targets):
    return sorted((t.leftmost, t.name) for t in targets)


def test_bare_remote_table_is_target():
    sql = "SELECT * FROM mysql_db.orders o JOIN local_t l ON o.id = l.oid"
    targets = extract_remote_targets(sql, ALIASES)
    assert _names(targets) == [("mysql_db", "orders")]


def test_local_table_not_target():
    sql = "SELECT * FROM local_a a JOIN local_b b ON a.id = b.id"
    assert extract_remote_targets(sql, ALIASES) == []


def test_table_inside_subquery_skipped_idempotent():
    sql = ("SELECT * FROM (SELECT * FROM mysql_db.orders WHERE created_at >= '2026-01-01') o "
           "JOIN local_t l ON o.id = l.oid")
    assert extract_remote_targets(sql, ALIASES) == []


def test_three_part_pg_table_target():
    sql = 'SELECT * FROM "pg"."public"."t" x JOIN local_t l ON x.id = l.id'
    targets = extract_remote_targets(sql, ALIASES)
    assert _names(targets) == [("pg", "t")]
