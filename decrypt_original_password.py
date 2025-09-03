#!/usr/bin/env python3
"""
尝试解密原始配置文件中的密码
"""

import sys
import os
import json
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

def decrypt_original_password():
    """尝试解密原始配置文件中的密码"""
    print("🔓 尝试解密原始配置文件中的密码...")
    
    try:
        from core.encryption import password_encryptor
        
        if not password_encryptor:
            print("❌ 密码加密器初始化失败")
            return False
        
        # 读取原始配置文件
        original_config = "config/datasources.json.backup_20250903_175847"
        if not os.path.exists(original_config):
            print(f"❌ 原始配置文件不存在: {original_config}")
            return False
        
        with open(original_config, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
        
        print(f"✅ 读取原始配置文件: {original_config}")
        
        # 尝试解密密码
        for source in config_data.get("database_sources", []):
            if "params" in source and "password" in source["params"]:
                encrypted_password = source["params"]["password"]
                print(f"\n📊 连接: {source['id']}")
                print(f"  - 加密密码: {encrypted_password[:20]}...")
                
                # 检查是否已加密
                is_encrypted = password_encryptor.is_encrypted(encrypted_password)
                print(f"  - 是否已加密: {'✅ 是' if is_encrypted else '❌ 否'}")
                
                if is_encrypted:
                    try:
                        # 尝试解密
                        decrypted_password = password_encryptor.decrypt_password(encrypted_password)
                        print(f"  - 解密结果: {'✅ 成功' if decrypted_password != encrypted_password else '❌ 失败'}")
                        if decrypted_password != encrypted_password:
                            print(f"  - 解密后密码: {decrypted_password}")
                        else:
                            print(f"  - 解密失败，可能是密钥不匹配")
                    except Exception as e:
                        print(f"  - 解密异常: {e}")
                else:
                    print(f"  - 密码未加密，直接使用")
        
        return True
        
    except Exception as e:
        print(f"❌ 解密原始密码失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """主函数"""
    print("🚀 解密原始配置文件中的密码")
    print("=" * 50)
    
    decrypt_original_password()

if __name__ == "__main__":
    main()
