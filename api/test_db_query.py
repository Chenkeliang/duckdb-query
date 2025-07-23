#!/usr/bin/env python3
"""
临时测试脚本：直接测试MySQL数据库查询
"""

import sys
import os
sys.path.append('/app')

from core.database_manager import db_manager

def test_mysql_query():
    """测试MySQL数据库查询"""
    try:
        print("=== 测试MySQL数据库连接 ===")
        
        # 测试SHOW TABLES
        print("1. 执行 SHOW TABLES")
        result_df = db_manager.execute_query("sorder", "SHOW TABLES")
        print(f"结果形状: {result_df.shape}")
        print(f"表列表: {result_df.to_dict('records')}")
        
        # 测试查询dy_order表
        print("\n2. 执行 SELECT * FROM dy_order LIMIT 3")
        result_df = db_manager.execute_query("sorder", "SELECT * FROM dy_order LIMIT 3")
        print(f"结果形状: {result_df.shape}")
        print(f"列名: {list(result_df.columns)}")
        print(f"前3行数据: {result_df.head(3).to_dict('records')}")
        
        return True
        
    except Exception as e:
        print(f"错误: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    test_mysql_query()
