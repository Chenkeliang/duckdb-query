#!/usr/bin/env python3
"""
简化时区测试
"""
import sys
import os
import json

def test_timezone_simple():
    try:
        # 直接测试配置文件
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "app-config.json")
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        print("=== 简化时区配置测试 ===")
        print(f"配置文件路径: {config_path}")
        print(f"时区配置: {config.get('timezone', '未设置')}")
        
        # 测试时区工具（绕过配置管理器）
        from zoneinfo import ZoneInfo
        from datetime import datetime
        
        timezone_name = config.get('timezone', 'Asia/Shanghai')
        tz = ZoneInfo(timezone_name)
        current_time = datetime.now(tz)
        
        print(f"当前时间: {current_time}")
        print(f"时区信息: {current_time.tzinfo}")
        print(f"格式化显示: {current_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        print(f"ISO 格式: {current_time.isoformat()}")
        
        print("\n✅ 时区配置正常工作！")
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_timezone_simple()
    sys.exit(0 if success else 1)