"""联邦表集合运算 SQL 生成测试"""

from core.services.set_operation_generator import (
    format_set_table_reference,
    generate_set_operation_sql,
)
from models.set_operation_models import (
    SetOperationConfig,
    SetOperationType,
    TableConfig,
)


def test_format_set_table_reference_federated():
    ref = format_set_table_reference(
        "mysql_sorder.orders", {"mysql_sorder"}
    )
    assert ref == '"mysql_sorder"."orders"'


def test_generate_set_operation_union_federated_sql():
    config = SetOperationConfig(
        operation_type=SetOperationType.UNION_ALL,
        use_by_name=True,
        tables=[
            TableConfig(table_name="mysql_sorder.t1", selected_columns=[]),
            TableConfig(table_name="mysql_sorder.t2", selected_columns=[]),
        ],
    )
    sql = generate_set_operation_sql(
        config, preview_limit=100, attach_aliases={"mysql_sorder"}
    )
    assert "UNION ALL BY NAME" in sql
    assert '"mysql_sorder"."t1"' in sql
    assert '"mysql_sorder"."t2"' in sql
    assert "LIMIT 100" in sql
