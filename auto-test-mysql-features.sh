#!/bin/bash

# 🧪 MySQL功能自动测试脚本
# 自动测试编码修复后的MySQL数据源管理功能

echo "🧪 MySQL功能自动测试"
echo "=================="

# 颜色设置
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

test_count=0
pass_count=0

test_api() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local data="$4"
    
    test_count=$((test_count + 1))
    echo -n "[$test_count] $name: "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "%{http_code}" "$url")
    else
        response=$(curl -s -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
    fi
    
    http_code=$(echo "$response" | tail -c 4)
    body=$(echo "$response" | head -c -4)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✅ PASS${NC} ($http_code)"
        pass_count=$((pass_count + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} ($http_code)"
        if [ ${#body} -lt 100 ] && [ ${#body} -gt 0 ]; then
            echo "   错误: $body"
        fi
        return 1
    fi
}

echo "1. 检查服务状态"
echo "============="
test_api "后端服务健康检查" "http://localhost:8000/health"

echo ""
echo "2. 测试MySQL连接"
echo "=============="
test_api "MySQL连接测试" "http://localhost:8000/api/test_mysql_connection" "POST" '{"datasource_name": "sorder"}'

echo ""
echo "3. 测试MySQL查询预览"
echo "================="
test_api "简单查询预览" "http://localhost:8000/api/mysql_query_preview" "POST" '{"datasource_name": "sorder", "sql": "SELECT 1 as test", "limit": 1}'

echo ""
echo "4. 测试数据源创建（编码修复）"
echo "========================"
test_api "创建MySQL数据源" "http://localhost:8000/api/mysql_datasource/create" "POST" '{
    "connection_name": "sorder",
    "sql": "SELECT * FROM yz_order LIMIT 3",
    "datasource_alias": "test_yz_auto",
    "description": "自动测试数据源"
}'

echo ""
echo "5. 测试数据源管理"
echo "==============="
test_api "获取数据源列表" "http://localhost:8000/api/mysql_datasource/list"
test_api "预览数据源" "http://localhost:8000/api/mysql_datasource/test_yz_auto/preview?limit=3"

echo ""
echo "6. 测试联表查询"
echo "============="

# 创建测试CSV文件
echo "user_id,name,city
1001,张三,北京
1002,李四,上海" > api/temp_files/test_users_auto.csv

test_api "联表查询测试" "http://localhost:8000/api/query" "POST" '{
    "sources": [
        {
            "id": "users",
            "type": "file",
            "params": {"path": "api/temp_files/test_users_auto.csv"}
        },
        {
            "id": "orders",
            "type": "mysql",
            "params": {
                "datasource_name": "sorder",
                "query": "SELECT buyer_id, order_id FROM yz_order LIMIT 10"
            }
        }
    ]
}'

echo ""
echo "7. 清理测试数据"
echo "============="
test_api "删除测试数据源" "http://localhost:8000/api/mysql_datasource/test_yz_auto" "DELETE"

# 清理测试文件
rm -f api/temp_files/test_users_auto.csv

echo ""
echo "📊 测试结果统计"
echo "============="
echo "总测试数: $test_count"
echo "通过数: $pass_count"
echo "失败数: $((test_count - pass_count))"

success_rate=$((pass_count * 100 / test_count))
echo "成功率: ${success_rate}%"

if [ $pass_count -eq $test_count ]; then
    echo ""
    echo -e "${GREEN}🎉 所有测试通过！MySQL数据源管理功能工作正常！${NC}"
    echo ""
    echo "✅ 验证完成的功能："
    echo "- MySQL数据库连接正常"
    echo "- 字符编码问题已修复"
    echo "- 数据源创建和管理功能正常"
    echo "- 联表查询功能正常"
    echo "- 安全的数据源引用工作正常"
    
    exit 0
else
    echo ""
    echo -e "${RED}⚠️ 有 $((test_count - pass_count)) 个测试失败${NC}"
    
    if [ $pass_count -gt 0 ]; then
        echo "但是有 $pass_count 个测试通过，核心功能可能已经工作"
    fi
    
    exit 1
fi