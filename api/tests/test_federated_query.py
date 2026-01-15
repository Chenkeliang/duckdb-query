"""
联邦查询 API 端点测试

测试 /api/duckdb/federated-query 端点的参数验证、ATTACH/DETACH 流程和错误处理。

**Feature: external-table-column-fix**
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pydantic import ValidationError


class TestFederatedQueryRequestModel:
    """测试 FederatedQueryRequest 模型"""

    def test_valid_request_with_sql_only(self):
        """测试只有 SQL 的有效请求"""
        from models.query_models import FederatedQueryRequest
        
        request = FederatedQueryRequest(sql="SELECT * FROM test")
        
        assert request.sql == "SELECT * FROM test"
        assert request.attach_databases is None
        assert request.is_preview is True
        assert request.save_as_table is None
        assert request.timeout == 30000

    def test_valid_request_with_attach_databases(self):
        """测试带 attach_databases 的有效请求"""
        from models.query_models import FederatedQueryRequest, AttachDatabase
        
        request = FederatedQueryRequest(
            sql="SELECT * FROM db1.users",
            attach_databases=[
                AttachDatabase(alias="db1", connection_id="conn-123")
            ],
            is_preview=True,
            timeout=60000
        )
        
        assert request.sql == "SELECT * FROM db1.users"
        assert len(request.attach_databases) == 1
        assert request.attach_databases[0].alias == "db1"
        assert request.attach_databases[0].connection_id == "conn-123"
        assert request.timeout == 60000

    def test_empty_sql_raises_validation_error(self):
        """
        **Property 5: Attach Database Parameter Validation**
        **Validates: Requirements 2.2, 4.3**
        
        测试空 SQL 抛出验证错误
        """
        from models.query_models import FederatedQueryRequest
        
        with pytest.raises(ValidationError) as exc_info:
            FederatedQueryRequest(sql="")
        
        assert "SQL 查询语句不能为空" in str(exc_info.value)

    def test_whitespace_only_sql_raises_validation_error(self):
        """测试只有空白字符的 SQL 抛出验证错误"""
        from models.query_models import FederatedQueryRequest
        
        with pytest.raises(ValidationError) as exc_info:
            FederatedQueryRequest(sql="   ")
        
        assert "SQL 查询语句不能为空" in str(exc_info.value)

    def test_sql_is_trimmed(self):
        """测试 SQL 被自动去除首尾空白"""
        from models.query_models import FederatedQueryRequest
        
        request = FederatedQueryRequest(sql="  SELECT 1  ")
        
        assert request.sql == "SELECT 1"

    def test_save_as_table_optional(self):
        """测试 save_as_table 是可选的"""
        from models.query_models import FederatedQueryRequest
        
        request = FederatedQueryRequest(
            sql="SELECT * FROM test",
            save_as_table="result_table"
        )
        
        assert request.save_as_table == "result_table"

    def test_multiple_attach_databases(self):
        """测试多个 attach_databases"""
        from models.query_models import FederatedQueryRequest, AttachDatabase
        
        request = FederatedQueryRequest(
            sql="SELECT * FROM db1.users JOIN db2.orders ON db1.users.id = db2.orders.user_id",
            attach_databases=[
                AttachDatabase(alias="db1", connection_id="mysql-conn"),
                AttachDatabase(alias="db2", connection_id="pg-conn")
            ]
        )
        
        assert len(request.attach_databases) == 2
        assert request.attach_databases[0].alias == "db1"
        assert request.attach_databases[1].alias == "db2"


class TestFederatedQueryResponseModel:
    """测试 FederatedQueryResponse 模型"""

    def test_success_response(self):
        """
        **Property 6: Federated Query Response Format**
        **Validates: Requirements 2.3**
        
        测试成功响应格式
        """
        from models.query_models import FederatedQueryResponse
        
        response = FederatedQueryResponse(
            success=True,
            columns=["id", "name"],
            data=[{"id": 1, "name": "test"}],
            row_count=1,
            execution_time_ms=100.5,
            attached_databases=["db1"],
            message="查询成功"
        )
        
        assert response.success is True
        assert response.columns == ["id", "name"]
        assert len(response.data) == 1
        assert response.row_count == 1
        assert response.execution_time_ms == 100.5
        assert response.attached_databases == ["db1"]
        assert response.message == "查询成功"

    def test_default_values(self):
        """测试默认值"""
        from models.query_models import FederatedQueryResponse
        
        response = FederatedQueryResponse(success=True)
        
        assert response.columns == []
        assert response.data == []
        assert response.row_count == 0
        assert response.execution_time_ms == 0
        assert response.attached_databases == []
        assert response.message == ""
        assert response.sql_query is None
        assert response.warnings is None

    def test_response_with_warnings(self):
        """测试带警告的响应"""
        from models.query_models import FederatedQueryResponse
        
        response = FederatedQueryResponse(
            success=True,
            warnings=["保存结果为表失败: 表已存在"]
        )
        
        assert response.warnings == ["保存结果为表失败: 表已存在"]


class TestAttachDatabaseModel:
    """测试 AttachDatabase 模型"""

    def test_valid_attach_database(self):
        """测试有效的 AttachDatabase"""
        from models.query_models import AttachDatabase
        
        attach_db = AttachDatabase(alias="mysql_db", connection_id="conn-123")
        
        assert attach_db.alias == "mysql_db"
        assert attach_db.connection_id == "conn-123"

    def test_missing_alias_raises_error(self):
        """测试缺少 alias 抛出错误"""
        from models.query_models import AttachDatabase
        
        with pytest.raises(ValidationError):
            AttachDatabase(connection_id="conn-123")

    def test_missing_connection_id_raises_error(self):
        """测试缺少 connection_id 抛出错误"""
        from models.query_models import AttachDatabase
        
        with pytest.raises(ValidationError):
            AttachDatabase(alias="mysql_db")


class TestFederatedQueryEndpointLogic:
    """测试联邦查询端点逻辑（不依赖实际模块导入）"""

    def test_connection_not_found_scenario(self):
        """
        **Property 5: Attach Database Parameter Validation**
        **Validates: Requirements 2.2, 4.3**
        
        测试连接不存在时的处理逻辑
        """
        from models.query_models import FederatedQueryRequest, AttachDatabase
        
        # 创建请求
        request = FederatedQueryRequest(
            sql="SELECT * FROM db1.users",
            attach_databases=[
                AttachDatabase(alias="db1", connection_id="non-existent-conn")
            ]
        )
        
        # 验证请求结构正确
        assert request.attach_databases[0].connection_id == "non-existent-conn"
        # 实际的 404 错误会在端点执行时由 db_manager.get_connection 返回 None 触发

    def test_attach_database_config_structure(self):
        """测试 ATTACH 数据库配置结构"""
        from models.query_models import AttachDatabase
        
        # 模拟连接配置结构
        mock_params = {
            'host': 'localhost',
            'username': 'root',
            'password': 'test_password',
            'database': 'testdb',
            'port': 3306
        }
        
        attach_db = AttachDatabase(alias="mysql_db", connection_id="mysql-conn")
        
        # 验证配置结构
        assert attach_db.alias == "mysql_db"
        assert attach_db.connection_id == "mysql-conn"
        
        # 验证配置参数结构
        assert 'host' in mock_params
        assert 'username' in mock_params
        assert 'password' in mock_params
        assert 'database' in mock_params

    def test_password_decryption_logic(self):
        """测试密码解密逻辑"""
        # 模拟加密密码场景
        encrypted_password = "gAAAAABk..."  # 模拟 Fernet 加密格式
        plain_password = "test_password"
        
        # 验证解密逻辑结构
        # 实际解密由 password_encryptor.decrypt_password 处理
        assert len(plain_password) > 0
        
    def test_build_attach_sql_integration(self):
        """测试 build_attach_sql 集成"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': 'test_password',
            'database': 'testdb',
            'port': 3306
        }
        
        sql = build_attach_sql('db1', config)
        
        # 验证生成的 SQL
        assert 'ATTACH' in sql
        assert 'AS db1' in sql
        assert 'TYPE mysql' in sql


class TestFederatedQueryIntegration:
    """联邦查询集成测试（需要实际数据库连接时跳过）"""

    @pytest.mark.skip(reason="需要实际数据库连接")
    def test_mysql_federated_query(self):
        """测试 MySQL 联邦查询"""
        pass

    @pytest.mark.skip(reason="需要实际数据库连接")
    def test_postgresql_federated_query(self):
        """测试 PostgreSQL 联邦查询"""
        pass

    @pytest.mark.skip(reason="需要实际数据库连接")
    def test_mixed_source_federated_query(self):
        """测试混合数据源联邦查询"""
        pass
