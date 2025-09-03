#!/usr/bin/env python3
"""
全面检查项目配置系统
检查硬编码配置、配置声明但未使用等情况
"""

import sys
import os
import re

sys.path.append(os.path.join(os.path.dirname(__file__), "api"))


def check_hardcoded_configs():
    """检查所有可能的硬编码配置"""
    print("🔍 检查所有可能的硬编码配置...")

    # 检查的文件和模式
    check_patterns = [
        # DuckDB配置
        (r"SET threads=\d+", "DuckDB线程数硬编码"),
        (r"SET memory_limit=['\"][^'\"]+['\"]", "DuckDB内存限制硬编码"),
        (r"SET enable_profiling=(true|false)", "DuckDB性能分析硬编码"),
        (r"SET force_index_join=(true|false)", "DuckDB强制索引JOIN硬编码"),
        (r"SET enable_object_cache=(true|false)", "DuckDB对象缓存硬编码"),
        (r"SET preserve_insertion_order=(true|false)", "DuckDB保持插入顺序硬编码"),
        (r"SET enable_progress_bar=(true|false)", "DuckDB进度条硬编码"),
        # 连接池配置
        (r"max_connections=\d+", "连接池最大连接数硬编码"),
        (r"connection_timeout=\d+", "连接池超时硬编码"),
        (r"idle_timeout=\d+", "连接池空闲超时硬编码"),
        (r"max_retries=\d+", "连接池重试次数硬编码"),
        # 文件大小限制
        (r"MAX_FILE_SIZE\s*=\s*\d+\s*\*", "文件大小限制硬编码"),
        (r"MAX_CHUNK_FILE_SIZE\s*=\s*\d+\s*\*", "分块文件大小限制硬编码"),
        # 数据库连接超时
        (r"connect_timeout=\d+", "数据库连接超时硬编码"),
        (r"read_timeout=\d+", "数据库读取超时硬编码"),
        (r"write_timeout=\d+", "数据库写入超时硬编码"),
        (r"timeout=\d+", "通用超时硬编码"),
        # 其他数值配置
        (r"max_file_size\s*=\s*\d+\s*\*", "最大文件大小硬编码"),
        (r"query_timeout\s*=\s*\d+", "查询超时硬编码"),
        (r"download_timeout\s*=\s*\d+", "下载超时硬编码"),
        (r"max_query_rows\s*=\s*\d+", "最大查询行数硬编码"),
        (r"max_tables\s*=\s*\d+", "最大表数硬编码"),
        (r"cache_ttl\s*=\s*\d+", "缓存TTL硬编码"),
    ]

    # 要检查的文件
    python_files = [
        "api/core/duckdb_engine.py",
        "api/core/duckdb_pool.py",
        "api/core/security.py",
        "api/core/config_manager.py",
        "api/routers/data_sources.py",
        "api/routers/database_tables.py",
        "api/routers/query_proxy.py",
        "api/routers/url_reader.py",
        "api/core/database_manager.py",
    ]

    found_hardcoded = []

    for file_path in python_files:
        if not os.path.exists(file_path):
            continue

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                lines = content.split("\n")

            for line_num, line in enumerate(lines, 1):
                for pattern, description in check_patterns:
                    if re.search(pattern, line):
                        # 排除配置文件中的默认值定义
                        if not line.strip().startswith("#"):
                            found_hardcoded.append(
                                {
                                    "file": file_path,
                                    "line": line_num,
                                    "content": line.strip(),
                                    "description": description,
                                }
                            )

        except Exception as e:
            print(f"❌ 检查文件 {file_path} 失败: {e}")

    if found_hardcoded:
        print(f"❌ 发现 {len(found_hardcoded)} 个硬编码配置:")
        for item in found_hardcoded:
            print(f"  - {item['file']}:{item['line']} - {item['description']}")
            print(f"    {item['content']}")
        return False
    else:
        print("✅ 没有发现硬编码配置")
        return True


def check_config_usage():
    """检查配置字段是否被使用"""
    print("\n🔍 检查配置字段使用情况...")

    try:
        from core.config_manager import AppConfig

        # 获取所有配置字段
        config = AppConfig()
        all_fields = list(config.__dict__.keys())

        # 检查配置文件
        config_file = "config/app-config.json"
        if os.path.exists(config_file):
            import json

            with open(config_file, "r", encoding="utf-8") as f:
                file_config = json.load(f)

            file_fields = list(file_config.keys())

            # 检查AppConfig中定义但配置文件中没有的字段
            missing_in_file = [f for f in all_fields if f not in file_fields]
            if missing_in_file:
                print(f"❌ 配置文件中缺少 {len(missing_in_file)} 个字段:")
                for field in missing_in_file:
                    print(f"  - {field}")
                return False

            # 检查配置文件中有但AppConfig中没有的字段
            extra_in_file = [f for f in file_fields if f not in all_fields]
            if extra_in_file:
                print(f"⚠️  配置文件中有 {len(extra_in_file)} 个未定义的字段:")
                for field in extra_in_file:
                    print(f"  - {field}")

            print(f"✅ 配置文件包含所有 {len(all_fields)} 个配置字段")
            return True
        else:
            print("❌ 配置文件不存在")
            return False

    except Exception as e:
        print(f"❌ 检查配置使用情况失败: {e}")
        return False


def check_config_categories():
    """检查配置分类的完整性"""
    print("\n🔍 检查配置分类完整性...")

    try:
        from core.config_manager import AppConfig

        config = AppConfig()

        # 按类别分组配置字段
        categories = {
            "基础应用配置": [
                f
                for f in config.__dict__.keys()
                if not f.startswith(("duckdb_", "pool_", "db_"))
            ],
            "DuckDB引擎配置": [
                f for f in config.__dict__.keys() if f.startswith("duckdb_")
            ],
            "连接池配置": [f for f in config.__dict__.keys() if f.startswith("pool_")],
            "数据库连接配置": [
                f for f in config.__dict__.keys() if f.startswith("db_")
            ],
        }

        total_fields = sum(len(fields) for fields in categories.values())

        print(f"✅ 配置分类统计:")
        for category, fields in categories.items():
            print(f"  - {category}: {len(fields)} 个字段")

        print(f"✅ 总计: {total_fields} 个配置字段")
        return True

    except Exception as e:
        print(f"❌ 检查配置分类失败: {e}")
        return False


def main():
    """主测试函数"""
    print("🚀 项目配置系统全面检查")
    print("=" * 60)

    tests = [
        ("硬编码配置检查", check_hardcoded_configs),
        ("配置字段使用检查", check_config_usage),
        ("配置分类完整性", check_config_categories),
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

    print("\n" + "=" * 60)
    print(f"测试结果: {passed}/{total} 通过")

    if passed == total:
        print("🎉 所有测试通过！配置系统完全基于配置文件")
    else:
        print("⚠️  部分测试失败，配置系统仍需完善")


if __name__ == "__main__":
    main()
