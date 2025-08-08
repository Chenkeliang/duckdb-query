#!/bin/bash

echo "🔧 重新部署服务以应用编码修复..."

# 1. 停止当前服务
echo "1. 停止当前服务..."
docker-compose down

# 2. 重新构建API服务（应用编码修复）
echo "2. 重新构建API服务..."
docker-compose build api

# 3. 启动服务
echo "3. 启动服务..."
docker-compose up -d

# 4. 等待服务启动
echo "4. 等待服务启动..."
sleep 20

# 5. 检查服务状态
echo "5. 检查服务状态..."
docker-compose ps

# 6. 测试API可用性
echo "6. 测试API可用性..."
curl -s http://localhost:8000/docs > /dev/null && echo "✅ API服务正常" || echo "❌ API服务异常"
curl -s http://localhost:3000 > /dev/null && echo "✅ 前端服务正常" || echo "❌ 前端服务异常"

echo ""
echo "✅ 重新部署完成！"
echo "🌐 前端访问：http://localhost:3000"
echo "📚 API文档：http://localhost:8000/docs"
echo ""
echo "现在可以再次测试导出功能，编码问题应该已经修复！"