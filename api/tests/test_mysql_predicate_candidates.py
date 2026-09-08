"""Source mapping and eligibility regressions for 2026-09-08 MySQL fixes."""
import duckdb
import pytest

from core.database.mysql_predicate_candidates import (
    MySQLColumn,
    build_candidate_select,
    find_mysql_sources,
    patch_sources,
)

CONFIGS = [("m", {"type": "mysql", "database": "business"})]
COLUMNS = [
    MySQLColumn("id", "BIGINT", "bigint", None),
    MySQLColumn("code", "VARCHAR", "varchar", "utf8"),
    MySQLColumn("unsupported", "VARCHAR", "char", "utf8"),
]


@pytest.mark.parametrize("predicate,eligible", [
    ("code='A'", True), ("'A'=code", True),
    ("code IN ('A','B',NULL)", True), ("code IN (NULL)", True),
    ("(code='A') AND id>0", True),
    ("code != 'A'", False), ("code NOT IN ('A')", False),
    ("NOT(code='A')", False), ("code>'A'", False),
    ("code='A' OR id=2", False), ("code IN ('A',1)", False),
    ("CAST(code AS VARCHAR)='A'", False),
])
def test_positive_predicates_only(predicate, eligible):
    """2026-09-08: negative/OR necessities cannot use a broad CI candidate."""
    sources, _ = find_mysql_sources("SELECT id FROM m.orders WHERE " + predicate, CONFIGS, 100)
    sources[0].columns = COLUMNS
    assert (build_candidate_select(sources[0]) is not None) is eligible


def test_projection_prunes_unrequested_unsupported_columns():
    """2026-09-08: an unused CHAR column must not defeat a safe key lookup."""
    sources, _ = find_mysql_sources("SELECT id FROM m.orders WHERE code='A'", CONFIGS, 100)
    sources[0].columns = COLUMNS
    sql = build_candidate_select(sources[0])
    assert "unsupported" not in sql
    sources, _ = find_mysql_sources("SELECT * FROM m.orders WHERE code='A'", CONFIGS, 100)
    sources[0].columns = COLUMNS
    assert build_candidate_select(sources[0]) is None


def test_unrepresentable_positive_key_is_empty_without_mysql_conversion():
    """2026-09-08: utf8 cannot contain an exact four-byte Unicode match."""
    sources, _ = find_mysql_sources("SELECT id FROM m.orders WHERE code IN ('😀',NULL)", CONFIGS, 100)
    sources[0].columns = COLUMNS
    assert "WHERE FALSE" in build_candidate_select(sources[0])


def test_source_patch_preserves_literals_and_executes_unicode_sql():
    """2026-09-08: replace identifiers without normalizing user expressions."""
    sql = "SELECT '中文😀 m.orders' AS note, m.orders.code FROM m.orders WHERE code IN ('A') -- keep\n"
    sources, _ = find_mysql_sources(sql, CONFIGS, 100)
    sources[0].temporary_name = "candidate"
    rewritten = patch_sources(sql, sources)
    assert "'中文😀 m.orders'" in rewritten
    assert "-- keep" in rewritten
    with duckdb.connect(":memory:") as connection:
        connection.execute("CREATE TABLE candidate(code VARCHAR)")
        connection.execute("INSERT INTO candidate VALUES('A'),('a')")
        assert connection.execute(rewritten).fetchall() == [("中文😀 m.orders", "A")]


def test_cte_shadowing_resolves_only_qualified_physical_table():
    """2026-09-08: a CTE called orders is not the remote physical table."""
    sql = "WITH orders AS (SELECT 'A' AS code) SELECT r.code FROM orders l JOIN m.orders r ON r.code=l.code WHERE r.code='A'"
    sources, _ = find_mysql_sources(sql, CONFIGS, 100)
    assert len(sources) == 1
    assert sources[0].alias == "r"
    sources[0].temporary_name = "candidate"
    rewritten = patch_sources(sql, sources)
    with duckdb.connect(":memory:") as connection:
        connection.execute("CREATE TABLE candidate(code VARCHAR)")
        connection.execute("INSERT INTO candidate VALUES('A'),('a')")
        assert connection.execute(rewritten).fetchall() == [("A",)]


def test_correlated_query_declines_source_rewrite():
    """2026-09-08: correlated names must not be mistaken for local predicates."""
    sources, _ = find_mysql_sources(
        "SELECT * FROM m.orders o WHERE EXISTS(SELECT 1 FROM m.orders r WHERE r.code=o.code AND r.code='A')",
        CONFIGS, 100,
    )
    assert sources == []


@pytest.mark.parametrize("sql", [
    "SELECT l.id FROM local_t l JOIN m.orders r USING(id) WHERE r.code='A'",
    "SELECT l.id FROM local_t l NATURAL JOIN m.orders r WHERE r.code='A'",
    "SELECT r FROM m.orders r WHERE r.code='A'",
    "SELECT to_json(r) FROM m.orders r WHERE r.code='A'",
])
def test_implicit_columns_preserve_the_complete_source_schema(sql):
    """2026-09-08: USING/NATURAL/row structs must not lose implicit columns."""
    sources, _ = find_mysql_sources(sql, CONFIGS, 100)
    sources[0].columns = COLUMNS[:2]
    candidate = build_candidate_select(sources[0])
    assert '"id"' in candidate and '"code"' in candidate
    sources[0].temporary_name = "candidate"
    with duckdb.connect(":memory:") as connection:
        connection.execute("CREATE TABLE candidate(id BIGINT,code VARCHAR)")
        connection.execute("INSERT INTO candidate VALUES(1,'A'),(2,'B')")
        connection.execute("CREATE TABLE local_t AS SELECT * FROM candidate")
        expected = connection.execute(sql.replace("m.orders", "candidate")).fetchall()
        assert connection.execute(patch_sources(sql, sources)).fetchall() == expected


def test_positional_alias_list_declines_candidate_filtering():
    """2026-09-08: alias(code,id) must not filter the physical code column."""
    sources, _ = find_mysql_sources("SELECT * FROM m.orders r(code,id) WHERE r.code='A'", CONFIGS, 100)
    assert sources == []


def test_foreign_column_qualifier_is_not_rebound_to_a_local_alias():
    """2026-09-08: rewriting cannot make an invalid foreign qualifier valid."""
    sources, _ = find_mysql_sources(
        "SELECT other.orders.code FROM m.orders WHERE orders.code='A'",
        CONFIGS, 100,
    )
    assert sources == []


def test_virtual_rowid_cannot_be_replaced_by_candidate_row_numbers():
    """2026-09-08: source row identity cannot be inferred from materialization order."""
    sources, _ = find_mysql_sources("SELECT rowid FROM m.orders WHERE code='A'", CONFIGS, 100)
    sources[0].columns = COLUMNS
    assert build_candidate_select(sources[0]) is None


@pytest.mark.parametrize("null_sql", [
    "NULL::VARCHAR", "CAST(NULL AS VARCHAR)", "TRY_CAST(NULL AS VARCHAR)",
    "CAST((NULL::INTEGER) AS VARCHAR)",
])
def test_typed_null_keeps_positive_candidate_lookup(null_sql):
    """2026-09-08: desktop IN with typed NULL fell back to a full remote scan."""
    sql = f"SELECT code FROM m.orders WHERE code IN ('A', {null_sql})"
    sources, _ = find_mysql_sources(sql, CONFIGS, 100)
    sources[0].columns = COLUMNS
    candidate = build_candidate_select(sources[0])
    assert candidate is not None
    assert "X''41''" in candidate
    sources[0].temporary_name = "candidate"
    with duckdb.connect(":memory:") as connection:
        connection.execute("CREATE TABLE candidate(code VARCHAR)")
        connection.execute("INSERT INTO candidate VALUES('A'),('a'),('A '),(NULL)")
        assert connection.execute(patch_sources(sql, sources)).fetchall() == [("A",)]


@pytest.mark.parametrize("predicate", [
    "code IN (NULL::VARCHAR)", "code=CAST(NULL AS VARCHAR)",
    "TRY_CAST(NULL AS VARCHAR)=code",
])
def test_typed_null_only_candidate_is_empty(predicate):
    """2026-09-08: a typed NULL cannot match a positive equality or IN."""
    sources, _ = find_mysql_sources("SELECT code FROM m.orders WHERE " + predicate, CONFIGS, 100)
    sources[0].columns = COLUMNS
    candidate = build_candidate_select(sources[0])
    assert candidate is not None and "WHERE FALSE" in candidate


@pytest.mark.parametrize("predicate", [
    "code IN ('A', CAST('B' AS VARCHAR))", "code IN ('A', TRY_CAST('bad' AS INTEGER))",
    "code NOT IN ('A', NULL::VARCHAR)", "code='A' OR code IN (NULL::VARCHAR)",
])
def test_typed_null_support_does_not_fold_other_expressions(predicate):
    """2026-09-08: only a NULL literal under casts is eligible, not arbitrary folding."""
    sources, _ = find_mysql_sources("SELECT code FROM m.orders WHERE " + predicate, CONFIGS, 100)
    sources[0].columns = COLUMNS
    assert build_candidate_select(sources[0]) is None


@pytest.mark.parametrize("null_type", ["INTEGER", "DOUBLE", "DECIMAL(10,2)"])
def test_non_text_null_cannot_narrow_a_numeric_in_comparison(null_type):
    """2026-09-08: dropping numeric typed NULL could incorrectly remove code='1'."""
    sql = f"SELECT code FROM m.orders WHERE code IN ('01',NULL::{null_type})"
    sources, _ = find_mysql_sources(sql, CONFIGS, 100)
    sources[0].columns = COLUMNS
    assert build_candidate_select(sources[0]) is None
    with duckdb.connect(":memory:") as connection:
        connection.execute("CREATE TABLE reference(code VARCHAR)")
        connection.execute("INSERT INTO reference VALUES ('1')")
        assert connection.execute(sql.replace("m.orders", "reference")).fetchall() == [("1",)]
