#!/usr/bin/env python3
"""
直接测试database_manager
绕过API层，直接测试核心功能
"""

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "api"))


def test_database_manager_direct():
    """直接测试database_manager"""
    print("🧪 直接测试database_manager...")

    try:
        from core.database_manager import db_manager

        print(f"✅ 数据库管理器实例创建成功")
        print(f"✅ 配置加载状态: {db_manager._config_loaded}")
        print(f"✅ 当前连接数量: {len(db_manager.connections)}")

        # 手动触发配置加载
        print("\n🔄 手动触发配置加载...")
        db_manager._load_connections_from_config()

        print(f"✅ 配置加载后连接数量: {len(db_manager.connections)}")
        print(f"✅ 配置加载状态: {db_manager._config_loaded}")

        # 列出所有连接
        connections = db_manager.list_connections()
        print(f"✅ list_connections() 返回: {len(connections)} 个连接")

        for conn in connections:
            print(f"  - {conn.id}: {conn.name} ({conn.type}) - 状态: {conn.status}")

        # 检查配置文件路径
        config_dir = os.getenv("CONFIG_DIR")
        if config_dir:
            config_path = os.path.join(config_dir, "datasources.json")
        else:
            config_path = os.path.join(
                os.path.dirname(__file__), "config", "datasources.json"
            )

        print(f"\n📁 配置文件路径: {config_path}")
        print(f"📁 文件是否存在: {os.path.exists(config_path)}")

        if os.path.exists(config_path):
            import json

            with open(config_path, "r", encoding="utf-8") as f:
                config_data = json.load(f)

            print(f"📄 配置文件内容:")
            print(json.dumps(config_data, indent=2, ensure_ascii=False))

        return len(connections) > 0

    except Exception as e:
        print(f"❌ 直接测试失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_config_manager_integration():
    """测试config_manager集成"""
    print("\n🧪 测试config_manager集成...")

    try:
        from core.config_manager import config_manager

        # 重新加载所有配置
        config_manager.load_all_configs()

        # 检查MySQL配置
        mysql_configs = config_manager.get_all_mysql_configs()
        print(f"✅ MySQL配置数量: {len(mysql_configs)}")

        # 检查数据源配置
        datasources = config_manager.get_all_database_sources()
        print(f"✅ 数据源配置数量: {len(datasources)}")

        return len(mysql_configs) > 0 and len(datasources) > 0

    except Exception as e:
        print(f"❌ config_manager集成测试失败: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    """主测试函数"""
    print("🚀 直接测试database_manager")
    print("=" * 50)

    tests = [
        ("直接测试database_manager", test_database_manager_direct),
        ("config_manager集成测试", test_config_manager_integration),
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
