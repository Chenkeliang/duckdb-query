#!/usr/bin/env python3
"""
多表JOIN功能测试
测试三个数据源的复杂JOIN操作
"""

import requests
import json
import sys
import time

def test_multi_table_join():
    """测试多表JOIN功能"""

    # 测试数据
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
                "right_source_id": "0702",
                "join_type": "outer",
                "conditions": [
                    {
                        "left_column": "uid",
                        "right_column": "uid",
                        "operator": "="
                    }
                ]
            },
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
    
    print("🧪 开始测试多表JOIN功能...")
    print(f"📊 测试数据源数量: {len(test_request['sources'])}")
    print(f"🔗 测试JOIN数量: {len(test_request['joins'])}")
    
    try:
        # 发送请求
        response = requests.post(
            "http://localhost:8000/api/query",
            json=test_request,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            
            print("✅ 请求成功!")
            print(f"📈 返回数据行数: {len(result.get('data', []))}")
            
            # 检查列名
            if result.get('data') and len(result['data']) > 0:
                columns = list(result['data'][0].keys())
                print(f"📋 返回列数: {len(columns)}")
                
                # 检查是否包含三个表的数据
                a_columns = [col for col in columns if col.startswith('A_')]
                b_columns = [col for col in columns if col.startswith('B_')]
                c_columns = [col for col in columns if col.startswith('C_')]

                print(f"🅰️ A表列数 (0711): {len(a_columns)}")
                print(f"🅱️ B表列数 (0702): {len(b_columns)}")
                print(f"🅲 C表列数 (sorder): {len(c_columns)}")

                # 显示前几个列名作为示例
                if a_columns:
                    print(f"   A表示例列: {a_columns[:3]}...")
                if b_columns:
                    print(f"   B表示例列: {b_columns[:3]}...")
                if c_columns:
                    print(f"   C表示例列: {c_columns[:3]}...")

                # 期望的列数
                expected_total = 12 + 12 + 36  # A表12列 + B表12列 + C表36列 = 60列
                actual_total = len(columns)

                print(f"📊 期望总列数: {expected_total}")
                print(f"📊 实际总列数: {actual_total}")

                if len(c_columns) > 0 and actual_total >= expected_total:
                    print("🎉 成功！三个表的数据都已包含在结果中")
                    print("✅ 多表JOIN功能正常工作")
                    return True
                else:
                    print("❌ 失败！多表JOIN功能存在问题")
                    if len(c_columns) == 0:
                        print("   - C表（sorder）的数据未包含在结果中")
                    if actual_total < expected_total:
                        print(f"   - 列数不足，缺少 {expected_total - actual_total} 列")
                    return False
            else:
                print("⚠️ 返回数据为空")
                return False
                
        else:
            print(f"❌ 请求失败: {response.status_code}")
            print(f"错误信息: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 测试异常: {e}")
        return False

def main():
    """主函数"""
    print("=" * 60)
    print("🧪 Interactive Data Query - 多表JOIN测试")
    print("=" * 60)
    
    # 等待服务启动
    print("⏳ 等待服务启动...")
    time.sleep(2)
    
    # 执行测试
    success = test_multi_table_join()
    
    print("=" * 60)
    if success:
        print("🎉 测试通过！多表JOIN功能正常")
        sys.exit(0)
    else:
        print("❌ 测试失败！需要修复多表JOIN功能")
        sys.exit(1)

if __name__ == "__main__":
    main()
