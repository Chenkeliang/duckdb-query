"""federated_attach 工具测试"""

from unittest.mock import MagicMock

from core.database.federated_attach import (
    _is_database_already_attached_error,
    attach_databases_on_connection,
    format_qualified_table_reference,
)


def test_format_qualified_table_reference_simple():
    assert format_qualified_table_reference("sales") == '"sales"'


def test_format_qualified_table_reference_dotted():
    assert format_qualified_table_reference("mysql_db.orders") == '"mysql_db"."orders"'


def test_format_qualified_table_reference_three_part():
    ref = format_qualified_table_reference("pg_db.public.users")
    assert ref == '"pg_db"."public"."users"'


def test_is_database_already_attached_error():
    err = Exception(
        'Binder Error: Failed to attach database: database with name "mysql_sorder" already exists'
    )
    assert _is_database_already_attached_error(err) is True
    assert _is_database_already_attached_error(Exception("connection refused")) is False


def test_attach_databases_on_connection_reuses_existing_alias():
    conn = MagicMock()
    conn.execute.side_effect = [
        Exception('database with name "mysql_sorder" already exists'),
    ]
    attached = attach_databases_on_connection(
        conn,
        [("mysql_sorder", {"type": "mysql", "host": "h", "database": "d"})],
    )
    assert attached == ["mysql_sorder"]
