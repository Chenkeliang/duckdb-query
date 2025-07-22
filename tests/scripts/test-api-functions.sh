#!/bin/bash

# API功能完整测试脚本
# 测试所有后端API端点和功能

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# API基础URL
API_BASE="http://localhost:8000"

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local data=$4
    
    echo ""
    log_info "测试: $description"
    echo "请求: $method $endpoint"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_BASE$endpoint")
    elif [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$data" "$API_BASE$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$API_BASE$endpoint")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        log_success "状态码: $http_code"
        echo "响应: $body" | head -n 3
    else
        log_error "状态码: $http_code"
        echo "错误: $body"
    fi
}

test_file_upload() {
    log_info "测试文件上传功能"
    
    # 创建测试CSV文件
    cat > test_data.csv << 'EOF'
id,name,age,city
1,张三,25,北京
2,李四,30,上海
3,王五,28,广州
4,赵六,35,深圳
EOF
    
    echo "上传测试文件: test_data.csv"
    response=$(curl -s -w "\n%{http_code}" -X POST -F "file=@test_data.csv" "$API_BASE/upload")
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        log_success "文件上传成功: $http_code"
        echo "响应: $body"
    else
        log_error "文件上传失败: $http_code"
        echo "错误: $body"
    fi
    
    # 清理测试文件
    rm -f test_data.csv
}

echo "🧪 DataQuery Pro API 功能测试"
echo "================================"

# 1. 健康检查
test_endpoint "GET" "/health" "健康检查"

# 2. 根路径
test_endpoint "GET" "/" "根路径访问"

# 3. 文件相关API
test_endpoint "GET" "/api/list_files" "获取文件列表"
test_endpoint "GET" "/api/file_exists?path=test.csv" "检查文件是否存在"

# 4. 数据源相关API
test_endpoint "GET" "/api/data_sources" "获取数据源列表"

# 5. 查询相关API
test_endpoint "POST" "/api/execute_query" "执行查询" '{"query": "SELECT 1 as test_column"}'

# 6. 数据库连接测试
test_endpoint "POST" "/api/test_connection" "测试数据库连接" '{
    "db_type": "mysql",
    "host": "localhost",
    "port": 3306,
    "database": "test",
    "username": "test",
    "password": "test"
}'

# 7. 文件上传测试
test_file_upload

# 8. 数据预览
test_endpoint "GET" "/api/preview_data?source=test_data.csv&limit=5" "数据预览"

# 9. 获取表结构
test_endpoint "GET" "/api/table_schema?source=test_data.csv" "获取表结构"

# 10. JOIN查询测试
test_endpoint "POST" "/api/join_query" "JOIN查询测试" '{
    "left_source": "test_data.csv",
    "right_source": "test_data.csv",
    "join_type": "inner",
    "join_conditions": [
        {
            "left_column": "id",
            "right_column": "id",
            "operator": "="
        }
    ],
    "selected_columns": ["left.name", "right.age"]
}'

echo ""
echo "🎯 测试完成总结"
echo "================"
log_info "如果看到大量✅，说明API功能正常"
log_info "如果看到❌，说明对应功能需要修复"
log_warning "请检查后端服务是否在 http://localhost:8000 运行"

echo ""
echo "📋 手动测试建议："
echo "1. 访问 http://localhost:8000/docs 查看API文档"
echo "2. 在前端测试文件上传功能"
echo "3. 测试数据库连接功能"
echo "4. 执行查询并查看结果"
