#!/usr/bin/env python3
"""
重新加密配置文件中的密码
使用新的密钥重新加密所有密码
"""

import sys
import os
import json
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

def reencrypt_passwords():
    """重新加密配置文件中的密码"""
    print("🔐 重新加密配置文件中的密码...")
    
    try:
        from core.encryption import password_encryptor
        
        if not password_encryptor:
            print("❌ 密码加密器初始化失败")
            return False
        
        # 读取新配置文件
        config_file = "config/datasources_new.json"
        if not os.path.exists(config_file):
            print(f"❌ 配置文件不存在: {config_file}")
            return False
        
        with open(config_file, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
        
        print(f"✅ 读取配置文件: {config_file}")
        
        # 重新加密密码
        encrypted_config = {}
        encrypted_config["database_sources"] = []
        
        for source in config_data.get("database_sources", []):
            encrypted_source = source.copy()
            if "params" in encrypted_source and "password" in encrypted_source["params"]:
                password = encrypted_source["params"]["password"]
                if password and password != "********":
                    # 重新加密密码
                    encrypted_password = password_encryptor.encrypt_password(password)
                    encrypted_source["params"]["password"] = encrypted_password
                    print(f"✅ 重新加密密码: {source['id']}")
                else:
                    print(f"⚠️  密码为空或已标记: {source['id']}")
            
            encrypted_config["database_sources"].append(encrypted_source)
        
        # 保存加密后的配置
        output_file = "config/datasources.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(encrypted_config, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 加密后的配置已保存到: {output_file}")
        
        # 验证加密结果
        print("\n🔍 验证加密结果...")
        with open(output_file, 'r', encoding='utf-8') as f:
            final_config = json.load(f)
        
        for source in final_config.get("database_sources", []):
            password = source.get("params", {}).get("password", "")
            if password and password != "********":
                is_encrypted = password_encryptor.is_encrypted(password)
                print(f"  - {source['id']}: {'✅ 已加密' if is_encrypted else '❌ 未加密'}")
        
        return True
        
    except Exception as e:
        print(f"❌ 重新加密密码失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_encrypted_config():
    """测试加密后的配置"""
    print("\n🧪 测试加密后的配置...")
    
    try:
        from core.database_manager import db_manager
        
        # 重新加载配置
        if hasattr(db_manager, '_config_loaded'):
            db_manager._config_loaded = False
        
        # 加载连接
        db_manager._load_connections_from_config()
        
        # 获取连接列表
        connections = db_manager.list_connections()
        print(f"✅ 找到 {len(connections)} 个连接")
        
        for conn in connections:
            print(f"\n📊 连接详情: {conn.id}")
            print(f"  - 名称: {conn.name}")
            print(f"  - 类型: {conn.type}")
            print(f"  - 状态: {conn.status}")
            
            # 测试连接
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
        
        return len(connections) > 0
        
    except Exception as e:
        print(f"❌ 测试加密后的配置失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """主函数"""
    print("🚀 重新加密配置文件中的密码")
    print("=" * 50)
    
    # 重新加密密码
    if reencrypt_passwords():
        print("\n✅ 密码重新加密成功！")
        
        # 测试加密后的配置
        if test_encrypted_config():
            print("\n🎉 配置测试通过！现在应该可以正常连接了")
        else:
            print("\n⚠️  配置测试失败，需要进一步诊断")
    else:
        print("\n❌ 密码重新加密失败")

if __name__ == "__main__":
    main()
