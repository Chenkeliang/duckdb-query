#!/bin/bash

echo "🚀 开始部署导出和保存功能修复..."

# 停止现有服务
echo "📦 停止现有服务..."
docker-compose down --remove-orphans

# 清理Docker缓存以确保重新构建
echo "🧹 清理Docker缓存..."
docker system prune -f

# 重新构建并启动服务
echo "🔨 重新构建并启动服务..."
docker-compose up --build -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose ps

# 检查API服务是否可用
echo "🌐 检查API服务..."
for i in {1..10}; do
    if curl -s http://localhost:8000/docs > /dev/null; then
        echo "✅ API服务已启动并可访问"
        break
    else
        echo "⏳ 等待API服务启动... ($i/10)"
        sleep 5
    fi
done

# 检查前端服务是否可用
echo "🌐 检查前端服务..."
for i in {1..10}; do
    if curl -s http://localhost:3000 > /dev/null; then
        echo "✅ 前端服务已启动并可访问"
        break
    else
        echo "⏳ 等待前端服务启动... ($i/10)"
        sleep 5
    fi
done

echo "🎉 部署完成！"
echo "📋 服务访问地址："
echo "   - 前端: http://localhost:3000"
echo "   - API文档: http://localhost:8000/docs"
echo ""
echo "💡 现在可以测试导出和保存功能了"