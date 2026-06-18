import duckdb
import pytest

from core.database.federated_optimizer import optimize_federated_sql


@pytest.fixture()
def conn(tmp_path):
    # 用第二个 DuckDB 库充当"远端"(原生 ATTACH,无需扩展/联网);其别名当作 remote。
    remote_path = tmp_path / "remote.duckdb"
    r = duckdb.connect(str(remote_path))
    r.execute("CREATE TABLE orders (id INTEGER, amount DOUBLE, created_at TIMESTAMP)")
    r.execute("INSERT INTO orders VALUES (1,10,'2020-01-01'),(2,20,'2026-06-01'),(3,30,'2026-06-10')")
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
