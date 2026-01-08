#!/bin/bash

# DuckQuery Lint 规则安装脚本

set -e

echo "🚀 开始安装 DuckQuery 自定义 Lint 规则..."

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否在项目根目录
if [ ! -f "package.json" ] || [ ! -d "lint-rules" ]; then
    echo -e "${RED}❌ 错误: 请在项目根目录运行此脚本${NC}"
    exit 1
fi

echo ""
echo "📦 步骤 1/4: 安装前端 ESLint 规则..."
cd lint-rules/eslint
if [ ! -d "node_modules" ]; then
    npm install
fi
npm link
cd ../..

echo ""
echo "📦 步骤 2/4: 链接前端规则到项目..."
cd frontend
npm link eslint-plugin-duckquery
cd ..

echo ""
echo "🐍 步骤 3/4: 安装后端 Pylint 规则..."
cd lint-rules/pylint
pip install -e .
cd ../..

echo ""
echo "⚙️  步骤 4/4: 配置 Lint 工具..."

# 备份现有配置
if [ -f "frontend/.eslintrc.js" ]; then
    echo -e "${YELLOW}⚠️  备份现有 ESLint 配置到 .eslintrc.js.backup${NC}"
    cp frontend/.eslintrc.js frontend/.eslintrc.js.backup
fi

if [ -f "api/.pylintrc" ]; then
    echo -e "${YELLOW}⚠️  备份现有 Pylint 配置到 .pylintrc.backup${NC}"
    cp api/.pylintrc api/.pylintrc.backup
fi

# 使用新配置
cp frontend/.eslintrc.duckquery.js frontend/.eslintrc.js
cp api/.pylintrc.duckquery api/.pylintrc

echo ""
echo -e "${GREEN}✅ 安装完成！${NC}"
echo ""
echo "📝 下一步:"
echo "  1. 运行 'npm run lint' 检查前端代码"
echo "  2. 运行 'cd api && pylint .' 检查后端代码"
echo "  3. 或运行 './scripts/check-all.sh' 一次性检查所有代码"
echo ""
echo "💡 提示:"
echo "  - 编辑器会自动显示 Lint 错误"
echo "  - Git 提交前会自动运行检查"
echo "  - CI/CD 流程会自动拦截不合规代码"
echo ""
