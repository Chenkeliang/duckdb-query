#!/bin/bash

# 新 UI 组件验证标准 - 自动化检查脚本
# 用途：根据 VERIFICATION_STANDARD.md 自动检查组件是否符合标准
# 使用：./VERIFICATION_STANDARD_CHECK.sh ComponentName

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查参数
if [ -z "$1" ]; then
    echo -e "${RED}❌ 错误：请提供组件名称${NC}"
    echo "使用方法: $0 ComponentName"
    echo "示例: $0 DataPasteCard"
    exit 1
fi

COMPONENT_NAME=$1
COMPONENT_FILE="frontend/src/new/DataSource/${COMPONENT_NAME}.tsx"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔍 新 UI 组件验证标准 - 自动化检查${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "组件名称: ${COMPONENT_NAME}"
echo "组件文件: ${COMPONENT_FILE}"
echo ""

# 检查项计数
TOTAL=0
PASSED=0
FAILED=0
WARNINGS=0

# ============================================
# 第一部分：代码层面验证
# ============================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 第一部分：代码层面验证${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1.1 文件结构检查
echo "1.1 文件结构检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((TOTAL++))
if [ -f "$COMPONENT_FILE" ]; then
    echo -e "${GREEN}✅ 组件文件存在${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 组件文件不存在: $COMPONENT_FILE${NC}"
    ((FAILED++))
    echo ""
    echo -e "${RED}验证失败：组件文件不存在，无法继续验证${NC}"
    exit 1
fi

((TOTAL++))
if [[ "$COMPONENT_FILE" == *.tsx ]]; then
    echo -e "${GREEN}✅ 使用 .tsx 扩展名${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 未使用 .tsx 扩展名${NC}"
    ((FAILED++))
fi
echo ""

# 1.2 代码规范检查
echo "1.2 代码规范检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查硬编码颜色
((TOTAL++))
HARDCODED_COLORS=$(grep -E "#[0-9a-fA-F]{3,6}|rgb\(|hsl\(|bg-blue-[0-9]|bg-red-[0-9]|bg-green-[0-9]" "$COMPONENT_FILE" | wc -l)
if [ "$HARDCODED_COLORS" -eq 0 ]; then
    echo -e "${GREEN}✅ 无硬编码颜色${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 发现 $HARDCODED_COLORS 处硬编码颜色${NC}"
    echo -e "${YELLOW}   提示：使用语义化类名如 bg-surface, text-foreground${NC}"
    ((FAILED++))
fi

# 检查 CSS 变量直接使用
((TOTAL++))
CSS_VARS=$(grep -c "var(--dq-" "$COMPONENT_FILE" || echo "0")
if [ "$CSS_VARS" -eq 0 ]; then
    echo -e "${GREEN}✅ 无直接使用 CSS 变量${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  发现 $CSS_VARS 处直接使用 CSS 变量${NC}"
    echo -e "${YELLOW}   提示：使用 Tailwind 类名代替 var(--dq-*)${NC}"
    ((WARNINGS++))
fi

# 检查 i18n 使用
((TOTAL++))
I18N_USAGE=$(grep -c "t(\"" "$COMPONENT_FILE" || echo "0")
if [ "$I18N_USAGE" -gt 0 ]; then
    echo -e "${GREEN}✅ 使用 i18n 翻译 ($I18N_USAGE 处)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现 i18n 使用${NC}"
    echo -e "${YELLOW}   提示：用户可见文本应使用 t(\"key\")${NC}"
    ((WARNINGS++))
fi

# 检查 shadcn/ui 组件使用
((TOTAL++))
SHADCN_IMPORTS=$(grep -E "from \"@/new/components/ui/" "$COMPONENT_FILE" | wc -l)
if [ "$SHADCN_IMPORTS" -gt 0 ]; then
    echo -e "${GREEN}✅ 使用 shadcn/ui 组件 ($SHADCN_IMPORTS 个)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现 shadcn/ui 组件导入${NC}"
    echo -e "${YELLOW}   提示：优先使用 shadcn/ui 组件${NC}"
    ((WARNINGS++))
fi
echo ""

# 1.3 构建验证
echo "1.3 构建验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
((TOTAL++))
echo -e "${YELLOW}⏳ 正在构建...（这可能需要 20-30 秒）${NC}"
cd frontend
if npm run build > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 前端构建成功${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 前端构建失败${NC}"
    echo -e "${YELLOW}   提示：运行 'cd frontend && npm run build' 查看详细错误${NC}"
    ((FAILED++))
fi
cd ..
echo ""

# ============================================
# 第二部分：功能层面验证
# ============================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 第二部分：功能层面验证${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 2.1 Toast 通知系统
echo "2.1 Toast 通知系统"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 showNotification prop
((TOTAL++))
if grep -q "showNotification" "$COMPONENT_FILE"; then
    echo -e "${GREEN}✅ 接收 showNotification prop${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 未接收 showNotification prop${NC}"
    ((FAILED++))
fi

# 检查 notify 函数定义
((TOTAL++))
if grep -q "const notify = " "$COMPONENT_FILE"; then
    echo -e "${GREEN}✅ 定义 notify 函数${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 未定义 notify 函数${NC}"
    ((FAILED++))
fi

# 检查 notify 调用次数
((TOTAL++))
NOTIFY_CALLS=$(grep -c "notify(" "$COMPONENT_FILE" || echo "0")
if [ "$NOTIFY_CALLS" -gt 0 ]; then
    echo -e "${GREEN}✅ 调用 notify 函数 ($NOTIFY_CALLS 次)${NC}"
    ((PASSED++))
else
    echo -e "${RED}❌ 未调用 notify 函数${NC}"
    ((FAILED++))
fi

# 检查成功 Toast
((TOTAL++))
SUCCESS_TOAST=$(grep -c "notify.*success" "$COMPONENT_FILE" || echo "0")
if [ "$SUCCESS_TOAST" -gt 0 ]; then
    echo -e "${GREEN}✅ 有成功 Toast ($SUCCESS_TOAST 处)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现成功 Toast${NC}"
    ((WARNINGS++))
fi

# 检查错误 Toast
((TOTAL++))
ERROR_TOAST=$(grep -c "notify.*error" "$COMPONENT_FILE" || echo "0")
if [ "$ERROR_TOAST" -gt 0 ]; then
    echo -e "${GREEN}✅ 有错误 Toast ($ERROR_TOAST 处)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现错误 Toast${NC}"
    ((WARNINGS++))
fi
echo ""

# 2.2 数据刷新机制
echo "2.2 数据刷新机制"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查回调 prop
((TOTAL++))
if grep -qE "onDataSourceSaved|onSuccess|onComplete" "$COMPONENT_FILE"; then
    echo -e "${GREEN}✅ 接收回调 prop${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现回调 prop${NC}"
    echo -e "${YELLOW}   提示：添加 onDataSourceSaved 等回调${NC}"
    ((WARNINGS++))
fi

# 检查回调调用
((TOTAL++))
CALLBACK_CALLS=$(grep -cE "onDataSourceSaved\?\.|onSuccess\?\.|onComplete\?\." "$COMPONENT_FILE" || echo "0")
if [ "$CALLBACK_CALLS" -gt 0 ]; then
    echo -e "${GREEN}✅ 调用回调函数 ($CALLBACK_CALLS 次)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未调用回调函数${NC}"
    ((WARNINGS++))
fi
echo ""

# 2.3 错误处理
echo "2.3 错误处理"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 try-catch
((TOTAL++))
TRY_CATCH=$(grep -c "try {" "$COMPONENT_FILE" || echo "0")
CATCH_BLOCKS=$(grep -c "catch" "$COMPONENT_FILE" || echo "0")
if [ "$TRY_CATCH" -gt 0 ] && [ "$CATCH_BLOCKS" -gt 0 ]; then
    echo -e "${GREEN}✅ 使用 try-catch ($TRY_CATCH 处)${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现 try-catch 错误处理${NC}"
    ((WARNINGS++))
fi

# 检查错误状态
((TOTAL++))
if grep -qE "setError|error.*useState" "$COMPONENT_FILE"; then
    echo -e "${GREEN}✅ 有错误状态管理${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现错误状态管理${NC}"
    ((WARNINGS++))
fi
echo ""

# 2.4 用户交互
echo "2.4 用户交互"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 loading 状态
((TOTAL++))
if grep -qE "loading|isLoading" "$COMPONENT_FILE"; then
    echo -e "${GREEN}✅ 有 loading 状态${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现 loading 状态${NC}"
    ((WARNINGS++))
fi

# 检查 disabled 状态
((TOTAL++))
if grep -q "disabled" "$COMPONENT_FILE"; then
    echo -e "${GREEN}✅ 有 disabled 状态${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠️  未发现 disabled 状态${NC}"
    ((WARNINGS++))
fi
echo ""

# ============================================
# 总结
# ============================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 验证结果总结${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "总检查项: $TOTAL"
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"
echo -e "警告: ${YELLOW}$WARNINGS${NC}"
echo ""

# 计算通过率
PASS_RATE=$((PASSED * 100 / TOTAL))
echo "通过率: ${PASS_RATE}%"
echo ""

# 判断结果
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}🎉 自动化验证通过！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "✅ 代码层面检查通过"
    echo "✅ 功能层面检查通过"
    
    if [ $WARNINGS -gt 0 ]; then
        echo ""
        echo -e "${YELLOW}⚠️  有 $WARNINGS 个警告项，建议优化${NC}"
    fi
    
    echo ""
    echo "📝 下一步：手动验证（10分钟）"
    echo "   1. 启动应用"
    echo "   2. 测试 Toast 通知"
    echo "   3. 测试数据刷新"
    echo "   4. 测试错误处理"
    echo "   5. 测试用户体验"
    echo ""
    echo "📖 详细指南: .kiro/specs/VERIFICATION_STANDARD.md"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ 验证失败！${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${RED}发现 $FAILED 个问题，请修复后重新验证${NC}"
    echo ""
    echo "📖 修复指南: .kiro/specs/VERIFICATION_STANDARD.md"
    echo "   查看 '常见问题修复指南' 部分"
    exit 1
fi
