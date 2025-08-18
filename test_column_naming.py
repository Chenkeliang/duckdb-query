#!/usr/bin/env python3
"""
测试改进的列名生成逻辑
"""

import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'api'))

from core.duckdb_engine import generate_improved_column_aliases, generate_table_identifiers, simplify_table_name
from models.query_models import DataSource

def test_simplify_table_name():
    """测试表名简化函数"""
    print("测试表名简化函数...")
    
    test_cases = [
        ("users", "users"),
        ("very_long_table_name", "very_long_"),
        ("123table", "t_123table"),
        ("special@#table", "special__ta"),
        ("", "tbl"),
        ("a", "tbl"),
    ]
    
    for input_name, expected in test_cases:
        result = simplify_table_name(input_name)
        print(f"  {input_name} -> {result} (expected: {expected})")
        assert len(result) >= 2, f"简化后的名称太短: {result}"


def test_generate_table_identifiers():
    """测试表标识符生成函数"""
    print("\n测试表标识符生成函数...")
    
    # 创建测试数据源
    sources = [
        DataSource(id="users", name="users", type="duckdb", columns=["id", "username", "email"]),
        DataSource(id="orders", name="orders", type="duckdb", columns=["id", "user_id", "order_date"]),
        DataSource(id="products", name="products", type="duckdb", columns=["id", "name", "price"]),
    ]
    
    identifiers = generate_table_identifiers(sources)
    print(f"  生成的表标识符: {identifiers}")
    
    # 验证标识符唯一性
    unique_identifiers = set(identifiers.values())
    assert len(unique_identifiers) == len(identifiers), "表标识符不唯一"


def test_generate_improved_column_aliases():
    """测试改进的列别名生成函数"""
    print("\n测试改进的列别名生成函数...")
    
    # 创建测试数据源（有同名列）
    sources = [
        DataSource(id="users", name="users", type="duckdb", columns=["id", "username", "email"]),
        DataSource(id="orders", name="orders", type="duckdb", columns=["id", "user_id", "order_date"]),
        DataSource(id="products", name="products", type="duckdb", columns=["id", "name", "price"]),
    ]
    
    aliases = generate_improved_column_aliases(sources)
    print(f"  生成的列别名: {aliases}")
    
    # 验证同名列是否正确处理
    users_aliases = aliases["users"]
    orders_aliases = aliases["orders"]
    products_aliases = aliases["products"]
    
    # 检查id列是否被重命名
    assert users_aliases["id"] != "id", "users表的id列应该被重命名"
    assert orders_aliases["id"] != "id", "orders表的id列应该被重命名"
    assert products_aliases["id"] != "id", "products表的id列应该被重命名"
    
    # 检查非同名列是否保持原名
    assert users_aliases["username"] == "username", "非同名列应该保持原名"
    assert orders_aliases["order_date"] == "order_date", "非同名列应该保持原名"
    assert products_aliases["price"] == "price", "非同名列应该保持原名"
    
    print("  所有测试通过！")


if __name__ == "__main__":
    test_simplify_table_name()
    test_generate_table_identifiers()
    test_generate_improved_column_aliases()
    print("\n所有测试完成！")