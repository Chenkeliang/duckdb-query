#!/usr/bin/env python3
"""
调试数据库连接问题
"""

import sys
import os
sys.path.append('/app')

import json
from datetime import datetime
from core.database_manager import db_manager
from models.query_models import DatabaseConnection, DataSourceType

def debug_connection():
    """调试数据库连接问题"""
    try:
        print("=== 调试数据库连接问题 ===")
        
        # 1. 检查当前连接状态
        print("1. 当前连接状态")
        connections = db_manager.list_connections()
        print(f"连接数量: {len(connections)}")
        for conn in connections:
            print(f"  - {conn.id}: {conn.status}")
        
        # 2. 读取配置文件
        print("\n2. 读取配置文件")
        with open('/app/mysql_configs.json', 'r', encoding='utf-8') as f:
            configs = json.load(f)
        print(f"配置数量: {len(configs)}")
        
        # 3. 手动添加连接
        print("\n3. 手动添加连接")
        for config in configs:
            print(f"处理配置: {config['id']}")
            
            # 创建DatabaseConnection对象
            db_connection = DatabaseConnection(
                id=config["id"],
                name=config.get("name", config["id"]),
                type=DataSourceType.MYSQL,
                params=config["params"],
                created_at=datetime.now(),
            )
            
            print(f"连接参数: {config['params']}")
            
            # 尝试添加连接
            try:
                success = db_manager.add_connection(db_connection)
                print(f"添加结果: {success}")
                if success:
                    print(f"连接状态: {db_connection.status}")
                else:
                    print(f"连接状态: {db_connection.status}")
            except Exception as e:
                print(f"添加连接异常: {str(e)}")
                import traceback
                traceback.print_exc()
        
        # 4. 再次检查连接状态
        print("\n4. 添加后的连接状态")
        connections = db_manager.list_connections()
        print(f"连接数量: {len(connections)}")
        for conn in connections:
            print(f"  - {conn.id}: {conn.status}")
        
        # 5. 测试查询
        if connections:
            print("\n5. 测试查询")
            try:
                conn_id = connections[0].id
                result_df = db_manager.execute_query(conn_id, "SHOW TABLES")
                print(f"查询成功，结果: {result_df.shape}")
                print(f"表列表: {result_df.to_dict('records')}")
            except Exception as e:
                print(f"查询失败: {str(e)}")
                import traceback
                traceback.print_exc()
        
        return True
        
    except Exception as e:
        print(f"调试过程出错: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    debug_connection()
