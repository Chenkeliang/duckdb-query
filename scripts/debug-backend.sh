#!/bin/bash

# 🔧 后端服务启动问题排查脚本
# 检查后端服务启动失败的原因并提供解决方案

echo "🔧 后端服务启动问题排查"
echo "====================="
echo "检查后端服务无法启动的原因"
echo ""

echo "1. 检查Docker容器状态"
echo "==================="
docker ps -a | grep dataquery

echo ""
echo "2. 查看后端容器日志"
echo "================="
echo "获取最近的错误日志..."
docker logs dataquery-backend --tail 50

echo ""
echo "3. 检查Python语法错误"
echo "=================="

echo "检查main.py语法..."
python3 -m py_compile api/main.py 2>&1 || echo "❌ main.py有语法错误"

echo "检查mysql_datasource_manager.py语法..."
python3 -m py_compile api/routers/mysql_datasource_manager.py 2>&1 || echo "❌ mysql_datasource_manager.py有语法错误"

echo "检查mysql_query.py语法..."
python3 -m py_compile api/routers/mysql_query.py 2>&1 || echo "❌ mysql_query.py有语法错误"

echo ""
echo "4. 检查导入问题"
echo "============="

# 检查是否有循环导入或缺失依赖
cd api
echo "检查模块导入..."

python3 -c "
try:
    from routers import mysql_datasource_manager
    print('✅ mysql_datasource_manager 导入成功')
except Exception as e:
    print(f'❌ mysql_datasource_manager 导入失败: {e}')

try:
    from routers import mysql_query
    print('✅ mysql_query 导入成功')
except Exception as e:
    print(f'❌ mysql_query 导入失败: {e}')

try:
    import main
    print('✅ main.py 导入成功')
except Exception as e:
    print(f'❌ main.py 导入失败: {e}')
" 2>&1

cd ..

echo ""
echo "5. 检查requirements.txt依赖"
echo "========================="

echo "检查是否缺少必要依赖..."
grep -q "sqlalchemy" api/requirements.txt && echo "✅ sqlalchemy已包含" || echo "❌ 缺少sqlalchemy依赖"
grep -q "pymysql" api/requirements.txt && echo "✅ pymysql已包含" || echo "❌ 缺少pymysql依赖"
grep -q "pandas" api/requirements.txt && echo "✅ pandas已包含" || echo "❌ 缺少pandas依赖"

echo ""
echo "6. 检查文件权限"
echo "============="

echo "检查关键文件是否可读..."
[ -r api/main.py ] && echo "✅ main.py可读" || echo "❌ main.py不可读"
[ -r api/routers/mysql_datasource_manager.py ] && echo "✅ mysql_datasource_manager.py可读" || echo "❌ mysql_datasource_manager.py不可读"
[ -r api/mysql_configs.json ] && echo "✅ mysql_configs.json可读" || echo "❌ mysql_configs.json不可读"

echo ""
echo "7. 尝试直接启动后端服务"
echo "===================="

echo "尝试在本地直接启动后端服务以查看详细错误..."
cd api

echo "设置Python路径..."
export PYTHONPATH="/Users/keliang/mypy/interactive-data-query/api:$PYTHONPATH"

echo "启动FastAPI服务..."
timeout 10s python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | head -20

cd ..

echo ""
echo "8. 修复建议"
echo "=========="

echo "🔧 常见问题和解决方案："
echo ""
echo "问题1: Python语法错误"
echo "解决: 检查新增代码的语法，特别是缩进和引号"
echo ""
echo "问题2: 导入错误"
echo "解决: 检查模块路径和循环导入"
echo ""
echo "问题3: 依赖缺失"
echo "解决: 确保requirements.txt包含所需依赖"
echo ""
echo "问题4: 端口占用"
echo "解决: docker stop dataquery-backend && docker start dataquery-backend"
echo ""
echo "问题5: Docker构建问题"
echo "解决: docker-compose build --no-cache dataquery-backend"

echo ""
echo "🚀 快速修复步骤："
echo "1. 检查上面的错误输出"
echo "2. 修复Python语法错误"
echo "3. 重新构建Docker镜像: docker-compose build dataquery-backend"
echo "4. 重新启动容器: docker-compose up -d"

echo ""
echo "🏁 排查完成"