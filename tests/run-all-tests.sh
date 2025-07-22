#!/bin/bash

# 聚合测试脚本 - 自动执行所有测试检查代码问题
# 遵循原则：不动已通过测试的代码，只修复错误场景，建立完整测试体系

echo "🧪 聚合测试执行器"
echo "================"
echo "目标：自动执行所有测试脚本，检查代码问题"
echo "原则：1.不动已通过测试的代码 2.只修复错误场景 3.建立完整测试体系"
echo ""

# 测试结果统计
TOTAL_SCRIPTS=0
PASSED_SCRIPTS=0
FAILED_SCRIPTS=0
FAILED_TESTS=()

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$SCRIPT_DIR/scripts"

# 测试脚本执行函数
run_test_script() {
    local script_name="$1"
    local script_path="$TESTS_DIR/$script_name"
    
    TOTAL_SCRIPTS=$((TOTAL_SCRIPTS + 1))
    echo "[$TOTAL_SCRIPTS] 执行测试: $script_name"
    echo "----------------------------------------"
    
    if [ ! -f "$script_path" ]; then
        echo "❌ 脚本不存在: $script_path"
        FAILED_SCRIPTS=$((FAILED_SCRIPTS + 1))
        FAILED_TESTS+=("$script_name - 脚本不存在")
        return 1
    fi
    
    if [ ! -x "$script_path" ]; then
        chmod +x "$script_path"
    fi
    
    # 执行测试脚本
    if cd "$(dirname "$SCRIPT_DIR")" && "$script_path"; then
        echo "✅ $script_name 测试通过"
        PASSED_SCRIPTS=$((PASSED_SCRIPTS + 1))
        return 0
    else
        echo "❌ $script_name 测试失败"
        FAILED_SCRIPTS=$((FAILED_SCRIPTS + 1))
        FAILED_TESTS+=("$script_name")
        return 1
    fi
}

echo "📋 可用测试脚本列表："
echo "==================="
ls -1 "$TESTS_DIR"/*.sh 2>/dev/null | while read script; do
    basename "$script"
done

echo ""
echo "🚀 开始执行测试脚本"
echo "=================="

# 1. 核心功能测试（最重要）
echo ""
echo "🔥 1. 核心功能测试"
echo "================="
run_test_script "test-all-functions.sh"

# 2. API功能测试
echo ""
echo "🌐 2. API功能测试"
echo "================"
run_test_script "test-api-functions.sh"

# 3. 数据源功能测试
echo ""
echo "📁 3. 数据源功能测试"
echo "=================="
run_test_script "test-datasource-fixes.sh"

# 4. 查询功能测试
echo ""
echo "🔍 4. 查询功能测试"
echo "================"
run_test_script "test-query-fix.sh"

# 5. UI功能测试
echo ""
echo "🖥️  5. UI功能测试"
echo "==============="
run_test_script "test-ui-fixes.sh"

# 6. 表格显示测试
echo ""
echo "📊 6. 表格显示测试"
echo "================"
run_test_script "test-table-display-fix.sh"
run_test_script "test-datagrid-fix.sh"

# 7. 删除功能测试
echo ""
echo "🗑️  7. 删除功能测试"
echo "================="
run_test_script "test-delete-file-fix.sh"

# 8. SQL功能测试
echo ""
echo "💾 8. SQL功能测试"
echo "================"
run_test_script "test-sql-fix.sh"

# 9. 请求处理测试
echo ""
echo "🔄 9. 请求处理测试"
echo "================"
run_test_script "test-request-fix.sh"

echo ""
echo "📊 聚合测试结果统计"
echo "=================="
echo "总测试脚本数: $TOTAL_SCRIPTS"
echo "通过脚本数: $PASSED_SCRIPTS"
echo "失败脚本数: $FAILED_SCRIPTS"

if [ $FAILED_SCRIPTS -eq 0 ]; then
    echo ""
    echo "🎉 所有测试脚本执行成功！"
    echo "✅ 代码质量检查通过"
    echo "✅ 所有功能正常工作"
    echo ""
    echo "📋 测试覆盖范围："
    echo "- 核心功能测试"
    echo "- API接口测试"
    echo "- 数据源管理测试"
    echo "- 查询功能测试"
    echo "- UI界面测试"
    echo "- 表格显示测试"
    echo "- 删除功能测试"
    echo "- SQL执行测试"
    echo "- 请求处理测试"
    
    exit 0
else
    echo ""
    echo "⚠️  有 $FAILED_SCRIPTS 个测试脚本失败"
    echo ""
    echo "❌ 失败的测试脚本："
    for failed_test in "${FAILED_TESTS[@]}"; do
        echo "   - $failed_test"
    done
    
    echo ""
    echo "🔧 修复建议："
    echo "1. 检查失败的测试脚本输出"
    echo "2. 按照修复原则进行问题修复"
    echo "3. 重新运行此聚合测试脚本"
    echo "4. 确保所有测试通过后再进行代码提交"
    
    exit 1
fi
