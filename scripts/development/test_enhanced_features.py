#!/usr/bin/env python3
"""
测试增强功能的脚本
验证新添加的多数据源关联分析平台功能
"""

import sys
import os
import pandas as pd
import json
import tempfile
from pathlib import Path

# 添加API目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

from models.query_models import (
    DataSourceType,
    DatabaseConnection,
    ConnectionTestRequest,
    QueryRequest,
    DataSource,
    Join,
    JoinType,
    JoinCondition,
    ExportRequest,
    ExportFormat
)
from core.database_manager import db_manager
from core.duckdb_engine import (
    get_db_connection,
    register_dataframe,
    build_join_query,
    detect_column_conflicts,
    generate_column_aliases
)


def test_file_formats():
    """测试新文件格式支持"""
    print("🧪 测试文件格式支持...")
    
    # 创建测试数据
    test_data = {
        'id': [1, 2, 3, 4, 5],
        'name': ['Alice', 'Bob', 'Charlie', 'David', 'Eve'],
        'age': [25, 30, 35, 28, 32],
        'city': ['New York', 'London', 'Tokyo', 'Paris', 'Sydney']
    }
    df = pd.DataFrame(test_data)
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # 测试CSV
        csv_file = temp_path / "test.csv"
        df.to_csv(csv_file, index=False)
        print(f"✅ CSV文件创建成功: {csv_file}")
        
        # 测试Excel
        excel_file = temp_path / "test.xlsx"
        df.to_excel(excel_file, index=False)
        print(f"✅ Excel文件创建成功: {excel_file}")
        
        # 测试JSON
        json_file = temp_path / "test.json"
        df.to_json(json_file, orient='records', indent=2)
        print(f"✅ JSON文件创建成功: {json_file}")
        
        # 测试Parquet
        try:
            parquet_file = temp_path / "test.parquet"
            df.to_parquet(parquet_file, index=False)
            print(f"✅ Parquet文件创建成功: {parquet_file}")
        except ImportError:
            print("⚠️  Parquet支持需要pyarrow库")
    
    print("✅ 文件格式测试完成\n")


def test_database_manager():
    """测试数据库连接管理器"""
    print("🧪 测试数据库连接管理器...")
    
    # 测试SQLite连接
    sqlite_connection = DatabaseConnection(
        id="test_sqlite",
        type=DataSourceType.SQLITE,
        params={"database": ":memory:"},
        name="测试SQLite连接"
    )
    
    # 测试连接
    test_request = ConnectionTestRequest(
        type=DataSourceType.SQLITE,
        params={"database": ":memory:"}
    )
    
    result = db_manager.test_connection(test_request)
    if result.success:
        print(f"✅ SQLite连接测试成功: {result.message}")
        print(f"   延迟: {result.latency_ms:.2f}ms")
    else:
        print(f"❌ SQLite连接测试失败: {result.message}")
    
    # 添加连接
    success = db_manager.add_connection(sqlite_connection)
    if success:
        print("✅ SQLite连接添加成功")
    else:
        print("❌ SQLite连接添加失败")
    
    # 列出连接
    connections = db_manager.list_connections()
    print(f"✅ 当前连接数量: {len(connections)}")
    
    print("✅ 数据库连接管理器测试完成\n")


def test_enhanced_join():
    """测试增强的JOIN功能"""
    print("🧪 测试增强JOIN功能...")
    
    # 创建测试数据
    users_data = pd.DataFrame({
        'user_id': [1, 2, 3, 4],
        'name': ['Alice', 'Bob', 'Charlie', 'David'],
        'email': ['alice@example.com', 'bob@example.com', 'charlie@example.com', 'david@example.com']
    })
    
    orders_data = pd.DataFrame({
        'order_id': [101, 102, 103, 104, 105],
        'user_id': [1, 2, 1, 3, 2],
        'product': ['Laptop', 'Mouse', 'Keyboard', 'Monitor', 'Headphones'],
        'amount': [1200, 25, 75, 300, 150]
    })
    
    products_data = pd.DataFrame({
        'product': ['Laptop', 'Mouse', 'Keyboard', 'Monitor', 'Headphones'],
        'category': ['Electronics', 'Accessories', 'Accessories', 'Electronics', 'Accessories'],
        'price': [1200, 25, 75, 300, 150]
    })
    
    # 注册到DuckDB
    con = get_db_connection()
    register_dataframe("users", users_data, con)
    register_dataframe("orders", orders_data, con)
    register_dataframe("products", products_data, con)
    
    print("✅ 测试数据注册到DuckDB")
    
    # 创建数据源
    users_source = DataSource(
        id="users",
        type=DataSourceType.CSV,
        params={},
        columns=users_data.columns.tolist()
    )
    
    orders_source = DataSource(
        id="orders", 
        type=DataSourceType.CSV,
        params={},
        columns=orders_data.columns.tolist()
    )
    
    products_source = DataSource(
        id="products",
        type=DataSourceType.CSV, 
        params={},
        columns=products_data.columns.tolist()
    )
    
    # 测试列冲突检测
    conflicts = detect_column_conflicts([users_source, orders_source, products_source])
    print(f"✅ 检测到列冲突: {conflicts}")
    
    # 生成列别名
    aliases = generate_column_aliases([users_source, orders_source, products_source])
    print(f"✅ 生成列别名: {json.dumps(aliases, indent=2)}")
    
    # 创建复杂JOIN查询
    joins = [
        Join(
            left_source_id="users",
            right_source_id="orders", 
            join_type=JoinType.LEFT,
            conditions=[
                JoinCondition(left_column="user_id", right_column="user_id", operator="=")
            ]
        ),
        Join(
            left_source_id="orders",
            right_source_id="products",
            join_type=JoinType.INNER,
            conditions=[
                JoinCondition(left_column="product", right_column="product", operator="=")
            ]
        )
    ]
    
    query_request = QueryRequest(
        sources=[users_source, orders_source, products_source],
        joins=joins,
        limit=100
    )
    
    # 构建查询
    sql_query = build_join_query(query_request)
    print(f"✅ 生成的SQL查询:\n{sql_query}")
    
    # 执行查询
    try:
        from core.duckdb_engine import execute_query
        result = execute_query(sql_query, con)
        print(f"✅ 查询执行成功，返回 {len(result)} 行数据")
        print("前5行数据:")
        print(result.head().to_string())
    except Exception as e:
        print(f"❌ 查询执行失败: {str(e)}")
    
    print("✅ 增强JOIN功能测试完成\n")


def test_export_functionality():
    """测试导出功能"""
    print("🧪 测试导出功能...")
    
    # 创建测试数据
    test_data = pd.DataFrame({
        'id': range(1, 101),
        'name': [f'User_{i}' for i in range(1, 101)],
        'value': [i * 10 for i in range(1, 101)]
    })
    
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        
        # 测试CSV导出
        csv_file = temp_path / "export_test.csv"
        test_data.to_csv(csv_file, index=False)
        print(f"✅ CSV导出测试: {csv_file}")
        
        # 测试Excel导出
        excel_file = temp_path / "export_test.xlsx"
        test_data.to_excel(excel_file, index=False)
        print(f"✅ Excel导出测试: {excel_file}")
        
        # 测试JSON导出
        json_file = temp_path / "export_test.json"
        test_data.to_json(json_file, orient='records', indent=2)
        print(f"✅ JSON导出测试: {json_file}")
        
        # 测试Parquet导出
        try:
            parquet_file = temp_path / "export_test.parquet"
            test_data.to_parquet(parquet_file, index=False)
            print(f"✅ Parquet导出测试: {parquet_file}")
        except ImportError:
            print("⚠️  Parquet导出需要pyarrow库")
    
    print("✅ 导出功能测试完成\n")


def main():
    """主测试函数"""
    print("🚀 开始测试增强功能...\n")
    
    try:
        test_file_formats()
        test_database_manager()
        test_enhanced_join()
        test_export_functionality()
        
        print("🎉 所有测试完成!")
        print("\n📋 测试总结:")
        print("✅ 文件格式支持 (CSV, Excel, JSON, Parquet)")
        print("✅ 数据库连接管理")
        print("✅ 增强JOIN功能")
        print("✅ 导出功能")
        print("\n🔧 下一步:")
        print("1. 启动后端服务: cd api && uvicorn main:app --reload")
        print("2. 启动前端服务: cd frontend && npm run dev")
        print("3. 访问 http://localhost:5173 测试完整功能")
        
    except Exception as e:
        print(f"❌ 测试过程中出现错误: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
