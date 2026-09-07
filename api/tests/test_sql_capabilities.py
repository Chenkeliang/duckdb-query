"""Shared SQL classification regressions for DuckDB 2.0 syntax (2026-09-04)."""

import pytest

from core.common.exceptions import ValidationError as APIValidationError
from core.common.sql_capabilities import (
    is_read_only_sql,
    is_single_statement,
    remove_top_level_row_limit,
    statement_accepts_row_limit,
    top_level_row_limit_kind,
)
from routers.duckdb_query import assert_no_dangerous_write
from routers.query_sql_utils import ensure_query_has_limit


@pytest.mark.parametrize("value", [";", "LIMIT", "FETCH", "(", ")"])
def test_literal_tokens_preserve_nearest_limits_executes(value):
    """2026-09-07: literal tokens must not disable limits or truncate new syntax."""
    import duckdb
    from routers.query_sql_utils import apply_row_limit_choice
    sql = (f"SELECT '{value}' AS label, a.id FROM q a INNER JOIN q b APPROX NEAREST 2 "
           "BY SIMILARITY array_cosine_similarity(a.e,b.e)")
    assert is_single_statement(sql)
    assert is_read_only_sql(sql)
    assert top_level_row_limit_kind(sql) is None
    with duckdb.connect() as conn:
        conn.execute("CREATE TABLE q AS SELECT i id, [i::FLOAT, 1::FLOAT]::FLOAT[2] e FROM range(1,3) t(i)")
        assert len(conn.execute(ensure_query_has_limit(sql, 1)).fetchall()) == 1
        assert len(conn.execute(apply_row_limit_choice(sql + " LIMIT 1", False)).fetchall()) == 4


@pytest.mark.parametrize("name", [";", "LIMIT", "FETCH", "(", ")"])
def test_quoted_identifiers_are_not_control_tokens(name):
    """2026-09-07: quoted names must remain identifiers in shallow SQL scans."""
    sql = f'SELECT 1 AS "{name}"'
    assert is_read_only_sql(sql)
    assert top_level_row_limit_kind(sql) is None
    assert remove_top_level_row_limit(sql + " LIMIT 1") == sql


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT * FROM queries q INNER JOIN products p APPROX NEAREST 2 "
        "BY SIMILARITY array_cosine_similarity(q.embedding, p.embedding)",
        "WITH RECURSIVE t(x) USING KEY (x) AS (SELECT 1) SELECT * FROM t",
        "PIVOT sales ON region USING sum(amount)",
        "SHOW TABLES",
        "DESCRIBE SELECT 1",
        "PRAGMA table_info('items')",
        "EXPLAIN SELECT 1",
    ],
)
def test_read_only_sql_accepts_query_surfaces(sql):
    assert is_read_only_sql(sql)


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1; SELECT 2",
        "CONNECT 'db.duckdb'",
        "DISCONNECT",
        "CALL current_setting('threads')",
        "SET threads=1",
        "RESET threads",
        "INSTALL httpfs",
        "LOAD httpfs",
        "ATTACH 'other.db' AS other",
        "COPY (SELECT 1) TO 'out.csv'",
        "WITH changed AS (DELETE FROM items RETURNING *) SELECT * FROM changed",
        "EXPLAIN ANALYZE DELETE FROM items",
        "PRAGMA enable_profiling",
    ],
)
def test_read_only_sql_rejects_side_effects_and_multiple_statements(sql):
    assert not is_read_only_sql(sql)


def test_tokens_ignore_keywords_in_literals_and_comments():
    sql = "SELECT 'DELETE; LIMIT 1' AS note /* SET x */ -- CONNECT\n"
    assert is_single_statement(sql)
    assert is_read_only_sql(sql)
    assert top_level_row_limit_kind(sql) is None
    assert statement_accepts_row_limit("SELECT 'DELETE LIMIT 1' APPROX NEAREST USING vec <-> [1]")


def test_top_level_row_limit_distinguishes_nested_and_fetch():
    assert top_level_row_limit_kind("SELECT * FROM t LIMIT 5") == "limit"
    assert top_level_row_limit_kind("SELECT * FROM t FETCH FIRST 5 ROWS ONLY") == "fetch"
    assert top_level_row_limit_kind(
        "SELECT * FROM (SELECT * FROM t LIMIT 5) nested"
    ) is None


def test_new_select_clause_accepts_limit_and_can_remove_it_without_ast():
    sql = "SELECT * FROM t APPROX NEAREST USING vec <-> [1, 2] LIMIT 5; -- keep"
    assert statement_accepts_row_limit(sql)
    assert remove_top_level_row_limit(sql) == (
        "SELECT * FROM t APPROX NEAREST USING vec <-> [1, 2]; -- keep"
    )


def test_fetch_removal_preserves_outer_offset():
    sql = "SELECT * FROM t OFFSET 3 ROWS FETCH NEXT 5 ROWS ONLY"
    assert remove_top_level_row_limit(sql) == "SELECT * FROM t OFFSET 3 ROWS"


@pytest.mark.parametrize(
    "sql",
    [
        "CONNECT 'remote'",
        "DISCONNECT",
        "CALL quack_serve(token='secret')",
        "INSTALL httpfs",
        "LOAD httpfs",
        "SET threads=1",
    ],
)
def test_query_endpoint_guard_rejects_session_and_extension_side_effects(sql):
    with pytest.raises(APIValidationError, match="Only queries"):
        assert_no_dangerous_write(sql, None)


def test_save_as_table_does_not_authorize_user_sql_side_effects():
    with pytest.raises(APIValidationError, match="Only queries"):
        assert_no_dangerous_write("DELETE FROM ITEMS", "saved_result")


def test_direct_create_table_remains_supported_but_other_create_forms_do_not():
    assert_no_dangerous_write("CREATE TABLE result AS SELECT 'DELETE' AS note", None)
    assert_no_dangerous_write("CREATE TABLE main.result AS SELECT 1", None)
    with pytest.raises(APIValidationError, match="Only queries"):
        assert_no_dangerous_write("CREATE SECRET hidden (TYPE S3, KEY_ID 'x')", None)
    with pytest.raises(APIValidationError, match="Only queries"):
        assert_no_dangerous_write("CREATE TABLE remote.schema.result AS SELECT 1", None)
    with pytest.raises(APIValidationError, match="Only queries"):
        assert_no_dangerous_write("CREATE TEMP TABLE pooled_state AS SELECT 1", None)


@pytest.mark.parametrize(
    "sql",
    [
        "/* harmless-looking prefix */ CONNECT 'remote'",
        "SELECT 1; -- hide the second statement\nDISCONNECT",
        "WITH moved AS MATERIALIZED (DELETE FROM items RETURNING *) SELECT * FROM moved",
        "WITH copied AS MATERIALIZED (COPY items TO 'out.csv' RETURNING *) SELECT * FROM copied",
        "EXPLAIN /* split marker */ ANALYZE SELECT * FROM items",
        "PRAGMA memory_limit='1GB'",
        "CREATE VIEW leaked AS SELECT * FROM items",
        "CREATE TRIGGER audit AFTER UPDATE ON items DELETE FROM items",
        "CREATE EXTENSION REPOSITORY untrusted WITH PREFIX 'https://example.invalid'",
    ],
)
def test_adversarial_side_effect_obfuscation_fails_closed(sql):
    assert not is_read_only_sql(sql)
    with pytest.raises(APIValidationError):
        assert_no_dangerous_write(sql, None)


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 'CONNECT; DROP TABLE items' AS text",
        "SELECT $$INSTALL httpfs; LOAD httpfs$$ AS text",
        'SELECT "DELETE" FROM items',
        "SELECT 1 /* FETCH FIRST 1 ROW ONLY */",
    ],
)
def test_adversarial_keywords_inside_literals_identifiers_and_comments_are_safe(sql):
    assert is_read_only_sql(sql)


def test_adversarial_nested_limits_do_not_disable_outer_total_limit():
    sql = (
        "SELECT * FROM (SELECT * FROM products FETCH FIRST 2 ROWS ONLY) p "
        "INNER JOIN queries q APPROX NEAREST 3 "
        "BY SIMILARITY array_cosine_similarity(p.embedding, q.embedding)"
    )
    assert top_level_row_limit_kind(sql) is None
    assert ensure_query_has_limit(sql, 50).endswith("LIMIT 50")
