#!/usr/bin/env python3
"""
数据格式检测工具
帮助分析粘贴数据中的格式问题
"""

import re
import json

def analyze_data_format(data_text):
    """分析数据格式问题"""

    print("🔍 开始分析数据格式...")

    # 按行分割数据
    lines = data_text.strip().split('\n')
    print(f"📊 总行数: {len(lines)}")

    # 分析每行的格式
    line_analysis = []

    for i, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue

        # 移除首尾的引号和逗号
        cleaned_line = line.strip('"').strip("'").rstrip(',').strip()

        # 检查CSV解析
        csv_columns = []
        try:
            # 尝试按CSV格式解析
            import csv
            import io
            reader = csv.reader(io.StringIO(line))
            csv_columns = next(reader, [])
        except:
            csv_columns = []

        analysis = {
            'line_number': i,
            'original': line,
            'cleaned': cleaned_line,
            'length': len(cleaned_line),
            'has_quotes': line.startswith('"') or line.startswith("'"),
            'has_comma': line.endswith(','),
            'is_numeric': cleaned_line.isdigit(),
            'char_count': len(line),
            'csv_columns': len(csv_columns),
            'comma_count': line.count(','),
            'quote_count': line.count('"') + line.count("'"),
            'special_chars': []
        }

        # 检查特殊字符
        for char in line:
            if not (char.isdigit() or char in ['"', "'", ',', ' ', '\t']):
                analysis['special_chars'].append(char)

        line_analysis.append(analysis)
    
    # 统计分析
    lengths = [a['length'] for a in line_analysis]
    csv_columns = [a['csv_columns'] for a in line_analysis]
    comma_counts = [a['comma_count'] for a in line_analysis]

    print(f"\n📏 数据长度分析:")
    print(f"   唯一长度数量: {len(set(lengths))}")
    print(f"   长度范围: {min(lengths)} - {max(lengths)}")

    print(f"\n🔗 CSV列数分析:")
    print(f"   唯一列数: {set(csv_columns)}")
    print(f"   逗号数量范围: {min(comma_counts)} - {max(comma_counts)}")

    # 按CSV列数分组
    csv_groups = {}
    for analysis in line_analysis:
        cols = analysis['csv_columns']
        if cols not in csv_groups:
            csv_groups[cols] = []
        csv_groups[cols].append(analysis)

    print(f"\n📋 按CSV列数分组:")
    for cols, group in sorted(csv_groups.items()):
        print(f"   {cols} 列: {len(group)} 行")
        if len(group) <= 5:  # 显示少数异常行
            for item in group:
                print(f"      行 {item['line_number']}: {item['comma_count']} 个逗号 - '{item['original']}'")

    # 检查非数字行
    non_numeric = [a for a in line_analysis if not a['is_numeric']]
    if non_numeric:
        print(f"\n⚠️  非数字行 ({len(non_numeric)} 行):")
        for item in non_numeric[:10]:  # 只显示前10个
            print(f"   行 {item['line_number']}: '{item['original']}'")
            if item['special_chars']:
                print(f"      特殊字符: {item['special_chars']}")

    # 检查CSV列数不一致的行
    most_common_cols = max(csv_groups.keys(), key=lambda x: len(csv_groups[x]))
    inconsistent_csv = [a for a in line_analysis if a['csv_columns'] != most_common_cols]

    if inconsistent_csv:
        print(f"\n🚨 CSV列数不一致的行 ({len(inconsistent_csv)} 行):")
        print(f"   最常见列数: {most_common_cols} ({len(csv_groups[most_common_cols])} 行)")
        for item in inconsistent_csv:
            print(f"   行 {item['line_number']}: {item['csv_columns']} 列, {item['comma_count']} 个逗号 - '{item['original']}'")

    # 生成修复建议
    print(f"\n💡 修复建议:")
    if inconsistent_csv:
        print(f"   1. 检查CSV列数不一致的 {len(inconsistent_csv)} 行")
        print(f"   2. 标准列数应为: {most_common_cols}")
        print(f"   3. 检查逗号数量是否正确")

    if non_numeric:
        print(f"   4. 检查包含非数字字符的 {len(non_numeric)} 行")

    # 生成清理后的数据
    cleaned_data = []
    for analysis in line_analysis:
        if analysis['is_numeric'] and analysis['csv_columns'] == most_common_cols:
            cleaned_data.append(analysis['cleaned'])

    print(f"\n✅ 清理后的有效数据: {len(cleaned_data)} 行")

    return {
        'total_lines': len(lines),
        'valid_lines': len(cleaned_data),
        'inconsistent_lines': len(inconsistent_csv),
        'non_numeric_lines': len(non_numeric),
        'most_common_cols': most_common_cols,
        'cleaned_data': cleaned_data,
        'problematic_lines': inconsistent_csv + non_numeric
    }

if __name__ == "__main__":
    # 测试数据
    test_data = '''
"20205414628442244006",
"20205415627720776773",
"202006165711984134",
"20205518636662953778",
"202006175494413814",
"202006175943044790",
"202006175676893286",
"202006175681381025",
"202008115833487391",
"20205418618057084221",
"20205418627924955771",
"20205418627716290778",
"20215104694417670007",
"202006185298060196",
"202006185275119988",
"202006185592651249",
"202006185188739365",
"202006225879796862",
"202006195996124865",
"20205419651196094884",
"20205419618452009229",
"20205419618899485226",
"20205419629573736003",
"202006195779552053",
"20205419627707427668",
"20205419612564058554",
"202006195618922587",
"202006195715127430",
"202006195072264509",
"202006195921866783",
"20205419651980701880",
"202006195458768729",
"20205419651559781887",
"20205419618413667336",
"20205419612363767552",
"202006195547790918",
"202006195473773965",
"20205419627840765668",
"202009175871697080",
"202006205687145434",
"202006205183259402",
"20205420628917912669",
"202006205732487373",
"202006205133152312",
"202006205193938483",
"202006205905517333",
"20205421628800276662",
"20205421619662882335",
"202006215500842437",
"20205421613701362445"
'''
    
    result = analyze_data_format(test_data)
    
    print(f"\n📄 分析完成!")
    print(f"   总行数: {result['total_lines']}")
    print(f"   有效行数: {result['valid_lines']}")
    print(f"   问题行数: {result['inconsistent_lines'] + result['non_numeric_lines']}")
