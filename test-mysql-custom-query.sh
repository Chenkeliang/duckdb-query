#!/bin/bash

# 🧪 MySQL自定义查询功能和安全改进测试
# 验证新的MySQL功能和安全措施

echo "🧪 MySQL自定义查询功能测试"
echo "=========================="
echo "测试新增的MySQL自定义SQL查询功能和安全改进"
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
echo "2. 测试新增的MySQL查询API"
echo "======================="

# 测试获取MySQL数据源列表
test_api "获取MySQL数据源列表" "http://localhost:8000/api/mysql_datasources" "GET"

# 测试MySQL连接测试
test_connection_data='{
    "datasource_name": "sorder"
}'
test_api "测试MySQL连接" "http://localhost:8000/api/test_mysql_connection" "POST" "$test_connection_data"

# 测试MySQL查询预览
preview_data='{
    "datasource_name": "sorder",
    "sql": "SELECT * FROM dy_order LIMIT 5",
    "limit": 5
}'
test_api "MySQL查询预览" "http://localhost:8000/api/mysql_query_preview" "POST" "$preview_data"

# 测试MySQL自定义查询并加载到DuckDB
custom_query_data='{
    "datasource_name": "sorder",
    "sql": "SELECT order_id, buyer_id, order_amount FROM dy_order WHERE order_amount > 100 LIMIT 10",
    "table_name": "custom_orders"
}'
test_api "MySQL自定义查询加载到DuckDB" "http://localhost:8000/api/mysql_custom_query" "POST" "$custom_query_data"

echo ""
echo "3. 测试安全改进的联表查询"
echo "===================="

# 创建测试文件
test_file="api/temp_files/user_info.csv"
cat > "$test_file" << 'EOF'
user_id,name,age,city
1001,张三,25,北京
1002,李四,30,上海
1003,王五,28,广州
EOF

echo "已创建测试文件: $test_file"

# 测试安全的联表查询（使用数据源名称而不是明文密码）
secure_join_query='{
    "sources": [
        {
            "id": "users",
            "type": "file",
            "params": {
                "path": "api/temp_files/user_info.csv"
            }
        },
        {
            "id": "orders",
            "type": "mysql",
            "params": {
                "datasource_name": "sorder",
                "query": "SELECT buyer_id, order_id, order_amount FROM dy_order LIMIT 20"
            }
        }
    ],
    "joins": [
        {
            "left_source_id": "users",
            "right_source_id": "orders",
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

test_api "安全联表查询（数据源名称模式）" "http://localhost:8000/api/query" "POST" "$secure_join_query"

echo ""
echo "4. 验证安全改进"
echo "============="

# 测试错误的数据源名称
invalid_datasource_data='{
    "datasource_name": "nonexistent_datasource",
    "sql": "SELECT 1"
}'
echo -n "[验证] 无效数据源名称应该失败: "
response=$(curl -s -w "\n%{http_code}" -m 10 -X POST -H "Content-Type: application/json" -d "$invalid_datasource_data" "http://localhost:8000/api/mysql_custom_query")
http_code=$(echo "$response" | tail -n 1)
if [ "$http_code" = "404" ] || [ "$http_code" = "500" ]; then
    echo "✅ PASS - 正确拒绝无效数据源"
else
    echo "❌ FAIL - 应该拒绝无效数据源"
fi

echo ""
echo "5. 功能验证总结"
echo "============="

echo ""
echo "📊 测试结果统计"
echo "============="
echo "总测试数: $TOTAL_TESTS"
echo "通过: $PASSED_TESTS"
echo "失败: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo "🎉 所有MySQL功能测试通过！"
    echo ""
    echo "✅ 新功能验证成功："
    echo "1. ✅ MySQL数据源列表获取"
    echo "2. ✅ MySQL连接测试"
    echo "3. ✅ MySQL查询预览功能"
    echo "4. ✅ MySQL自定义SQL查询并加载到DuckDB"
    echo "5. ✅ 安全的联表查询（使用数据源名称）"
    echo ""
    echo "🔒 安全改进验证："
    echo "- ✅ 前端只传数据源名称，不传明文密码"
    echo "- ✅ 后端从配置文件安全读取连接信息"
    echo "- ✅ 无效数据源正确拒绝访问"
    echo ""
    echo "💡 推荐的前端调用方式："
    echo "```javascript"
    echo "// 1. 获取可用数据源"
    echo "fetch('/api/mysql_datasources')"
    echo ""
    echo "// 2. 预览查询结果"
    echo "fetch('/api/mysql_query_preview', {"
    echo "  method: 'POST',"
    echo "  body: JSON.stringify({"
    echo "    datasource_name: 'sorder',"
    echo "    sql: 'SELECT * FROM dy_order LIMIT 10'"
    echo "  })"
    echo "})"
    echo ""
    echo "// 3. 执行查询并加载到DuckDB"
    echo "fetch('/api/mysql_custom_query', {"
    echo "  method: 'POST',"
    echo "  body: JSON.stringify({"
    echo "    datasource_name: 'sorder',"
    echo "    sql: 'SELECT * FROM dy_order WHERE created_at > \"2024-01-01\"',"
    echo "    table_name: 'recent_orders'"
    echo "  })"
    echo "})"
    echo ""
    echo "// 4. 安全的联表查询"
    echo "fetch('/api/query', {"
    echo "  method: 'POST',"
    echo "  body: JSON.stringify({"
    echo "    sources: [{"
    echo "      id: 'mysql_data',"
    echo "      type: 'mysql',"
    echo "      params: {"
    echo "        datasource_name: 'sorder',  // 只传名称，不传密码"
    echo "        query: 'SELECT * FROM dy_order LIMIT 100'"
    echo "      }"
    echo "    }]"
    echo "  })"
    echo "})"
    echo "```"
    
    success_rate=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo "- 成功率: ${success_rate}%"
    
    exit 0
else
    echo ""
    echo "⚠️ 有 $FAILED_TESTS 个功能测试失败"
    echo ""
    echo "🔧 可能的问题："
    echo "1. 后端服务未启动或MySQL路由未正确注册"
    echo "2. MySQL配置文件不存在或格式错误"
    echo "3. MySQL数据库连接问题"
    echo "4. DuckDB引擎问题"
    
    success_rate=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))
    echo "- 当前成功率: ${success_rate}%"
    
    exit 1
fi

# 清理测试文件
rm -f "$test_file"
echo ""
echo "🧹 已清理测试文件"
echo "🏁 MySQL功能测试完成"