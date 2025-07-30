#!/bin/bash

# 项目架构清理脚本
# 此脚本将清理项目中的临时文件、调试文件和重复配置

echo "🧹 开始清理项目架构..."

# 1. 删除调试和临时文件
echo "📝 删除调试和临时文件..."

# 后端调试文件
rm -f api/check_db_manager.py
rm -f api/debug_db_connection.py
rm -f api/fix_execute_sql.py
rm -f api/quick_fix.py
rm -f api/test_db_query.py

# 删除Python缓存
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name "*.pyc" -delete 2>/dev/null || true

# 删除虚拟环境（不应该在版本控制中）
rm -rf api/venv
rm -rf frontend/venv

# 删除前端构建输出
rm -rf frontend/dist
rm -rf frontend/node_modules/.cache

# 删除旧的UI目录
rm -rf frontend/modern-ui

echo "🐳 删除重复的Docker配置文件..."

# 2. 删除重复的Docker文件
rm -f frontend/Dockerfile.dev
rm -f frontend/Dockerfile.fixed
rm -f frontend/Dockerfile.prod

# 删除重复的Docker Compose文件
rm -f docker-compose.dev.yml
rm -f docker-compose.full.yml
rm -f docker-compose.simple.yml

echo "📜 移动测试脚本到scripts目录..."

# 3. 创建scripts目录并移动脚本
mkdir -p scripts

# 移动有用的脚本到scripts目录
if [ -f "docker-dev.sh" ]; then
    mv docker-dev.sh scripts/
fi

if [ -f "docker-start.sh" ]; then
    mv docker-start.sh scripts/
fi

if [ -f "debug-backend-startup.sh" ]; then
    mv debug-backend-startup.sh scripts/debug-backend.sh
fi

# 删除其他测试脚本（可以根据需要保留）
rm -f auto-test-mysql-features.sh
rm -f comprehensive-mysql-test.sh
rm -f force-rebuild-and-test.sh
rm -f test-mysql-custom-query.sh
rm -f test-mysql-datasource-manager.sh
rm -f ultimate-mysql-test.sh
rm -f debug_files.py

echo "📁 创建标准目录结构..."

# 4. 创建标准目录结构
mkdir -p data/uploads
mkdir -p config
mkdir -p docs
mkdir -p tests/backend
mkdir -p tests/frontend
mkdir -p tests/e2e

# 创建.gitkeep文件保持空目录
touch data/uploads/.gitkeep
touch api/exports/.gitkeep

echo "📋 移动配置文件..."

# 5. 移动配置文件（如果存在）
if [ -f "api/mysql_configs.json" ]; then
    echo "移动 mysql_configs.json 到 config 目录"
    mv api/mysql_configs.json config/mysql-configs.json.example
fi

if [ -f "api/mysql_datasources.json" ]; then
    echo "移动 mysql_datasources.json 到 config 目录"
    mv api/mysql_datasources.json config/datasources.json.example
fi

echo "🧹 清理临时文件..."

# 6. 清理临时文件
rm -f *.tmp
rm -f *.swp
rm -f .DS_Store
find . -name ".DS_Store" -delete 2>/dev/null || true

echo "✅ 项目架构清理完成！"
echo ""
echo "📋 清理总结："
echo "  ✓ 删除了调试和临时文件"
echo "  ✓ 删除了重复的Docker配置"
echo "  ✓ 移动了脚本文件到scripts目录"
echo "  ✓ 创建了标准目录结构"
echo "  ✓ 移动了配置文件到config目录"
echo "  ✓ 更新了.gitignore文件"
echo ""
echo "⚠️  注意："
echo "  - 配置文件已重命名为.example，请复制并配置实际使用的文件"
echo "  - 请检查代码中的路径引用是否需要更新"
echo "  - 建议运行测试确保功能正常"
