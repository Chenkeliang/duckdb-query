#!/bin/bash

# API接口验证脚本
# 验证所有关键API接口的功能

BASE_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:3000"

echo "🚀 开始API接口验证..."
echo "=================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试函数
test_api() {
    local test_name="$1"
    local url="$2"
    local expected_status="$3"
    local method="${4:-GET}"
    local data="$5"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "测试 $test_name ... "
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$url")
    else
        response=$(curl -s -w "%{http_code}" "$url")
    fi
    
    status_code="${response: -3}"
    body="${response%???}"
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC} (状态码: $status_code)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (期望: $expected_status, 实际: $status_code)"
        echo "响应内容: $body"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

# 测试JSON响应格式
test_json_api() {
    local test_name="$1"
    local url="$2"
    local expected_field="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "测试 $test_name ... "
    
    response=$(curl -s "$url")
    
    if echo "$response" | python3 -c "import sys, json; data=json.load(sys.stdin); print('$expected_field' in data)" 2>/dev/null | grep -q "True"; then
        echo -e "${GREEN}✅ PASS${NC} (JSON格式正确)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (JSON格式错误或缺少字段: $expected_field)"
        echo "响应内容: $response"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo "1. 基础健康检查接口"
echo "--------------------------------"
test_api "健康检查" "$BASE_URL/health" "200"
test_json_api "健康检查JSON格式" "$BASE_URL/health" "status"

echo ""
echo "2. 数据源管理接口"
echo "--------------------------------"
test_api "获取可用表列表" "$BASE_URL/api/available_tables" "200"
test_json_api "表列表JSON格式" "$BASE_URL/api/available_tables" "success"

echo ""
echo "3. DuckDB管理接口"
echo "--------------------------------"
test_api "获取DuckDB表信息" "$BASE_URL/api/duckdb/tables" "200"

echo ""
echo "4. MySQL数据源接口"
echo "--------------------------------"
test_api "获取MySQL配置列表" "$BASE_URL/api/mysql_configs" "200"
test_api "获取MySQL数据源列表" "$BASE_URL/api/mysql_datasources" "200"

echo ""
echo "5. 查询相关接口"
echo "--------------------------------"
# 测试简单查询
query_data='{"sources": [], "joins": [], "select_columns": [], "filters": [], "limit": 10}'
test_api "查询接口基础测试" "$BASE_URL/api/query" "422" "POST" "$query_data"

echo ""
echo "6. 文件上传接口测试"
echo "--------------------------------"
# 创建测试文件
echo "id,name,age" > /tmp/test.csv
echo "1,Alice,25" >> /tmp/test.csv
echo "2,Bob,30" >> /tmp/test.csv

upload_response=$(curl -s -w "%{http_code}" -X POST -F "file=@/tmp/test.csv" "$BASE_URL/api/upload")
upload_status="${upload_response: -3}"
upload_body="${upload_response%???}"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$upload_status" = "200" ]; then
    echo -e "文件上传测试 ... ${GREEN}✅ PASS${NC} (状态码: $upload_status)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    
    # 验证上传后表是否可用
    sleep 2
    tables_response=$(curl -s "$BASE_URL/api/available_tables")
    if echo "$tables_response" | grep -q "test"; then
        echo -e "文件上传后表创建 ... ${GREEN}✅ PASS${NC}"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "文件上传后表创建 ... ${RED}❌ FAIL${NC}"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
else
    echo -e "文件上传测试 ... ${RED}❌ FAIL${NC} (状态码: $upload_status)"
    echo "响应内容: $upload_body"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# 清理测试文件
rm -f /tmp/test.csv

echo ""
echo "7. 前端页面可访问性"
echo "--------------------------------"
test_api "前端主页" "$FRONTEND_URL" "200"

echo ""
echo "=================================="
echo "📊 测试结果统计"
echo "=================================="
echo "总测试数: $TOTAL_TESTS"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}⚠️  有 $FAILED_TESTS 个测试失败${NC}"
    exit 1
fi
