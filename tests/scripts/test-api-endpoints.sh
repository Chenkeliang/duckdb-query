#!/bin/bash

# API接口快速测试脚本
# 验证list_files和connect_database接口是否正常响应

echo "🔍 API接口快速测试"
echo "=================="
echo "测试目标接口：list_files 和 connect_database"
echo ""

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_api_endpoint() {
    local test_name="$1"
    local url="$2"
    local method="${3:-GET}"
    local data="$4"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "[$TOTAL_TESTS] $test_name: "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -m 10 "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -m 10 -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo "✅ PASS (状态码: $http_code)"
        if [ ${#body} -gt 100 ]; then
            echo "   响应: ${body:0:100}..."
        else
            echo "   响应: $body"
        fi
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    elif [ "$http_code" = "000" ]; then
        echo "❌ FAIL - 无法连接到服务器"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    else
        echo "❌ FAIL (状态码: $http_code)"
        echo "   错误: $body"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo "1. 基础连接测试"
echo "============="

# 测试后端服务是否运行
test_api_endpoint "后端健康检查" "http://localhost:8000/health" "GET"

echo ""
echo "2. 问题接口测试"
echo "============="

# 测试list_files接口
test_api_endpoint "list_files接口" "http://localhost:8000/api/list_files" "GET"

# 测试connect_database接口（应该是POST方法）
test_api_endpoint "connect_database接口" "http://localhost:8000/api/connect_database" "POST" '{
    "id": "test_connection",
    "type": "sqlite",
    "params": {
        "database": ":memory:",
        "query": "SELECT 1 as test_column"
    }
}'

echo ""
echo "3. 相关接口测试"
echo "============="

# 测试其他相关接口
test_api_endpoint "database_connections接口" "http://localhost:8000/api/database_connections" "GET"

test_api_endpoint "file_columns接口" "http://localhost:8000/api/file_columns?filename=test_unit.csv" "GET"

echo ""
echo "📊 测试结果统计"
echo "============="
echo "总测试数: $TOTAL_TESTS"
echo "通过: $PASSED_TESTS"
echo "失败: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo "🎉 所有API接口测试通过！"
    echo ""
    echo "✅ 修复验证结果："
    echo "- list_files接口正常响应"
    echo "- connect_database接口正常响应"
    echo "- 数据库连接相关接口正常"
    echo "- 文件相关接口正常"
    
    success_rate=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo "- 成功率: ${success_rate}%"
    
    exit 0
else
    echo ""
    echo "⚠️ 有 $FAILED_TESTS 个接口测试失败"
    echo ""
    echo "🔧 可能的问题："
    echo "1. 后端服务未启动 - 请运行: cd api && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
    echo "2. 代码语法错误 - 检查修改的Python代码"
    echo "3. 依赖包缺失 - 检查requirements.txt中的依赖"
    echo "4. 端口被占用 - 检查8000端口是否可用"
    
    success_rate=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo "- 当前成功率: ${success_rate}%"
    
    exit 1
fi