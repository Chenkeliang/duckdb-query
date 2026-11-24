"""Doris staged inputs preserve local JOIN semantics and have bounded lifetimes."""

from decimal import Decimal
from unittest.mock import MagicMock

import duckdb
import pytest

from core.common.exceptions import ValidationError
from core.database import doris_join
from core.database.federated_execution import federated_execution_scope

CONFIGS = [("doris_demo", {"type": "doris", "database": "reporting"})]
SQL = """
SELECT d.id, d.amount, l.label
FROM (SELECT id, amount FROM doris_demo.orders WHERE id >= 10) d
LEFT JOIN main.labels l ON d.id = l.id
ORDER BY d.id
"""


@pytest.fixture
def remote(monkeypatch):
    monkeypatch.setattr(doris_join, "doris_columns", lambda *_:
        [{"name": "id", "type": "LARGEINT"},
         {"name": "amount", "type": "DECIMALV3(30,4)"},
         {"name": "unused", "type": "ARRAY<INT>"}])
    connection = MagicMock()
    cursor = connection.__enter__.return_value.cursor.return_value
    cursor.fetchmany.side_effect = [
        [(10, Decimal("2.0100")), (2**90 + 5, Decimal("9007199254740993.0001"))], [],
    ]
    monkeypatch.setattr("core.database.doris_source.connect_doris", lambda _config: connection)
    return cursor


def test_doris_projection_filter_and_exact_local_join(remote):
    with duckdb.connect() as connection:
        connection.execute("CREATE TABLE labels(id HUGEINT, label VARCHAR)")
        connection.execute("INSERT INTO labels VALUES (10, 'matched'), (NULL, 'no match')")
        with federated_execution_scope(connection, SQL, CONFIGS) as prepared:
            rows = connection.execute(prepared.sql).fetchall()
            assert rows == [
                (10, Decimal("2.0100"), "matched"),
                (2**90 + 5, Decimal("9007199254740993.0001"), None),
            ]
            assert prepared.display_sql == SQL
            assert prepared.pushdown["doris_reads"] == [
                {"relation": "doris_demo.orders", "rows": 2, "columns": ["id", "amount"], "filters": 1}
            ]
        assert connection.execute("SHOW TABLES").fetchall() == [("labels",)]
    assert remote.execute.call_args_list[0].args[0] == "SET session_context = %s"
    remote.execute.assert_called_with(
        "SELECT `id`, `amount` FROM `orders` WHERE `id` >= %s LIMIT 100001", (10,),
    )


def test_doris_input_over_budget_discards_staging_without_partial_results(remote, monkeypatch):
    monkeypatch.setattr(doris_join, "MAX_DORIS_JOIN_ROWS", 1)
    with duckdb.connect() as connection:
        with pytest.raises(ValidationError, match="exceeds the read budget"):
            with federated_execution_scope(connection, SQL, CONFIGS):
                pytest.fail("An incomplete Doris input must not reach execution")
        assert connection.execute("SHOW TABLES").fetchall() == []
    assert remote.execute.call_args.args[0].endswith("LIMIT 2")


def test_native_doris_main_database_is_not_mistaken_for_a_mixed_query():
    assert not doris_join.references_local_schema("SELECT * FROM main.orders", "doris_demo")
    assert doris_join.references_local_schema(SQL, "doris_demo")
