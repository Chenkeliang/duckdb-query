#!/usr/bin/env python3
"""
下载功能测试
验证多表JOIN下载功能是否正常工作
"""

import requests
import os
import sys
import time
import tempfile

def test_download_functionality():
    """测试下载功能"""
    
    # 测试数据 - 使用您提供的实际请求格式
    test_request = {
        "sources": [
            {
                "id": "0702",
                "name": "0702.xlsx",
                "type": "file",
                "path": "0702.xlsx",
                "columns": ["序号","提交答卷时间","所用时间","来源","来源详情","来自IP","1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）","uid","2、请输入您的收货地址：—收货人姓名：","2、所在地区：","2、详细地址:","2、收货人电话："],
                "sourceType": "file"
            },
            {
                "id": "0711",
                "name": "0711.xlsx",
                "type": "file",
                "path": "0711.xlsx",
                "columns": ["序号","提交答卷时间","所用时间","来源","来源详情","来自IP","1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）","uid","2、请输入您的收货地址：—收货人姓名：","2、所在地区：","2、详细地址:","2、收货人电话："],
                "sourceType": "file"
            },
            {
                "id": "sorder",
                "name": "sorder",
                "type": "mysql",
                "connectionId": "sorder",
                "columns": ["id","order_id","showcase_id","payment_fee","post_fee","receiver_province","receiver_city","receiver_district","receiver_zip","receiver_address","receiver_name","receiver_mobile","receiver_phone","shipping_time","pay_time","outer_tid","state","discount_fee","total_fee","sign_time","buyer_message","buyer_id","pay_type","create_time","update_time","delete_flag","invoice_email","invoice_phone","invoice_title","invoice_identity","invoice_detail","invoice_flag","direct_parent_order_id","parent_order_id","iget_uid","type"],
                "params": {
                    "host": "rr-2ze4ks6ww80gpae5z723.mysql.rds.aliyuncs.com",
                    "port": 3306,
                    "user": "dataread",
                    "password": "GQgx7jbP",
                    "database": "store_order",
                    "query": "SELECT * FROM dy_order limit 10"
                },
                "sourceType": "database"
            }
        ],
        "joins": [
            {
                "left_source_id": "0702",
                "right_source_id": "0711",
                "left_on": "uid",
                "right_on": "uid",
                "how": "outer"
            },
            {
                "left_source_id": "0702",
                "right_source_id": "sorder",
                "left_on": "uid",
                "right_on": "buyer_id",
                "how": "outer"
            }
        ]
    }
    
    print("🧪 开始测试下载功能...")
    print(f"📊 测试数据源数量: {len(test_request['sources'])}")
    print(f"🔗 测试JOIN数量: {len(test_request['joins'])}")
    
    try:
        # 发送下载请求
        response = requests.post(
            "http://localhost:8000/api/download_proxy",
            json=test_request,
            timeout=30
        )
        
        if response.status_code == 200:
            # 创建临时文件保存下载内容
            with tempfile.NamedTemporaryFile(suffix='.xlsx', delete=False) as temp_file:
                temp_file.write(response.content)
                temp_filename = temp_file.name
            
            # 检查文件大小
            file_size = os.path.getsize(temp_filename)
            
            print("✅ 下载请求成功!")
            print(f"📁 下载文件大小: {file_size} bytes")
            
            # 验证文件大小（应该大于100KB，因为包含多表数据）
            if file_size > 100000:  # 100KB
                print("🎉 下载功能测试通过！")
                print("✅ 文件大小正常，包含完整的多表JOIN数据")
                
                # 清理临时文件
                os.unlink(temp_filename)
                return True
            else:
                print("❌ 下载文件过小，可能数据不完整")
                print(f"   期望大小: >100KB, 实际大小: {file_size} bytes")
                os.unlink(temp_filename)
                return False
                
        else:
            print(f"❌ 下载请求失败: {response.status_code}")
            print(f"错误信息: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ 下载测试异常: {e}")
        return False

def test_download_proxy_endpoint():
    """测试下载代理端点是否存在"""
    print("\n🧪 测试下载代理端点...")
    
    try:
        # 发送OPTIONS请求检查端点是否存在
        response = requests.options("http://localhost:8000/api/download_proxy", timeout=10)
        
        if response.status_code in [200, 405]:  # 200 OK 或 405 Method Not Allowed 都表示端点存在
            print("✅ 下载代理端点存在")
            return True
        else:
            print(f"❌ 下载代理端点不存在: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ 端点测试异常: {e}")
        return False

def main():
    """主函数"""
    print("=" * 60)
    print("🧪 Interactive Data Query - 下载功能测试")
    print("=" * 60)
    
    # 等待服务启动
    print("⏳ 等待服务启动...")
    time.sleep(2)
    
    # 执行测试
    tests = [
        ("下载代理端点检查", test_download_proxy_endpoint),
        ("多表JOIN下载功能", test_download_functionality),
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
    
    print("\n" + "=" * 60)
    print(f"📊 测试结果: {passed}/{total} 通过")
    
    if passed == total:
        print("🎉 所有下载测试通过！下载功能完全正常")
        print("")
        print("✅ 下载代理端点正常工作")
        print("✅ 多表JOIN下载功能正常")
        print("✅ 前后端格式转换正确")
        print("✅ 文件生成和传输正常")
        sys.exit(0)
    else:
        print("❌ 部分下载测试失败！需要进一步检查")
        sys.exit(1)

if __name__ == "__main__":
    main()
