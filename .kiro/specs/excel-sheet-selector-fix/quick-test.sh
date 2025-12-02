#!/bin/bash

# 新 UI 数据源管理 - 快速测试脚本
# 用途：自动化检查代码和构建状态

echo "🚀 新 UI 数据源管理 - 快速验证"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查项计数
PASSED=0
FAILED=0

# 1. 检查 DataPasteCard.tsx 是否存在
echo "📋 1. 检查文件存在性..."
if [ -f "frontend/src/new/DataSource/DataPasteCard.tsx" ]; then
    echo -e "${GREEN}✅ DataPasteCard.tsx 存在${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ DataPasteCard.tsx 不存在${NC}"
    ((FAILED++))
fi

# 2. 检查 notify 函数定义
echo ""
echo "📋 2. 检查 notify 函数定义..."
if grep -q "const notify = (message, severity" frontend/src/new/DataSource/DataPasteCard.tsx; then
    echo -e "${GREEN}✅ notify 函数已定义${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ notify 函数未定义${NC}"
    ((FAILED++))
fi

# 3. 检查 notify 调用次数
echo ""
echo "📋 3. 检查 notify 调用次数..."
NOTIFY_COUNT=$(grep -c "notify(" frontend/src/new/DataSource/DataPasteCard.tsx)
if [ "$NOTIFY_COUNT" -ge 7 ]; then
    echo -e "${GREEN}✅ 找到 $NOTIFY_COUNT 个 notify 调用（预期 ≥7）${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 只找到 $NOTIFY_COUNT 个 notify 调用（预期 ≥7）${NC}"
    ((FAILED++))
fi

# 4. 检查 showNotification prop
echo ""
echo "📋 4. 检查 showNotification prop..."
if grep -q "showNotification" frontend/src/new/DataSource/DataPasteCard.tsx; then
    echo -e "${GREEN}✅ showNotification prop 已接收${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ showNotification prop 未接收${NC}"
    ((FAILED++))
fi

# 5. 检查 DuckQueryApp 中的传递
echo ""
echo "📋 5. 检查 DuckQueryApp 中的 prop 传递..."
if grep -A 10 "DataPasteCard" frontend/src/DuckQueryApp.jsx | grep -q "showNotification"; then
    echo -e "${GREEN}✅ DuckQueryApp 正确传递 showNotification${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ DuckQueryApp 未传递 showNotification${NC}"
    ((FAILED++))
fi

# 6. 构建检查
echo ""
echo "📋 6. 检查前端构建..."
echo -e "${YELLOW}⏳ 正在构建...（这可能需要 20-30 秒）${NC}"
cd frontend
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 前端构建成功${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 前端构建失败${NC}"
    ((FAILED++))
fi
cd ..

# 总结
echo ""
echo "================================"
echo "📊 测试结果总结"
echo "================================"
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 所有自动化检查通过！${NC}"
    echo ""
    echo "✅ 代码修复已正确应用"
    echo "✅ 构建成功，无错误"
    echo ""
    echo "📝 下一步：手动测试（5分钟）"
    echo "   1. 启动后端: cd api && python -m uvicorn main:app --reload"
    echo "   2. 启动前端: cd frontend && npm run dev"
    echo "   3. 访问: http://localhost:5173"
    echo "   4. 测试数据粘贴功能，检查 Toast 通知"
    echo ""
    echo "📖 详细测试指南: .kiro/specs/excel-sheet-selector-fix/QUICK_TEST_CHECKLIST.md"
    exit 0
else
    echo -e "${RED}❌ 发现 $FAILED 个问题，请检查！${NC}"
    exit 1
fi
