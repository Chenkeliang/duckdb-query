#!/usr/bin/env python3
"""
测试时区修复的脚本
验证所有时间字段都使用统一的时区配置
"""

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "api"))

from core.timezone_utils import get_current_time, get_current_time_iso
from datetime import datetime
import pytz


def test_timezone_consistency():
    """测试时区一致性"""
    print("=== 时区一致性测试 ===")

    # 获取当前时间
    current_time = get_current_time()
    current_time_iso = get_current_time_iso()

    print(f"当前时间 (datetime): {current_time}")
    print(f"当前时间 (ISO): {current_time_iso}")
    print(f"时区信息: {current_time.tzinfo}")

    # 验证时区是否为 Asia/Shanghai
    if current_time.tzinfo and str(current_time.tzinfo) == "Asia/Shanghai":
        print("✅ 时区配置正确: Asia/Shanghai")
    else:
        print("❌ 时区配置错误")
        print(f"期望: Asia/Shanghai, 实际: {current_time.tzinfo}")

    # 验证时间格式
    print(f"\n时间格式验证:")
    print(f"ISO 格式: {current_time.isoformat()}")
    print(f"显示格式: {current_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")

    # 对比本地时间
    local_time = datetime.now()
    print(f"\n对比本地时间:")
    print(f"本地时间: {local_time}")
    print(f"应用时间: {current_time}")

    if current_time.tzinfo:
        print("✅ 应用时间包含时区信息")
    else:
        print("❌ 应用时间缺少时区信息")


def test_timezone_parsing():
    """测试时间解析"""
    print("\n=== 时间解析测试 ===")

    from core.timezone_utils import parse_datetime_string

    # 测试不同的时间格式
    test_times = [
        "2025-09-01T14:33:33.395743+08:00",
        "2025-09-01 06:33:54.414577",
        "2025-08-29T05:28:47.740928",
        "2025-08-26 09:12:57.733046",
    ]

    for time_str in test_times:
        try:
            parsed_time = parse_datetime_string(time_str)
            print(f"✅ 解析成功: {time_str} -> {parsed_time}")
            if parsed_time.tzinfo:
                print(f"   时区: {parsed_time.tzinfo}")
            else:
                print(f"   时区: 无 (将使用应用默认时区)")
        except Exception as e:
            print(f"❌ 解析失败: {time_str} -> {e}")


def test_timezone_config():
    """测试时区配置"""
    print("\n=== 时区配置测试 ===")

    try:
        from core.config_manager import config_manager

        app_config = config_manager.get_app_config()
        timezone_name = app_config.timezone
        print(f"配置文件时区: {timezone_name}")

        # 验证时区是否有效
        try:
            import pytz

            pytz.timezone(timezone_name)
            print(f"✅ 时区 {timezone_name} 有效")
        except Exception as e:
            print(f"❌ 时区 {timezone_name} 无效: {e}")

    except Exception as e:
        print(f"❌ 无法读取时区配置: {e}")


if __name__ == "__main__":
    print("开始测试时区修复...")

    try:
        test_timezone_consistency()
        test_timezone_parsing()
        test_timezone_config()

        print("\n=== 测试完成 ===")
        print("如果所有测试都通过，说明时区修复成功！")

    except Exception as e:
        print(f"测试过程中出现错误: {e}")
        import traceback

        traceback.print_exc()
