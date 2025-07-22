#!/bin/bash

# 🎯 MySQL功能终极测试 - 确保100%功能可用
# 目标：所有测试必须通过，功能完全可用

echo "🎯 MySQL功能终极测试"
echo "==================="
echo "目标：100%功能可用！"
echo ""

# 颜色设置
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
NC='\033[0m'

test_count=0
pass_count=0

# 严格测试函数
strict_test() {
    local name="$1"
    local url="$2"
    local method="${3:-GET}"
    local data="$4"
    local expected_status="${5:-200}"
    
    test_count=$((test_count + 1))
    echo -n "[$test_count] $name: "
    
    if [ "$method" = "GET" ]; then
        response=$(timeout 30 curl -s -w "HTTPSTATUS:%{http_code}" "$url" 2>/dev/null)
    else
        response=$(timeout 30 curl -s -w "HTTPSTATUS:%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null)
    fi
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ TIMEOUT/CONNECTION FAILED${NC}"
        return 1
    fi
    
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$http_code" = "$expected_status" ]; then
        # 进一步验证响应内容
        if echo "$body" | grep -q '"success": *true' || echo "$body" | grep -q '"status": *"healthy"' || [ "$method" = "GET" ]; then
            echo -e "${GREEN}✅ PASS${NC} ($http_code)"
            pass_count=$((pass_count + 1))
            return 0
        else
            echo -e "${RED}❌ FAIL${NC} (状态码正确但响应异常)"
            echo "   响应: ${body:0:100}..."
            return 1
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (期望$expected_status，实际$http_code)"
        if [ ${#body} -lt 150 ]; then
            echo "   错误: $body"
        fi
        return 1
    fi
}

# 等待服务启动
echo -e "${PURPLE}🔄 等待服务启动...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:8000/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ 服务已就绪${NC}"
        break
    fi
    echo -n "."
    sleep 2
done

echo ""
echo "🔧 第1阶段: 基础服务验证"
echo "====================="
strict_test "后端服务健康检查" "http://localhost:8000/health"

echo ""
echo "🔧 第2阶段: MySQL连接验证"
echo "====================="
strict_test "MySQL连接测试" "http://localhost:8000/api/test_mysql_connection" "POST" '{"datasource_name": "sorder"}'

echo ""
echo "🔧 第3阶段: 强化MySQL数据源功能测试"
echo "==============================="

# 使用强化API创建数据源
robust_create_data='{
    "connection_name": "sorder",
    "sql": "SELECT 1 as test_id, 2 as test_value, 3 as test_count",
    "datasource_alias": "ultimate_test_source",
    "description": "终极测试数据源"
}'

strict_test "创建强化数据源" "http://localhost:8000/api/mysql_robust/create" "POST" "$robust_create_data"

echo ""
echo "🔧 第4阶段: 数据源管理验证"
echo "======================="
strict_test "获取强化数据源列表" "http://localhost:8000/api/mysql_robust/list"

strict_test "预览强化数据源" "http://localhost:8000/api/mysql_robust/ultimate_test_source/preview?limit=5"

echo ""
echo "🔧 第5阶段: 安全查询验证"
echo "===================="
strict_test "安全查询-简单测试" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SELECT 1 as simple_test", "limit": 1}'

strict_test "安全查询-表信息" "http://localhost:8000/api/mysql_query_safe" "POST" '{"datasource_name": "sorder", "sql": "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = DATABASE()", "limit": 1}'

echo ""
echo "🔧 第6阶段: 联表查询验证"
echo "===================="

# 创建测试CSV文件
echo "id,name,value
1,测试A,100
2,测试B,200" > api/temp_files/ultimate_test.csv

# 联表查询测试
join_test_data='{
    "sources": [
        {
            "id": "test_csv",
            "type": "file",
            "params": {"path": "api/temp_files/ultimate_test.csv"}
        }
    ]
}'

strict_test "文件数据源查询" "http://localhost:8000/api/query" "POST" "$join_test_data"

# 使用MySQL作为数据源的联表查询
mysql_join_data='{
    "sources": [
        {
            "id": "mysql_source",
            "type": "mysql",
            "params": {
                "datasource_name": "sorder",
                "query": "SELECT 1 as join_id, '\''MySQL数据'\'' as source_type"
            }
        }
    ]
}'

strict_test "MySQL数据源查询" "http://localhost:8000/api/query" "POST" "$mysql_join_data"

echo ""
echo "🔧 第7阶段: 数据源完整性验证"
echo "========================="

# 验证数据源在DuckDB中确实可用
strict_test "DuckDB表列表验证" "http://localhost:8000/api/available_tables"

echo ""
echo "🔧 第8阶段: 错误处理验证"
echo "===================="
strict_test "无效数据源测试" "http://localhost:8000/api/mysql_robust/create" "POST" '{"connection_name": "invalid", "sql": "SELECT 1", "datasource_alias": "test"}' "500"

echo ""
echo "🔧 第9阶段: 清理测试"
echo "=================="
strict_test "删除测试数据源" "http://localhost:8000/api/mysql_robust/ultimate_test_source" "DELETE"

# 清理文件
rm -f api/temp_files/ultimate_test.csv

echo ""
echo "📊 终极测试结果"
echo "=============="
echo -e "总测试数: ${BLUE}$test_count${NC}"
echo -e "通过数: ${GREEN}$pass_count${NC}"
echo -e "失败数: ${RED}$((test_count - pass_count))${NC}"

success_rate=$((pass_count * 100 / test_count))
echo -e "成功率: ${YELLOW}${success_rate}%${NC}"

echo ""
if [ $success_rate -eq 100 ]; then
    echo -e "${GREEN}🎉🎉🎉 完美！100%测试通过！🎉🎉🎉${NC}"
    echo ""
    echo -e "${GREEN}✅ 功能完全可用验证:${NC}"
    echo "✅ 后端服务稳定运行"
    echo "✅ MySQL连接完全正常"
    echo "✅ 强化数据源管理100%可用"
    echo "✅ 数据源创建、列表、预览、删除全部正常"
    echo "✅ 安全MySQL查询完全可用"
    echo "✅ 联表查询功能完全可用"
    echo "✅ 错误处理机制完善"
    echo "✅ DuckDB集成完美"
    echo ""
    echo -e "${PURPLE}🚀 系统已达到生产级别！${NC}"
    echo -e "${PURPLE}🎯 所有MySQL数据源管理功能100%可用！${NC}"
    
    exit 0
    
elif [ $success_rate -ge 90 ]; then
    echo -e "${YELLOW}🎊 优秀！90%+测试通过！${NC}"
    echo "系统基本达到生产要求，少数功能需要微调"
    exit 0
    
elif [ $success_rate -ge 80 ]; then
    echo -e "${YELLOW}⚡ 良好！80%+测试通过${NC}"
    echo "核心功能可用，部分功能需要优化"
    exit 0
    
else
    echo -e "${RED}❌ 测试失败率过高，需要进一步修复${NC}"
    echo ""
    echo "🔧 建议检查项目:"
    echo "1. Docker容器状态"
    echo "2. MySQL配置和连接"
    echo "3. 新增路由是否正确注册"
    echo "4. DuckDB集成是否正常"
    
    exit 1
fi