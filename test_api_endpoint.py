#!/usr/bin/env python3
"""
测试后端API端点
验证/api/database_connections是否正常工作
"""

import sys
import os
import requests
import json


def test_api_endpoint():
    """测试API端点"""
    print("🧪 测试后端API端点...")

    try:
        # 测试本地API
        base_url = "http://localhost:8000"

        # 测试数据库连接列表API
        print(f"📡 测试 {base_url}/api/database_connections")
        response = requests.get(f"{base_url}/api/database_connections", timeout=10)

        print(f"✅ 状态码: {response.status_code}")
        print(f"✅ 响应头: {dict(response.headers)}")

        if response.status_code == 200:
            data = response.json()
            print(f"✅ 响应数据: {json.dumps(data, indent=2, ensure_ascii=False)}")

            if data.get("success") and "connections" in data:
                connections = data["connections"]
                print(f"✅ 找到 {len(connections)} 个数据库连接")

                for conn in connections:
                    print(
                        f"  - {conn.get('id')}: {conn.get('name')} ({conn.get('type')})"
                    )

                return True
            else:
                print("❌ 响应格式不正确")
                return False
        else:
            print(f"❌ API请求失败: {response.text}")
            return False

    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到后端API，请确保后端服务正在运行")
        return False
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        return False


def test_config_files():
    """测试配置文件"""
    print("\n🧪 检查配置文件...")

    config_files = [
        "config/datasources.json",
        "config/mysql-configs.json",
        "config/app-config.json",
    ]

    for config_file in config_files:
        if os.path.exists(config_file):
            try:
                with open(config_file, "r", encoding="utf-8") as f:
                    config_data = json.load(f)

                if "database_sources" in config_data:
                    sources = config_data["database_sources"]
                    print(f"✅ {config_file}: {len(sources)} 个数据库源")
                    for source in sources:
                        print(
                            f"  - {source.get('id')}: {source.get('name')} ({source.get('type')})"
                        )
                elif "mysql_configs" in config_data:
                    configs = config_data["mysql_configs"]
                    print(f"✅ {config_file}: {len(configs)} 个MySQL配置")
                else:
                    print(f"⚠️  {config_file}: 未知格式")

            except Exception as e:
                print(f"❌ {config_file}: 读取失败 - {e}")
        else:
            print(f"❌ {config_file}: 文件不存在")


def main():
    """主测试函数"""
    print("🚀 后端API端点测试")
    print("=" * 50)

    # 检查配置文件
    test_config_files()

    # 测试API端点
    if test_api_endpoint():
        print("\n🎉 API端点测试通过！")
    else:
        print("\n⚠️  API端点测试失败，请检查后端服务")


if __name__ == "__main__":
    main()
