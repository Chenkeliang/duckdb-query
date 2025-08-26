#!/usr/bin/env python3
"""
测试修复结果
"""
import json
import subprocess
import sys

def test_api_response():
    """测试 API 响应中是否还有 created_at 为 null 的情况"""
    try:
        result = subprocess.run([
            'curl', '-s', '-X', 'GET', 
            'http://localhost:3000/api/duckdb/tables',
            '-H', 'accept: application/json'
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            data = json.loads(result.stdout)
            tables = data.get('tables', [])
            
            null_created_at_tables = []
            for table in tables:
                if table.get('created_at') is None:
                    null_created_at_tables.append(table.get('table_name'))
            
            print(f'总表数: {len(tables)}')
            print(f'created_at 为 null 的表数: {len(null_created_at_tables)}')
            
            if len(null_created_at_tables) == 0:
                print('✅ 所有表的 created_at 字段都已修复！')
                return True
            else:
                print(f'❌ 还有 {len(null_created_at_tables)} 个表的 created_at 为 null:')
                for table_name in null_created_at_tables[:5]:  # 只显示前5个
                    print(f'  - {table_name}')
                if len(null_created_at_tables) > 5:
                    print(f'  ... 还有 {len(null_created_at_tables) - 5} 个')
                return False
        else:
            print(f'❌ API 调用失败: {result.stderr}')
            return False
            
    except Exception as e:
        print(f'❌ 测试失败: {str(e)}')
        return False

if __name__ == "__main__":
    print("测试修复结果...")
    success = test_api_response()
    sys.exit(0 if success else 1)