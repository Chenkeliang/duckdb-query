#!/usr/bin/env python3
"""
修复execute_sql端点的临时脚本
"""

import sys
import os
sys.path.append('/app')

import json
from datetime import datetime
from core.database_manager import db_manager
from models.query_models import DatabaseConnection, DataSourceType

def ensure_mysql_connection(datasource_id):
    """确保MySQL连接存在，如果不存在则创建"""
    try:
        # 检查连接是否已存在
        existing_conn = db_manager.get_connection(datasource_id)
        if existing_conn:
            print(f"连接 {datasource_id} 已存在")
            return True
        
        # 读取配置文件
        with open('/app/mysql_configs.json', 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        # 查找对应的配置
        config = None
        for cfg in configs:
            if cfg['id'] == datasource_id:
                config = cfg
                break
        
        if not config:
            print(f"未找到配置: {datasource_id}")
            return False
        
        # 创建连接
        db_connection = DatabaseConnection(
            id=config["id"],
            name=config.get("name", config["id"]),
            type=DataSourceType.MYSQL,
            params=config["params"],
            created_at=datetime.now(),
        )
        
        # 添加连接
        success = db_manager.add_connection(db_connection)
        print(f"创建连接 {datasource_id}: {success}")
        return success
        
    except Exception as e:
        print(f"确保连接失败: {str(e)}")
        return False

def test_mysql_query(datasource_id, sql):
    """测试MySQL查询"""
    try:
        print(f"=== 测试MySQL查询 ===")
        print(f"数据源: {datasource_id}")
        print(f"SQL: {sql}")
        
        # 确保连接存在
        if not ensure_mysql_connection(datasource_id):
            print("连接创建失败")
            return False
        
        # 执行查询
        result_df = db_manager.execute_query(datasource_id, sql)
        print(f"查询成功，结果形状: {result_df.shape}")
        print(f"列名: {list(result_df.columns)}")
        
        if len(result_df) > 0:
            print(f"前3行数据: {result_df.head(3).to_dict('records')}")
        
        return True
        
    except Exception as e:
        print(f"查询失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # 测试用户的查询
    test_mysql_query("sorder", "SELECT * FROM yz_order LIMIT 3")
    print("\n" + "="*50 + "\n")
    test_mysql_query("sorder", "SELECT * FROM dy_order LIMIT 3")
