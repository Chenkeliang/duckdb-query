#!/usr/bin/env python3
"""
测试连接状态和连接测试
检查为什么连接状态是inactive
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), "api"))

def test_connection_status():
    """测试连接状态"""
    print("🧪 测试连接状态...")
    
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
                    
            except Exception as e:
                print(f"  - 测试异常: {e}")
        
        return True
        
    except Exception as e:
        print(f"❌ 测试连接状态失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_connection_activation():
    """测试连接激活"""
    print("\n🧪 测试连接激活...")
    
    try:
        from core.database_manager import db_manager
        
        # 确保配置已加载
        if not db_manager._config_loaded:
            db_manager._load_connections_from_config()
        
        connections = db_manager.list_connections()
        if not connections:
            print("❌ 没有找到连接")
            return False
        
        # 选择第一个连接进行测试
        conn = connections[0]
        print(f"🔄 尝试激活连接: {conn.id}")
        
        # 尝试添加连接（会测试连接）
        success = db_manager.add_connection(conn, test_connection=True)
        
        if success:
            print(f"✅ 连接激活成功: {conn.id}")
            print(f"  - 状态: {conn.status}")
            print(f"  - 引擎: {'✅ 已创建' if conn.id in db_manager.engines else '❌ 未创建'}")
        else:
            print(f"❌ 连接激活失败: {conn.id}")
            print(f"  - 状态: {conn.status}")
        
        return success
        
    except Exception as e:
        print(f"❌ 测试连接激活失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """主测试函数"""
    print("🚀 连接状态和激活测试")
    print("=" * 50)
    
    tests = [
        ("连接状态测试", test_connection_status),
        ("连接激活测试", test_connection_activation)
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
