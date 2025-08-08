#!/usr/bin/env python3
"""
导出功能修复验证脚本
测试download_proxy端点对DuckDB表类型数据源的处理
"""

import requests
import json
import sys
import time
from datetime import datetime


def test_download_proxy_with_duckdb_sources():
    """测试download_proxy端点对DuckDB表类型数据源的处理"""
    print("🔧 测试download_proxy端点对DuckDB表的处理...")

    # 使用你提供的实际前端请求参数
    request_data = {
        "sources": [
            {
                "id": "query_result_08071348_dy",
                "name": "query_result_08071348_dy",
                "sourceType": "duckdb",
                "type": "table",
                "columns": [
                    "id",
                    "order_id",
                    "showcase_id",
                    "payment_fee",
                    "post_fee",
                    "receiver_province",
                    "receiver_city",
                    "receiver_district",
                    "receiver_zip",
                    "receiver_address",
                    "receiver_name",
                    "receiver_mobile",
                    "receiver_phone",
                    "shipping_time",
                    "pay_time",
                    "outer_tid",
                    "state",
                    "discount_fee",
                    "total_fee",
                    "sign_time",
                    "buyer_message",
                    "buyer_id",
                    "pay_type",
                    "create_time",
                    "update_time",
                    "delete_flag",
                    "invoice_email",
                    "invoice_phone",
                    "invoice_title",
                    "invoice_identity",
                    "invoice_detail",
                    "invoice_flag",
                    "direct_parent_order_id",
                    "parent_order_id",
                    "iget_uid",
                    "type",
                ],
                "columnCount": 36,
            },
            {
                "id": "table_17e5d8d9_5888_4104_bd88_e0330c0c9446",
                "name": "table_17e5d8d9_5888_4104_bd88_e0330c0c9446",
                "sourceType": "duckdb",
                "type": "table",
                "columns": [
                    "__source__",
                    "__tag__:__hostname__",
                    "__tag__:__pack_id__",
                    "__time__",
                    "__topic__",
                    "_container_ip_",
                    "_container_name_",
                    "_image_name_",
                    "_pod_name_",
                    "_pod_uid_",
                    "_source_",
                    "_time_",
                    "component_name",
                    "content",
                    "namespace",
                ],
                "columnCount": 15,
            },
        ],
        "joins": [
            {
                "left_source_id": "query_result_08071348_dy",
                "right_source_id": "table_17e5d8d9_5888_4104_bd88_e0330c0c9446",
                "left_on": "pay_time",
                "right_on": "_container_name_",
                "how": "outer",
            }
        ],
    }

    try:
        print(f"📤 发送下载请求到 /api/download_proxy...")
        print(f"📋 请求数据: {json.dumps(request_data, indent=2, ensure_ascii=False)}")

        response = requests.post(
            "http://localhost:8000/api/download_proxy",
            json=request_data,
            headers={"Content-Type": "application/json"},
            timeout=60,
        )

        print(f"🔍 响应状态码: {response.status_code}")
        print(f"🔍 响应头: {dict(response.headers)}")

        if response.status_code == 200:
            # 检查是否是文件下载响应
            content_type = response.headers.get("content-type", "")
            if (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                in content_type
            ):
                content_length = len(response.content)
                print(f"✅ 下载代理测试成功！")
                print(f"   - 文件大小: {content_length} bytes")
                print(f"   - Content-Type: {content_type}")

                # 保存测试文件
                filename = f"download_proxy_test_{int(time.time())}.xlsx"
                with open(filename, "wb") as f:
                    f.write(response.content)
                print(f"   - 测试文件已保存: {filename}")
                return True
            else:
                print(f"⚠️ 响应类型不正确: {content_type}")
                print(f"   响应内容: {response.text[:500]}...")
                return False

        else:
            print(f"❌ 下载代理测试失败！")
            print(f"   - 状态码: {response.status_code}")
            try:
                error_data = response.json()
                print(
                    f"   - 错误信息: {json.dumps(error_data, indent=2, ensure_ascii=False)}"
                )
            except:
                print(f"   - 响应内容: {response.text[:500]}...")
            return False

    except requests.exceptions.RequestException as e:
        print(f"❌ 请求异常: {e}")
        return False
    except Exception as e:
        print(f"❌ 测试出错: {e}")
        return False


def test_quick_export_api():
    """测试快速导出API（对比测试）"""
    print("📤 测试快速导出API...")

    # 简单的快速导出测试数据
    export_data = {
        "data": [
            {"id": "1", "name": "测试数据1", "value": "100"},
            {"id": "2", "name": "测试数据2", "value": "200"},
            {"id": "3", "name": "中文测试", "value": "测试值"},
        ],
        "columns": ["id", "name", "value"],
        "filename": f"quick_export_test_{int(time.time())}",
    }

    try:
        response = requests.post(
            "http://localhost:8000/api/export/quick",
            json=export_data,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )

        print(f"响应状态码: {response.status_code}")

        if response.status_code == 200:
            content_length = len(response.content)
            print(f"✅ 快速导出API测试成功！")
            print(f"   - 文件大小: {content_length} bytes")

            # 保存测试文件
            filename = f"quick_export_test_{int(time.time())}.xlsx"
            with open(filename, "wb") as f:
                f.write(response.content)
            print(f"   - 测试文件已保存: {filename}")
            return True
        else:
            print(f"❌ 快速导出API测试失败: {response.status_code}")
            try:
                error_data = response.json()
                print(f"   - 错误信息: {error_data}")
            except:
                print(f"   - 响应内容: {response.text[:200]}...")
            return False

    except Exception as e:
        print(f"❌ 快速导出API测试失败: {e}")
        return False


def test_backend_health():
    """测试后端健康状态"""
    print("🔍 检查后端服务状态...")

    try:
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
    print("🎯 开始导出功能修复验证测试...")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # 测试结果统计
    results = {}

    # 1. 检查后端健康状态
    results["backend_health"] = test_backend_health()
    print()

    # 2. 测试快速导出API（基准测试）
    results["quick_export"] = test_quick_export_api()
    print()

    # 3. 测试download_proxy端点（修复验证）
    results["download_proxy"] = test_download_proxy_with_duckdb_sources()
    print()

    # 总结报告
    print("=" * 60)
    print("🎯 测试总结报告:")
    print(f"   - 后端服务状态: {'✅ 正常' if results['backend_health'] else '❌ 异常'}")
    print(f"   - 快速导出API: {'✅ 正常' if results['quick_export'] else '❌ 异常'}")
    print(f"   - 下载代理API: {'✅ 正常' if results['download_proxy'] else '❌ 异常'}")

    success_count = sum(results.values())
    total_tests = len(results)

    print(
        f"\n📊 测试通过率: {success_count}/{total_tests} ({success_count/total_tests*100:.1f}%)"
    )

    if results["download_proxy"]:
        print(
            "🎉 导出功能修复验证成功！download_proxy端点现在可以正确处理DuckDB表类型的数据源。"
        )
    else:
        print("⚠️ 导出功能仍有问题，需要进一步调试。")

    return 0 if success_count == total_tests else 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
