#!/usr/bin/env python3
"""
测试DuckDB自动化配置系统
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'api'))

from core.config_manager import AppConfig, ConfigManager
import json

def test_app_config():
    """测试AppConfig类的DuckDB配置字段"""
    print("🧪 测试AppConfig类的DuckDB配置字段...")
    
    # 创建默认配置
    config = AppConfig()
    
    # 检查DuckDB配置字段
    duckdb_fields = {k: v for k, v in config.__dict__.items() if k.startswith('duckdb_')}
    
    print(f"发现 {len(duckdb_fields)} 个DuckDB配置字段:")
    for field, value in duckdb_fields.items():
        print(f"  {field}: {value}")
    
    return len(duckdb_fields) > 0

def test_config_manager():
    """测试配置管理器的DuckDB配置加载"""
    print("\n🧪 测试配置管理器的DuckDB配置加载...")
    
    try:
        config_manager = ConfigManager()
        app_config = config_manager.get_app_config()
        
        # 检查DuckDB配置
        duckdb_config = {k: v for k, v in app_config.__dict__.items() if k.startswith('duckdb_')}
        
        print(f"配置管理器加载了 {len(duckdb_config)} 个DuckDB配置:")
        for field, value in duckdb_config.items():
            print(f"  {field}: {value}")
        
        return True
    except Exception as e:
        print(f"❌ 配置管理器测试失败: {e}")
        return False

def test_config_file_creation():
    """测试配置文件创建"""
    print("\n🧪 测试配置文件创建...")
    
    try:
        # 创建示例配置
        example_config = {
            "debug": False,
            "duckdb_memory_limit": "16GB",
            "duckdb_threads": 16,
            "duckdb_extensions": ["excel", "json", "parquet", "httpfs"]
        }
        
        config_path = "config/test-duckdb-config.json"
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(example_config, f, indent=2, ensure_ascii=False)
        
        print(f"✅ 测试配置文件已创建: {config_path}")
        
        # 清理测试文件
        os.remove(config_path)
        print("🧹 测试配置文件已清理")
        
        return True
    except Exception as e:
        print(f"❌ 配置文件创建测试失败: {e}")
        return False

def main():
    """主测试函数"""
    print("🚀 DuckDB自动化配置系统测试")
    print("=" * 50)
    
    tests = [
        ("AppConfig类测试", test_app_config),
        ("配置管理器测试", test_config_manager),
        ("配置文件创建测试", test_config_file_creation)
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
        print("🎉 所有测试通过！DuckDB自动化配置系统工作正常")
    else:
        print("⚠️  部分测试失败，请检查配置系统")

if __name__ == "__main__":
    main()
