import duckdb
import pytest
import sqlglot
from sqlglot import exp

from core.common.utils import dedupe_column_names
from core.database.federated_optimizer import optimize_federated_sql


@pytest.fixture()
def conn(tmp_path):
    # 用第二个 DuckDB 库充当"远端"(原生 ATTACH,无需扩展/联网);其别名当作 remote。
    remote_path = tmp_path / "remote.duckdb"
    r = duckdb.connect(str(remote_path))
    r.execute("CREATE TABLE orders (id INTEGER, amount DOUBLE, created_at TIMESTAMP)")
    r.execute("INSERT INTO orders VALUES (1,10,'2020-01-01'),(2,20,'2026-06-01'),(3,30,'2026-06-10')")
    r.execute("CREATE TABLE items (id INTEGER, order_id INTEGER, label VARCHAR)")
    r.execute("INSERT INTO items VALUES (10,2,'x'),(11,2,'y'),(12,3,'z')")
    r.close()

    c = duckdb.connect()
    c.execute(f"ATTACH '{remote_path}' AS remote_db (READ_ONLY)")
    c.execute("CREATE TABLE local_t (oid INTEGER, tag VARCHAR)")
    c.execute("INSERT INTO local_t VALUES (2,'x'),(3,'y')")  # 只关心 id 2,3
    yield c
    c.close()


class _Cfg:
    federated_semijoin_threshold = 1000


def test_semijoin_preserves_result(conn):
    sql = "SELECT o.id FROM remote_db.orders o JOIN local_t l ON o.id = l.oid ORDER BY o.id"
    baseline = conn.execute(sql).fetchall()
    opt, _sugg, _warn = optimize_federated_sql(conn, sql, {"remote_db"}, _Cfg())
    assert "IN (" in opt                      # 确实改写了
    assert conn.execute(opt).fetchall() == baseline == [(2,), (3,)]


def test_idempotent_on_prewrapped_subquery(conn):
    sql = ("SELECT o.id FROM (SELECT * FROM remote_db.orders WHERE id IN (2,3)) o "
           "JOIN local_t l ON o.id = l.oid ORDER BY o.id")
    opt, _s, _w = optimize_federated_sql(conn, sql, {"remote_db"}, _Cfg())
    assert conn.execute(opt).fetchall() == [(2,), (3,)]


def test_time_bound_suggestion_emitted(conn):
    sql = "SELECT o.id FROM remote_db.orders o JOIN local_t l ON o.id = l.oid"
    _opt, sugg, _w = optimize_federated_sql(conn, sql, {"remote_db"}, _Cfg())
    assert any(s["column"] == "created_at" for s in sugg)


def test_left_join_preserved_remote_returns_all_rows(conn):
    # orders 是 LEFT 保留侧 → 必须返回全部 3 行(local 只匹配 id 2,3)
    sql = "SELECT o.id FROM remote_db.orders o LEFT JOIN local_t l ON l.oid = o.id ORDER BY o.id"
    baseline = conn.execute(sql).fetchall()
    opt, _s, _w = optimize_federated_sql(conn, sql, {"remote_db"}, _Cfg())
    assert conn.execute(opt).fetchall() == baseline == [(1,), (2,), (3,)]


def test_same_mysql_star_join_remote_sql_executes_and_preserves_result(conn):
    """历史回归（2026-07-28）：整条同库 JOIN 下推生成的远端 SQL 必须在
    真实 DuckDB 上执行，并与原联邦 SQL 的值、字段顺序及去重列名一致。"""
    sql = (
        "SELECT * FROM remote_db.orders o JOIN remote_db.items i "
        "ON o.id = i.order_id ORDER BY o.id, i.id"
    )
    baseline_cursor = conn.execute(sql)
    baseline_rows = baseline_cursor.fetchall()
    baseline_columns = dedupe_column_names(
        [str(column[0]) for column in baseline_cursor.description]
    )

    optimized, _suggestions, warnings = optimize_federated_sql(
        conn,
        sql,
        {"remote_db"},
        _Cfg(),
        mysql_aliases={"remote_db"},
    )
    wrapper = sqlglot.parse_one(optimized, read="duckdb")
    mysql_query = next(wrapper.find_all(exp.Anonymous))
    remote_mysql_sql = mysql_query.expressions[1].this
    remote_duckdb_sql = sqlglot.transpile(
        remote_mysql_sql, read="mysql", write="duckdb"
    )[0]

    remote_path = conn.execute(
        "SELECT path FROM duckdb_databases() WHERE database_name = 'remote_db'"
    ).fetchone()[0]
    remote = duckdb.connect(remote_path, read_only=True)
    try:
        remote_cursor = remote.execute(remote_duckdb_sql)
        remote_rows = remote_cursor.fetchall()
        remote_columns = [str(column[0]) for column in remote_cursor.description]
    finally:
        remote.close()

    assert remote_rows == baseline_rows
    assert [
        (row[0], row[1], row[3], row[4], row[5]) for row in remote_rows
    ] == [
        (2, 20.0, 10, 2, "x"),
        (2, 20.0, 11, 2, "y"),
        (3, 30.0, 12, 3, "z"),
    ]
    assert remote_columns == baseline_columns == [
        "id", "amount", "created_at", "id_1", "order_id", "label"
    ]
    assert warnings == []
