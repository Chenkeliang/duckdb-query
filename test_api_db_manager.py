#!/usr/bin/env python3
"""
检查API路由中的db_manager状态
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "api"))

def test_api_db_manager():
    """检查API路由中的db_manager状态"""
    print("🧪 检查API路由中的db_manager状态...")
    
    try:
        # 导入API路由中的db_manager
        from routers.data_sources import db_manager
        
        print(f"✅ 获取到API路由中的db_manager实例")
        print(f"  - 配置加载状态: {getattr(db_manager, '_config_loaded', 'Unknown')}")
        print(f"  - 当前连接数量: {len(db_manager.connections)}")
        
        # 检查连接详情
        if db_manager.connections:
            for conn_id, conn in db_manager.connections.items():
                print(f"\n📊 连接详情: {conn_id}")
                print(f"  - 名称: {conn.name}")
                print(f"  - 类型: {conn.type}")
                print(f"  - 状态: {conn.status}")
                print(f"  - 状态类型: {type(conn.status)}")
                print(f"  - 状态值: {getattr(conn.status, 'value', 'No value')}")
        
        # 手动触发配置加载
        print(f"\n🔄 手动触发配置加载...")
        db_manager._load_connections_from_config()
        
        print(f"  - 配置加载后连接数量: {len(db_manager.connections)}")
        print(f"  - 配置加载状态: {getattr(db_manager, '_config_loaded', 'Unknown')}")
        
        # 再次检查连接详情
        if db_manager.connections:
            for conn_id, conn in db_manager.connections.items():
                print(f"\n📊 重新加载后连接详情: {conn_id}")
                print(f"  - 名称: {conn.name}")
                print(f"  - 类型: {conn.type}")
                print(f"  - 状态: {conn.status}")
                print(f"  - 状态类型: {type(conn.status)}")
                print(f"  - 状态值: {getattr(conn.status, 'value', 'No value')}")
                
                # 检查是否有对应的引擎
                if conn_id in db_manager.engines:
                    print(f"  - 引擎: ✅ 已创建")
                else:
                    print(f"  - 引擎: ❌ 未创建")
        
        return True
        
    except Exception as e:
        print(f"❌ 检查API路由中的db_manager状态失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_connection_status_update():
    """测试连接状态更新"""
    print("\n🧪 测试连接状态更新...")
    
    try:
        from routers.data_sources import db_manager
        
        # 获取连接列表
        connections = db_manager.list_connections()
        print(f"✅ list_connections() 返回: {len(connections)} 个连接")
        
        for conn in connections:
            print(f"\n📊 连接: {conn.id}")
            print(f"  - 当前状态: {conn.status}")
            
            # 尝试测试连接
            print(f"  - 测试连接...")
            try:
                from models.query_models import ConnectionTestRequest
                test_request = ConnectionTestRequest(type=conn.type, params=conn.params)
                test_result = db_manager.test_connection(test_request)
                
                print(f"  - 测试结果: {'✅ 成功' if test_result.success else '❌ 失败'}")
                if not test_result.success:
                    print(f"  - 错误信息: {test_result.message}")
                else:
                    print(f"  - 延迟: {test_result.latency_ms:.2f}ms")
                    
                # 检查状态是否更新
                print(f"  - 测试后状态: {conn.status}")
                
            except Exception as e:
                print(f"  - 测试异常: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ 测试连接状态更新失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """主函数"""
    print("🚀 检查API路由中的db_manager状态")
    print("=" * 50)
    
    tests = [
        ("检查API路由中的db_manager状态", test_api_db_manager),
        ("测试连接状态更新", test_connection_status_update)
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
