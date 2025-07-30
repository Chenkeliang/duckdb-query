#!/bin/bash

# Docker 入口脚本 - 在容器启动时自动执行清理
# Docker Entrypoint Script - Automatically execute cleanup when container starts

echo "🐳 Docker 容器启动中..."
echo "🐳 Docker container starting..."

# 设置环境变量
export PYTHONPATH=/app
export PYTHONUNBUFFERED=1

# 检查是否需要执行自动清理
AUTO_CLEANUP=${AUTO_CLEANUP:-"true"}

if [ "$AUTO_CLEANUP" = "true" ]; then
    echo "🧹 执行自动清理..."
    echo "🧹 Executing automatic cleanup..."
    
    # 执行清理脚本
    if [ -f "/app/scripts/auto-cleanup.sh" ]; then
        chmod +x /app/scripts/auto-cleanup.sh
        /app/scripts/auto-cleanup.sh
    else
        echo "⚠️ 清理脚本未找到，跳过清理步骤"
        echo "⚠️ Cleanup script not found, skipping cleanup"
    fi
else
    echo "ℹ️ 自动清理已禁用 (AUTO_CLEANUP=false)"
    echo "ℹ️ Automatic cleanup disabled (AUTO_CLEANUP=false)"
fi

# 等待数据库服务启动（如果需要）
if [ "$WAIT_FOR_DB" = "true" ]; then
    echo "⏳ 等待数据库服务启动..."
    echo "⏳ Waiting for database service..."
    sleep 5
fi

# 创建必要的目录
mkdir -p /app/data/duckdb
mkdir -p /app/data/uploads
mkdir -p /app/api/temp_files
mkdir -p /app/api/exports
mkdir -p /app/logs

# 设置权限
chmod 755 /app/data/duckdb
chmod 755 /app/data/uploads
chmod 755 /app/api/temp_files
chmod 755 /app/api/exports

echo "✅ 容器初始化完成！"
echo "✅ Container initialization completed!"

# 执行传入的命令
exec "$@"
