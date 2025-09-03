#!/usr/bin/env python3
"""
直接测试API路由函数
绕过HTTP层，直接测试路由逻辑
"""

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "api"))


def test_api_route_direct():
    """直接测试API路由函数"""
    print("🧪 直接测试API路由函数...")

    try:
        from routers.data_sources import list_database_connections
        from fastapi import Request

        # 创建一个模拟的Request对象
        class MockRequest:
            def __init__(self):
                self.client = type("MockClient", (), {"host": "127.0.0.1"})()

        mock_request = MockRequest()

        # 直接调用路由函数
        print("🔄 调用list_database_connections路由函数...")
        result = list_database_connections(mock_request)

        print(f"✅ 路由函数返回结果:")
        print(f"  - 类型: {type(result)}")
        print(f"  - 内容: {result}")

        if hasattr(result, "body"):
            print(f"  - 响应体: {result.body}")

        return True

    except Exception as e:
        print(f"❌ 直接测试API路由失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_database_manager_in_api():
    """测试API中的database_manager状态"""
    print("\n🧪 测试API中的database_manager状态...")

    try:
        from routers.data_sources import db_manager

        print(f"✅ API中的db_manager实例:")
        print(f"  - 配置加载状态: {db_manager._config_loaded}")
        print(f"  - 当前连接数量: {len(db_manager.connections)}")

        # 手动触发配置加载
        print("\n🔄 手动触发配置加载...")
        db_manager._load_connections_from_config()

        print(f"✅ 配置加载后:")
        print(f"  - 配置加载状态: {db_manager._config_loaded}")
        print(f"  - 当前连接数量: {len(db_manager.connections)}")

        # 列出所有连接
        connections = db_manager.list_connections()
        print(f"✅ list_connections() 返回: {len(connections)} 个连接")

        for conn in connections:
            print(f"  - {conn.id}: {conn.name} ({conn.type}) - 状态: {conn.status}")

        return len(connections) > 0

    except Exception as e:
        print(f"❌ 测试API中的database_manager失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    """主测试函数"""
    print("🚀 直接测试API路由函数")
    print("=" * 50)

    tests = [
        ("直接测试API路由函数", test_api_route_direct),
        ("测试API中的database_manager", test_database_manager_in_api),
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
