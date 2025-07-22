#!/usr/bin/env python3
"""
多表JOIN功能综合测试套件
测试各种JOIN场景和边界情况
"""

import requests
import json
import sys
import time

def test_two_table_join():
    """测试两表JOIN"""
    print("\n🧪 测试两表JOIN...")
    
    test_request = {
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
            }
        ],
        "joins": [
            {
                "left_source_id": "0711",
                "right_source_id": "0702",
                "join_type": "inner",
                "conditions": [
                    {
                        "left_column": "uid",
                        "right_column": "uid",
                        "operator": "="
                    }
                ]
            }
        ]
    }
    
    try:
        response = requests.post(
            "http://localhost:8000/api/query",
            json=test_request,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            columns = list(result['data'][0].keys()) if result.get('data') else []
            
            a_columns = [col for col in columns if col.startswith('A_')]
            b_columns = [col for col in columns if col.startswith('B_')]
            
            print(f"   ✅ 两表JOIN成功: A表{len(a_columns)}列, B表{len(b_columns)}列")
            return len(a_columns) > 0 and len(b_columns) > 0
        else:
            print(f"   ❌ 两表JOIN失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ 两表JOIN异常: {e}")
        return False

def test_three_table_join():
    """测试三表JOIN"""
    print("\n🧪 测试三表JOIN...")
    
    test_request = {
        "sources": [
            {
                "id": "0711",
                "type": "file",
                "params": {
                    "path": "temp_files/0711.xlsx"
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
            },
            {
                "id": "0702",
                "type": "file",
                "params": {
                    "path": "temp_files/0702.xlsx"
                }
            }
        ],
        "joins": [
            {
                "left_source_id": "0711",
                "right_source_id": "sorder",
                "join_type": "left",
                "conditions": [
                    {
                        "left_column": "uid",
                        "right_column": "buyer_id",
                        "operator": "="
                    }
                ]
            },
            {
                "left_source_id": "0711",
                "right_source_id": "0702",
                "join_type": "outer",
                "conditions": [
                    {
                        "left_column": "uid",
                        "right_column": "uid",
                        "operator": "="
                    }
                ]
            }
        ]
    }
    
    try:
        response = requests.post(
            "http://localhost:8000/api/query",
            json=test_request,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            columns = list(result['data'][0].keys()) if result.get('data') else []
            
            a_columns = [col for col in columns if col.startswith('A_')]
            b_columns = [col for col in columns if col.startswith('B_')]
            c_columns = [col for col in columns if col.startswith('C_')]
            
            print(f"   ✅ 三表JOIN成功: A表{len(a_columns)}列, B表{len(b_columns)}列, C表{len(c_columns)}列")
            return len(a_columns) > 0 and len(b_columns) > 0 and len(c_columns) > 0
        else:
            print(f"   ❌ 三表JOIN失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ 三表JOIN异常: {e}")
        return False

def test_single_table():
    """测试单表查询"""
    print("\n🧪 测试单表查询...")
    
    test_request = {
        "sources": [
            {
                "id": "0711",
                "type": "file",
                "params": {
                    "path": "temp_files/0711.xlsx"
                }
            }
        ],
        "joins": []
    }
    
    try:
        response = requests.post(
            "http://localhost:8000/api/query",
            json=test_request,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            print(f"   ✅ 单表查询成功: {len(result.get('data', []))}行")
            return True
        else:
            print(f"   ❌ 单表查询失败: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ 单表查询异常: {e}")
        return False

def main():
    """主函数"""
    print("=" * 70)
    print("🧪 Interactive Data Query - 多表JOIN综合测试套件")
    print("=" * 70)
    
    # 等待服务启动
    print("⏳ 等待服务启动...")
    time.sleep(2)
    
    # 执行测试
    tests = [
        ("单表查询", test_single_table),
        ("两表JOIN", test_two_table_join),
        ("三表JOIN", test_three_table_join),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        print(f"\n📋 执行测试: {test_name}")
        if test_func():
            passed += 1
            print(f"   🎉 {test_name} - 通过")
        else:
            print(f"   ❌ {test_name} - 失败")
    
    print("\n" + "=" * 70)
    print(f"📊 测试结果: {passed}/{total} 通过")
    
    if passed == total:
        print("🎉 所有测试通过！多表JOIN功能完全正常")
        sys.exit(0)
    else:
        print("❌ 部分测试失败！需要进一步检查")
        sys.exit(1)

if __name__ == "__main__":
    main()
