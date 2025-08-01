#!/usr/bin/env python3
"""
测试CSV解析问题
"""

import csv
import io

def test_csv_parsing():
    """测试CSV解析"""
    
    # 模拟您的数据格式
    test_data = '''
"20205625639826335226",
"20200826591169218",
"20205626674417096998",
"20200827509422066",
"20205629640522710226",
"20200829510037490",
'''
    
    print("🔍 测试CSV解析...")
    
    lines = test_data.strip().split('\n')
    
    for i, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue
            
        print(f"\n行 {i}: '{line}'")
        print(f"   长度: {len(line)}")
        print(f"   逗号数: {line.count(',')}")
        print(f"   引号数: {line.count('\"')}")
        
        # 尝试CSV解析
        try:
            reader = csv.reader(io.StringIO(line))
            columns = next(reader, [])
            print(f"   CSV列数: {len(columns)}")
            print(f"   CSV内容: {columns}")
        except Exception as e:
            print(f"   CSV解析错误: {e}")
        
        # 检查是否是单列数据
        if line.endswith(','):
            print(f"   ⚠️  行末有逗号 - 可能被解析为2列")
        else:
            print(f"   ✅ 行末无逗号 - 应该是1列")

if __name__ == "__main__":
    test_csv_parsing()
