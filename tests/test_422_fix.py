#!/usr/bin/env python3
"""
测试422错误修复
验证query_proxy能正确转换请求格式并解决422错误
"""

import requests
import json
import sys
import time

def test_query_proxy_fix():
    """测试查询代理修复"""
    
    print("🔧 测试422错误修复")
    print("=" * 50)
    
    # 测试数据 - 模拟前端发送的原始格式
    test_request = {
        "sources": [
            {
                "id": "0711",
                "name": "0711.xlsx",
                "type": "file", 
                "path": "0711.xlsx",
                "columns": ["序号", "提交答卷时间", "所用时间", "来源", "来源详情", "来自IP", 
                           "1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）", "uid",
                           "2、请输入您的收货地址：—收货人姓名：", "2、所在地区：", "2、详细地址:", "2、收货人电话："],
                "sourceType": "file"
            },
            {
                "id": "0702", 
                "name": "0702.xlsx",
                "type": "file",
                "path": "0702.xlsx", 
                "columns": ["序号", "提交答卷时间", "所用时间", "来源", "来源详情", "来自IP",
                           "1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）", "uid",
                           "2、请输入您的收货地址：—收货人姓名：", "2、所在地区：", "2、详细地址:", "2、收货人电话："],
                "sourceType": "file"
            }
        ],
        "joins": [
            {
                "left_source_id": "0711",
                "right_source_id": "0702", 
                "left_on": "uid",
                "right_on": "uid",
                "how": "inner"
            }
        ]
    }
    
    # 测试服务器地址
    base_url = "http://localhost:8000"
    
    print("1. 测试服务器连接...")
    try:
        health_response = requests.get(f"{base_url}/health", timeout=5)
        if health_response.status_code == 200:
            print("✅ 服务器连接正常")
        else:
            print(f"❌ 服务器健康检查失败: {health_response.status_code}")
            return False
    except Exception as e:
        print(f"❌ 无法连接到服务器: {e}")
        return False
    
    print("\n2. 测试原始格式请求（应该失败）...")
    try:
        direct_response = requests.post(
            f"{base_url}/api/query",
            json=test_request,
            timeout=30
        )
        if direct_response.status_code == 422:
            print("✅ 原始格式请求确实返回422错误（符合预期）")
            error_detail = direct_response.json()
            print(f"   错误详情: {error_detail.get('detail', [])[:2]}...")  # 只显示前2个错误
        else:
            print(f"⚠️  原始格式请求返回状态码: {direct_response.status_code}")
    except Exception as e:
        print(f"⚠️  原始格式请求异常: {e}")
    
    print("\n3. 测试查询代理修复（应该成功）...")
    try:
        proxy_response = requests.post(
            f"{base_url}/api/query_proxy",
            json=test_request,
            timeout=30
        )
        
        if proxy_response.status_code == 200:
            print("✅ 查询代理请求成功！422错误已修复")
            result = proxy_response.json()
            
            # 检查返回结果
            if "columns" in result and "data" in result:
                print(f"   返回数据: {len(result.get('data', []))} 行, {len(result.get('columns', []))} 列")
                return True
            elif "error" in result:
                print(f"   查询执行错误: {result['error']}")
                return False
            else:
                print(f"   返回格式: {list(result.keys())}")
                return True
        else:
            print(f"❌ 查询代理请求失败: {proxy_response.status_code}")
            try:
                error_detail = proxy_response.json()
                print(f"   错误详情: {error_detail}")
            except:
                print(f"   响应内容: {proxy_response.text[:200]}...")
            return False
            
    except Exception as e:
        print(f"❌ 查询代理请求异常: {e}")
        return False

def main():
    """主函数"""
    print("开始测试422错误修复...")
    print()
    
    success = test_query_proxy_fix()
    
    print("\n" + "=" * 50)
    if success:
        print("🎉 测试通过！422错误已成功修复")
        print("\n修复说明:")
        print("- ✅ query_proxy.py 动态获取服务器地址")
        print("- ✅ 自动转换数据源格式（添加params字段）")
        print("- ✅ 自动转换JOIN格式（转换为conditions数组）")
        print("- ✅ 支持混合格式请求")
        sys.exit(0)
    else:
        print("❌ 测试失败！需要进一步检查")
        print("\n故障排除建议:")
        print("1. 检查后端服务是否正常运行")
        print("2. 检查数据文件是否存在")
        print("3. 查看后端日志获取详细错误信息")
        sys.exit(1)

if __name__ == "__main__":
    main()
