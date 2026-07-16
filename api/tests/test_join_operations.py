"""
多表关联（JOIN）功能单元测试

测试范围：
- JOIN数据模型验证
- JOIN查询生成器
- JOIN API端点
- 集成测试
- 错误处理
"""

import sys
import os
import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from main import app
from models.query_models import (
    DataSource,
    DataSourceType,
    JoinType,
    JoinCondition,
    Join,
    QueryRequest,
)
from core.database.duckdb_engine import generate_improved_column_aliases
from routers.join_query import build_join_chain, build_multi_table_join_query
from routers.query_sql_utils import get_join_type_sql
from tests.pool_mock import bind_mock_duckdb_pool

client = TestClient(app, raise_server_exceptions=False)


class TestJoinModels:
    """测试JOIN数据模型"""

    def test_join_type_enum(self):
        """测试JOIN类型枚举"""
        assert JoinType.INNER == "inner"
        assert JoinType.LEFT == "left"
        assert JoinType.RIGHT == "right"
        assert JoinType.OUTER == "outer"
        assert JoinType.FULL_OUTER == "full_outer"
        assert JoinType.CROSS == "cross"

    def test_join_condition_model(self):
        """测试JOIN条件模型"""
        condition = JoinCondition(
            left_column="user_id", right_column="id", operator="="
        )
        assert condition.left_column == "user_id"
        assert condition.right_column == "id"
        assert condition.operator == "="

    def test_join_model(self):
        """测试JOIN模型"""
        join = Join(
            left_source_id="users",
            right_source_id="orders",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="id", right_column="user_id", operator="=")
            ],
            alias_left="u",
            alias_right="o",
        )
        assert join.left_source_id == "users"
        assert join.right_source_id == "orders"
        assert join.join_type == JoinType.INNER
        assert len(join.conditions) == 1
        assert join.conditions[0].left_column == "id"
        assert join.conditions[0].right_column == "user_id"
        assert join.alias_left == "u"
        assert join.alias_right == "o"

    def test_query_request_model(self):
        """测试查询请求模型"""
        source1 = DataSource(
            id="users", type=DataSourceType.DUCKDB, params={"table_name": "users"}
        )
        source2 = DataSource(
            id="orders", type=DataSourceType.DUCKDB, params={"table_name": "orders"}
        )

        join = Join(
            left_source_id="users",
            right_source_id="orders",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="id", right_column="user_id", operator="=")
            ],
        )

        request = QueryRequest(
            sources=[source1, source2],
            joins=[join],
            select_columns=["id", "name", "order_id"],
            where_conditions="age > 18",
            order_by="name",
            limit=100,
        )

        assert len(request.sources) == 2
        assert len(request.joins) == 1
        assert request.select_columns == ["id", "name", "order_id"]
        assert request.where_conditions == "age > 18"
        assert request.order_by == "name"
        assert request.limit == 100


class TestJoinQueryGenerator:
    """测试JOIN查询生成器"""

    def setup_method(self):
        """每个测试方法前的设置"""
        self.source1 = DataSource(
            id="users",
            type=DataSourceType.DUCKDB,
            params={"table_name": "users"},
            columns=[
                {"name": "id", "type": "INTEGER"},
                {"name": "name", "type": "VARCHAR"},
                {"name": "email", "type": "VARCHAR"},
                {"name": "age", "type": "INTEGER"},
            ],
        )
        self.source2 = DataSource(
            id="orders",
            type=DataSourceType.DUCKDB,
            params={"table_name": "orders"},
            columns=[
                {"name": "id", "type": "INTEGER"},
                {"name": "user_id", "type": "INTEGER"},
                {"name": "product", "type": "VARCHAR"},
                {"name": "amount", "type": "DOUBLE"},
            ],
        )
        self.source3 = DataSource(
            id="products",
            type=DataSourceType.DUCKDB,
            params={"table_name": "products"},
            columns=[
                {"name": "id", "type": "INTEGER"},
                {"name": "name", "type": "VARCHAR"},
                {"name": "price", "type": "DOUBLE"},
                {"name": "category", "type": "VARCHAR"},
            ],
        )

    def test_get_join_type_sql(self):
        """测试JOIN类型SQL转换"""
        assert get_join_type_sql(JoinType.INNER) == "INNER JOIN"
        assert get_join_type_sql(JoinType.LEFT) == "LEFT JOIN"
        assert get_join_type_sql(JoinType.RIGHT) == "RIGHT JOIN"
        assert get_join_type_sql(JoinType.FULL_OUTER) == "FULL OUTER JOIN"
        assert get_join_type_sql(JoinType.CROSS) == "CROSS JOIN"

    def test_generate_improved_column_aliases(self):
        """测试改进的列别名生成"""

        # 创建模拟的数据源对象，绕过Pydantic验证
        class MockDataSource:
            def __init__(self, id, columns):
                self.id = id
                self.columns = columns

        source1 = MockDataSource("users", ["id", "name", "email"])
        source2 = MockDataSource("orders", ["id", "user_id", "product"])

        sources = [source1, source2]
        aliases = generate_improved_column_aliases(sources)

        assert "users" in aliases
        assert "orders" in aliases
        assert "id" in aliases["users"]
        assert "id" in aliases["orders"]
        # 应该为重复的列名生成不同的别名
        assert aliases["users"]["id"] != aliases["orders"]["id"]

    def test_generate_improved_column_aliases_qualified_source_ids(self):
        """外部表 source.id 是限定名（连接前缀.表名）时，冲突别名应取表名段而非连接前缀，
        避免同连接下多表被截断成相同前缀（如 sqlite_ala）导致 _1 后缀。"""

        class MockDataSource:
            def __init__(self, id, columns):
                self.id = id
                self.columns = columns

        source1 = MockDataSource(
            "sqlite_alarm_sqlite.alerts", ["record_id", "message"]
        )
        source2 = MockDataSource(
            "sqlite_alarm_sqlite.rules", ["record_id", "rule_name"]
        )

        aliases = generate_improved_column_aliases([source1, source2])

        assert aliases["sqlite_alarm_sqlite.alerts"]["record_id"] == "record_id_alerts"
        assert aliases["sqlite_alarm_sqlite.rules"]["record_id"] == "record_id_rules"
        for source_aliases in aliases.values():
            for alias in source_aliases.values():
                assert "sqlite_ala" not in alias
                assert not alias.endswith("_1")

    def test_generate_improved_column_aliases_chinese_table_names(self):
        """中文表名的冲突别名应保留中文（列名_表名），而不是被吞成下划线后再撞名加 _1。

        回归背景(2026-07): 旧 simplify_table_name 用 [^a-zA-Z0-9_] 清洗，
        「商品表」「订单表」全变下划线 → 结果列头出现 商品id______ / 商品id_______1。
        """

        class MockDataSource:
            def __init__(self, id, columns):
                self.id = id
                self.columns = columns

        source1 = MockDataSource("duckdb_demo.商品表", ["商品id", "商品名称"])
        source2 = MockDataSource("duckdb_demo.订单表", ["商品id", "城市"])

        aliases = generate_improved_column_aliases([source1, source2])

        assert aliases["duckdb_demo.商品表"]["商品id"] == "商品id_商品表"
        assert aliases["duckdb_demo.订单表"]["商品id"] == "商品id_订单表"
        # 非冲突列保持原名
        assert aliases["duckdb_demo.商品表"]["商品名称"] == "商品名称"

    def test_build_join_chain_simple(self):
        """测试构建简单JOIN链"""
        join = Join(
            left_source_id="users",
            right_source_id="orders",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="id", right_column="user_id", operator="=")
            ],
        )

        table_columns = {
            "users": ["id", "name", "email"],
            "orders": ["id", "user_id", "product"],
        }

        join_chain = build_join_chain(
            [self.source1, self.source2], [join], table_columns
        )

        assert '"users"' in join_chain
        assert 'INNER JOIN "orders"' in join_chain
        assert 'ON "users"."id" = "orders"."user_id"' in join_chain

    def test_build_join_chain_multiple(self):
        """测试构建多表JOIN链"""
        join1 = Join(
            left_source_id="users",
            right_source_id="orders",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="id", right_column="user_id", operator="=")
            ],
        )

        join2 = Join(
            left_source_id="orders",
            right_source_id="products",
            join_type=JoinType.LEFT,
            conditions=[
                JoinCondition(left_column="product", right_column="name", operator="=")
            ],
        )

        table_columns = {
            "users": ["id", "name", "email"],
            "orders": ["id", "user_id", "product"],
            "products": ["id", "name", "price"],
        }

        join_chain = build_join_chain(
            [self.source1, self.source2, self.source3], [join1, join2], table_columns
        )

        assert '"users"' in join_chain
        assert 'INNER JOIN "orders"' in join_chain
        assert 'LEFT JOIN "products"' in join_chain
        assert 'ON "users"."id" = "orders"."user_id"' in join_chain
        assert 'ON "orders"."product" = "products"."name"' in join_chain

    def test_build_join_chain_cross_join(self):
        """测试构建CROSS JOIN链"""
        join = Join(
            left_source_id="users", right_source_id="orders", join_type=JoinType.CROSS,
            conditions=[]  # CROSS JOIN 不需要条件，但模型需要提供空列表
        )

        table_columns = {"users": ["id", "name"], "orders": ["id", "product"]}

        join_chain = build_join_chain(
            [self.source1, self.source2], [join], table_columns
        )

        assert '"users"' in join_chain
        assert 'CROSS JOIN "orders"' in join_chain
        # CROSS JOIN不应该有ON条件
        assert "ON" not in join_chain

    @patch("routers.join_query.with_duckdb_connection")
    def test_build_multi_table_join_query_simple(self, mock_get_db):
        """测试构建简单多表JOIN查询"""
        # 模拟数据库连接
        mock_con = Mock()
        bind_mock_duckdb_pool(mock_get_db, mock_con)

        # 模拟表存在检查
        mock_con.execute.return_value.fetchall.return_value = [("users",), ("orders",)]

        join = Join(
            left_source_id="users",
            right_source_id="orders",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="id", right_column="user_id", operator="=")
            ],
        )

        request = QueryRequest(
            sources=[self.source1, self.source2],
            joins=[join],
            select_columns=["id", "name", "order_id"],
        )

        query = build_multi_table_join_query(request, mock_con)

        assert "SELECT" in query
        assert '"users"' in query
        assert 'INNER JOIN "orders"' in query
        assert 'ON "users"."id" = "orders"."user_id"' in query

    @patch("routers.join_query.with_duckdb_connection")
    def test_build_multi_table_join_query_with_where(self, mock_get_db):
        """测试构建带WHERE条件的多表JOIN查询"""
        # 模拟数据库连接
        mock_con = Mock()
        bind_mock_duckdb_pool(mock_get_db, mock_con)

        # 模拟表存在检查
        mock_con.execute.return_value.fetchall.return_value = [("users",), ("orders",)]

        join = Join(
            left_source_id="users",
            right_source_id="orders",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="id", right_column="user_id", operator="=")
            ],
        )

        request = QueryRequest(
            sources=[self.source1, self.source2],
            joins=[join],
            where_conditions="age > 18",
            order_by="name",
            limit=100,
        )

        query = build_multi_table_join_query(request, mock_con)

        # 注意：当前实现只处理 LIMIT，WHERE 和 ORDER BY 由 SQL 模式处理
        # 验证基本 JOIN 结构
        assert "SELECT" in query
        assert "INNER JOIN" in query
        assert "LIMIT 100" in query

    @patch("routers.join_query.with_duckdb_connection")
    def test_build_multi_table_join_query_no_joins(self, mock_get_db):
        """测试构建无JOIN条件的多表查询（CROSS JOIN）"""
        # 模拟数据库连接
        mock_con = Mock()
        bind_mock_duckdb_pool(mock_get_db, mock_con)

        # 模拟表存在检查
        mock_con.execute.return_value.fetchall.return_value = [("users",), ("orders",)]

        request = QueryRequest(
            sources=[self.source1, self.source2], joins=[]  # 无JOIN条件
        )

        query = build_multi_table_join_query(request, mock_con)

        assert "SELECT" in query
        assert '"users"' in query
        assert 'CROSS JOIN "orders"' in query

    @patch("routers.join_query.with_duckdb_connection")
    def test_build_multi_table_join_query_single_table(self, mock_get_db):
        """测试构建单表查询"""
        # 模拟数据库连接
        mock_con = Mock()
        bind_mock_duckdb_pool(mock_get_db, mock_con)

        # 模拟表存在检查
        mock_con.execute.return_value.fetchall.return_value = [("users",)]

        request = QueryRequest(sources=[self.source1], joins=[])

        query = build_multi_table_join_query(request, mock_con)

        assert "SELECT" in query
        assert '"users"' in query
        assert "JOIN" not in query

    @patch("routers.join_query.with_duckdb_connection")
    def test_build_multi_table_join_query_escapes_malicious_column_name(self, mock_get_db):
        """回归：columns[].name 直接来自请求体（query_models.DataSource.columns 无
        schema 校验），曾经裸拼进 SELECT 列表，嵌入的双引号能跳出标识符注入任意 SQL。
        当前打包前端从不显式传 columns（总是走 PRAGMA table_info 自动推导），但直接
        调 API 的调用方可以——转义必须在编译层兜住，不能依赖调用方守规矩。"""
        mock_con = Mock()
        bind_mock_duckdb_pool(mock_get_db, mock_con)
        mock_con.execute.return_value.fetchall.return_value = [("users",), ("orders",)]

        malicious_source = DataSource(
            id="users",
            type=DataSourceType.DUCKDB,
            params={"table_name": "users"},
            columns=[
                {"name": 'id" AS "x", (SELECT params FROM system_database_connections) AS "leak'},
            ],
        )

        join = Join(
            left_source_id="users",
            right_source_id="orders",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="id", right_column="user_id", operator="=")
            ],
        )
        request = QueryRequest(
            sources=[malicious_source, self.source2],
            joins=[join],
        )

        query = build_multi_table_join_query(request, mock_con)

        # 恶意片段必须整体落在一个转义后的引号标识符里：内嵌的每个 " 都被双写成
        # ""，所以从"打开的引号"到"关闭的引号"之间——包括 (SELECT ...) 子句——
        # 全部是这一个标识符的字面内容，不是独立可执行的 SQL 子句。
        assert (
            '"users"."id"" AS ""x"", (SELECT params FROM system_database_connections)'
            ' AS ""leak" AS "id"" AS ""x"", (SELECT params FROM system_database_connections)'
            ' AS ""leak"'
        ) in query

    @patch("routers.join_query.with_duckdb_connection")
    def test_build_multi_table_join_query_escapes_malicious_alias(self, mock_get_db):
        """同上，但攻击面是列别名冲突消解产生的 alias（同样来自请求体，同样
        未转义就拼进 AS "..."）。"""
        mock_con = Mock()
        bind_mock_duckdb_pool(mock_get_db, mock_con)
        mock_con.execute.return_value.fetchall.return_value = [("users",), ("orders",)]

        # 两张表都选了同名列 "id"，生成的别名会带表前缀（users_id / orders_id），
        # 所以直接给一个在别名生成结果里不存在的列名，落到 .get(col_name, col_name)
        # 的原样透传兜底分支，验证 alias 本身也被转义。
        malicious_source = DataSource(
            id="users",
            type=DataSourceType.DUCKDB,
            params={"table_name": "users"},
            columns=[{"name": 'name" AS "x", (SELECT 1) AS "y'}],
        )

        request = QueryRequest(sources=[malicious_source, self.source2], joins=[])

        query = build_multi_table_join_query(request, mock_con)

        assert (
            '"users"."name"" AS ""x"", (SELECT 1) AS ""y" AS "name"" AS ""x"",'
            ' (SELECT 1) AS ""y"'
        ) in query

    @patch("routers.join_query.with_duckdb_connection")
    def test_join_result_marker_escapes_malicious_condition_column(self, mock_get_db):
        """回归：JOIN 结果标记 CASE 表达式里的键列 join.conditions[].right_column
        （来自请求体、无 schema 校验）曾经裸拼进 CASE WHEN "t"."{col}" IS NULL，
        与 columns[].name 是同一注入面。LEFT/RIGHT/FULL JOIN 都要覆盖。"""
        malicious = 'id" IS NULL THEN 1 ELSE (SELECT password FROM system_database_connections LIMIT 1) END AS "leak'
        for jt in (JoinType.LEFT, JoinType.RIGHT, JoinType.FULL_OUTER):
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)
            mock_con.execute.return_value.fetchall.return_value = [("users",), ("orders",)]
            join = Join(
                left_source_id="users",
                right_source_id="orders",
                join_type=jt,
                conditions=[
                    JoinCondition(left_column=malicious, right_column=malicious, operator="=")
                ],
            )
            request = QueryRequest(sources=[self.source1, self.source2], joins=[join])
            query = build_multi_table_join_query(request, mock_con)

            # 未转义的注入形态（键列的 " 单写、提前闭合标识符）绝不能出现——那才是
            # 可执行的注入；`id" IS NULL` 里的单个 " 若没被双写就说明漏了转义
            assert 'id" IS NULL' not in query, f"unescaped breakout for join_type={jt}"
            # 转义后的正确形态：键列里的每个 " 都被双写成 ""，整段恶意串落在一个
            # 引号标识符内部（含 (SELECT ...) 只是字面文本，不可执行）
            assert (
                'id"" IS NULL THEN 1 ELSE '
                '(SELECT password FROM system_database_connections LIMIT 1) END AS ""leak"'
            ) in query, f"escaping missing for join_type={jt}"


def bind_join_query_flow(mock_con, tables, table_columns, result_columns, result_rows,
                         query_error=None):
    """按 SQL 语义分发的连接 mock:SHOW TABLES / PRAGMA table_info / DESCRIBE /
    主查询(description+fetchall)。query_error 给定时主查询抛出该异常。"""
    import re as _re

    def _execute(sql, *args, **kwargs):
        res = Mock()
        text = str(sql).strip()
        upper = text.upper()
        if upper.startswith("SHOW TABLES"):
            res.fetchall.return_value = [(t,) for t in tables]
            return res
        if "PRAGMA TABLE_INFO" in upper:
            m = _re.search(r"table_info\('([^']+)'\)", text, _re.I)
            cols = table_columns.get(m.group(1), []) if m else []
            # PRAGMA table_info 行:(cid, name, type, notnull, dflt, pk)
            res.fetchall.return_value = [
                (i, c, "VARCHAR", 0, None, 0) for i, c in enumerate(cols)
            ]
            return res
        if upper.startswith("DESCRIBE"):
            res.fetchall.return_value = [(c, "VARCHAR") for c in result_columns]
            return res
        if query_error is not None:
            raise query_error
        res.description = [(c, "VARCHAR") for c in result_columns]
        res.fetchall.return_value = [tuple(r) for r in result_rows]
        return res

    mock_con.execute.side_effect = _execute


class TestJoinAPI:
    """测试JOIN API端点"""

    def test_perform_query_simple_join(self):
        """测试执行简单JOIN查询"""
        request_data = {
            "sources": [
                {"id": "users", "type": "duckdb", "params": {"table_name": "users"}},
                {"id": "orders", "type": "duckdb", "params": {"table_name": "orders"}},
            ],
            "joins": [
                {
                    "left_source_id": "users",
                    "right_source_id": "orders",
                    "join_type": "inner",
                    "conditions": [
                        {
                            "left_column": "id",
                            "right_column": "user_id",
                            "operator": "=",
                        }
                    ],
                }
            ],
            "select_columns": ["id", "name", "order_id"],
            "limit": 10,
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)

            bind_join_query_flow(
                mock_con,
                tables=["users", "orders"],
                table_columns={
                    "users": ["id", "name", "email"],
                    "orders": ["id", "user_id", "order_id"],
                },
                result_columns=["id", "name", "order_id"],
                result_rows=[(1, "Alice", 101), (2, "Bob", 102)],
            )

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            payload = response.json()["data"]
            assert payload["row_count"] == 2
            assert payload["data"][0]["name"] == "Alice"

    def test_perform_query_multiple_joins(self):
        """测试执行多表JOIN查询"""
        request_data = {
            "sources": [
                {"id": "users", "type": "duckdb", "params": {"table_name": "users"}},
                {"id": "orders", "type": "duckdb", "params": {"table_name": "orders"}},
                {
                    "id": "products",
                    "type": "duckdb",
                    "params": {"table_name": "products"},
                },
            ],
            "joins": [
                {
                    "left_source_id": "users",
                    "right_source_id": "orders",
                    "join_type": "inner",
                    "conditions": [
                        {
                            "left_column": "id",
                            "right_column": "user_id",
                            "operator": "=",
                        }
                    ],
                },
                {
                    "left_source_id": "orders",
                    "right_source_id": "products",
                    "join_type": "left",
                    "conditions": [
                        {
                            "left_column": "product",
                            "right_column": "name",
                            "operator": "=",
                        }
                    ],
                },
            ],
            "limit": 5,
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)

            bind_join_query_flow(
                mock_con,
                tables=["users", "orders", "products"],
                table_columns={
                    "users": ["id", "name", "email"],
                    "orders": ["id", "user_id", "product"],
                    "products": ["id", "name", "price"],
                },
                result_columns=["id", "name"],
                result_rows=[(1, "Alice")],
            )

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            assert response.json()["data"]["row_count"] == 1

    def test_perform_query_cross_join(self):
        """测试执行CROSS JOIN查询"""
        request_data = {
            "sources": [
                {"id": "users", "type": "duckdb", "params": {"table_name": "users"}},
                {"id": "orders", "type": "duckdb", "params": {"table_name": "orders"}},
            ],
            "joins": [
                {
                    "left_source_id": "users",
                    "right_source_id": "orders",
                    "join_type": "cross",
                    "conditions": [],  # CROSS JOIN 需要提供空 conditions 列表
                }
            ],
            "limit": 5,
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)

            bind_join_query_flow(
                mock_con,
                tables=["users", "orders"],
                table_columns={
                    "users": ["id", "name", "email"],
                    "orders": ["id", "user_id", "amount"],
                },
                result_columns=["id", "name", "amount"],
                result_rows=[(1, "Alice", 10), (1, "Alice", 20)],
            )

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            assert response.json()["data"]["row_count"] == 2

    def test_perform_query_validation_error(self):
        """测试查询验证错误"""
        # 缺少必需字段的请求
        request_data = {"sources": []}  # 空数据源列表

        response = client.post("/api/query", json=request_data)

        assert response.status_code == 422  # Validation error

    def test_perform_query_table_not_found(self):
        """测试表不存在的错误处理"""
        request_data = {
            "sources": [
                {
                    "id": "nonexistent_table",
                    "type": "duckdb",
                    "params": {"table_name": "nonexistent_table"},
                }
            ],
            "joins": [],
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)

            # 模拟表不存在
            mock_con.execute.return_value.fetchall.return_value = []  # 空表列表

            response = client.post("/api/query", json=request_data)

            assert response.status_code in (404, 500)
            data = response.json()
            error_str = str(data).lower()
            assert (
                "not found" in error_str
                or "does not exist" in error_str
                or "不存在" in error_str
                or "resource_not_found" in error_str
            )

    def test_perform_query_legacy_source_type_reports_missing_table_not_silent_success(self):
        """回归：source.type in {mysql,postgresql,sqlite}（连同 "file"）曾经各自
        走一套独立的物化逻辑（数据库连接池连接/config/mysql-configs.json 明文凭据/
        直连参数三选一），从未被现在唯一存在的前端调用方触发过
        （buildJoinQueryPayload.ts 固定发 type:'duckdb'）。删除之后，这类 source
        不再被特殊处理，直接落入"表未在 DuckDB 注册"的常规校验——这是期望的新
        行为：明确报错，而不是用遗留分支悄悄物化数据、或用临时视图伪装成功。

        用一个不存在的 connectionId 是关键：旧代码走到这里会走"模式1"，报
        "Database connection not found/processing failed"这一句和本测试断言的
        "table not found"类消息完全不同——如果这条遗留分支哪天被意外恢复，这个
        测试会因为错误消息对不上而失败，不会被"反正也报错了"蒙混过关。"""
        request_data = {
            "sources": [
                {
                    "id": "legacy_mysql_source",
                    "type": "mysql",
                    "params": {"connectionId": "some-connection-id"},
                }
            ],
            "joins": [],
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)
            mock_con.execute.return_value.fetchall.return_value = []

            response = client.post("/api/query", json=request_data)

            assert response.status_code in (404, 500)
            error_str = str(response.json()).lower()
            assert (
                "not found" in error_str
                or "does not exist" in error_str
                or "不存在" in error_str
                or "resource_not_found" in error_str
            )
            assert "database connection" not in error_str


class TestJoinIntegration:
    """测试JOIN集成功能"""

    def test_full_join_workflow(self):
        """测试完整的JOIN工作流程"""
        # 步骤1：准备数据源
        sources = [
            {"id": "users", "type": "duckdb", "params": {"table_name": "users"}},
            {"id": "orders", "type": "duckdb", "params": {"table_name": "orders"}},
        ]

        # 步骤2：定义JOIN关系
        joins = [
            {
                "left_source_id": "users",
                "right_source_id": "orders",
                "join_type": "inner",
                "conditions": [
                    {"left_column": "id", "right_column": "user_id", "operator": "="}
                ],
            }
        ]

        # 步骤3：执行查询
        request_data = {
            "sources": sources,
            "joins": joins,
            "select_columns": ["id", "name", "order_id", "amount"],
            "where_conditions": "amount > 100",
            "order_by": "name",
            "limit": 10,
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)

            bind_join_query_flow(
                mock_con,
                tables=["users", "orders"],
                table_columns={
                    "users": ["id", "name", "email"],
                    "orders": ["id", "user_id", "order_id"],
                },
                result_columns=["id", "name", "order_id"],
                result_rows=[(1, "Alice", 101)],
            )

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            assert response.json()["data"]["data"][0]["order_id"] == 101


class TestJoinErrorHandling:
    """测试JOIN错误处理"""

    def test_invalid_join_type(self):
        """测试无效的JOIN类型"""
        request_data = {
            "sources": [
                {"id": "users", "type": "duckdb", "params": {"table_name": "users"}},
                {"id": "orders", "type": "duckdb", "params": {"table_name": "orders"}},
            ],
            "joins": [
                {
                    "left_source_id": "users",
                    "right_source_id": "orders",
                    "join_type": "invalid_join_type",  # 无效的JOIN类型
                    "conditions": [
                        {
                            "left_column": "id",
                            "right_column": "user_id",
                            "operator": "=",
                        }
                    ],
                }
            ],
        }

        response = client.post("/api/query", json=request_data)

        assert response.status_code == 422  # Validation error

    def test_missing_join_conditions(self):
        """测试缺少JOIN条件"""
        request_data = {
            "sources": [
                {"id": "users", "type": "duckdb", "params": {"table_name": "users"}},
                {"id": "orders", "type": "duckdb", "params": {"table_name": "orders"}},
            ],
            "joins": [
                {
                    "left_source_id": "users",
                    "right_source_id": "orders",
                    "join_type": "inner",
                    # 缺少conditions字段
                }
            ],
        }

        response = client.post("/api/query", json=request_data)

        assert response.status_code == 422  # Validation error

    def test_database_connection_error(self):
        """测试数据库连接错误"""
        request_data = {
            "sources": [
                {"id": "users", "type": "duckdb", "params": {"table_name": "users"}}
            ],
            "joins": [],
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            mock_get_db.return_value.__enter__.side_effect = Exception(
                "Database connection failed"
            )

            response = client.post("/api/query", json=request_data)

            # API 应该返回错误状态码
            assert response.status_code in [500, 503]  # Accept both error codes
            data = response.json()
            # 错误信息可能在 'detail' 或 'message' 字段中
            error_msg = str(data)
            assert "connection" in error_msg.lower() or "failed" in error_msg.lower() or "error" in error_msg.lower()

    def test_sql_execution_error(self):
        """测试SQL执行错误"""
        request_data = {
            "sources": [
                {"id": "users", "type": "duckdb", "params": {"table_name": "users"}},
                {"id": "orders", "type": "duckdb", "params": {"table_name": "orders"}},
            ],
            "joins": [
                {
                    "left_source_id": "users",
                    "right_source_id": "orders",
                    "join_type": "inner",
                    "conditions": [
                        {
                            "left_column": "nonexistent_column",
                            "right_column": "user_id",
                            "operator": "=",
                        }
                    ],
                }
            ],
        }

        with patch("routers.join_query.with_duckdb_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_get_db, mock_con)

            bind_join_query_flow(
                mock_con,
                tables=["users", "orders"],
                table_columns={
                    "users": ["id", "name", "email"],
                    "orders": ["id", "user_id", "order_id"],
                },
                result_columns=[],
                result_rows=[],
                query_error=Exception(
                    'Binder Error: Referenced column "nonexistent_column" not found'
                ),
            )

            response = client.post("/api/query", json=request_data)

            assert response.status_code in [400, 500]
            assert "nonexistent_column" in str(response.json())
