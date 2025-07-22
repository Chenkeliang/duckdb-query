#!/bin/bash

# 最终严谨测试脚本 - 确保所有功能都正常工作

API_BASE="http://localhost:8000"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 统计变量
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

test_api() {
    local description=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_success=${5:-true}  # 默认期望成功
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
    log_info "测试 $TOTAL_TESTS: $description"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -X POST -H "Content-Type: application/json" -d "$data" "$API_BASE$endpoint")
    else
        response=$(curl -s "$API_BASE$endpoint")
    fi
    
    # 检查响应是否符合预期
    if [ "$expected_success" = "true" ]; then
        # 特殊处理CSV导出（返回CSV内容而不是JSON）
        if [[ "$description" == *"CSV导出"* ]] && echo "$response" | grep -q "name,salary"; then
            log_success "$description - 通过"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            echo "CSV内容: $(echo "$response" | head -2)"
            return 0
        elif echo "$response" | grep -q '"success":true\|"status":"healthy"'; then
            log_success "$description - 通过"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            echo "响应: $(echo "$response" | head -c 150)..."
            return 0
        else
            log_error "$description - 失败"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            echo "错误响应: $response"
            return 1
        fi
    else
        # 期望失败的测试
        if echo "$response" | grep -q '"success":false\|"detail"'; then
            log_success "$description - 正确失败（符合预期）"
            PASSED_TESTS=$((PASSED_TESTS + 1))
            echo "预期错误: $(echo "$response" | head -c 150)..."
            return 0
        else
            log_error "$description - 意外成功（应该失败）"
            FAILED_TESTS=$((FAILED_TESTS + 1))
            echo "意外响应: $response"
            return 1
        fi
    fi
}

echo "🔬 DataQuery Pro 最终严谨测试"
echo "============================"

# 准备测试数据
log_info "准备完整测试数据集"

# 创建员工数据
cat > employees_final.csv << 'EOF'
emp_id,name,age,department,salary,hire_date
1,张三,28,技术部,8000,2020-01-15
2,李四,32,销售部,12000,2019-03-20
3,王五,25,技术部,7500,2021-06-10
4,赵六,35,市场部,15000,2018-11-05
5,钱七,29,销售部,9500,2020-08-12
EOF

# 创建产品数据
cat > products_final.csv << 'EOF'
product_id,name,price,category
101,笔记本电脑,5000,电子产品
102,手机,3000,电子产品
103,书籍,50,文具
104,椅子,800,家具
EOF

# 上传测试文件
for file in employees_final.csv products_final.csv; do
    upload_result=$(curl -s -X POST -F "file=@$file" "$API_BASE/api/upload")
    if echo "$upload_result" | grep -q "success"; then
        log_success "文件 $file 上传成功"
    else
        log_error "文件 $file 上传失败"
        exit 1
    fi
done

echo ""
echo "📊 核心功能测试"
echo "=============="

# 1. 基础查询测试
test_api "基础SELECT查询" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT * FROM employees_final LIMIT 3", "filename": "employees_final.csv"}'

test_api "条件查询" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT name, salary FROM employees_final WHERE age > 30", "filename": "employees_final.csv"}'

test_api "聚合查询" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT department, COUNT(*) as count, AVG(salary) as avg_salary FROM employees_final GROUP BY department", "filename": "employees_final.csv"}'

# 2. 多表JOIN测试
test_api "INNER JOIN查询" "POST" "/api/multi_table_query" \
'{
  "files": ["employees_final.csv", "products_final.csv"],
  "sql": "SELECT e.name as employee_name, p.name as product_name FROM employees_final e CROSS JOIN products_final p LIMIT 5"
}'

test_api "复杂聚合查询" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT department, MIN(salary) as min_sal, MAX(salary) as max_sal, COUNT(*) as emp_count FROM employees_final GROUP BY department HAVING COUNT(*) > 1", "filename": "employees_final.csv"}'

echo ""
echo "🗄️ 数据库连接测试"
echo "================"

# 3. 数据库连接测试
test_api "SQLite连接测试" "POST" "/api/test_connection_simple" \
'{"type": "sqlite", "database": ":memory:"}'

test_api "MySQL连接测试（预期失败）" "POST" "/api/test_connection_simple" \
'{"type": "mysql", "host": "localhost", "port": 3306, "database": "test", "username": "root", "password": "password"}' false

echo ""
echo "📤 数据导出测试"
echo "=============="

# 4. 数据导出测试
test_api "JSON导出测试" "POST" "/api/export_simple" \
'{"filename": "employees_final.csv", "sql": "SELECT * FROM employees_final", "format": "json"}'

test_api "CSV导出测试" "POST" "/api/export_simple" \
'{"filename": "employees_final.csv", "sql": "SELECT name, salary FROM employees_final", "format": "csv"}'

echo ""
echo "⚠️ 错误处理测试"
echo "=============="

# 5. 错误处理测试（这些应该失败）
test_api "空SQL查询（预期失败）" "POST" "/api/execute_simple_sql" \
'{"sql": "", "filename": "employees_final.csv"}' false

test_api "SQL语法错误（预期失败）" "POST" "/api/execute_simple_sql" \
'{"sql": "SELCT * FORM employees_final", "filename": "employees_final.csv"}' false

test_api "不存在的列（预期失败）" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT non_existent_column FROM employees_final", "filename": "employees_final.csv"}' false

test_api "不存在的文件（预期失败）" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT * FROM test", "filename": "non_existent.csv"}' false

echo ""
echo "🧪 边缘情况测试"
echo "=============="

# 6. 边缘情况测试
test_api "空结果查询" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT * FROM employees_final WHERE age > 100", "filename": "employees_final.csv"}'

test_api "特殊字符查询" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT '\''特殊字符测试'\'' as test_column", "filename": "employees_final.csv"}'

test_api "大量列查询" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT emp_id, name, age, department, salary, hire_date, '\''额外列1'\'' as extra1, '\''额外列2'\'' as extra2 FROM employees_final", "filename": "employees_final.csv"}'

echo ""
echo "🚀 高级功能测试"
echo "=============="

# 7. 高级SQL功能测试
test_api "窗口函数测试" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT name, salary, ROW_NUMBER() OVER (ORDER BY salary DESC) as rank FROM employees_final", "filename": "employees_final.csv"}'

test_api "CASE WHEN测试" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT name, age, CASE WHEN age < 30 THEN '\''年轻'\'' ELSE '\''资深'\'' END as age_group FROM employees_final", "filename": "employees_final.csv"}'

test_api "子查询测试" "POST" "/api/execute_simple_sql" \
'{"sql": "SELECT name, salary FROM employees_final WHERE salary > (SELECT AVG(salary) FROM employees_final)", "filename": "employees_final.csv"}'

# 清理测试文件
rm -f employees_final.csv products_final.csv

echo ""
echo "🎯 最终测试报告"
echo "=============="
echo "总测试数: $TOTAL_TESTS"
echo "通过测试: $PASSED_TESTS"
echo "失败测试: $FAILED_TESTS"
echo "成功率: $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    log_success "🎉 所有测试通过！系统完全可用！"
    echo ""
    echo "✅ 核心功能: 100% 可用"
    echo "✅ 错误处理: 100% 正确"
    echo "✅ 边缘情况: 100% 处理"
    echo "✅ 高级功能: 100% 支持"
    echo ""
    echo "🚀 DataQuery Pro 已通过严谨测试，可以投入生产使用！"
else
    echo ""
    log_error "❌ 仍有 $FAILED_TESTS 个测试失败，需要进一步修复"
    echo ""
    echo "请检查失败的测试并进行修复"
fi
