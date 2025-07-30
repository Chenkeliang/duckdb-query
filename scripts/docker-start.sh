#!/bin/bash

# Interactive Data Query - Docker 启动脚本
# 前后端统一Docker启动

echo "🚀 启动 Interactive Data Query 项目..."
echo ""

# 检查Docker是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动Docker"
    exit 1
fi

# 停止现有容器
echo "🛑 停止现有容器..."
docker-compose -f docker-compose.full.yml down

# 构建镜像
echo "🔨 构建Docker镜像..."
docker-compose -f docker-compose.full.yml build

# 启动服务
echo "🚀 启动服务..."
docker-compose -f docker-compose.full.yml up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "🔍 检查服务状态..."
echo ""

# 检查后端
echo "📡 后端服务状态:"
if curl -s http://localhost:8000/health | grep -q "healthy"; then
    echo "✅ 后端服务正常 - http://localhost:8000"
else
    echo "❌ 后端服务异常"
fi

# 检查前端
echo "🌐 前端服务状态:"
if curl -s http://localhost:3000 | grep -q "Interactive Data Query"; then
    echo "✅ 前端服务正常 - http://localhost:3000"
else
    echo "❌ 前端服务异常"
fi

echo ""
echo "🎉 启动完成！"
echo ""
echo "📋 服务信息:"
echo "   前端: http://localhost:3000"
echo "   后端: http://localhost:8000"
echo "   健康检查: http://localhost:8000/health"
echo ""
echo "📝 管理命令:"
echo "   查看日志: docker-compose -f docker-compose.full.yml logs -f"
echo "   停止服务: docker-compose -f docker-compose.full.yml down"
echo "   重启服务: docker-compose -f docker-compose.full.yml restart"
echo ""
