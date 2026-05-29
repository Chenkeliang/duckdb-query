"""联邦 JOIN 查询 SQL 别名测试"""

from unittest.mock import Mock

import pandas as pd

from models.query_models import DataSource, Join, JoinCondition, JoinType, QueryRequest
from routers.join_query import build_multi_table_join_query, load_federated_table_columns


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

    # 联邦源以投影子查询形式出现，别名为短表名（非全路径 mysql_sorder.iget_order_detail）
    assert 'FROM "mysql_sorder"."iget_order_detail") AS "iget_order_detail"' in query
    assert 'FROM "mysql_sorder"."iget_order") AS "iget_order"' in query
    assert '"iget_order_detail"."order_id"' in query
    assert '"iget_order"."order_id"' in query
    assert '"mysql_sorder.iget_order"' not in query


def test_build_multi_table_join_query_federated_pushdown_where_subquery():
    mock_con = Mock()
    sources = [
        DataSource(
            id="mysql_sorder.iget_order_detail",
            type="duckdb",
            table_name="mysql_sorder.iget_order_detail",
            params={
                "table_name": "mysql_sorder.iget_order_detail",
                "pushdown_where": '"update_time" >= \'2026-05-20 00:00:00\'',
            },
            columns=[{"name": "order_id", "type": "VARCHAR"}],
        ),
        DataSource(
            id="mysql_sorder.iget_order",
            type="duckdb",
            table_name="mysql_sorder.iget_order",
            params={
                "table_name": "mysql_sorder.iget_order",
                "pushdown_where": '"update_time" >= \'2026-05-20 00:00:00\'',
            },
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

    assert (
        'FROM "mysql_sorder"."iget_order_detail" WHERE "update_time" >= \'2026-05-20 00:00:00\''
        in query
    )
    assert (
        'FROM "mysql_sorder"."iget_order" WHERE "update_time" >= \'2026-05-20 00:00:00\''
        in query
    )
    assert '"order_id"' in query
    assert "SELECT * FROM" not in query.split("FROM", 1)[0]


def test_build_multi_table_join_query_federated_where_conditions():
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
        where_conditions='"iget_order_detail"."amount" > 100',
        limit=10000,
        is_preview=False,
    )

    query = build_multi_table_join_query(
        request,
        mock_con,
        federated_attach=True,
        attach_aliases={"mysql_sorder"},
    )

    assert ' WHERE "iget_order_detail"."amount" > 100' in query


def test_build_multi_table_join_query_federated_column_prune_without_pushdown():
    mock_con = Mock()
    sources = [
        DataSource(
            id="mysql_sorder.t1",
            type="duckdb",
            table_name="mysql_sorder.t1",
            params={"table_name": "mysql_sorder.t1"},
            columns=[{"name": "id", "type": "INTEGER"}, {"name": "name", "type": "VARCHAR"}],
        ),
        DataSource(
            id="mysql_sorder.t2",
            type="duckdb",
            table_name="mysql_sorder.t2",
            params={"table_name": "mysql_sorder.t2"},
            columns=[{"name": "id", "type": "INTEGER"}],
        ),
    ]
    join = Join(
        left_source_id="mysql_sorder.t1",
        right_source_id="mysql_sorder.t2",
        join_type=JoinType.INNER,
        conditions=[JoinCondition(left_column="id", right_column="id", operator="=")],
    )
    request = QueryRequest(sources=sources, joins=[join], is_preview=False)

    query = build_multi_table_join_query(
        request,
        mock_con,
        federated_attach=True,
        attach_aliases={"mysql_sorder"},
    )

    assert '(SELECT "id", "name" FROM "mysql_sorder"."t1")' in query
    assert '(SELECT "id" FROM "mysql_sorder"."t2")' in query


def test_load_federated_table_columns_from_describe():
    mock_con = Mock()
    mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
        {"column_name": ["order_id", "amount"]}
    )
    cols = load_federated_table_columns(
        mock_con, "mysql_sorder.iget_order_detail", {"mysql_sorder"}
    )
    assert cols == [{"name": "order_id"}, {"name": "amount"}]
    mock_con.execute.assert_called_once()
    assert "DESCRIBE" in mock_con.execute.call_args[0][0]
