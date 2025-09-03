#!/usr/bin/env python3
"""
测试配置同步功能
验证config_manager和database_manager的配置是否同步
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

def test_config_sync():
    """测试配置同步功能"""
    print("🧪 测试配置同步功能...")
    
    try:
        from core.config_manager import config_manager
        
        # 重新加载所有配置
        config_manager.load_all_configs()
        
        # 检查MySQL配置
        mysql_configs = config_manager.get_all_mysql_configs()
        print(f"✅ MySQL配置数量: {len(mysql_configs)}")
        for config_id, config in mysql_configs.items():
            print(f"  - {config_id}: {config.name} ({config.type})")
        
        # 检查数据源配置
        datasources = config_manager.get_all_database_sources()
        print(f"✅ 数据源配置数量: {len(datasources)}")
        for source in datasources:
            print(f"  - {source.get('id')}: {source.get('name')} ({source.get('type')})")
        
        # 检查配置文件
        config_file = "config/datasources.json"
        if os.path.exists(config_file):
            import json
            with open(config_file, 'r', encoding='utf-8') as f:
                file_config = json.load(f)
            
            file_sources = file_config.get("database_sources", [])
            print(f"✅ 配置文件中的数据库源数量: {len(file_sources)}")
            for source in file_sources:
                print(f"  - {source.get('id')}: {source.get('name')} ({source.get('type')})")
        
        # 验证同步结果
        if len(mysql_configs) > 0 and len(datasources) > 0:
            print("✅ 配置同步成功！")
            return True
        else:
            print("❌ 配置同步失败，没有找到配置")
            return False
            
    except Exception as e:
        print(f"❌ 测试配置同步失败: {e}")
        return False

def test_database_manager_integration():
    """测试数据库管理器集成"""
    print("\n🧪 测试数据库管理器集成...")
    
    try:
        from core.database_manager import db_manager
        
        # 列出所有连接
        connections = db_manager.list_connections()
        print(f"✅ 数据库管理器连接数量: {len(connections)}")
        
        for conn in connections:
            print(f"  - {conn.id}: {conn.name} ({conn.type}) - 状态: {conn.status}")
        
        if len(connections) > 0:
            print("✅ 数据库管理器集成成功！")
            return True
        else:
            print("❌ 数据库管理器没有找到连接")
            return False
            
    except Exception as e:
        print(f"❌ 测试数据库管理器集成失败: {e}")
        return False

def main():
    """主测试函数"""
    print("🚀 配置同步功能测试")
    print("=" * 50)
    
    tests = [
        ("配置同步测试", test_config_sync),
        ("数据库管理器集成测试", test_database_manager_integration)
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
        print("🎉 所有测试通过！配置同步功能正常")
    else:
        print("⚠️  部分测试失败，配置同步功能需要修复")

if __name__ == "__main__":
    main()
