"""
DuckDB 扩展管理测试

测试扩展配置、ATTACH SQL 生成等功能。

**Feature: duckdb-extension-unified-management**
"""

import pytest
from unittest.mock import patch, MagicMock
import os


class TestDefaultExtensionConfiguration:
    """测试默认扩展配置"""

    def test_default_extensions_include_federated_query_extensions(self):
        """
        **Property 5: Configuration Default Extensions**
        **Validates: Requirements 1.4, 4.2**
        
        验证默认扩展列表包含 excel, json, parquet, mysql, postgres
        """
        from core.common.config_manager import AppConfig
        
        # 创建不带显式扩展配置的 AppConfig
        config = AppConfig()
        
        # 验证默认扩展列表
        expected_extensions = ["excel", "json", "parquet", "mysql", "postgres"]
        assert config.duckdb_extensions == expected_extensions
        
        # 验证联邦查询扩展存在
        assert "mysql" in config.duckdb_extensions
        assert "postgres" in config.duckdb_extensions

    def test_custom_extensions_override_default(self):
        """测试自定义扩展列表覆盖默认值"""
        from core.common.config_manager import AppConfig
        
        custom_extensions = ["json", "parquet"]
        config = AppConfig(duckdb_extensions=custom_extensions)
        
        assert config.duckdb_extensions == custom_extensions
        assert "mysql" not in config.duckdb_extensions

    def test_empty_extensions_list_preserved(self):
        """测试空扩展列表被保留"""
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=[])
        
        assert config.duckdb_extensions == []


class TestBuildAttachSQL:
    """测试 ATTACH SQL 生成"""

    def test_mysql_attach_sql_format(self):
        """
        **Property 2: ATTACH SQL Format for MySQL**
        **Validates: Requirements 2.2**
        
        验证 MySQL ATTACH SQL 格式正确
        """
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': 'test_password',
            'database': 'testdb',
            'port': 3306
        }
        
        sql = build_attach_sql('test_alias', config)
        
        # 验证 SQL 格式
        assert 'TYPE mysql' in sql
        assert 'host=localhost' in sql
        assert 'user=root' in sql
        assert 'database=testdb' in sql
        assert 'port=3306' in sql
        assert 'AS test_alias' in sql

    def test_postgres_attach_sql_format(self):
        """
        **Property 3: ATTACH SQL Format for PostgreSQL**
        **Validates: Requirements 2.3**
        
        验证 PostgreSQL ATTACH SQL 格式正确
        """
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'postgresql',
            'host': 'localhost',
            'username': 'postgres',
            'password': 'test_password',
            'database': 'testdb',
            'port': 5432
        }
        
        sql = build_attach_sql('pg_alias', config)
        
        # 验证 SQL 格式
        assert 'TYPE postgres' in sql
        assert 'host=localhost' in sql
        assert 'user=postgres' in sql
        assert 'dbname=testdb' in sql
        assert 'port=5432' in sql
        assert 'AS pg_alias' in sql

    def test_sqlite_attach_sql_format(self):
        """
        **Property 4: ATTACH SQL Format for SQLite**
        **Validates: Requirements 2.4**
        
        验证 SQLite ATTACH SQL 格式正确
        """
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'sqlite',
            'database': '/path/to/database.db'
        }
        
        sql = build_attach_sql('sqlite_alias', config)
        
        # 验证 SQL 格式
        assert 'TYPE sqlite' in sql
        assert '/path/to/database.db' in sql
        assert 'AS sqlite_alias' in sql

    def test_mysql_without_port(self):
        """测试 MySQL 不带端口的情况"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': 'password',
            'database': 'testdb'
        }
        
        sql = build_attach_sql('mysql_db', config)
        
        assert 'TYPE mysql' in sql
        assert 'host=localhost' in sql
        assert 'port=' not in sql

    def test_postgres_without_port(self):
        """测试 PostgreSQL 不带端口的情况"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'postgres',
            'host': 'localhost',
            'username': 'postgres',
            'password': 'password',
            'database': 'testdb'
        }
        
        sql = build_attach_sql('pg_db', config)
        
        assert 'TYPE postgres' in sql
        assert 'host=localhost' in sql
        assert 'port=' not in sql

    def test_unsupported_database_type_raises_error(self):
        """测试不支持的数据库类型抛出错误"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'oracle',
            'host': 'localhost',
            'username': 'user',
            'password': 'password',
            'database': 'testdb'
        }
        
        with pytest.raises(ValueError) as exc_info:
            build_attach_sql('oracle_db', config)
        
        assert 'Unsupported database type' in str(exc_info.value)

    def test_empty_password_handled(self):
        """测试空密码的处理"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': '',
            'database': 'testdb'
        }
        
        sql = build_attach_sql('mysql_db', config)
        
        assert 'TYPE mysql' in sql
        assert 'password=' in sql


class TestExtensionLoading:
    """测试扩展加载"""

    def test_resolve_duckdb_extensions_deduplicates(self):
        """测试扩展列表去重"""
        from core.database.duckdb_engine import _resolve_duckdb_extensions
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=["json", "JSON", "parquet", "json"])
        
        resolved = _resolve_duckdb_extensions(config)
        
        # 验证去重（忽略大小写）
        assert len(resolved) == 2
        assert "json" in resolved or "JSON" in resolved
        assert "parquet" in resolved

    def test_resolve_duckdb_extensions_preserves_order(self):
        """测试扩展列表保持顺序"""
        from core.database.duckdb_engine import _resolve_duckdb_extensions
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=["parquet", "json", "excel"])
        
        resolved = _resolve_duckdb_extensions(config)
        
        assert resolved == ["parquet", "json", "excel"]

    def test_resolve_duckdb_extensions_with_override(self):
        """测试扩展列表覆盖"""
        from core.database.duckdb_engine import _resolve_duckdb_extensions
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=["json", "parquet"])
        override = ["mysql", "postgres"]
        
        resolved = _resolve_duckdb_extensions(config, override)
        
        assert resolved == ["mysql", "postgres"]
