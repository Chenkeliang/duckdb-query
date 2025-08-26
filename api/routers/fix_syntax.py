import re

# 读取文件
with open('data_sources.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 查找PostgreSQL路由部分
pattern = r'# PostgreSQL配置管理路由\n@router\.get\("/api/postgresql_configs".*?async def delete_postgresql_config\(config_id: str\):\n.*?    except Exception as e:\n.*?        raise HTTPException\(status_code=500, detail=f"删除PostgreSQL配置失败: {str\(e\)}"\)'

# 查找匹配的部分
match = re.search(pattern, content, re.DOTALL)
if match:
    print("Found PostgreSQL routes section")
    # 检查是否有语法错误
    section = match.group(0)
    if 'except HTTPException:' in section and 'raise' not in section.split('except HTTPException:')[1].split('\n')[0].strip():
        print("Found missing 'raise' statement")
        # 修复缺少的'raise'语句
        fixed_section = section.replace('except HTTPException:\n', 'except HTTPException:\n        raise\n')
        # 替换原内容
        content = content.replace(section, fixed_section)
        # 写回文件
        with open('data_sources.py', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Fixed missing 'raise' statement")
    else:
        print("No syntax error found in PostgreSQL routes")
else:
    print("PostgreSQL routes section not found")