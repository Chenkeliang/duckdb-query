#!/usr/bin/env python3
"""
诊断连接错误
检查为什么MySQL连接测试失败
"""

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "api"))


def test_connection_error():
    """诊断连接错误"""
    print("🧪 诊断连接错误...")

    try:
        from core.database_manager import db_manager

        # 确保配置已加载
        if not db_manager._config_loaded:
            db_manager._load_connections_from_config()

        # 获取连接列表
        connections = db_manager.list_connections()
        print(f"✅ 找到 {len(connections)} 个连接")

        for conn in connections:
            print(f"\n📊 连接详情: {conn.id}")
            print(f"  - 名称: {conn.name}")
            print(f"  - 类型: {conn.type}")
            print(f"  - 状态: {conn.status}")
            print(f"  - 参数: {conn.params}")

            # 检查是否有对应的引擎
            if conn.id in db_manager.engines:
                print(f"  - 引擎: ✅ 已创建")
            else:
                print(f"  - 引擎: ❌ 未创建")

            # 详细测试连接
            print(f"  - 详细测试连接...")
            try:
                from models.query_models import ConnectionTestRequest

                test_request = ConnectionTestRequest(type=conn.type, params=conn.params)
                test_result = db_manager.test_connection(test_request)

                print(
                    f"  - 测试结果: {'✅ 成功' if test_result.success else '❌ 失败'}"
                )
                if not test_result.success:
                    print(f"  - 错误信息: {test_result.message}")
                    print(f"  - 错误类型: {type(test_result.message)}")
                else:
                    print(f"  - 延迟: {test_result.latency_ms:.2f}ms")

            except Exception as e:
                print(f"  - 测试异常: {e}")
                import traceback

                traceback.print_exc()

        return True

    except Exception as e:
        print(f"❌ 诊断连接错误失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_raw_connection():
    """测试原始连接"""
    print("\n🧪 测试原始连接...")

    try:
        import pymysql

        # 从配置文件读取连接参数
        config_file = "config/datasources.json"
        if os.path.exists(config_file):
            import json

            with open(config_file, "r", encoding="utf-8") as f:
                config_data = json.load(f)

            if "database_sources" in config_data and config_data["database_sources"]:
                source = config_data["database_sources"][0]
                params = source["params"]

                print(f"📊 连接参数:")
                print(f"  - 主机: {params.get('host')}")
                print(f"  - 端口: {params.get('port')}")
                print(f"  - 用户: {params.get('user')}")
                print(f"  - 数据库: {params.get('database')}")
                print(f"  - 密码: {'***' if params.get('password') else 'None'}")

                # 尝试原始连接
                print(f"\n🔄 尝试原始连接...")
                try:
                    conn = pymysql.connect(
                        host=params.get("host"),
                        port=params.get("port", 3306),
                        user=params.get("user"),
                        password=params.get("password"),
                        database=params.get("database"),
                        connect_timeout=10,
                    )

                    # 测试连接
                    with conn.cursor() as cursor:
                        cursor.execute("SELECT 1")
                        result = cursor.fetchone()
                        print(f"✅ 原始连接成功: {result}")

                    conn.close()
                    return True

                except Exception as e:
                    print(f"❌ 原始连接失败: {e}")
                    return False
            else:
                print("❌ 配置文件中没有数据库源")
                return False
        else:
            print("❌ 配置文件不存在")
            return False

    except Exception as e:
        print(f"❌ 测试原始连接失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_network_connectivity():
    """测试网络连通性"""
    print("\n🧪 测试网络连通性...")

    try:
        import socket

        # 从配置文件读取主机和端口
        config_file = "config/datasources.json"
        if os.path.exists(config_file):
            import json

            with open(config_file, "r", encoding="utf-8") as f:
                config_data = json.load(f)

            if "database_sources" in config_data and config_data["database_sources"]:
                source = config_data["database_sources"][0]
                params = source["params"]
                host = params.get("host")
                port = params.get("port", 3306)

                print(f"📊 网络测试:")
                print(f"  - 主机: {host}")
                print(f"  - 端口: {port}")

                # 测试TCP连接
                print(f"\n🔄 测试TCP连接...")
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(10)
                    result = sock.connect_ex((host, port))
                    sock.close()

                    if result == 0:
                        print(f"✅ TCP连接成功")
                        return True
                    else:
                        print(f"❌ TCP连接失败，错误码: {result}")
                        return False

                except Exception as e:
                    print(f"❌ TCP连接测试异常: {e}")
                    return False
            else:
                print("❌ 配置文件中没有数据库源")
                return False
        else:
            print("❌ 配置文件不存在")
            return False

    except Exception as e:
        print(f"❌ 测试网络连通性失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    """主测试函数"""
    print("🚀 连接错误诊断")
    print("=" * 50)

    tests = [
        ("连接错误诊断", test_connection_error),
        ("原始连接测试", test_raw_connection),
        ("网络连通性测试", test_network_connectivity),
    ]

    passed = 0
    total = len(tests)

    for test_name, test_func in tests:
        try:
            if test_func():
                print(f"✅ {test_name} 通过")
                passed += 1
            else:
                print(f"❌ {test_name} 失败")
        except Exception as e:
            print(f"❌ {test_name} 异常: {e}")

    print("\n" + "=" * 50)
    print(f"测试结果: {passed}/{total} 通过")

    if passed == total:
        print("🎉 所有测试通过！")
    else:
        print("⚠️  部分测试失败，需要进一步诊断")


if __name__ == "__main__":
    main()
