"""联邦 JOIN 查询 SQL 别名测试"""

from unittest.mock import Mock

from models.query_models import DataSource, Join, JoinCondition, JoinType, QueryRequest
from routers.join_query import build_multi_table_join_query


def test_build_multi_table_join_query_federated_short_table_aliases():
    mock_con = Mock()
    sources = [
        DataSource(
            id="mysql_sorder.iget_order_detail",
            type="duckdb",
            table_name="mysql_sorder.iget_order_detail",
            params={"table_name": "mysql_sorder.iget_order_detail"},
            columns=[{"name": "order_id", "type": "VARCHAR"}],
        ),
        DataSource(
            id="mysql_sorder.iget_order",
            type="duckdb",
            table_name="mysql_sorder.iget_order",
            params={"table_name": "mysql_sorder.iget_order"},
            columns=[{"name": "order_id", "type": "VARCHAR"}],
        ),
    ]
    join = Join(
        left_source_id="mysql_sorder.iget_order_detail",
        right_source_id="mysql_sorder.iget_order",
        join_type=JoinType.LEFT,
        conditions=[
            JoinCondition(left_column="order_id", right_column="order_id", operator="=")
        ],
    )
    request = QueryRequest(
        sources=sources,
        joins=[join],
        limit=10000,
        is_preview=False,
    )

    query = build_multi_table_join_query(
        request,
        mock_con,
        federated_attach=True,
        attach_aliases={"mysql_sorder"},
    )

    assert '"mysql_sorder"."iget_order_detail" AS "iget_order_detail"' in query
    assert '"mysql_sorder"."iget_order" AS "iget_order"' in query
    assert '"iget_order_detail"."order_id"' in query
    assert '"iget_order"."order_id"' in query
    assert '"mysql_sorder.iget_order"' not in query
