"""Executable DuckDB 2.0 feature contract; skipped on the 1.5 production baseline."""

import duckdb
import pytest

from routers.query_sql_utils import apply_row_limit_choice, ensure_query_has_limit


def _engine_version() -> str:
    con = duckdb.connect(":memory:")
    try:
        return str(con.execute("SELECT version()").fetchone()[0])
    finally:
        con.close()


ENGINE_VERSION = _engine_version()
pytestmark = pytest.mark.skipif(
    not str(ENGINE_VERSION).startswith("v2."),
    reason="DuckDB 2.x feature matrix",
)


@pytest.fixture
def vectors():
    con = duckdb.connect(":memory:")
    con.execute("CREATE TABLE queries(id INTEGER, embedding FLOAT[3])")
    con.execute("INSERT INTO queries VALUES (1,[1,0,0]),(2,[0,1,0])")
    con.execute("CREATE TABLE products(id INTEGER, embedding FLOAT[3])")
    con.execute(
        "INSERT INTO products VALUES "
        "(10,[1,0,0]),(20,[0.9,0.1,0]),(30,[0,1,0]),(40,NULL)"
    )
    try:
        yield con
    finally:
        con.close()


def _nearest_sql() -> str:
    return (
        "SELECT q.id AS qid, p.id AS pid FROM queries q "
        "INNER JOIN products p APPROX NEAREST 2 "
        "BY SIMILARITY array_cosine_similarity(q.embedding, p.embedding) "
        "ORDER BY qid, pid"
    )


def test_handwritten_approx_nearest_executes_and_gets_total_limit(vectors):
    sql = ensure_query_has_limit(_nearest_sql(), 3)
    assert sql.endswith("LIMIT 3")
    assert vectors.execute(sql).fetchall() == [(1, 10), (1, 20), (2, 20)]


def test_approx_nearest_user_limit_is_respected_and_removable(vectors):
    sql = f"{_nearest_sql()} LIMIT 2"
    assert ensure_query_has_limit(sql, 10) == sql
    assert len(vectors.execute(sql).fetchall()) == 2
    assert len(vectors.execute(apply_row_limit_choice(sql, False)).fetchall()) == 4


def test_approx_nearest_dimension_mismatch_is_rejected(vectors):
    bad = (
        "SELECT * FROM queries q INNER JOIN products p APPROX NEAREST 1 "
        "BY SIMILARITY array_cosine_similarity(q.embedding, [1,2]::FLOAT[2])"
    )
    with pytest.raises(duckdb.Error):
        vectors.execute(bad)


def test_approx_nearest_can_be_materialized_and_exported(vectors, tmp_path):
    """Save/async use CTAS and export uses COPY(query); both must accept the join."""
    limited = ensure_query_has_limit(_nearest_sql(), 3)
    vectors.execute(f"CREATE TABLE nearest_saved AS ({limited})")
    assert vectors.execute("SELECT count(*) FROM nearest_saved").fetchone() == (3,)

    target = tmp_path / "nearest.parquet"
    vectors.execute(f"COPY (\n{limited}\n) TO ? (FORMAT PARQUET)", [str(target)])
    assert vectors.execute("SELECT count(*) FROM read_parquet(?)", [str(target)]).fetchone() == (3,)


def test_recursive_cte_using_key_and_fetch_first_execute():
    con = duckdb.connect(":memory:")
    base_sql = (
        "WITH RECURSIVE tally(id, value) USING KEY (id) AS ("
        "SELECT 1, 1 UNION SELECT id + 1, value + 1 FROM tally WHERE id < 5"
        ") SELECT * FROM tally ORDER BY id"
    )
    bounded = ensure_query_has_limit(base_sql, 3)
    assert bounded.endswith("LIMIT 3")
    rows = con.execute(bounded).fetchall()
    assert rows == [(1, 1), (2, 2), (3, 3)]
    fetched = f"{base_sql} FETCH FIRST 2 ROWS ONLY"
    assert ensure_query_has_limit(fetched, 3) == fetched


def test_variant_and_json_mutation_work_without_extensions():
    con = duckdb.connect(":memory:")
    row = con.execute(
        "SELECT variant_type('{\"a\":1}'::JSON::VARIANT), "
        "variant_contains('{\"a\":1}'::JSON::VARIANT, '{\"a\":1}'::JSON::VARIANT), "
        "json_set('{\"a\":1}', '$.b', '2')"
    ).fetchone()
    assert row == ("OBJECT", True, '{"a":1,"b":2}')


def test_lambda_breaking_change_and_json_arrow_are_unambiguous():
    con = duckdb.connect(":memory:")
    with pytest.raises(duckdb.Error, match="Deprecated lambda arrow"):
        con.execute("SELECT list_transform([1,2], x -> x + 1)")
    assert con.execute(
        "SELECT list_transform([1,2], lambda x: x + 1)"
    ).fetchone() == ([2, 3],)
    assert con.execute("SELECT json('{\"a\":1}')->'a'").fetchone() == ("1",)


def test_icu_timezone_and_collation_work_with_autoinstall_disabled():
    con = duckdb.connect(":memory:")
    con.execute("SET autoinstall_known_extensions=false")
    con.execute("LOAD icu")
    assert con.execute(
        "SELECT timezone('Asia/Shanghai', TIMESTAMPTZ '2026-01-01 00:00:00+00')"
    ).fetchone()[0].hour == 8
    assert con.execute("SELECT 'a' < 'b' COLLATE zh").fetchone() == (True,)
