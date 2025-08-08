#!/bin/bash
echo "停止服务..."
docker-compose down

echo "重新构建和启动..."
docker-compose up --build -d

echo "等待服务启动..."
sleep 10

echo "检查服务状态..."
docker-compose ps

echo "部署完成！"
echo "前端: http://localhost:3000"
echo "API: http://localhost:8000/docs"