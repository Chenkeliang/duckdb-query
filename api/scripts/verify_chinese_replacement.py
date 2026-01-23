#!/usr/bin/env python3
"""
Verify that all Chinese messages have been replaced in backend API files
"""

import re
from pathlib import Path
from collections import defaultdict

def find_chinese_in_file(file_path: Path) -> list:
    """Find all Chinese characters in a file"""
    if not file_path.exists():
        return []
    
    try:
        content = file_path.read_text(encoding='utf-8')
        lines = content.split('\n')
        chinese_lines = []
        
        for line_num, line in enumerate(lines, 1):
            # Skip comments (docstrings and # comments)
            stripped = line.strip()
            if stripped.startswith('#'):
                continue
            if stripped.startswith('"""') or stripped.startswith("'''"):
                continue
            
            # Find Chinese characters
            chinese_chars = re.findall(r'[\u4e00-\u9fff]+', line)
            if chinese_chars:
                # Check if it's in a string literal (message)
                if '"' in line or "'" in line or 'logger.' in line or 'raise' in line or 'detail=' in line or 'message=' in line:
                    chinese_lines.append((line_num, line.strip(), chinese_chars))
        
        return chinese_lines
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return []

def main():
    print("Verifying Chinese message replacement in backend API files...\n")
    
    # Scan all Python files in api directory
    api_dir = Path("api")
    python_files = list(api_dir.rglob("*.py"))
    
    files_with_chinese = defaultdict(list)
    total_chinese_lines = 0
    
    for file_path in python_files:
        # Skip migration scripts and test files
        if 'migrate_' in file_path.name or file_path.name.startswith('test_'):
            continue
        
        chinese_lines = find_chinese_in_file(file_path)
        if chinese_lines:
            files_with_chinese[str(file_path)] = chinese_lines
            total_chinese_lines += len(chinese_lines)
    
    if files_with_chinese:
        print(f"❌ Found {total_chinese_lines} lines with Chinese messages in {len(files_with_chinese)} files:\n")
        
        for file_path, chinese_lines in sorted(files_with_chinese.items()):
            print(f"\n{file_path}:")
            for line_num, line, chinese_chars in chinese_lines[:5]:  # Show first 5 lines
                print(f"  Line {line_num}: {line[:100]}")
                print(f"    Chinese: {', '.join(chinese_chars)}")
            if len(chinese_lines) > 5:
                print(f"  ... and {len(chinese_lines) - 5} more lines")
        
        print(f"\n{'='*60}")
        print(f"❌ VERIFICATION FAILED")
        print(f"Found {total_chinese_lines} lines with Chinese messages")
        print(f"{'='*60}")
        return 1
    else:
        print(f"{'='*60}")
        print(f"✅ VERIFICATION PASSED")
        print(f"No Chinese messages found in backend API files")
        print(f"{'='*60}")
        return 0

if __name__ == "__main__":
    exit(main())
