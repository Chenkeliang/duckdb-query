#!/usr/bin/env python3
"""
数据类型转换问题修复验证脚本
测试字符串统一转换是否解决了JOIN操作中的类型转换错误
"""

import pandas as pd
import sys
import os

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from core.duckdb_engine import get_db_connection, create_persistent_table, safe_encode_string

def test_string_conversion():
    """测试字符串转换功能"""
    print("🧪 测试字符串转换功能...")
    
    # 测试各种类型的数据
    test_values = [
        "WXSP3725056863906171904",  # 长字符串
        123456789,  # 整数
        123.456,  # 浮点数
        True,  # 布尔值
        None,  # 空值
        b'\xd6\xd0\xce\xc4',  # 字节数据（可能有编码问题）
    ]
    
    for value in test_values:
        try:
            result = safe_encode_string(str(value))
            print(f"✅ {type(value).__name__}: {value} -> {result}")
        except Exception as e:
            print(f"❌ {type(value).__name__}: {value} -> 错误: {e}")

def test_dataframe_processing():
    """测试DataFrame预处理功能"""
    print("\n🧪 测试DataFrame预处理功能...")
    
    # 创建包含不同数据类型的测试DataFrame
    df = pd.DataFrame({
        'order_id': ['WXSP3725056863906171904', 'WXSP3725056863906171905', 'WXSP3725056863906171906'],
        'amount': [123.45, 678.90, 999.99],
        'count': [1, 2, 3],
        'is_paid': [True, False, True],
        'description': ['订单1', '订单2', '订单3']
    })
    
    print(f"原始DataFrame类型:")
    print(df.dtypes)
    print(f"原始数据:")
    print(df.head())
    
    # 测试预处理
    from core.duckdb_engine import prepare_dataframe_for_duckdb
    
    try:
        processed_df = prepare_dataframe_for_duckdb(df)
        print(f"\n处理后DataFrame类型:")
        print(processed_df.dtypes)
        print(f"处理后数据:")
        print(processed_df.head())
        print("✅ DataFrame预处理成功")
        return processed_df
    except Exception as e:
        print(f"❌ DataFrame预处理失败: {e}")
        return None

def test_join_compatibility():
    """测试JOIN兼容性"""
    print("\n🧪 测试JOIN兼容性...")
    
    # 创建两个测试表，模拟原来的问题场景
    df1 = pd.DataFrame({
        'order_id': ['WXSP3725056863906171904', 'WXSP3725056863906171905'],
        'customer_name': ['张三', '李四']
    })
    
    df2 = pd.DataFrame({
        '订单号': ['WXSP3725056863906171904', 'WXSP3725056863906171905'],
        '金额': [123.45, 678.90]
    })
    
    con = get_db_connection()
    
    try:
        # 创建持久化表
        success1 = create_persistent_table('test_orders', df1, con)
        success2 = create_persistent_table('test_order_details', df2, con)
        
        if success1 and success2:
            print("✅ 测试表创建成功")
            
            # 尝试执行JOIN查询
            join_query = '''
            SELECT 
                o.order_id,
                o.customer_name,
                d."金额"
            FROM test_orders o
            INNER JOIN test_order_details d ON o.order_id = d."订单号"
            '''
            
            result = con.execute(join_query).fetchdf()
            print(f"✅ JOIN查询成功，结果行数: {len(result)}")
            print(result)
            
        else:
            print("❌ 测试表创建失败")
            
    except Exception as e:
        print(f"❌ JOIN测试失败: {e}")
    finally:
        # 清理测试表
        try:
            con.execute('DROP TABLE IF EXISTS test_orders')
            con.execute('DROP TABLE IF EXISTS test_order_details')
        except:
            pass

def main():
    """主测试函数"""
    print("🚀 开始数据类型转换修复验证")
    print("=" * 50)
    
    # 测试1：字符串转换
    test_string_conversion()
    
    # 测试2：DataFrame预处理
    test_dataframe_processing()
    
    # 测试3：JOIN兼容性
    test_join_compatibility()
    
    print("\n" + "=" * 50)
    print("🎉 测试完成！")

if __name__ == "__main__":
    main()
