#!/bin/bash

# 自动清理脚本 - 清理项目中的敏感信息和数据
# Auto Cleanup Script - Clean sensitive information and data from the project
# 
# 此脚本会在Docker镜像启动时自动执行，确保没有敏感信息泄露
# This script runs automatically when Docker image starts to ensure no sensitive information leaks

echo "🧹 开始自动清理敏感数据..."
echo "🧹 Starting automatic cleanup of sensitive data..."

# 设置项目根目录
PROJECT_ROOT="/app"
if [ ! -d "$PROJECT_ROOT" ]; then
    PROJECT_ROOT="$(dirname "$(dirname "$(realpath "$0")")")"
fi

echo "📁 项目根目录: $PROJECT_ROOT"
echo "📁 Project root: $PROJECT_ROOT"

# 1. 清理数据库文件
echo "🗄️ 清理数据库文件..."
echo "🗄️ Cleaning database files..."
rm -f "$PROJECT_ROOT/data/duckdb_data.db"
rm -f "$PROJECT_ROOT/data/duckdb/main.db"*
rm -rf "$PROJECT_ROOT/data/duckdb/temp"
mkdir -p "$PROJECT_ROOT/data/duckdb"

# 2. 清理上传的文件
echo "📁 清理上传文件..."
echo "📁 Cleaning uploaded files..."
find "$PROJECT_ROOT/api/temp_files" -type f -delete 2>/dev/null || true
find "$PROJECT_ROOT/data/uploads" -type f -delete 2>/dev/null || true
rm -f "$PROJECT_ROOT/temp_files"/* 2>/dev/null || true

# 3. 重置数据源文件
echo "📋 重置数据源文件..."
echo "📋 Resetting datasource files..."
echo '{}' > "$PROJECT_ROOT/data/file_datasources.json"

# 4. 清理缓存文件
echo "🗑️ 清理缓存文件..."
echo "🗑️ Cleaning cache files..."
find "$PROJECT_ROOT" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$PROJECT_ROOT" -name "*.pyc" -delete 2>/dev/null || true
find "$PROJECT_ROOT" -name "*.pyo" -delete 2>/dev/null || true
find "$PROJECT_ROOT" -name ".DS_Store" -delete 2>/dev/null || true

# 5. 清理日志文件
echo "📝 清理日志文件..."
echo "📝 Cleaning log files..."
find "$PROJECT_ROOT" -name "*.log" -delete 2>/dev/null || true
rm -rf "$PROJECT_ROOT/logs" 2>/dev/null || true

# 6. 清理导出文件
echo "📤 清理导出文件..."
echo "📤 Cleaning export files..."
rm -f "$PROJECT_ROOT/api/exports"/*

# 7. 确保配置文件是示例版本
echo "⚙️ 检查配置文件..."
echo "⚙️ Checking configuration files..."

# 检查是否存在真实配置文件，如果存在则删除
if [ -f "$PROJECT_ROOT/config/mysql-configs.json" ]; then
    echo "⚠️ 发现真实配置文件，正在删除..."
    echo "⚠️ Found real config file, removing..."
    rm -f "$PROJECT_ROOT/config/mysql-configs.json"
fi

if [ -f "$PROJECT_ROOT/config/datasources.json" ]; then
    echo "⚠️ 发现真实数据源文件，正在删除..."
    echo "⚠️ Found real datasource file, removing..."
    rm -f "$PROJECT_ROOT/config/datasources.json"
fi

# 8. 创建必要的目录结构
echo "📁 创建必要的目录结构..."
echo "📁 Creating necessary directory structure..."
mkdir -p "$PROJECT_ROOT/data/duckdb"
mkdir -p "$PROJECT_ROOT/data/uploads"
mkdir -p "$PROJECT_ROOT/api/temp_files"
mkdir -p "$PROJECT_ROOT/api/exports"
mkdir -p "$PROJECT_ROOT/logs"

# 创建.gitkeep文件保持目录结构
touch "$PROJECT_ROOT/data/uploads/.gitkeep"
touch "$PROJECT_ROOT/api/temp_files/.gitkeep"
touch "$PROJECT_ROOT/api/exports/.gitkeep"

# 9. 设置正确的权限
echo "🔐 设置目录权限..."
echo "🔐 Setting directory permissions..."
chmod 755 "$PROJECT_ROOT/data"
chmod 755 "$PROJECT_ROOT/data/duckdb"
chmod 755 "$PROJECT_ROOT/data/uploads"
chmod 755 "$PROJECT_ROOT/api/temp_files"
chmod 755 "$PROJECT_ROOT/api/exports"

# 10. 生成清理报告
echo "📊 生成清理报告..."
echo "📊 Generating cleanup report..."

CLEANUP_REPORT="$PROJECT_ROOT/cleanup-report.txt"
cat > "$CLEANUP_REPORT" << EOF
===========================================
数据清理报告 / Data Cleanup Report
===========================================
清理时间 / Cleanup Time: $(date)
清理脚本版本 / Script Version: 1.0

已清理的内容 / Cleaned Items:
✅ DuckDB 数据库文件 / DuckDB database files
✅ 上传的文件 / Uploaded files  
✅ 数据源配置 / Datasource configurations
✅ Python 缓存文件 / Python cache files
✅ 日志文件 / Log files
✅ 导出文件 / Export files
✅ 真实配置文件 / Real configuration files

保留的内容 / Preserved Items:
📁 目录结构 / Directory structure
📄 示例配置文件 / Example configuration files
💻 源代码 / Source code
📚 文档 / Documentation

注意事项 / Notes:
- 所有敏感数据已被清理 / All sensitive data has been cleaned
- 请使用示例配置文件创建您的配置 / Please use example files to create your configurations
- 首次运行前请配置数据库连接 / Please configure database connections before first run

===========================================
EOF

echo "✅ 自动清理完成！"
echo "✅ Automatic cleanup completed!"
echo "📊 清理报告已保存到: $CLEANUP_REPORT"
echo "📊 Cleanup report saved to: $CLEANUP_REPORT"
echo ""
echo "🚀 项目已准备就绪，可以安全使用！"
echo "🚀 Project is ready and safe to use!"
