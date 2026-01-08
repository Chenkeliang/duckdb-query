#!/bin/bash

# DuckQuery 全量代码检查脚本

set -e

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 DuckQuery 代码规范检查${NC}"
echo "================================"
echo ""

# 统计变量
FRONTEND_ERRORS=0
BACKEND_ERRORS=0

# 前端检查
echo -e "${BLUE}📦 检查前端代码...${NC}"
cd frontend
if npm run lint; then
    echo -e "${GREEN}✅ 前端检查通过${NC}"
else
    FRONTEND_ERRORS=$?
    echo -e "${RED}❌ 前端检查失败 (错误代码: $FRONTEND_ERRORS)${NC}"
fi
cd ..

echo ""

# 后端检查
echo -e "${BLUE}🐍 检查后端代码...${NC}"
cd api
if pylint --rcfile=../.pylintrc routers/ core/ models/ utils/ services/; then
    echo -e "${GREEN}✅ 后端检查通过${NC}"
else
    BACKEND_ERRORS=$?
    echo -e "${RED}❌ 后端检查失败 (错误代码: $BACKEND_ERRORS)${NC}"
fi
cd ..

echo ""
echo "================================"

# 汇总结果
if [ $FRONTEND_ERRORS -eq 0 ] && [ $BACKEND_ERRORS -eq 0 ]; then
    echo -e "${GREEN}🎉 所有检查通过！代码符合规范。${NC}"
    exit 0
else
    echo -e "${RED}❌ 检查失败，请修复以上错误后再提交代码。${NC}"
    echo ""
    echo "💡 常见问题修复建议:"
    
    if [ $FRONTEND_ERRORS -ne 0 ]; then
        echo ""
        echo "前端问题:"
        echo "  - 新布局中使用了 MUI? → 改用 Shadcn/UI 组件"
        echo "  - useEffect 中调用 API? → 改用 TanStack Query Hook"
        echo "  - 硬编码颜色? → 使用 Tailwind 语义类 (text-primary, bg-background)"
        echo "  - 硬编码文本? → 使用 i18n (t('key'))"
    fi
    
    if [ $BACKEND_ERRORS -ne 0 ]; then
        echo ""
        echo "后端问题:"
        echo "  - 直接返回字典? → 使用 create_success_response()"
        echo "  - 使用全局连接? → 使用 pool.get_connection()"
        echo "  - 缺少 MessageCode? → 在 response_helpers.py 中定义"
    fi
    
    echo ""
    exit 1
fi
