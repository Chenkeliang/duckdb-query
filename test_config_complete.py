#!/usr/bin/env python3
"""
测试DuckDB配置系统是否完全基于配置文件
"""

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "api"))


def test_no_hardcoded_config():
    """测试是否还有硬编码的配置值"""
    print("🧪 检查是否还有硬编码的DuckDB配置...")

    # 检查duckdb_engine.py中的硬编码值
    engine_file = "api/core/duckdb_engine.py"

    hardcoded_patterns = [
        "SET threads=8",
        "SET memory_limit='8GB'",
        "SET enable_profiling=true",
        "SET enable_profiling=false",
        "SET force_index_join=false",
        "SET enable_object_cache=true",
        "SET preserve_insertion_order=false",
        "SET enable_progress_bar=false",
        '["excel", "json", "parquet"]',
    ]

    found_hardcoded = []

    try:
        with open(engine_file, "r", encoding="utf-8") as f:
            content = f.read()

        for pattern in hardcoded_patterns:
            if pattern in content:
                found_hardcoded.append(pattern)

        if found_hardcoded:
            print(f"❌ 发现 {len(found_hardcoded)} 个硬编码配置:")
            for pattern in found_hardcoded:
                print(f"  - {pattern}")
            return False
        else:
            print("✅ 没有发现硬编码的DuckDB配置值")
            return True

    except Exception as e:
        print(f"❌ 检查文件失败: {e}")
        return False


def test_config_source():
    """测试配置来源是否都是配置文件"""
    print("\n🧪 检查配置来源...")

    engine_file = "api/core/duckdb_engine.py"

    config_sources = [
        "config_manager.get_app_config()",
        "app_config.duckdb_",
        "config_items.get(",
    ]

    found_sources = []

    try:
        with open(engine_file, "r", encoding="utf-8") as f:
            content = f.read()

        for source in config_sources:
            if source in content:
                found_sources.append(source)

        if len(found_sources) >= 2:  # 至少应该有config_manager和config_items
            print(f"✅ 发现 {len(found_sources)} 个配置源:")
            for source in found_sources:
                print(f"  - {source}")
            return True
        else:
            print(f"❌ 配置源不足，只发现 {len(found_sources)} 个")
            return False

    except Exception as e:
        print(f"❌ 检查配置源失败: {e}")
        return False


def test_config_fields():
    """测试所有DuckDB配置字段是否都在配置文件中"""
    print("\n🧪 检查配置文件完整性...")

    try:
        from core.config_manager import AppConfig, ConfigManager

        # 获取所有DuckDB配置字段
        config = AppConfig()
        duckdb_fields = {
            k: v for k, v in config.__dict__.items() if k.startswith("duckdb_")
        }

        print(f"✅ AppConfig中定义了 {len(duckdb_fields)} 个DuckDB配置字段:")
        for field, value in duckdb_fields.items():
            print(f"  - {field}: {value}")

        # 检查配置文件
        config_file = "config/app-config.json"
        if os.path.exists(config_file):
            import json

            with open(config_file, "r", encoding="utf-8") as f:
                file_config = json.load(f)

            file_duckdb_fields = {
                k: v for k, v in file_config.items() if k.startswith("duckdb_")
            }

            if len(file_duckdb_fields) == len(duckdb_fields):
                print(f"✅ 配置文件包含所有 {len(file_duckdb_fields)} 个DuckDB字段")
                return True
            else:
                print(
                    f"❌ 配置文件不完整: 期望 {len(duckdb_fields)} 个，实际 {len(file_duckdb_fields)} 个"
                )
                return False
        else:
            print("❌ 配置文件不存在")
            return False

    except Exception as e:
        print(f"❌ 检查配置字段失败: {e}")
        return False


def main():
    """主测试函数"""
    print("🚀 DuckDB配置系统完整性测试")
    print("=" * 50)

    tests = [
        ("硬编码配置检查", test_no_hardcoded_config),
        ("配置来源检查", test_config_source),
        ("配置文件完整性", test_config_fields),
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
        print("🎉 所有测试通过！DuckDB配置系统完全基于配置文件")
    else:
        print("⚠️  部分测试失败，配置系统仍需完善")


if __name__ == "__main__":
    main()
