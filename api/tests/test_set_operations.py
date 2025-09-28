"""
集合操作功能单元测试

测试DuckDB集合操作功能，包括：
1. 集合操作数据模型验证
2. 集合操作查询生成器
3. 集合操作API端点
4. 前端集合操作组件集成
"""

import pytest
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
import pandas as pd
import json

from main import app
from models.visual_query_models import (
    SetOperationType,
    SetOperationConfig,
    SetOperationRequest,
    SetOperationResponse,
    TableConfig,
    ColumnMapping,
    UnionOperationRequest,
)
from core.visual_query_generator import (
    SetOperationQueryGenerator,
    generate_set_operation_sql,
    estimate_set_operation_rows,
)

client = TestClient(app)


class TestSetOperationModels:
    """测试集合操作数据模型"""

    def test_set_operation_type_enum(self):
        """测试集合操作类型枚举"""
        assert SetOperationType.UNION == "UNION"
        assert SetOperationType.UNION_ALL == "UNION ALL"
        assert SetOperationType.UNION_BY_NAME == "UNION BY NAME"
        assert SetOperationType.UNION_ALL_BY_NAME == "UNION ALL BY NAME"
        assert SetOperationType.EXCEPT == "EXCEPT"
        assert SetOperationType.INTERSECT == "INTERSECT"

    def test_column_mapping_model(self):
        """测试列映射模型"""
        mapping = ColumnMapping(source_column="user_id", target_column="id")
        assert mapping.source_column == "user_id"
        assert mapping.target_column == "id"

    def test_table_config_model(self):
        """测试表配置模型"""
        table_config = TableConfig(
            table_name="users", selected_columns=["id", "name", "email"], alias="u"
        )
        assert table_config.table_name == "users"
        assert table_config.selected_columns == ["id", "name", "email"]
        assert table_config.alias == "u"

    def test_set_operation_config_validation(self):
        """测试集合操作配置验证"""
        # 测试最少表数量验证
        with pytest.raises(ValueError, match="集合操作至少需要两个表"):
            SetOperationConfig(
                operation_type=SetOperationType.UNION,
                tables=[TableConfig(table_name="table1")],
            )

        # 测试BY NAME模式验证
        with pytest.raises(ValueError, match="只有UNION和UNION ALL支持BY NAME模式"):
            SetOperationConfig(
                operation_type=SetOperationType.EXCEPT,
                tables=[
                    TableConfig(table_name="table1"),
                    TableConfig(table_name="table2"),
                ],
                use_by_name=True,
            )

        # 测试BY NAME模式下必须提供列映射
        with pytest.raises(ValueError, match="表 .* 在BY NAME模式下必须提供列映射"):
            SetOperationConfig(
                operation_type=SetOperationType.UNION,
                tables=[
                    TableConfig(table_name="table1"),
                    TableConfig(table_name="table2"),
                ],
                use_by_name=True,
            )

    def test_set_operation_config_success(self):
        """测试有效的集合操作配置"""
        config = SetOperationConfig(
            operation_type=SetOperationType.UNION,
            tables=[
                TableConfig(
                    table_name="users", selected_columns=["id", "name"], alias="u"
                ),
                TableConfig(
                    table_name="customers", selected_columns=["id", "name"], alias="c"
                ),
            ],
            use_by_name=False,
        )
        assert config.operation_type == SetOperationType.UNION
        assert len(config.tables) == 2
        assert config.use_by_name is False


class TestSetOperationQueryGenerator:
    """测试集合操作查询生成器"""

    def setup_method(self):
        """每个测试方法前的设置"""
        self.generator = SetOperationQueryGenerator()

    def test_build_simple_union_query(self):
        """测试构建简单UNION查询"""
        config = SetOperationConfig(
            operation_type=SetOperationType.UNION,
            tables=[
                TableConfig(table_name="table1", selected_columns=["col1", "col2"]),
                TableConfig(table_name="table2", selected_columns=["col1", "col2"]),
            ],
            use_by_name=False,
        )

        sql = self.generator.build_set_operation_query(config)

        assert "UNION" in sql
        assert "table1" in sql
        assert "table2" in sql
        assert "col1" in sql
        assert "col2" in sql

    def test_build_union_all_query(self):
        """测试构建UNION ALL查询"""
        config = SetOperationConfig(
            operation_type=SetOperationType.UNION_ALL,
            tables=[
                TableConfig(table_name="table1", selected_columns=["col1", "col2"]),
                TableConfig(table_name="table2", selected_columns=["col1", "col2"]),
            ],
            use_by_name=False,
        )

        sql = self.generator.build_set_operation_query(config)

        assert "UNION ALL" in sql
        assert "table1" in sql
        assert "table2" in sql

    def test_build_union_by_name_query(self):
        """测试构建UNION BY NAME查询"""
        config = SetOperationConfig(
            operation_type=SetOperationType.UNION,
            tables=[
                TableConfig(
                    table_name="table1",
                    selected_columns=["id", "name"],
                    column_mappings=[
                        ColumnMapping(source_column="id", target_column="id"),
                        ColumnMapping(source_column="name", target_column="name"),
                    ],
                ),
                TableConfig(
                    table_name="table2",
                    selected_columns=["user_id", "full_name"],
                    column_mappings=[
                        ColumnMapping(source_column="user_id", target_column="id"),
                        ColumnMapping(source_column="full_name", target_column="name"),
                    ],
                ),
            ],
            use_by_name=True,
        )

        sql = self.generator.build_set_operation_query(config)

        assert "UNION BY NAME" in sql
        assert "table1" in sql
        assert "table2" in sql
        assert '"user_id" AS "id"' in sql
        assert '"full_name" AS "name"' in sql

    def test_build_except_query(self):
        """测试构建EXCEPT查询"""
        config = SetOperationConfig(
            operation_type=SetOperationType.EXCEPT,
            tables=[
                TableConfig(table_name="table1", selected_columns=["col1", "col2"]),
                TableConfig(table_name="table2", selected_columns=["col1", "col2"]),
            ],
            use_by_name=False,
        )

        sql = self.generator.build_set_operation_query(config)

        assert "EXCEPT" in sql
        assert "table1" in sql
        assert "table2" in sql

    def test_build_intersect_query(self):
        """测试构建INTERSECT查询"""
        config = SetOperationConfig(
            operation_type=SetOperationType.INTERSECT,
            tables=[
                TableConfig(table_name="table1", selected_columns=["col1", "col2"]),
                TableConfig(table_name="table2", selected_columns=["col1", "col2"]),
            ],
            use_by_name=False,
        )

        sql = self.generator.build_set_operation_query(config)

        assert "INTERSECT" in sql
        assert "table1" in sql
        assert "table2" in sql

    def test_estimate_result_rows(self):
        """测试结果行数估算"""
        config = SetOperationConfig(
            operation_type=SetOperationType.UNION,
            tables=[
                TableConfig(table_name="table1", selected_columns=["col1", "col2"]),
                TableConfig(table_name="table2", selected_columns=["col1", "col2"]),
            ],
            use_by_name=False,
        )

        # 测试无连接时的估算
        estimated_rows = self.generator.estimate_result_rows(config)
        assert estimated_rows > 0

        # 测试有连接时的估算
        mock_con = Mock()
        mock_con.execute.return_value.fetchone.return_value = [1000]

        estimated_rows = self.generator.estimate_result_rows(config, mock_con)
        assert estimated_rows > 0


class TestSetOperationAPI:
    """测试集合操作API端点"""

    def test_generate_set_operation_query_success(self):
        """测试成功生成集合操作查询"""
        request_data = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {
                        "table_name": "users",
                        "selected_columns": ["id", "name"],
                        "alias": "u",
                    },
                    {
                        "table_name": "customers",
                        "selected_columns": ["id", "name"],
                        "alias": "c",
                    },
                ],
                "use_by_name": False,
            },
            "include_metadata": True,
        }

        with patch("routers.query.generate_set_operation_sql") as mock_generate, patch(
            "routers.query.estimate_set_operation_rows"
        ) as mock_estimate, patch("routers.query.get_db_connection") as mock_get_db:

            # 模拟查询生成
            mock_generate.return_value = (
                "SELECT id, name FROM users UNION SELECT id, name FROM customers"
            )
            mock_estimate.return_value = 1000

            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            response = client.post("/api/set-operations/generate", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "UNION" in data["sql"]
            assert data["estimated_rows"] == 1000
            assert data["metadata"] is not None

    def test_generate_set_operation_query_validation_error(self):
        """测试集合操作查询生成验证错误"""
        request_data = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {"table_name": "users", "selected_columns": ["id", "name"]}
                    # 缺少第二个表
                ],
                "use_by_name": False,
            },
            "preview": False,
            "include_metadata": False,
        }

        response = client.post("/api/set-operations/generate", json=request_data)

        # 由于请求格式无效，应该返回422验证错误
        assert response.status_code == 422

    def test_preview_set_operation_success(self):
        """测试成功预览集合操作"""
        request_data = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {
                        "table_name": "users",
                        "selected_columns": ["id", "name"],
                        "alias": "u",
                    },
                    {
                        "table_name": "customers",
                        "selected_columns": ["id", "name"],
                        "alias": "c",
                    },
                ],
                "use_by_name": False,
            },
            "preview": True,
            "include_metadata": False,
        }

        with patch("routers.query.generate_set_operation_sql") as mock_generate, patch(
            "routers.query.estimate_set_operation_rows"
        ) as mock_estimate, patch("routers.query.get_db_connection") as mock_get_db:

            # 模拟查询生成
            mock_generate.return_value = "SELECT id, name FROM users UNION SELECT id, name FROM customers LIMIT 10"
            mock_estimate.return_value = 1000

            # 模拟数据库连接和查询结果
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟预览数据
            preview_data = pd.DataFrame(
                {"id": [1, 2, 3], "name": ["Alice", "Bob", "Charlie"]}
            )
            mock_con.execute.return_value.fetchdf.return_value = preview_data

            response = client.post("/api/set-operations/preview", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 3
            assert data["row_count"] == 3

    def test_validate_set_operation_success(self):
        """测试成功验证集合操作"""
        request_data = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {
                        "table_name": "users",
                        "selected_columns": ["id", "name"],
                        "alias": "u",
                    },
                    {
                        "table_name": "customers",
                        "selected_columns": ["id", "name"],
                        "alias": "c",
                    },
                ],
                "use_by_name": False,
            },
            "preview": False,
            "include_metadata": False,
        }

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟表存在检查
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame(
                {"name": ["users", "customers"]}
            )

            response = client.post("/api/set-operations/validate", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["is_valid"] is True

    def test_execute_set_operation_success(self):
        """测试成功执行集合操作"""
        request_data = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {
                        "table_name": "users",
                        "selected_columns": ["id", "name"],
                        "alias": "u",
                    },
                    {
                        "table_name": "customers",
                        "selected_columns": ["id", "name"],
                        "alias": "c",
                    },
                ],
                "use_by_name": False,
            }
        }

        with patch("routers.query.generate_set_operation_sql") as mock_generate, patch(
            "routers.query.get_db_connection"
        ) as mock_get_db:

            # 模拟查询生成
            mock_generate.return_value = (
                "SELECT id, name FROM users UNION SELECT id, name FROM customers"
            )

            # 模拟数据库连接和查询结果
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 模拟执行结果
            result_data = pd.DataFrame(
                {
                    "id": [1, 2, 3, 4, 5],
                    "name": ["Alice", "Bob", "Charlie", "David", "Eve"],
                }
            )
            mock_con.execute.return_value.fetchdf.return_value = result_data

            response = client.post("/api/set-operations/execute", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 5

    def test_simple_union_operation(self):
        """测试简单UNION操作"""
        request_data = {"tables": ["users", "customers"], "operation_type": "UNION"}

        with patch("routers.query.generate_set_operation_sql") as mock_generate, patch(
            "routers.query.estimate_set_operation_rows"
        ) as mock_estimate, patch("routers.query.get_db_connection") as mock_get_db:

            # 模拟查询生成
            mock_generate.return_value = (
                "SELECT * FROM users UNION SELECT * FROM customers"
            )
            mock_estimate.return_value = 500

            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            response = client.post(
                "/api/set-operations/simple-union", json=request_data
            )

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert "UNION" in data["sql"]
            assert data["estimated_rows"] == 500


class TestSetOperationIntegration:
    """测试集合操作集成功能"""

    def test_full_set_operation_workflow(self):
        """测试完整的集合操作工作流程"""
        # 步骤1：生成查询
        generate_request = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {
                        "table_name": "users",
                        "selected_columns": ["id", "name"],
                        "alias": "u",
                    },
                    {
                        "table_name": "customers",
                        "selected_columns": ["id", "name"],
                        "alias": "c",
                    },
                ],
                "use_by_name": False,
            },
            "include_metadata": True,
        }

        with patch("routers.query.generate_set_operation_sql") as mock_generate, patch(
            "routers.query.estimate_set_operation_rows"
        ) as mock_estimate, patch("routers.query.get_db_connection") as mock_get_db:

            # 模拟查询生成
            mock_generate.return_value = (
                "SELECT id, name FROM users UNION SELECT id, name FROM customers"
            )
            mock_estimate.return_value = 1000

            # 模拟数据库连接
            mock_con = Mock()
            mock_get_db.return_value = mock_con

            # 步骤1：生成查询
            response = client.post(
                "/api/set-operations/generate", json=generate_request
            )
            assert response.status_code == 200
            generate_data = response.json()
            assert generate_data["success"] is True

            # 步骤2：预览查询
            preview_request = {"config": generate_request["config"], "limit": 5}

            # 模拟预览数据
            preview_data = pd.DataFrame(
                {"id": [1, 2, 3], "name": ["Alice", "Bob", "Charlie"]}
            )
            mock_con.execute.return_value.fetchdf.return_value = preview_data

            response = client.post("/api/set-operations/preview", json=preview_request)
            assert response.status_code == 200
            preview_data = response.json()
            assert preview_data["success"] is True

            # 步骤3：执行查询
            execute_request = {"config": generate_request["config"]}

            # 模拟执行结果
            result_data = pd.DataFrame(
                {
                    "id": [1, 2, 3, 4, 5],
                    "name": ["Alice", "Bob", "Charlie", "David", "Eve"],
                }
            )
            mock_con.execute.return_value.fetchdf.return_value = result_data

            response = client.post("/api/set-operations/execute", json=execute_request)
            assert response.status_code == 200
            execute_data = response.json()
            assert execute_data["success"] is True
            assert len(execute_data["data"]) == 5


class TestSetOperationErrorHandling:
    """测试集合操作错误处理"""

    def test_invalid_operation_type(self):
        """测试无效的操作类型"""
        request_data = {
            "config": {
                "operation_type": "INVALID_OPERATION",
                "tables": [
                    {"table_name": "users", "selected_columns": ["id", "name"]},
                    {"table_name": "customers", "selected_columns": ["id", "name"]},
                ],
                "use_by_name": False,
            }
        }

        response = client.post("/api/set-operations/generate", json=request_data)

        assert response.status_code == 422  # Validation error

    def test_missing_required_fields(self):
        """测试缺少必需字段"""
        request_data = {
            "config": {
                "operation_type": "UNION"
                # 缺少tables字段
            }
        }

        response = client.post("/api/set-operations/generate", json=request_data)

        assert response.status_code == 422  # Validation error

    def test_database_connection_error(self):
        """测试数据库连接错误"""
        request_data = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {"table_name": "users", "selected_columns": ["id", "name"]},
                    {"table_name": "customers", "selected_columns": ["id", "name"]},
                ],
                "use_by_name": False,
            }
        }

        with patch("routers.query.get_db_connection") as mock_get_db:
            # 模拟数据库连接错误
            mock_get_db.side_effect = Exception("Database connection failed")

            response = client.post("/api/set-operations/generate", json=request_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert len(data["errors"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
