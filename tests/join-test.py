#!/usr/bin/env python3
"""
测试JOIN功能，特别是FULL OUTER JOIN的SQL生成和执行
"""

import requests
import json
import sys

def test_join_sql_generation():
    """测试JOIN的SQL生成"""
    
    # 模拟用户提供的查询请求
    query_request = {
        "sources": [
            {
                "id": "query_result_yz_1000",
                "name": "DuckDB表: query_result_yz_1000",
                "type": "duckdb",
                "table_name": "query_result_yz_1000",
                "columns": ["id","order_id","outer_tid","payment_fee","post_fee","receiver_province","receiver_city","receiver_district","receiver_zip","receiver_address","receiver_name","receiver_mobile","receiver_phone","state","discount_fee","total_fee","buyer_message","buyer_id","pay_time","sign_time","shipping_time","create_time","update_time","delete_flag","showcase_id","supplier_from","supplier_username","distributor_from","distributor_username","fenxiao_id","pay_type","trade_type","transaction_id","buyer_payment","iget_uid","platform","wx_entrance","open_id","broker_code","spm","type"],
                "row_count": 1000,
                "column_count": 41,
                "sourceType": "duckdb",
                "params": {}
            },
            {
                "id": "0702",
                "name": "DuckDB表: 0702",
                "type": "duckdb",
                "table_name": "0702",
                "columns": ["序号","提交答卷时间","所用时间","来源","来源详情","来自IP","1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）","uid","2、请输入您的收货地址：—收货人姓名：","2、所在地区：","2、详细地址:","2、收货人电话："],
                "row_count": 160,
                "column_count": 12,
                "sourceType": "duckdb",
                "params": {}
            }
        ],
        "joins": [
            {
                "left_source_id": "query_result_yz_1000",
                "right_source_id": "0702",
                "join_type": "outer",
                "conditions": [
                    {
                        "left_column": "buyer_id",
                        "right_column": "uid",
                        "operator": "="
                    }
                ]
            }
        ]
    }
    
    print("🧪 测试FULL OUTER JOIN功能...")
    print(f"📊 左表: query_result_yz_1000 ({query_request['sources'][0]['row_count']}条)")
    print(f"📊 右表: 0702 ({query_request['sources'][1]['row_count']}条)")
    print(f"🔗 连接条件: buyer_id = uid")
    print(f"🔗 连接类型: {query_request['joins'][0]['join_type']}")
    
    try:
        # 发送查询请求
        response = requests.post(
            'http://localhost:8000/api/query_proxy',
            json=query_request,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            
            # 检查是否有SQL信息
            if 'sql' in result:
                print(f"\n📝 生成的SQL:")
                print(result['sql'])
            
            # 检查结果
            if 'data' in result:
                row_count = len(result['data'])
                print(f"\n📊 查询结果:")
                print(f"   - 返回行数: {row_count}")
                print(f"   - 列数: {len(result.get('columns', []))}")
                
                # 分析结果
                if row_count == 1000:
                    print("⚠️  警告: 结果行数等于左表行数，可能存在问题")
                    print("   FULL OUTER JOIN应该返回 >= max(1000, 160) = 1000 行")
                    print("   如果有不匹配的记录，应该 > 1000 行")
                elif row_count > 1000:
                    print("✅ 结果看起来正确: 行数大于左表，说明包含了右表的不匹配记录")
                else:
                    print("❌ 结果异常: 行数小于左表行数")
                
                # 显示前几行数据的列名
                if result.get('columns'):
                    print(f"\n📋 列名 (前10个):")
                    for i, col in enumerate(result['columns'][:10]):
                        print(f"   {i+1}. {col}")
                    if len(result['columns']) > 10:
                        print(f"   ... 还有 {len(result['columns']) - 10} 列")
                        
            else:
                print("❌ 响应中没有数据")
                
        else:
            print(f"❌ 请求失败: {response.status_code}")
            print(f"错误信息: {response.text}")
            
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")

def test_individual_table_counts():
    """测试单独查询每个表的行数"""
    
    print("\n🔍 验证单表行数...")
    
    tables = [
        ("query_result_yz_1000", 1000),
        ("0702", 160)
    ]
    
    for table_name, expected_count in tables:
        try:
            query_request = {
                "sources": [
                    {
                        "id": table_name,
                        "type": "duckdb",
                        "sourceType": "duckdb",
                        "params": {}
                    }
                ],
                "joins": []
            }
            
            response = requests.post(
                'http://localhost:8000/api/query_proxy',
                json=query_request,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                actual_count = len(result.get('data', []))
                print(f"   {table_name}: {actual_count} 行 (期望: {expected_count})")
                
                if actual_count != expected_count:
                    print(f"   ⚠️  行数不匹配!")
            else:
                print(f"   ❌ {table_name}: 查询失败 ({response.status_code})")
                
        except Exception as e:
            print(f"   ❌ {table_name}: 错误 - {str(e)}")

if __name__ == "__main__":
    print("🧪 开始JOIN功能测试...\n")
    
    # 测试单表行数
    test_individual_table_counts()
    
    # 测试JOIN功能
    test_join_sql_generation()
    
    print("\n✅ 测试完成!")
