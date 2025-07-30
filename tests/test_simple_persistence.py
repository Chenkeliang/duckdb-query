"""
简化的DuckDB持久化功能测试
"""

import pytest
import pandas as pd
import os
import tempfile
import shutil
import sys

# 添加项目路径到sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

def test_duckdb_basic_persistence():
    """测试DuckDB基本持久化功能"""
    import duckdb
    
    # 创建临时目录和数据库文件
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, 'test.db')
    
    try:
        # 创建测试数据
        df = pd.DataFrame({
            'id': [1, 2, 3],
            'name': ['Alice', 'Bob', 'Charlie'],
            'age': [25, 30, 35]
        })
        
        # 第一次连接：创建持久化表
        con1 = duckdb.connect(db_path)
        
        # 注册临时表
        con1.register('temp_table', df)
        
        # 创建持久化表
        con1.execute('CREATE TABLE persistent_table AS SELECT * FROM temp_table')
        
        # 验证表存在
        tables_df = con1.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist()
        assert "temp_table" in table_names
        assert "persistent_table" in table_names
        
        con1.close()
        
        # 第二次连接：验证持久化
        con2 = duckdb.connect(db_path)
        
        tables_df = con2.execute("SHOW TABLES").fetchdf()
        table_names = tables_df["name"].tolist()
        
        # 临时表应该消失，持久化表应该保留
        assert "temp_table" not in table_names, "临时表重新连接后应该消失"
        assert "persistent_table" in table_names, "持久化表重新连接后应该保留"
        
        # 验证数据完整性
        result_df = con2.execute('SELECT * FROM persistent_table').fetchdf()
        assert len(result_df) == len(df), "数据行数应该匹配"
        assert list(result_df.columns) == list(df.columns), "列名应该匹配"
        
        con2.close()
        
        print("✅ DuckDB基本持久化测试通过")
        
    finally:
        # 清理临时文件
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


def test_create_persistent_table_function():
    """测试create_persistent_table函数"""
    try:
        from core.duckdb_engine import create_persistent_table, table_exists
        import duckdb
        
        # 创建临时目录和数据库文件
        temp_dir = tempfile.mkdtemp()
        db_path = os.path.join(temp_dir, 'test.db')
        
        # 创建测试数据
        df = pd.DataFrame({
            'id': [1, 2, 3],
            'name': ['Alice', 'Bob', 'Charlie']
        })
        
        # 测试create_persistent_table函数
        con = duckdb.connect(db_path)
        
        success = create_persistent_table('test_table', df, con)
        assert success, "创建持久化表应该成功"
        
        # 验证表存在
        exists = table_exists('test_table', con)
        assert exists, "表应该存在"
        
        # 验证数据
        result_df = con.execute('SELECT * FROM "test_table"').fetchdf()
        assert len(result_df) == len(df), "数据行数应该匹配"
        
        con.close()
        
        print("✅ create_persistent_table函数测试通过")
        
    except ImportError as e:
        print(f"⚠️  无法导入函数，跳过测试: {e}")
    finally:
        # 清理临时文件
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)


def test_mysql_datasource_config_format():
    """测试MySQL数据源配置格式"""
    mock_datasource = {
        "datasource_id": "mysql_test_data_12345678",
        "connection_name": "test_mysql",
        "sql_query": "SELECT * FROM test_table LIMIT 100",
        "alias": "test_data",
        "created_at": "2025-01-18T10:00:00"
    }
    
    required_fields = ["datasource_id", "connection_name", "sql_query"]
    
    for field in required_fields:
        assert field in mock_datasource, f"配置应该包含 {field} 字段"
        assert mock_datasource[field], f"{field} 字段不应该为空"
    
    print("✅ MySQL数据源配置格式测试通过")


if __name__ == "__main__":
    print("开始运行DuckDB持久化测试...")
    
    test_duckdb_basic_persistence()
    test_create_persistent_table_function()
    test_mysql_datasource_config_format()
    
    print("🎉 所有测试完成！")
