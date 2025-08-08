#!/bin/bash

echo "🔧 修复Docker容器冲突并重新部署..."

# 停止所有相关容器
echo "1. 停止所有相关容器..."
docker stop $(docker ps -aq --filter "name=dataquery") 2>/dev/null || true

# 删除所有相关容器
echo "2. 删除所有相关容器..."
docker rm $(docker ps -aq --filter "name=dataquery") 2>/dev/null || true

# 删除悬挂的镜像
echo "3. 清理悬挂的镜像..."
docker image prune -f

# 强制停止docker-compose服务
echo "4. 强制停止docker-compose服务..."
docker-compose down --remove-orphans --volumes

# 重新构建和启动服务
echo "5. 重新构建和启动服务..."
docker-compose up --build -d

# 等待服务启动
echo "6. 等待服务启动..."
sleep 30

# 检查服务状态
echo "7. 检查服务状态..."
docker-compose ps

echo ""
echo "✅ 部署完成！"
echo "🌐 前端访问：http://localhost:3000"
echo "📚 API文档：http://localhost:8000/docs"
echo ""
echo "现在可以测试导出和保存功能了！"