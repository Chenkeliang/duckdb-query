#!/usr/bin/env python3
"""
Replace remaining Chinese messages in the last 10 files
"""

import re
from pathlib import Path

# Define replacement mappings for each file
REPLACEMENTS = {
    "api/core/common/cache_manager.py": [
        ("File cache write failed", "File cache write failed"),
        ("Set cache failed", "Set cache failed"),
        ("File cache read failed", "File cache read failed"),
        ("Get cache failed", "Get cache failed"),
        ("Delete cache failed", "Delete cache failed"),
        ("缓存已清空", "Cache cleared"),
        ("Clear cache failed", "Clear cache failed"),
        ("清理了 {cleaned_count} 个过期缓存项", "Cleaned up {cleaned_count} expired cache entries"),
        ("清理过期缓存failed", "Failed to clean up expired cache"),
        ("使用缓存的queryresult，{len(df)} 行", "Using cached query result, {len(df)} rows"),
        ("缓存data格式error", "Cache data format error"),
        ("缓存queryresultfailed", "Failed to cache query result"),
    ],
    "api/core/security/security.py": [
        ("Unable to get configuration file, using default value", "Unable to get configuration file, using default value"),
        ("initializingpython-magicfailed", "Failed to initialize python-magic"),
    ],
    "api/core/security/rate_limiter.py": [
        ("Client {client_key} request rate too high", "Client {client_key} request rate too high"),
        ("客户端请求频率过高，请稍后再试", "Client request rate too high, please try again later"),
        ("Endpoint {endpoint} global request rate too high", "Endpoint {endpoint} global request rate too high"),
        ("服务器繁忙，请稍后再试", "Server busy, please try again later"),
        ("返回缓存响应", "Returning cached response"),
    ],
    "api/core/database/duckdb_pool.py": [
        ("关闭connection {conn_id} failed", "Failed to close connection {conn_id}"),
    ],
    "api/core/common/timezone_utils.py": [
        ("Failed to load timezone configuration: {str(e)}，使用默认时区 {DEFAULT_TIMEZONE}", "Failed to load timezone configuration: {str(e)}, using default timezone {DEFAULT_TIMEZONE}"),
    ],
}

def replace_in_file(file_path: str, replacements: list):
    """Replace Chinese messages in a file"""
    path = Path(file_path)
    if not path.exists():
        print(f"File not found: {file_path}")
        return False
    
    content = path.read_text(encoding='utf-8')
    original_content = content
    
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
            print(f"  ✓ Replaced: {old[:50]}...")
    
    if content != original_content:
        path.write_text(content, encoding='utf-8')
        print(f"✓ Updated: {file_path}")
        return True
    else:
        print(f"  No changes needed: {file_path}")
        return False

def main():
    print("Starting replacement of remaining Chinese messages...\n")
    
    updated_count = 0
    for file_path, replacements in REPLACEMENTS.items():
        print(f"\nProcessing: {file_path}")
        if replace_in_file(file_path, replacements):
            updated_count += 1
    
    print(f"\n{'='*60}")
    print(f"Replacement complete!")
    print(f"Updated {updated_count} files")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
