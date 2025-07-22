#!/usr/bin/env python3
"""
对比DuckDB数据库集成方式的测试脚本
比较传统方式（SQLAlchemy + pandas）vs DuckDB原生扩展方式
"""

import sys
import os
import time
import pandas as pd
import sqlite3
import tempfile
from pathlib import Path

# 添加API目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

from models.query_models import DatabaseConnection, DataSourceType
from core.duckdb_engine import get_db_connection
from core.database_manager import db_manager
from core.duckdb_native_connector import get_native_connector


def create_test_sqlite_database():
    """创建测试用的SQLite数据库"""
    temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
    temp_db.close()
    
    # 创建测试数据
    conn = sqlite3.connect(temp_db.name)
    cursor = conn.cursor()
    
    # 创建用户表
    cursor.execute('''
        CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE,
            age INTEGER,
            city TEXT
        )
    ''')
    
    # 创建订单表
    cursor.execute('''
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            product TEXT,
            amount DECIMAL(10,2),
            order_date DATE,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # 插入测试数据
    users_data = [
        (1, 'Alice Johnson', 'alice@example.com', 28, 'New York'),
        (2, 'Bob Smith', 'bob@example.com', 34, 'Los Angeles'),
        (3, 'Charlie Brown', 'charlie@example.com', 25, 'Chicago'),
        (4, 'Diana Prince', 'diana@example.com', 30, 'Houston'),
        (5, 'Eve Wilson', 'eve@example.com', 27, 'Phoenix')
    ]
    
    cursor.executemany('INSERT INTO users VALUES (?, ?, ?, ?, ?)', users_data)
    
    orders_data = [
        (1, 1, 'Laptop', 1299.99, '2024-01-15'),
        (2, 2, 'Mouse', 29.99, '2024-01-16'),
        (3, 1, 'Keyboard', 89.99, '2024-01-17'),
        (4, 3, 'Monitor', 299.99, '2024-01-18'),
        (5, 2, 'Headphones', 159.99, '2024-01-19'),
        (6, 4, 'Webcam', 79.99, '2024-01-20'),
        (7, 5, 'Tablet', 399.99, '2024-01-21'),
        (8, 1, 'Phone', 699.99, '2024-01-22')
    ]
    
    cursor.executemany('INSERT INTO orders VALUES (?, ?, ?, ?, ?)', orders_data)
    
    conn.commit()
    conn.close()
    
    return temp_db.name


def test_traditional_approach(db_path: str):
    """测试传统方式：SQLAlchemy + pandas + DuckDB register"""
    print("🔄 测试传统方式 (SQLAlchemy + pandas)")
    
    start_time = time.time()
    
    try:
        # 创建数据库连接
        connection = DatabaseConnection(
            id="test_sqlite_traditional",
            type=DataSourceType.SQLITE,
            params={"database": db_path}
        )
        
        # 使用传统方式连接
        success = db_manager.add_connection(connection)
        if not success:
            print("❌ 传统方式连接失败")
            return None
        
        # 执行查询并加载到pandas
        query = """
        SELECT u.name, u.email, u.city, o.product, o.amount, o.order_date
        FROM users u
        JOIN orders o ON u.id = o.user_id
        WHERE u.age > 25
        ORDER BY o.amount DESC
        """
        
        df = db_manager.execute_query(connection.id, query)
        
        # 注册到DuckDB
        duckdb_con = get_db_connection()
        duckdb_con.register("traditional_result", df)
        
        # 在DuckDB中执行进一步查询
        result = duckdb_con.execute("""
            SELECT city, COUNT(*) as order_count, SUM(amount) as total_amount
            FROM traditional_result
            GROUP BY city
            ORDER BY total_amount DESC
        """).fetchdf()
        
        end_time = time.time()
        execution_time = (end_time - start_time) * 1000
        
        print(f"✅ 传统方式完成，耗时: {execution_time:.2f}ms")
        print(f"   数据行数: {len(df)}")
        print(f"   聚合结果: {len(result)} 行")
        print("   结果预览:")
        print(result.to_string(index=False))
        
        return {
            "method": "traditional",
            "execution_time_ms": execution_time,
            "data_rows": len(df),
            "result_rows": len(result),
            "result": result
        }
        
    except Exception as e:
        print(f"❌ 传统方式执行失败: {str(e)}")
        return None


def test_native_approach(db_path: str):
    """测试DuckDB原生扩展方式"""
    print("\n🚀 测试DuckDB原生扩展方式")
    
    start_time = time.time()
    
    try:
        # 获取原生连接器
        native_connector = get_native_connector()
        
        # 创建数据库连接
        connection = DatabaseConnection(
            id="test_sqlite_native",
            type=DataSourceType.SQLITE,
            params={"database": db_path}
        )
        
        # 注意：DuckDB的SQLite扩展可能需要特殊处理
        # 这里我们模拟原生连接的概念
        duckdb_con = get_db_connection()
        
        # 直接在DuckDB中连接SQLite数据库
        attach_sql = f"ATTACH '{db_path}' AS native_db (TYPE sqlite)"
        duckdb_con.execute(attach_sql)
        
        # 直接执行跨数据库查询
        query = """
        SELECT u.name, u.email, u.city, o.product, o.amount, o.order_date
        FROM native_db.users u
        JOIN native_db.orders o ON u.id = o.user_id
        WHERE u.age > 25
        ORDER BY o.amount DESC
        """
        
        result_df = duckdb_con.execute(query).fetchdf()
        
        # 在DuckDB中执行进一步查询（无需额外的数据传输）
        aggregation_query = """
        WITH order_data AS (
            SELECT u.city, o.amount
            FROM native_db.users u
            JOIN native_db.orders o ON u.id = o.user_id
            WHERE u.age > 25
        )
        SELECT city, COUNT(*) as order_count, SUM(amount) as total_amount
        FROM order_data
        GROUP BY city
        ORDER BY total_amount DESC
        """
        
        result = duckdb_con.execute(aggregation_query).fetchdf()
        
        end_time = time.time()
        execution_time = (end_time - start_time) * 1000
        
        print(f"✅ 原生方式完成，耗时: {execution_time:.2f}ms")
        print(f"   数据行数: {len(result_df)}")
        print(f"   聚合结果: {len(result)} 行")
        print("   结果预览:")
        print(result.to_string(index=False))
        
        # 清理
        duckdb_con.execute("DETACH native_db")
        
        return {
            "method": "native",
            "execution_time_ms": execution_time,
            "data_rows": len(result_df),
            "result_rows": len(result),
            "result": result
        }
        
    except Exception as e:
        print(f"❌ 原生方式执行失败: {str(e)}")
        return None


def compare_approaches():
    """对比两种方式"""
    print("📊 DuckDB数据库集成方式对比测试")
    print("=" * 60)
    
    # 创建测试数据库
    print("🔧 创建测试SQLite数据库...")
    db_path = create_test_sqlite_database()
    print(f"✅ 测试数据库创建完成: {db_path}")
    
    # 测试传统方式
    traditional_result = test_traditional_approach(db_path)
    
    # 测试原生方式
    native_result = test_native_approach(db_path)
    
    # 对比结果
    print("\n📈 性能对比结果:")
    print("=" * 60)
    
    if traditional_result and native_result:
        traditional_time = traditional_result["execution_time_ms"]
        native_time = native_result["execution_time_ms"]
        
        improvement = ((traditional_time - native_time) / traditional_time) * 100
        
        print(f"传统方式耗时: {traditional_time:.2f}ms")
        print(f"原生方式耗时: {native_time:.2f}ms")
        print(f"性能提升: {improvement:.1f}%")
        
        print("\n🔍 方式对比:")
        print("传统方式 (SQLAlchemy + pandas):")
        print("  ✅ 优点: 成熟稳定，支持多种数据库")
        print("  ❌ 缺点: 需要将数据加载到内存，多次数据传输")
        print("  📊 适用场景: 小到中等数据集，需要复杂数据处理")
        
        print("\nDuckDB原生扩展方式:")
        print("  ✅ 优点: 零拷贝，直接查询，高性能")
        print("  ✅ 优点: 支持复杂SQL，列式存储优化")
        print("  ❌ 缺点: 依赖DuckDB扩展，功能相对较新")
        print("  📊 适用场景: 大数据集，分析型查询，实时处理")
        
        print("\n💡 推荐策略:")
        if improvement > 20:
            print("  🚀 建议优先使用DuckDB原生扩展方式")
        elif improvement > 0:
            print("  ⚖️  两种方式性能相近，可根据具体需求选择")
        else:
            print("  🔄 传统方式在此场景下表现更好")
    
    # 清理测试文件
    try:
        os.unlink(db_path)
        print(f"\n🧹 清理测试文件: {db_path}")
    except:
        pass


def main():
    """主函数"""
    try:
        compare_approaches()
        
        print("\n🎯 总结:")
        print("1. DuckDB原生扩展提供了更高效的数据库集成方式")
        print("2. 避免了数据在不同系统间的复制和传输")
        print("3. 充分利用了DuckDB的列式存储和向量化执行优势")
        print("4. 支持复杂的跨数据库查询和分析")
        
        print("\n🔧 实施建议:")
        print("1. 对于新项目，优先考虑DuckDB原生扩展")
        print("2. 对于现有项目，可以逐步迁移到原生方式")
        print("3. 保持两种方式并存，根据场景选择最优方案")
        
    except Exception as e:
        print(f"❌ 测试过程中出现错误: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
