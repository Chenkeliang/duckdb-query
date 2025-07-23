#!/usr/bin/env python3
"""
检查数据库管理器状态
"""

import sys
import os
sys.path.append('/app')

from core.database_manager import db_manager

def check_db_manager():
    """检查数据库管理器状态"""
    try:
        print("=== 检查数据库管理器状态 ===")
        
        # 检查连接列表
        print("1. 检查连接列表")
        connections = db_manager.list_connections()
        print(f"可用连接: {connections}")
        
        # 检查配置文件
        print("\n2. 检查配置文件")
        import json
        try:
            with open('/app/mysql_configs.json', 'r', encoding='utf-8') as f:
                configs = json.load(f)
                print(f"配置文件内容: {configs}")
        except Exception as e:
            print(f"读取配置文件失败: {e}")
        
        # 尝试初始化连接
        print("\n3. 尝试手动初始化连接")
        try:
            db_manager.initialize_connections()
            print("连接初始化完成")
            connections = db_manager.list_connections()
            print(f"初始化后的连接: {connections}")
        except Exception as e:
            print(f"初始化连接失败: {e}")
            import traceback
            traceback.print_exc()
        
        return True
        
    except Exception as e:
        print(f"错误: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    check_db_manager()
