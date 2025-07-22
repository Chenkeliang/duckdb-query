#!/bin/bash

echo "🔧 强制重建Docker并测试修复效果"
echo "================================="

# 停止所有容器
echo "1. 停止Docker容器..."
docker-compose down

# 清理旧镜像
echo "2. 清理旧镜像..."
docker image prune -f

# 重新构建
echo "3. 重新构建镜像..."
docker-compose build --no-cache

# 启动服务
echo "4. 启动服务..."
docker-compose up -d

# 等待服务启动
echo "5. 等待服务启动..."
sleep 15

# 测试健康检查
echo "6. 测试健康检查..."
curl -s http://localhost:8000/health

echo ""
echo "7. 测试文件列表API..."
response=$(curl -s http://localhost:8000/api/list_files)
echo "API响应: $response"

if echo "$response" | grep -q "0711.xlsx"; then
    echo "❌ 问题依然存在：依然返回0711.xlsx"
    
    echo ""
    echo "8. 调试信息..."
    docker exec dataquery-backend ls -la /app/api/temp_files/
    
    echo ""
    echo "9. 手动清理容器内文件..."
    docker exec dataquery-backend find /app -name "0711.xlsx" -delete
    
    echo ""
    echo "10. 重新测试..."
    sleep 2
    final_response=$(curl -s http://localhost:8000/api/list_files)
    echo "最终API响应: $final_response"
    
    if echo "$final_response" | grep -q "0711.xlsx"; then
        echo "❌ 修复失败"
        exit 1
    else
        echo "✅ 修复成功！"
        exit 0
    fi
else
    echo "✅ 修复成功！不再返回0711.xlsx"
    exit 0
fi