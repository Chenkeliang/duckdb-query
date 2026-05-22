"""federated_attach 工具测试"""

from core.database.federated_attach import format_qualified_table_reference


def test_format_qualified_table_reference_simple():
    assert format_qualified_table_reference("sales") == '"sales"'


def test_format_qualified_table_reference_dotted():
    assert format_qualified_table_reference("mysql_db.orders") == '"mysql_db"."orders"'


def test_format_qualified_table_reference_three_part():
    ref = format_qualified_table_reference("pg_db.public.users")
    assert ref == '"pg_db"."public"."users"'
