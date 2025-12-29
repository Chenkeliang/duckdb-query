#!/usr/bin/env python3
"""
测试 DuckDB 联邦查询优化
比较不同查询方式的性能和执行计划

用法:
  python scripts/test_federated_query_optimization.py <connection_id> <table_name> <filter_column> <filter_value>
  
示例:
  python scripts/test_federated_query_optimization.py mysql_sorting sorting_info create_time "2025-12-01"
"""

import sys
import os
import time
import argparse

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import duckdb
from core.config_manager import config_manager
from core.database_manager import db_manager
from core.duckdb_engine import build_attach_sql
from core.encryption import password_encryptor


def get_mysql_config(connection_id: str) -> dict:
    """获取 MySQL 连接配置"""
    # 确保连接配置已加载 (list_connections 会触发加载)
    db_manager.list_connections()
    
    connection = db_manager.get_connection(connection_id)
    if not connection:
        raise ValueError(f"连接不存在: {connection_id}")
    
    db_config = connection.params.copy()
    password = db_config.get('password', '')
    if password and password_encryptor and password_encryptor.is_encrypted(password):
        db_config['password'] = password_encryptor.decrypt_password(password)
    
    db_config['type'] = connection.type.value if hasattr(connection.type, 'value') else str(connection.type)
    return db_config


def run_test(connection_id: str, table_name: str, filter_column: str, filter_value: str):
    """运行测试"""
    print("=" * 80)
    print("DuckDB 联邦查询优化测试")
    print("=" * 80)
    print(f"连接 ID: {connection_id}")
    print(f"表名: {table_name}")
    print(f"过滤条件: {filter_column} >= '{filter_value}'")
    
    # 创建 DuckDB 连接
    con = duckdb.connect(':memory:')
    
    # 安装和加载 MySQL 扩展
    print("\n[1] 安装 MySQL 扩展...")
    con.execute("INSTALL mysql")
    con.execute("LOAD mysql")
    print("✓ MySQL 扩展已加载")
    
    # 获取连接配置
    print(f"\n[2] 获取连接配置: {connection_id}")
    try:
        db_config = get_mysql_config(connection_id)
        attach_sql = build_attach_sql('test_db', db_config)
        # 屏蔽密码
        import re
        masked_sql = re.sub(r"password=\S+", "password=***", attach_sql)
        print(f"ATTACH SQL: {masked_sql}")
    except Exception as e:
        print(f"❌ 获取配置失败: {e}")
        return
    
    # 执行 ATTACH
    print("\n[3] 执行 ATTACH...")
    try:
        con.execute(attach_sql)
        print("✓ ATTACH 成功")
    except Exception as e:
        print(f"❌ ATTACH 失败: {e}")
        return
    
    results = {}
    
    # 测试 1: 获取表的行数（不带过滤）
    print("\n" + "=" * 80)
    print("测试 1: 表总行数 (COUNT)")
    print("=" * 80)
    sql = f'SELECT COUNT(*) FROM test_db.{table_name}'
    print(f"SQL: {sql}")
    start = time.time()
    try:
        result = con.execute(sql).fetchone()
        elapsed = time.time() - start
        results['total_count'] = {'rows': result[0], 'time': elapsed}
        print(f"结果: {result[0]:,} 行")
        print(f"耗时: {elapsed:.2f} 秒")
    except Exception as e:
        print(f"❌ 错误: {e}")
    
    # 测试 2: 直接表查询 + WHERE 条件
    print("\n" + "=" * 80)
    print("测试 2: 直接表查询 + WHERE 条件")
    print("=" * 80)
    sql = f"SELECT COUNT(*) FROM test_db.{table_name} WHERE {filter_column} >= '{filter_value}'"
    print(f"SQL: {sql}")
    start = time.time()
    try:
        result = con.execute(sql).fetchone()
        elapsed = time.time() - start
        results['where_filter'] = {'rows': result[0], 'time': elapsed}
        print(f"结果: {result[0]:,} 行")
        print(f"耗时: {elapsed:.2f} 秒")
    except Exception as e:
        print(f"❌ 错误: {e}")
    
    # 测试 2b: EXPLAIN 分析
    print("\n[执行计划]")
    try:
        explain_sql = f"EXPLAIN SELECT * FROM test_db.{table_name} WHERE {filter_column} >= '{filter_value}' LIMIT 100"
        result = con.execute(explain_sql).fetchall()
        for row in result:
            print(f"  {row[0]}")
    except Exception as e:
        print(f"  ❌ EXPLAIN 错误: {e}")
    
    # 测试 3: 使用 mysql_query()
    print("\n" + "=" * 80)
    print("测试 3: 使用 mysql_query() 函数")
    print("=" * 80)
    inner_sql = f"SELECT COUNT(*) as cnt FROM {table_name} WHERE {filter_column} >= '{filter_value}'"
    sql = f"SELECT * FROM mysql_query('test_db', '{inner_sql}')"
    print(f"SQL: {sql}")
    start = time.time()
    try:
        result = con.execute(sql).fetchone()
        elapsed = time.time() - start
        results['mysql_query'] = {'rows': result[0], 'time': elapsed}
        print(f"结果: {result[0]:,} 行")
        print(f"耗时: {elapsed:.2f} 秒")
    except Exception as e:
        print(f"❌ 错误: {e}")
    
    # 测试 4: 子查询方式
    print("\n" + "=" * 80)
    print("测试 4: 子查询方式")
    print("=" * 80)
    sql = f"""
    SELECT COUNT(*) FROM (
        SELECT * FROM test_db.{table_name} 
        WHERE {filter_column} >= '{filter_value}'
    ) subquery
    """
    print(f"SQL: {sql.strip()}")
    start = time.time()
    try:
        result = con.execute(sql).fetchone()
        elapsed = time.time() - start
        results['subquery'] = {'rows': result[0], 'time': elapsed}
        print(f"结果: {result[0]:,} 行")
        print(f"耗时: {elapsed:.2f} 秒")
    except Exception as e:
        print(f"❌ 错误: {e}")
    
    # 汇总
    print("\n" + "=" * 80)
    print("结果汇总")
    print("=" * 80)
    print(f"{'方式':<25} {'行数':<15} {'耗时':<10}")
    print("-" * 50)
    for name, data in results.items():
        print(f"{name:<25} {data['rows']:>12,} {data['time']:>8.2f}s")
    
    # 分析
    if 'total_count' in results and 'where_filter' in results:
        total = results['total_count']['rows']
        filtered = results['where_filter']['rows']
        filter_ratio = (1 - filtered / total) * 100 if total > 0 else 0
        print(f"\n过滤掉了 {filter_ratio:.1f}% 的数据")
        
        if 'mysql_query' in results and 'where_filter' in results:
            speedup = results['where_filter']['time'] / results['mysql_query']['time'] if results['mysql_query']['time'] > 0 else 0
            if speedup > 1.5:
                print(f"⚠️ mysql_query() 比直接查询快 {speedup:.1f}x，说明 WHERE 条件未下推")
            else:
                print(f"✓ WHERE 条件可能已下推（性能差异不大）")
    
    # 清理
    print("\n" + "=" * 80)
    print("清理...")
    con.execute("DETACH test_db")
    con.close()
    print("✓ 测试完成")


def list_connections():
    """列出可用的连接"""
    print("可用的数据库连接:")
    connections = db_manager.list_connections()
    mysql_connections = [c for c in connections if getattr(c, 'type', None) == 'mysql' or str(getattr(c, 'type', '')).lower() == 'mysql']
    for i, conn in enumerate(mysql_connections):
        conn_id = getattr(conn, 'id', 'unknown')
        conn_name = getattr(conn, 'name', 'unknown')
        print(f"  {i+1}. {conn_id} - {conn_name}")
    return mysql_connections


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='测试 DuckDB 联邦查询优化')
    parser.add_argument('connection_id', nargs='?', help='MySQL 连接 ID')
    parser.add_argument('table_name', nargs='?', help='要测试的表名')
    parser.add_argument('filter_column', nargs='?', default='create_time', help='过滤字段名')
    parser.add_argument('filter_value', nargs='?', default='2025-12-01', help='过滤值')
    parser.add_argument('--list', '-l', action='store_true', help='列出可用的连接')
    
    args = parser.parse_args()
    
    if args.list or not args.connection_id:
        connections = list_connections()
        if not args.list:
            print("\n用法: python scripts/test_federated_query_optimization.py <connection_id> <table_name> [filter_column] [filter_value]")
        sys.exit(0)
    
    if not args.table_name:
        print("错误: 必须指定表名")
        sys.exit(1)
    
    run_test(args.connection_id, args.table_name, args.filter_column, args.filter_value)
