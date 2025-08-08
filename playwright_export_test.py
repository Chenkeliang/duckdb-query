#!/usr/bin/env python3
"""
Playwright导出功能测试脚本 (Python版本)
用于测试导出和保存功能的API端点
"""

import requests
import json
import sys
import time
from datetime import datetime


def test_export_api():
    """测试导出API端点"""
    print("📤 测试导出API端点...")

    try:
        # 准备测试数据
        export_data = {
            "data": [
                {"id": "1", "name": "测试数据1", "value": "100"},
                {"id": "2", "name": "测试数据2", "value": "200"},
                {"id": "3", "name": "中文测试", "value": "测试值"},
            ],
            "columns": ["id", "name", "value"],
            "filename": "test_export_" + str(int(time.time())),
        }

        # 发送POST请求到导出端点
        response = requests.post(
            "http://localhost:8000/api/export/quick",
            json=export_data,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )

        print(f"响应状态码: {response.status_code}")
        print(f"响应头: {dict(response.headers)}")

        if response.status_code == 200:
            # 检查响应内容
            content_length = len(response.content)
            print(f"✅ 导出API测试成功！")
            print(f"   - 文件大小: {content_length} bytes")

            # 检查Content-Type
            content_type = response.headers.get("content-type", "")
            if (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                in content_type
            ):
                print(f"   - Content-Type正确: {content_type}")
            else:
                print(f"   - ⚠️ Content-Type可能不正确: {content_type}")

            # 检查Content-Disposition
            content_disposition = response.headers.get("content-disposition", "")
            if content_disposition:
                print(f"   - Content-Disposition: {content_disposition}")
            else:
                print(f"   - ⚠️ 缺少Content-Disposition头")

            # 保存文件用于验证
            filename = f"test_export_{int(time.time())}.xlsx"
            with open(filename, "wb") as f:
                f.write(response.content)
            print(f"   - 测试文件已保存: {filename}")

            return True

        else:
            print(f"❌ 导出API测试失败！")
            print(f"   - 状态码: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   - 错误信息: {error_data}")
            except:
                print(f"   - 响应内容: {response.text[:200]}...")
            return False

    except requests.exceptions.RequestException as e:
        print(f"❌ 导出API请求异常: {e}")
        return False
    except Exception as e:
        print(f"❌ 导出API测试出错: {e}")
        return False


def test_save_api():
    """测试保存API端点"""
    print("💾 测试保存API端点...")

    try:
        # 准备测试数据
        save_data = {
            "sql": "SELECT 1 as test_col, '测试数据' as test_name",
            "datasource": {"id": "test", "type": "duckdb"},
            "table_alias": f"test_table_{int(time.time())}",
        }

        # 发送POST请求到保存端点
        response = requests.post(
            "http://localhost:8000/api/save_query_to_duckdb",
            json=save_data,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )

        print(f"响应状态码: {response.status_code}")

        if response.status_code == 200:
            try:
                result = response.json()
                if result.get("success"):
                    print(f"✅ 保存API测试成功！")
                    print(f"   - 消息: {result.get('message', 'N/A')}")
                    if "table_name" in result:
                        print(f"   - 表名: {result['table_name']}")
                    return True
                else:
                    print(f"❌ 保存API返回失败状态")
                    print(f"   - 消息: {result.get('message', 'N/A')}")
                    return False
            except json.JSONDecodeError:
                print(f"❌ 保存API响应不是有效JSON")
                print(f"   - 响应内容: {response.text[:200]}...")
                return False
        else:
            print(f"❌ 保存API测试失败！")
            print(f"   - 状态码: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   - 错误信息: {error_data}")
            except:
                print(f"   - 响应内容: {response.text[:200]}...")
            return False

    except requests.exceptions.RequestException as e:
        print(f"❌ 保存API请求异常: {e}")
        return False
    except Exception as e:
        print(f"❌ 保存API测试出错: {e}")
        return False


def test_backend_health():
    """测试后端健康状态"""
    print("🔍 检查后端服务状态...")

    try:
        # 测试API文档端点
        response = requests.get("http://localhost:8000/docs", timeout=10)
        if response.status_code == 200:
            print("✅ 后端API服务正常运行")
            return True
        else:
            print(f"⚠️ 后端API响应异常: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ 无法连接到后端服务: {e}")
        return False


def main():
    """主测试函数"""
    print("🎭 开始Python版本的导出功能测试...")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    # 测试结果统计
    results = {}

    # 1. 检查后端健康状态
    results["backend_health"] = test_backend_health()
    print()

    # 2. 测试导出功能
    results["export_api"] = test_export_api()
    print()

    # 3. 测试保存功能
    results["save_api"] = test_save_api()
    print()

    # 总结报告
    print("=" * 50)
    print("🎯 测试总结报告:")
    print(f"   - 后端服务状态: {'✅ 正常' if results['backend_health'] else '❌ 异常'}")
    print(f"   - 导出API功能: {'✅ 正常' if results['export_api'] else '❌ 异常'}")
    print(f"   - 保存API功能: {'✅ 正常' if results['save_api'] else '❌ 异常'}")

    success_count = sum(results.values())
    total_tests = len(results)

    print(
        f"\n📊 测试通过率: {success_count}/{total_tests} ({success_count/total_tests*100:.1f}%)"
    )

    if success_count == total_tests:
        print("🎉 所有测试通过！导出和保存功能正常工作。")
        return 0
    else:
        print("⚠️ 部分测试失败，请检查相关功能。")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
