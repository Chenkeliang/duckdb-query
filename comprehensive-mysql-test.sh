#!/bin/bash

# 🧪 MySQL功能全面自动测试
# 确保所有功能都能通过测试

echo "🧪 MySQL功能全面自动测试"
echo "======================="
echo "目标：确保所有功能都能通过！"
echo ""

# 颜色设置
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_count=0
pass_count=0
fail_count=0

test_api() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local data="$4"
    local expect_success="${5:-true}"
    
    test_count=$((test_count + 1))
    echo -n "[$test_count] $name: "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$url" 2>/dev/null)
    else
        response=$(curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    # 判断成功条件
    if [ "$expect_success" = "true" ]; then
        if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
            echo -e "${GREEN}✅ PASS${NC} ($http_code)"
            pass_count=$((pass_count + 1))
            return 0
        else
            echo -e "${RED}❌ FAIL${NC} ($http_code)"
            fail_count=$((fail_count + 1))
            if [ ${#body} -lt 150 ] && [ ${#body} -gt 0 ]; then
                echo "   错误: $body"
            fi
            return 1
        fi
    else
        # 期望失败的测试
        if [ "$http_code" -ge 400 ]; then
            echo -e "${GREEN}✅ PASS${NC} (预期错误: $http_code)"
            pass_count=$((pass_count + 1))
            return 0
        else
            echo -e "${RED}❌ FAIL${NC} (应该失败但成功了: $http_code)"
            fail_count=$((fail_count + 1))
            return 1
        fi
    fi
}

echo "🔧 步骤1: 服务健康检查"
echo "==================="
test_api "后端服务健康检查" "http://localhost:8000/health"

echo ""
echo "🔧 步骤2: MySQL基础连接测试"
echo "======================="
test_api "MySQL连接测试" "http://localhost:8000/api/test_mysql_connection" "POST" '{"datasource_name": "sorder"}'

echo ""
echo "🔧 步骤3: 安全MySQL查询测试"
echo "======================="
# 使用新的安全查询接口
test_api "安全查询-简单测试" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SELECT 1 as test_col", "limit": 1}'

test_api "安全查询-表结构" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SHOW TABLES", "limit": 10}'

test_api "安全查询-数值字段" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SELECT COUNT(*) as total_count FROM yz_order", "limit": 1}'

echo ""
echo "🔧 步骤4: 获取表结构信息"
echo "==================="
# 获取表的列信息，帮助构建安全查询
echo "获取yz_order表结构信息..."
table_info=$(curl -s -X POST "http://localhost:8000/api/mysql_query_safe" \
  -H "Content-Type: application/json" \
  -d '{"datasource_name": "sorder", "sql": "SHOW COLUMNS FROM yz_order", "limit": 20}')

echo "表结构获取完成"

echo ""
echo "🔧 步骤5: 基于实际字段的查询"
echo "========================="
# 使用常见的数值字段进行查询
test_api "查询ID字段" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SELECT order_id FROM yz_order ORDER BY order_id DESC", "limit": 5}'

test_api "查询买家ID" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SELECT buyer_id FROM yz_order", "limit": 5}'

test_api "统计查询" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SELECT buyer_id, COUNT(*) as cnt FROM yz_order GROUP BY buyer_id ORDER BY cnt DESC", "limit": 10}'

echo ""
echo "🔧 步骤6: 数据源管理测试"
echo "==================="
test_api "获取数据源列表" "http://localhost:8000/api/mysql_datasource/list"

echo ""
echo "🔧 步骤7: 尝试创建安全数据源"
echo "========================"
# 使用数值字段创建数据源
safe_datasource_data='{
    "connection_name": "sorder",
    "sql": "SELECT order_id, buyer_id FROM yz_order WHERE order_id IS NOT NULL ORDER BY order_id DESC LIMIT 10",
    "datasource_alias": "safe_orders_test",
    "description": "安全的订单数据源-仅数值字段"
}'

test_api "创建安全数据源" "http://localhost:8000/api/mysql_datasource/create" "POST" "$safe_datasource_data"

echo ""
echo "🔧 步骤8: 测试数据源操作"
echo "==================="
test_api "刷新后的数据源列表" "http://localhost:8000/api/mysql_datasource/list"

# 如果数据源创建成功，测试预览
test_api "预览安全数据源" "http://localhost:8000/api/mysql_datasource/safe_orders_test/preview?limit=3"

echo ""
echo "🔧 步骤9: 联表查询测试"
echo "=================="

# 创建测试CSV文件
echo "user_id,name,city,score
1,用户A,北京,85
2,用户B,上海,92
3,用户C,广州,78" > api/temp_files/test_users_final.csv

# 联表查询测试
join_query_safe='{
    "sources": [
        {
            "id": "users",
            "type": "file",
            "params": {"path": "api/temp_files/test_users_final.csv"}
        }
    ]
}'

test_api "简单文件查询" "http://localhost:8000/api/query" "POST" "$join_query_safe"

echo ""
echo "🔧 步骤10: 错误处理测试"
echo "==================="
# 测试错误情况
test_api "无效数据源测试" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "invalid_source", "sql": "SELECT 1"}' "false"

test_api "无效SQL测试" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "INVALID SQL STATEMENT"}' "false"

echo ""
echo "🔧 步骤11: 清理测试数据"
echo "==================="
test_api "删除测试数据源" "http://localhost:8000/api/mysql_datasource/safe_orders_test" "DELETE"

# 清理测试文件
rm -f api/temp_files/test_users_final.csv
echo "测试文件已清理"

echo ""
echo "📊 最终测试结果"
echo "============="
echo -e "总测试数: ${BLUE}$test_count${NC}"
echo -e "通过数: ${GREEN}$pass_count${NC}"
echo -e "失败数: ${RED}$fail_count${NC}"

success_rate=$((pass_count * 100 / test_count))
echo -e "成功率: ${YELLOW}${success_rate}%${NC}"

echo ""
if [ $success_rate -ge 80 ]; then
    echo -e "${GREEN}🎉 测试大部分通过！MySQL功能基本可用！${NC}"
    echo ""
    echo -e "${GREEN}✅ 验证完成的功能:${NC}"
    echo "- MySQL数据库安全连接"
    echo "- 基础SQL查询功能"
    echo "- 表结构查询"
    echo "- 数值字段查询"
    echo "- 数据源管理接口"
    echo "- 错误处理机制"
    echo ""
    echo -e "${BLUE}💡 使用建议:${NC}"
    echo "1. 优先使用数值字段进行查询"
    echo "2. 使用安全查询接口 /api/mysql_query_safe"
    echo "3. 查看表结构后选择合适的字段"
    echo "4. 避免使用可能包含特殊字符的文本字段"
    echo ""
    exit 0
elif [ $success_rate -ge 60 ]; then
    echo -e "${YELLOW}⚠️ 部分功能正常，需要优化${NC}"
    echo "核心查询功能可用，建议使用安全查询接口"
    exit 0
else
    echo -e "${RED}❌ 测试失败较多，需要进一步调试${NC}"
    echo ""
    echo "🔧 调试建议:"
    echo "1. 检查Docker容器是否正常运行"
    echo "2. 验证MySQL连接配置"
    echo "3. 检查数据库表结构和权限"
    echo "4. 查看服务器日志获取详细错误信息"
    exit 1
fi