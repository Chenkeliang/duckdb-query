#!/bin/bash

# 简化版Docker启动脚本
# 避免复杂的镜像构建，直接使用官方镜像

set -e

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 启动简化版现代化UI环境${NC}"
echo "================================"

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}❌ Docker未安装，请先安装Docker${NC}"
    exit 1
fi

if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}❌ Docker未运行，请先启动Docker${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker环境检查通过${NC}"

# 停止现有服务
echo -e "${BLUE}🛑 停止现有服务...${NC}"
docker-compose -f docker-compose.simple.yml down 2>/dev/null || true

# 清理端口
echo -e "${BLUE}🔧 检查端口占用...${NC}"
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口3000被占用，尝试释放...${NC}"
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口8000被占用，尝试释放...${NC}"
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
fi

# 启动服务
echo -e "${BLUE}🚀 启动服务...${NC}"
docker-compose -f docker-compose.simple.yml up --build

echo -e "${GREEN}🎉 服务启动完成！${NC}"
echo ""
echo "🌐 访问地址:"
echo "  前端: http://localhost:3000"
echo "  后端: http://localhost:8000"
echo "  API文档: http://localhost:8000/docs"
