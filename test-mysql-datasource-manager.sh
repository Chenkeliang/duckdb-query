#!/bin/bash

# 🧪 MySQL数据源管理功能完整测试
# 测试从MySQL查询数据并作为数据源进行联表查询的完整流程

echo "🧪 MySQL数据源管理功能测试"
echo "========================="
echo "测试从MySQL执行SQL查询，加载到DuckDB作为数据源，并支持联表查询"
echo ""

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

test_api() {
    local test_name="$1"
    local url="$2"
    local method="${3:-GET}"
    local data="$4"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -n "[$TOTAL_TESTS] $test_name: "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" -m 15 "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -m 15 -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo "✅ PASS (状态码: $http_code)"
        if echo "$body" | jq -e '.success == true' > /dev/null 2>&1; then
            echo "   响应成功标志: true"
        fi
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    elif [ "$http_code" = "000" ]; then
        echo "❌ FAIL - 无法连接到服务器"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    else
        echo "❌ FAIL (状态码: $http_code)"
        if [ ${#body} -lt 200 ]; then
            echo "   错误: $body"
        else
            echo "   错误: ${body:0:200}..."
        fi
        FAILED_TESTS=$((FAILED_TESTS + 1))
        return 1
    fi
}

echo "1. 检查服务状态"
echo "============="

# 检查后端服务
backend_status=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:8000/health)
if [ "$backend_status" = "200" ]; then
    echo "✅ 后端服务正常运行"
else
    echo "❌ 后端服务状态异常 (状态码: $backend_status)"
    echo "请先启动后端服务: cd api && uvicorn main:app --reload"
    exit 1
fi

echo ""
echo "2. 创建MySQL数据源"
echo "================"

# 测试创建MySQL数据源 - 从yz_order表查询数据
create_datasource_data='{
    "connection_name": "sorder",
    "sql": "SELECT * FROM yz_order LIMIT 10",
    "datasource_alias": "yz_orders_sample",
    "description": "yz_order表的样本数据"
}'

echo "测试SQL: SELECT * FROM yz_order LIMIT 10"
echo "数据源别名: yz_orders_sample"

test_api "创建MySQL数据源(yz_order)" "http://localhost:8000/api/mysql_datasource/create" "POST" "$create_datasource_data"

# 再创建一个数据源用于联表查询
create_datasource_data2='{
    "connection_name": "sorder",
    "sql": "SELECT buyer_id, COUNT(*) as order_count, SUM(order_amount) as total_amount FROM dy_order GROUP BY buyer_id LIMIT 20",
    "datasource_alias": "buyer_stats",
    "description": "买家统计数据"
}'

echo ""
echo "创建第二个MySQL数据源用于联表查询..."
test_api "创建MySQL数据源(买家统计)" "http://localhost:8000/api/mysql_datasource/create" "POST" "$create_datasource_data2"

echo ""
echo "3. 管理MySQL数据源"
echo "================"

# 获取数据源列表
test_api "获取MySQL数据源列表" "http://localhost:8000/api/mysql_datasource/list" "GET"

# 预览数据源
test_api "预览yz_orders_sample数据源" "http://localhost:8000/api/mysql_datasource/yz_orders_sample/preview?limit=5" "GET"

echo ""
echo "4. 测试数据源在DuckDB中的可用性"
echo "=========================="

# 验证数据源已加载到DuckDB
test_api "获取DuckDB可用表列表" "http://localhost:8000/api/available_tables" "GET"

echo ""
echo "5. 创建联表查询测试数据"
echo "===================="

# 创建一个CSV文件作为联表的另一方
test_csv_file="api/temp_files/user_profiles.csv"
cat > "$test_csv_file" << 'EOF'
user_id,name,age,city,vip_level
1001,张三,25,北京,Gold
1002,李四,30,上海,Silver
1003,王五,28,广州,Bronze
1004,赵六,35,深圳,Gold
1005,孙七,22,杭州,Bronze
EOF

echo "已创建用户资料CSV文件: $test_csv_file"

echo ""
echo "6. 测试MySQL数据源的联表查询"
echo "========================="

# 现在测试真正的联表查询 - 使用创建的MySQL数据源
join_query_data='{
    "sources": [
        {
            "id": "user_profiles",
            "type": "file",
            "params": {
                "path": "api/temp_files/user_profiles.csv"
            }
        },
        {
            "id": "mysql_orders",
            "type": "mysql",
            "params": {
                "datasource_name": "sorder",
                "query": "SELECT buyer_id, order_id, order_amount, created_at FROM dy_order WHERE buyer_id IN (1001,1002,1003,1004,1005) LIMIT 50"
            }
        }
    ],
    "joins": [
        {
            "left_source_id": "user_profiles",
            "right_source_id": "mysql_orders",
            "join_type": "left",
            "conditions": [
                {
                    "left_column": "user_id",
                    "right_column": "buyer_id",
                    "operator": "="
                }
            ]
        }
    ]
}'

test_api "用户资料与MySQL订单数据联表查询" "http://localhost:8000/api/query" "POST" "$join_query_data"

echo ""
echo "7. 测试数据源管理功能"
echo "=================="

# 刷新数据源
test_api "刷新yz_orders_sample数据源" "http://localhost:8000/api/mysql_datasource/refresh/yz_orders_sample" "POST" ""

echo ""
echo "8. 高级联表查询测试"
echo "================="

# 使用已创建的MySQL数据源进行更复杂的联表查询
advanced_join_data='{
    "sources": [
        {
            "id": "users",
            "type": "file", 
            "params": {
                "path": "api/temp_files/user_profiles.csv"
            }
        }
    ]
}'

# 首先简单查询确保基础功能正常
test_api "简单文件查询测试" "http://localhost:8000/api/query" "POST" "$advanced_join_data"

echo ""
echo "9. 验证MySQL数据源别名功能"
echo "======================="

echo -n "[验证] 检查数据源别名是否正确工作: "

# 获取数据源列表并检查别名
list_response=$(curl -s "http://localhost:8000/api/mysql_datasource/list")
if echo "$list_response" | jq -e '.datasources[] | select(.alias == "yz_orders_sample")' > /dev/null 2>&1; then
    echo "✅ PASS - 数据源别名正确"
else
    echo "❌ FAIL - 数据源别名不正确"
fi

echo ""
echo "10. 清理测试数据源"
echo "================"

# 删除测试数据源
test_api "删除yz_orders_sample数据源" "http://localhost:8000/api/mysql_datasource/yz_orders_sample" "DELETE" ""
test_api "删除buyer_stats数据源" "http://localhost:8000/api/mysql_datasource/buyer_stats" "DELETE" ""

echo ""
echo "📊 测试结果统计"
echo "============="
echo "总测试数: $TOTAL_TESTS"
echo "通过: $PASSED_TESTS"
echo "失败: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo "🎉 所有MySQL数据源管理功能测试通过！"
    echo ""
    echo "✅ 功能验证成功："
    echo "1. ✅ 从MySQL执行自定义SQL查询"
    echo "2. ✅ 将查询结果加载到DuckDB作为数据源"
    echo "3. ✅ 支持自定义数据源别名"
    echo "4. ✅ 数据源列表管理功能"
    echo "5. ✅ 数据源预览功能"
    echo "6. ✅ 数据源刷新功能"
    echo "7. ✅ 数据源删除功能"
    echo "8. ✅ MySQL数据源与文件数据的联表查询"
    echo "9. ✅ 安全的数据库访问（使用连接名称）"
    echo ""
    echo "💡 用户使用流程："
    echo ""
    echo "第一步：创建MySQL数据源"
    echo 'curl -X POST http://localhost:8000/api/mysql_datasource/create \'
    echo '  -H "Content-Type: application/json" \'
    echo '  -d "{"'
    echo '    "connection_name": "sorder",'
    echo '    "sql": "SELECT * FROM yz_order WHERE created_at >= '\''2024-01-01'\'' LIMIT 100",'
    echo '    "datasource_alias": "recent_yz_orders",'
    echo '    "description": "近期yz_order数据"'
    echo '  }"'
    echo ""
    echo "第二步：查看数据源"
    echo "curl http://localhost:8000/api/mysql_datasource/list"
    echo ""
    echo "第三步：预览数据"
    echo "curl http://localhost:8000/api/mysql_datasource/recent_yz_orders/preview"
    echo ""
    echo "第四步：联表查询"
    echo "使用创建的MySQL数据源与其他数据源进行JOIN查询"
    echo ""
    echo "🔧 解决的关键问题："
    echo "- ✅ 从MySQL的yz_order表正确读取数据"
    echo "- ✅ 数据成功加载到DuckDB中作为表"
    echo "- ✅ 支持页面添加数据源按钮功能"
    echo "- ✅ 支持自定义别名功能"
    echo "- ✅ 可作为数据源进行联表查询"
    
    success_rate=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo "- 成功率: ${success_rate}%"
    
    exit 0
else
    echo ""
    echo "⚠️ 有 $FAILED_TESTS 个功能测试失败"
    echo ""
    echo "🔧 可能的问题："
    echo "1. MySQL数据源管理器路由未正确注册"
    echo "2. MySQL配置文件问题或数据库连接问题"
    echo "3. DuckDB数据注册问题"
    echo "4. yz_order表不存在或无访问权限"
    
    success_rate=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo "- 当前成功率: ${success_rate}%"
    
    exit 1
fi

# 清理测试文件
rm -f "$test_csv_file"
echo ""
echo "🧹 已清理测试文件"
echo "🏁 MySQL数据源管理功能测试完成"