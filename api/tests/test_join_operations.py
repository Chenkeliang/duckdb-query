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
import pandas as pd
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
from routers.query import (
    build_multi_table_join_query,
    build_join_chain,
    get_join_type_sql,
    generate_improved_column_aliases,
)

client = TestClient(app)


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
            left_source_id="users", right_source_id="orders", join_type=JoinType.CROSS
        )

        table_columns = {"users": ["id", "name"], "orders": ["id", "product"]}

        join_chain = build_join_chain(
            [self.source1, self.source2], [join], table_columns
        )

        assert '"users"' in join_chain
        assert 'CROSS JOIN "orders"' in join_chain
        # CROSS JOIN不应该有ON条件
        assert "ON" not in join_chain

    @patch("routers.query.get_db_connection")
    def test_build_multi_table_join_query_simple(self, mock_get_db):
        """测试构建简单多表JOIN查询"""
        # 模拟数据库连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟表存在检查
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"name": ["users", "orders"]}
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
            sources=[self.source1, self.source2],
            joins=[join],
            select_columns=["id", "name", "order_id"],
        )

        query = build_multi_table_join_query(request, mock_con)

        assert "SELECT" in query
        assert '"users"' in query
        assert 'INNER JOIN "orders"' in query
        assert 'ON "users"."id" = "orders"."user_id"' in query

    @patch("routers.query.get_db_connection")
    def test_build_multi_table_join_query_with_where(self, mock_get_db):
        """测试构建带WHERE条件的多表JOIN查询"""
        # 模拟数据库连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟表存在检查
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"name": ["users", "orders"]}
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
            sources=[self.source1, self.source2],
            joins=[join],
            where_conditions="age > 18",
            order_by="name",
            limit=100,
        )

        query = build_multi_table_join_query(request, mock_con)

        assert "WHERE age > 18" in query
        assert "ORDER BY name" in query
        assert "LIMIT 100" in query

    @patch("routers.query.get_db_connection")
    def test_build_multi_table_join_query_no_joins(self, mock_get_db):
        """测试构建无JOIN条件的多表查询（CROSS JOIN）"""
        # 模拟数据库连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟表存在检查
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"name": ["users", "orders"]}
        )

        request = QueryRequest(
            sources=[self.source1, self.source2], joins=[]  # 无JOIN条件
        )

        query = build_multi_table_join_query(request, mock_con)

        assert "SELECT" in query
        assert '"users"' in query
        assert 'CROSS JOIN "orders"' in query

    @patch("routers.query.get_db_connection")
    def test_build_multi_table_join_query_single_table(self, mock_get_db):
        """测试构建单表查询"""
        # 模拟数据库连接
        mock_con = Mock()
        mock_get_db.return_value = mock_con

        # 模拟表存在检查
        mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
            {"name": ["users"]}
        )

        request = QueryRequest(sources=[self.source1], joins=[])

        query = build_multi_table_join_query(request, mock_con)

        assert "SELECT" in query
        assert '"users"' in query
        assert "JOIN" not in query


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

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟表存在检查 - 第一次调用返回表列表
            mock_con.execute.return_value.fetchdf.side_effect = [
                pd.DataFrame({"name": ["users", "orders"]}),  # SHOW TABLES
                pd.DataFrame(
                    {  # 查询结果
                        "id": [1, 2, 3],
                        "name": ["Alice", "Bob", "Charlie"],
                        "order_id": [101, 102, 103],
                    }
                ),
            ]

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 3

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

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟表存在检查和查询结果
            mock_con.execute.return_value.fetchdf.side_effect = [
                pd.DataFrame({"name": ["users", "orders", "products"]}),  # SHOW TABLES
                pd.DataFrame(
                    {  # 查询结果
                        "id": [1, 2],
                        "name": ["Alice", "Bob"],
                        "order_id": [101, 102],
                        "product_name": ["Laptop", "Mouse"],
                    }
                ),
            ]

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 2

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
                }
            ],
            "limit": 5,
        }

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟表存在检查和查询结果
            mock_con.execute.return_value.fetchdf.side_effect = [
                pd.DataFrame({"name": ["users", "orders"]}),  # SHOW TABLES
                pd.DataFrame(
                    {  # 查询结果
                        "id": [1, 1, 2, 2],
                        "name": ["Alice", "Alice", "Bob", "Bob"],
                        "order_id": [101, 102, 101, 102],
                    }
                ),
            ]

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 4

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

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟表不存在
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
                {"name": []}  # 空表列表
            )

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 422
            data = response.json()
            assert "不存在" in data["detail"]


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

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟表存在检查和查询结果
            mock_con.execute.return_value.fetchdf.side_effect = [
                pd.DataFrame({"name": ["users", "orders"]}),  # SHOW TABLES
                pd.DataFrame(
                    {  # 查询结果
                        "id": [1, 2, 3],
                        "name": ["Alice", "Bob", "Charlie"],
                        "order_id": [101, 102, 103],
                        "amount": [150.0, 200.0, 120.0],
                    }
                ),
            ]

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 3

            # 验证查询包含所有必要的SQL元素
            assert "INNER JOIN" in str(mock_con.execute.call_args)
            assert "WHERE amount > 100" in str(mock_con.execute.call_args)
            assert "ORDER BY name" in str(mock_con.execute.call_args)
            assert "LIMIT 10" in str(mock_con.execute.call_args)


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

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接错误
            mock_get_db.side_effect = Exception("Database connection failed")

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 500
            data = response.json()
            assert "Database connection failed" in data["detail"]

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

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟表存在检查成功，但查询执行失败
            mock_con.execute.return_value.fetchdf.side_effect = [
                pd.DataFrame({"name": ["users", "orders"]}),  # SHOW TABLES 成功
                Exception("Column 'nonexistent_column' does not exist"),  # 查询执行失败
            ]

            response = client.post("/api/query", json=request_data)

            assert response.status_code == 500
            data = response.json()
            assert "Column 'nonexistent_column' does not exist" in data["detail"]
