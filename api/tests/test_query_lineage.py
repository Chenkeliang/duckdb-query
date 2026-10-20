"""2026-10-10: provenance must follow bound columns, not result-name guesses."""
import duckdb
import pytest

from core.services.query_lineage import describe_column_lineage


@pytest.fixture
def connection():
    with duckdb.connect() as con:
        con.execute("CREATE TABLE orders(id INTEGER, amount DECIMAL(12,2))")
        con.execute("CREATE TABLE customers(id INTEGER, name VARCHAR)")
        con.execute("INSERT INTO orders VALUES (1,12.50)")
        con.execute("INSERT INTO customers VALUES (1,'Test')")
        yield con


@pytest.mark.parametrize("sql,kinds,origins", [
    ("SELECT o.id, c.id, c.name FROM orders o JOIN customers c USING(id)",
     ["direct", "direct", "direct"], [["orders.id"], ["customers.id"], ["customers.name"]]),
    ("WITH src AS (SELECT * FROM orders) SELECT id AS renamed, amount*2 AS doubled FROM src",
     ["direct", "derived"], [["orders.id"], ["orders.amount"]]),
    ("SELECT * EXCLUDE(amount) FROM orders", ["direct"], [["orders.id"]]),
    ("SELECT id FROM orders UNION ALL SELECT id FROM customers",
     ["derived"], [["orders.id", "customers.id"]]),
    ("SELECT 42 AS id", ["constant"], [[]]),
    ("SELECT SUM(amount) AS total FROM orders", ["derived"], [["orders.amount"]]),
])
def test_lineage_matches_executed_result(connection, sql, kinds, origins):
    result = connection.execute(sql)
    count = len(result.description)
    assert result.fetchall()
    lineage = describe_column_lineage(connection, sql, count)
    assert [entry["kind"] for entry in lineage] == kinds
    assert [sorted(f"{s['table']}.{s['column']}" for s in entry["sources"]) for entry in lineage] == [sorted(item) for item in origins]


def test_unsupported_source_is_explicit_and_does_not_execute_it(connection):
    connection.execute("CREATE SEQUENCE once_only")
    assert describe_column_lineage(connection, "SELECT nextval('once_only') AS id", 1)[0]["sources"] == []
    assert connection.execute("SELECT nextval('once_only')").fetchone()[0] == 1
    assert describe_column_lineage(connection, "SELECT * FROM missing_table", 2) == [
        {"kind": "unresolved", "sources": []}, {"kind": "unresolved", "sources": []},
    ]


@pytest.mark.parametrize('expression', ['random()', 'current_timestamp', 'current_date'])
def test_dynamic_expression_is_not_a_constant(connection, expression):
    result = describe_column_lineage(connection, f'SELECT {expression} AS value', 1)
    assert result == [{'kind': 'derived', 'sources': []}]


@pytest.mark.parametrize('sql,origins', [
    ('SELECT id, amount FROM orders UNION ALL BY NAME SELECT amount, id FROM other',
     [['orders.id', 'other.id'], ['orders.amount', 'other.amount']]),
    ('SELECT id, amount FROM orders UNION ALL BY NAME SELECT amount, extra FROM other',
     [['orders.id'], ['orders.amount', 'other.amount'], ['other.extra']]),
    ('SELECT * FROM orders UNION ALL BY NAME SELECT extra, id FROM other',
     [['orders.id', 'other.id'], ['orders.amount'], ['other.extra']]),
    ('SELECT extra FROM (SELECT id FROM orders UNION ALL BY NAME SELECT extra FROM other) src',
     [['other.extra']]),
    ('SELECT id FROM (SELECT id, amount FROM orders UNION ALL BY NAME SELECT amount, id FROM other) src',
     [['orders.id', 'other.id']]),
    ('SELECT id FROM orders UNION ALL BY NAME SELECT amount, id FROM other UNION ALL BY NAME SELECT id, name FROM customers',
     [['orders.id', 'other.id', 'customers.id'], ['other.amount'], ['customers.name']]),
])
def test_union_by_name_lineage_follows_names_and_null_padding(connection, sql, origins):
    """2026-10-14: BY NAME must not pair reordered columns by position."""
    connection.execute('CREATE TABLE other(id INTEGER, amount DECIMAL(12,2), extra VARCHAR)')
    connection.execute("INSERT INTO other VALUES (2,25.00,'Other')")
    result = connection.execute(sql)
    count = len(result.description)
    assert result.fetchall()
    sources = describe_column_lineage(connection, sql, count)
    assert [sorted(f"{s['table']}.{s['column']}" for s in item['sources']) for item in sources] == [sorted(item) for item in origins]
