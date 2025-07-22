#!/usr/bin/env python3
"""
测试 full outer join 问题
"""

import requests
import json

def test_full_outer_join():
    """测试用户的 full outer join 查询"""
    
    # 用户提供的查询请求
    query_request = {
        "sources": [
            {
                "id": "0711",
                "type": "file",
                "params": {
                    "path": "temp_files/0711.xlsx"
                }
            },
            {
                "id": "0702",
                "type": "file",
                "params": {
                    "path": "temp_files/0702.xlsx"
                }
            },
            {
                "id": "sorder",
                "type": "mysql",
                "params": {
                    "host": "rr-2ze4ks6ww80gpae5z723.mysql.rds.aliyuncs.com",
                    "port": 3306,
                    "user": "dataread",
                    "password": "GQgx7jbP",
                    "database": "store_order",
                    "query": "SELECT * FROM dy_order limit 10"
                }
            }
        ],
        "joins": [
            {
                "left_source_id": "0711",
                "right_source_id": "sorder",
                "join_type": "outer",
                "conditions": [
                    {
                        "left_column": "uid",
                        "right_column": "buyer_id",
                        "operator": "="
                    }
                ]
            }
        ]
    }
    
    print("🔍 测试 Full Outer Join 查询")
    print("=" * 50)
    
    # 1. 首先检查各个数据源的数据
    print("1. 检查数据源状态:")
    
    # 检查文件列表
    try:
        files_response = requests.get("http://localhost:8000/api/list_files")
        files = files_response.json()
        print(f"   可用文件: {files}")
    except Exception as e:
        print(f"   获取文件列表失败: {e}")
    
    # 检查DuckDB表
    try:
        tables_response = requests.get("http://localhost:8000/api/available_tables")
        tables_data = tables_response.json()
        print(f"   DuckDB表: {tables_data}")
    except Exception as e:
        print(f"   获取表列表失败: {e}")
    
    print()
    
    # 2. 测试简化的查询（只查询单个数据源）
    print("2. 测试单个数据源:")
    
    # 测试0711文件
    simple_0711_request = {
        "sources": [query_request["sources"][0]],
        "joins": []
    }
    
    try:
        response = requests.post(
            "http://localhost:8000/api/query_proxy",
            json=simple_0711_request,
            timeout=30
        )
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ 0711文件查询成功: {len(result.get('data', []))} 行")
            if result.get('columns'):
                print(f"      列名: {result['columns'][:5]}...")  # 只显示前5列
        else:
            print(f"   ❌ 0711文件查询失败: {response.status_code}")
            print(f"      错误: {response.text[:200]}")
    except Exception as e:
        print(f"   ❌ 0711文件查询异常: {e}")
    
    # 测试MySQL数据源
    simple_mysql_request = {
        "sources": [query_request["sources"][2]],
        "joins": []
    }
    
    try:
        response = requests.post(
            "http://localhost:8000/api/query_proxy",
            json=simple_mysql_request,
            timeout=30
        )
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ MySQL查询成功: {len(result.get('data', []))} 行")
            if result.get('columns'):
                print(f"      列名: {result['columns'][:5]}...")  # 只显示前5列
        else:
            print(f"   ❌ MySQL查询失败: {response.status_code}")
            print(f"      错误: {response.text[:200]}")
    except Exception as e:
        print(f"   ❌ MySQL查询异常: {e}")
    
    print()
    
    # 3. 测试原始的 full outer join 查询
    print("3. 测试 Full Outer Join:")
    
    try:
        response = requests.post(
            "http://localhost:8000/api/query_proxy",
            json=query_request,
            timeout=60
        )
        
        print(f"   状态码: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            data_count = len(result.get('data', []))
            columns = result.get('columns', [])
            
            print(f"   ✅ Full Outer Join 查询成功!")
            print(f"      返回行数: {data_count}")
            print(f"      列数: {len(columns)}")
            
            if columns:
                print(f"      列名: {columns}")
            
            if data_count == 0:
                print("   ⚠️  警告: 查询成功但返回0行数据")
                print("      可能原因:")
                print("      - JOIN条件不匹配")
                print("      - 数据类型不兼容")
                print("      - 数据源为空")
            else:
                print(f"      前3行数据预览:")
                for i, row in enumerate(result.get('data', [])[:3]):
                    print(f"        行{i+1}: {row[:5]}...")  # 只显示前5列
                    
        else:
            print(f"   ❌ Full Outer Join 查询失败")
            print(f"      错误详情: {response.text}")
            
    except Exception as e:
        print(f"   ❌ Full Outer Join 查询异常: {e}")
    
    print()
    
    # 4. 测试简化的 inner join（用于对比）
    print("4. 测试 Inner Join (对比):")
    
    inner_join_request = query_request.copy()
    inner_join_request["joins"][0]["join_type"] = "inner"
    
    try:
        response = requests.post(
            "http://localhost:8000/api/query_proxy",
            json=inner_join_request,
            timeout=60
        )
        
        if response.status_code == 200:
            result = response.json()
            data_count = len(result.get('data', []))
            print(f"   ✅ Inner Join 查询成功: {data_count} 行")
            
            if data_count > 0:
                print("   💡 Inner Join 有数据，说明数据源连接正常")
            else:
                print("   ⚠️  Inner Join 也返回0行，说明JOIN条件可能不匹配")
                
        else:
            print(f"   ❌ Inner Join 查询失败: {response.status_code}")
            
    except Exception as e:
        print(f"   ❌ Inner Join 查询异常: {e}")
    
    print()
    print("=" * 50)
    print("测试完成！")

if __name__ == "__main__":
    test_full_outer_join()
