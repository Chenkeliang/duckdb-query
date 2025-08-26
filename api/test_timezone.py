#!/usr/bin/env python3
"""
测试全局时区配置
"""
import sys
import os

# 添加项目根目录到 Python 路径
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

def test_timezone():
    try:
        from core.timezone_utils import get_current_time, get_current_time_iso, load_timezone_config
        
        print("=== 时区配置测试 ===")
        
        # 测试时区加载
        tz = load_timezone_config()
        print(f"加载的时区: {tz}")
        
        # 测试时间获取
        current_time = get_current_time()
        print(f"当前时间: {current_time}")
        print(f"当前时间 ISO: {get_current_time_iso()}")
        print(f"时区信息: {current_time.tzinfo}")
        print(f"格式化显示: {current_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        
        # 测试配置管理器
        from core.config_manager import config_manager
        app_config = config_manager.get_app_config()
        print(f"配置文件中的时区: {app_config.timezone}")
        
        print("\n✅ 时区配置测试通过！")
        return True
        
    except Exception as e:
        print(f"❌ 时区配置测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_timezone()
    sys.exit(0 if success else 1)