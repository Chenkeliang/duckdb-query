#!/usr/bin/env python3
"""
详细检查连接测试过程
"""

import sys
import os
import json
sys.path.append(os.path.join(os.path.dirname(__file__), "api"))

def test_connection_detailed():
    """详细检查连接测试过程"""
    print("🧪 详细检查连接测试过程...")
    
    try:
        from core.database_manager import db_manager
        from models.query_models import ConnectionTestRequest, DataSourceType
        
        # 确保配置已加载
        if not db_manager._config_loaded:
            db_manager._load_connections_from_config()
        
        # 获取连接
        connections = db_manager.list_connections()
        if not connections:
            print("❌ 没有找到连接")
            return False
        
        conn = connections[0]
        print(f"📊 连接: {conn.id}")
        print(f"  - 当前状态: {conn.status}")
        
        # 详细测试连接
        print(f"\n🔄 详细测试连接...")
        
        # 1. 检查参数
        params = conn.params
        print(f"  - 主机: {params.get('host')}")
        print(f"  - 端口: {params.get('port')}")
        print(f"  - 用户: {params.get('user')}")
        print(f"  - 数据库: {params.get('database')}")
        print(f"  - 密码: {'***' if params.get('password') else 'None'}")
        
        # 2. 检查密码是否加密
        password = params.get('password', '')
        from core.encryption import password_encryptor
        is_encrypted = password_encryptor.is_encrypted(password)
        print(f"  - 密码是否加密: {'✅ 是' if is_encrypted else '❌ 否'}")
        
        # 3. 尝试解密密码
        if is_encrypted:
            try:
                decrypted_password = password_encryptor.decrypt_password(password)
                print(f"  - 密码解密: {'✅ 成功' if decrypted_password != password else '❌ 失败'}")
                if decrypted_password != password:
                    print(f"  - 解密后密码: {decrypted_password}")
            except Exception as e:
                print(f"  - 密码解密异常: {e}")
        
        # 4. 创建测试请求
        test_request = ConnectionTestRequest(type=conn.type, params=params)
        print(f"  - 测试请求类型: {test_request.type}")
        
        # 5. 执行连接测试
        print(f"\n🔄 执行连接测试...")
        try:
            test_result = db_manager.test_connection(test_request)
            print(f"  - 测试结果: {'✅ 成功' if test_result.success else '❌ 失败'}")
            if not test_result.success:
                print(f"  - 错误信息: {test_result.message}")
            else:
                print(f"  - 延迟: {test_result.latency_ms:.2f}ms")
                print(f"  - 数据库信息: {test_result.database_info}")
        except Exception as e:
            print(f"  - 测试异常: {e}")
            import traceback
            traceback.print_exc()
        
        # 6. 检查测试后状态
        print(f"\n📊 测试后状态:")
        print(f"  - 连接状态: {conn.status}")
        print(f"  - 引擎状态: {'✅ 已创建' if conn.id in db_manager.engines else '❌ 未创建'}")
        
        return True
        
    except Exception as e:
        print(f"❌ 详细检查连接测试过程失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_raw_connection_with_decrypted_password():
    """使用解密后的密码测试原始连接"""
    print("\n🧪 使用解密后的密码测试原始连接...")
    
    try:
        import pymysql
        from core.encryption import password_encryptor
        
        # 从配置文件读取连接参数
        config_file = "config/datasources.json"
        if os.path.exists(config_file):
            with open(config_file, 'r', encoding='utf-8') as f:
                config_data = json.load(f)
            
            if "database_sources" in config_data and config_data["database_sources"]:
                source = config_data["database_sources"][0]
                params = source["params"]
                
                # 解密密码
                encrypted_password = params.get("password", "")
                if password_encryptor.is_encrypted(encrypted_password):
                    decrypted_password = password_encryptor.decrypt_password(encrypted_password)
                    print(f"✅ 密码解密成功: {decrypted_password}")
                else:
                    decrypted_password = encrypted_password
                    print(f"⚠️  密码未加密，直接使用")
                
                # 尝试原始连接
                print(f"🔄 尝试原始连接...")
                try:
                    conn = pymysql.connect(
                        host=params.get("host"),
                        port=params.get("port", 3306),
                        user=params.get("user"),
                        password=decrypted_password,
                        database=params.get("database"),
                        connect_timeout=10
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

def main():
    """主函数"""
    print("🚀 详细检查连接测试过程")
    print("=" * 50)
    
    tests = [
        ("详细检查连接测试过程", test_connection_detailed),
        ("使用解密后的密码测试原始连接", test_raw_connection_with_decrypted_password)
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
