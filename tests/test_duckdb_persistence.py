"""
DuckDB持久化功能测试
测试数据源在重启后的持久化和恢复功能
"""

import pytest
import pandas as pd
import os
import tempfile
import json
from unittest.mock import patch, MagicMock
import sys
import logging

# 添加项目路径到sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from core.duckdb_engine import (
    get_db_connection, 
    create_persistent_table, 
    table_exists, 
    drop_table_if_exists,
    register_dataframe
)

logger = logging.getLogger(__name__)


class TestDuckDBPersistence:
    """DuckDB持久化测试类"""
    
    @pytest.fixture
    def sample_dataframe(self):
        """创建测试用的DataFrame"""
        return pd.DataFrame({
            'id': [1, 2, 3, 4, 5],
            'name': ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
            'age': [25, 30, 35, 28, 32],
            'city': ['北京', '上海', '广州', '深圳', '杭州']
        })
    
    @pytest.fixture
    def temp_db_path(self):
        """创建临时数据库文件路径"""
        import tempfile
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, 'test.db')
        yield temp_path
        # 清理临时文件
        import shutil
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
    
    def test_create_persistent_table(self, sample_dataframe, temp_db_path):
        """测试创建持久化表"""
        import duckdb
        
        # 使用临时数据库
        con = duckdb.connect(temp_db_path)
        
        # 创建持久化表
        table_name = "test_persistent_table"
        success = create_persistent_table(table_name, sample_dataframe, con)
        
        assert success, "创建持久化表应该成功"
        
        # 验证表存在
        assert table_exists(table_name, con), "表应该存在"
        
        # 验证数据正确
        result_df = con.execute(f'SELECT * FROM "{table_name}"').fetchdf()
        assert len(result_df) == len(sample_dataframe), "行数应该匹配"
        assert list(result_df.columns) == list(sample_dataframe.columns), "列名应该匹配"
        
        con.close()
    
    def test_table_persistence_after_reconnect(self, sample_dataframe, temp_db_path):
        """测试重新连接后表的持久化"""
        import duckdb
        
        table_name = "test_persistence_table"
        
        # 第一次连接：创建表
        con1 = duckdb.connect(temp_db_path)
        success = create_persistent_table(table_name, sample_dataframe, con1)
        assert success, "创建持久化表应该成功"
        con1.close()
        
        # 第二次连接：验证表仍然存在
        con2 = duckdb.connect(temp_db_path)
        assert table_exists(table_name, con2), "重新连接后表应该仍然存在"
        
        # 验证数据完整性
        result_df = con2.execute(f'SELECT * FROM "{table_name}"').fetchdf()
        assert len(result_df) == len(sample_dataframe), "重新连接后数据行数应该匹配"
        assert list(result_df.columns) == list(sample_dataframe.columns), "重新连接后列名应该匹配"
        
        con2.close()
    
    def test_register_vs_persistent_table(self, sample_dataframe, temp_db_path):
        """测试register和persistent_table的区别"""
        import duckdb
        
        # 第一次连接：创建临时表和持久化表
        con1 = duckdb.connect(temp_db_path)
        
        # 使用register创建临时表
        con1.register("temp_table", sample_dataframe)
        
        # 使用create_persistent_table创建持久化表
        create_persistent_table("persistent_table", sample_dataframe, con1)
        
        # 验证两个表都存在
        tables_df = con1.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist()
        assert "temp_table" in table_names, "临时表应该存在"
        assert "persistent_table" in table_names, "持久化表应该存在"
        
        con1.close()
        
        # 第二次连接：验证持久化差异
        con2 = duckdb.connect(temp_db_path)
        tables_df = con2.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist()
        
        # 临时表应该消失，持久化表应该保留
        assert "temp_table" not in table_names, "临时表重新连接后应该消失"
        assert "persistent_table" in table_names, "持久化表重新连接后应该保留"
        
        con2.close()
    
    def test_drop_table_if_exists(self, sample_dataframe, temp_db_path):
        """测试删除表功能"""
        import duckdb
        
        con = duckdb.connect(temp_db_path)
        table_name = "test_drop_table"
        
        # 创建表
        create_persistent_table(table_name, sample_dataframe, con)
        assert table_exists(table_name, con), "表应该存在"
        
        # 删除表
        success = drop_table_if_exists(table_name, con)
        assert success, "删除表应该成功"
        assert not table_exists(table_name, con), "表应该被删除"
        
        # 删除不存在的表应该也成功
        success = drop_table_if_exists("non_existent_table", con)
        assert success, "删除不存在的表应该也成功"
        
        con.close()
    
    def test_table_name_with_special_characters(self, sample_dataframe, temp_db_path):
        """测试包含特殊字符的表名"""
        import duckdb
        
        con = duckdb.connect(temp_db_path)
        
        # 测试包含特殊字符的表名
        special_table_names = [
            "table-with-dash",
            "table_with_underscore",
            "table with space",
            "表名中文",
            "table.with.dots"
        ]
        
        for table_name in special_table_names:
            success = create_persistent_table(table_name, sample_dataframe, con)
            assert success, f"创建表 '{table_name}' 应该成功"
            assert table_exists(table_name, con), f"表 '{table_name}' 应该存在"
            
            # 验证可以查询数据
            result_df = con.execute(f'SELECT * FROM "{table_name}"').fetchdf()
            assert len(result_df) == len(sample_dataframe), f"表 '{table_name}' 数据应该正确"
        
        con.close()


class TestMySQLDataSourcePersistence:
    """MySQL数据源持久化测试"""
    
    @pytest.fixture
    def mock_mysql_config(self):
        """模拟MySQL配置"""
        return {
            "id": "test_mysql",
            "params": {
                "host": "localhost",
                "port": 3306,
                "username": "test_user",
                "password": "test_password",
                "database": "test_db"
            }
        }
    
    @pytest.fixture
    def mock_mysql_datasource(self):
        """模拟MySQL数据源配置"""
        return {
            "datasource_id": "mysql_test_data_12345678",
            "connection_name": "test_mysql",
            "sql_query": "SELECT * FROM test_table LIMIT 100",
            "alias": "test_data",
            "created_at": "2025-01-18T10:00:00"
        }
    
    def test_mysql_datasource_config_format(self, mock_mysql_datasource):
        """测试MySQL数据源配置格式"""
        required_fields = ["datasource_id", "connection_name", "sql_query"]
        
        for field in required_fields:
            assert field in mock_mysql_datasource, f"配置应该包含 {field} 字段"
            assert mock_mysql_datasource[field], f"{field} 字段不应该为空"
    
    @patch('main.os.path.exists')
    @patch('builtins.open')
    @patch('main.json.load')
    def test_load_mysql_datasources_config(self, mock_json_load, mock_open, mock_exists):
        """测试加载MySQL数据源配置"""
        from main import load_mysql_datasources_on_startup
        
        # 模拟配置文件存在
        mock_exists.return_value = True
        
        # 模拟配置内容
        mock_json_load.side_effect = [
            [{"datasource_id": "test_id", "connection_name": "test_conn", "sql_query": "SELECT 1"}],  # mysql_datasources.json
            [{"id": "test_conn", "params": {"host": "localhost"}}]  # mysql_configs.json
        ]
        
        # 执行测试（这里只测试配置加载逻辑，不执行实际的数据库操作）
        with patch('main.create_persistent_table') as mock_create_table:
            with patch('main.get_db_connection'):
                with patch('sqlalchemy.create_engine'):
                    with patch('pandas.read_sql'):
                        load_mysql_datasources_on_startup()
        
        # 验证文件被正确打开
        assert mock_open.call_count >= 1, "应该打开配置文件"


if __name__ == "__main__":
    # 运行测试
    pytest.main([__file__, "-v"])
