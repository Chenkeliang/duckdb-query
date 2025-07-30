#!/bin/bash

# 容器数据清理脚本 - 清理运行中容器的敏感数据
# Container Data Cleanup Script - Clean sensitive data from running containers

echo "🐳 容器数据清理工具"
echo "🐳 Container Data Cleanup Tool"
echo "=================================="

# 检查Docker是否运行
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker未运行，请先启动Docker"
    echo "❌ Docker is not running, please start Docker first"
    exit 1
fi

# 检查容器是否存在
BACKEND_CONTAINER="dataquery-backend"
FRONTEND_CONTAINER="dataquery-frontend"

if ! docker ps -q -f name=$BACKEND_CONTAINER | grep -q .; then
    echo "⚠️ 后端容器未运行，跳过容器清理"
    echo "⚠️ Backend container not running, skipping container cleanup"
    exit 0
fi

echo "🧹 开始清理容器内的敏感数据..."
echo "🧹 Starting cleanup of sensitive data in containers..."

# 1. 清理后端容器的文件
echo "📁 清理后端容器文件..."
echo "📁 Cleaning backend container files..."

# 清理temp_files目录
docker exec $BACKEND_CONTAINER find /app/temp_files -type f -delete 2>/dev/null || true
docker exec $BACKEND_CONTAINER find /app/data/uploads -type f -delete 2>/dev/null || true
docker exec $BACKEND_CONTAINER find /app/exports -type f -delete 2>/dev/null || true

# 重置数据源配置
echo "📋 重置容器内数据源配置..."
echo "📋 Resetting datasource configuration in container..."
docker exec $BACKEND_CONTAINER sh -c 'echo "{}" > /app/data/file_datasources.json'

# 清理DuckDB数据库
echo "🗄️ 清理容器内DuckDB数据..."
echo "🗄️ Cleaning DuckDB data in container..."
docker exec $BACKEND_CONTAINER find /app/data/duckdb -name "*.db*" -delete 2>/dev/null || true
docker exec $BACKEND_CONTAINER rm -rf /app/data/duckdb/temp 2>/dev/null || true

# 清理缓存文件
echo "🗑️ 清理容器内缓存文件..."
echo "🗑️ Cleaning cache files in container..."
docker exec $BACKEND_CONTAINER find /app -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
docker exec $BACKEND_CONTAINER find /app -name "*.pyc" -delete 2>/dev/null || true
docker exec $BACKEND_CONTAINER find /app -name "*.log" -delete 2>/dev/null || true

# 创建必要的目录结构
echo "📁 重建容器内目录结构..."
echo "📁 Rebuilding directory structure in container..."
docker exec $BACKEND_CONTAINER mkdir -p /app/data/duckdb
docker exec $BACKEND_CONTAINER mkdir -p /app/data/uploads
docker exec $BACKEND_CONTAINER mkdir -p /app/temp_files
docker exec $BACKEND_CONTAINER mkdir -p /app/exports

# 验证清理结果
echo "🔍 验证清理结果..."
echo "🔍 Verifying cleanup results..."

TEMP_FILES_COUNT=$(docker exec $BACKEND_CONTAINER find /app/temp_files -type f | wc -l)
UPLOADS_COUNT=$(docker exec $BACKEND_CONTAINER find /app/data/uploads -type f | wc -l)
EXPORTS_COUNT=$(docker exec $BACKEND_CONTAINER find /app/exports -type f | wc -l)

echo "📊 清理结果统计:"
echo "📊 Cleanup results:"
echo "   - temp_files: $TEMP_FILES_COUNT 个文件"
echo "   - uploads: $UPLOADS_COUNT 个文件"
echo "   - exports: $EXPORTS_COUNT 个文件"

if [ "$TEMP_FILES_COUNT" -eq 0 ] && [ "$UPLOADS_COUNT" -eq 0 ] && [ "$EXPORTS_COUNT" -eq 0 ]; then
    echo "✅ 容器数据清理成功！"
    echo "✅ Container data cleanup successful!"
else
    echo "⚠️ 部分文件可能未被清理"
    echo "⚠️ Some files may not have been cleaned"
fi

# 重启容器以确保清理生效
read -p "是否重启容器以确保清理完全生效? (y/n): " restart_choice
if [ "$restart_choice" = "y" ] || [ "$restart_choice" = "Y" ]; then
    echo "🔄 重启容器..."
    echo "🔄 Restarting containers..."
    
    PROJECT_ROOT="$(dirname "$(dirname "$(realpath "$0")")")"
    cd "$PROJECT_ROOT"
    
    docker-compose restart
    
    echo "✅ 容器重启完成"
    echo "✅ Container restart completed"
fi

echo ""
echo "🎉 容器数据清理完成！"
echo "🎉 Container data cleanup completed!"
echo ""
echo "💡 提示: 现在可以刷新浏览器页面验证清理效果"
echo "💡 Tip: You can now refresh the browser page to verify the cleanup"
