#!/bin/bash

# Docker API 修复验证测试
# 测试前端通过代理访问后端 API 的功能

echo "🔧 Docker API 修复验证测试"
echo "=========================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0

# 测试函数
test_api() {
    local test_name="$1"
    local url="$2"
    local expected_status="$3"
    local description="$4"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "测试 $TOTAL_TESTS: $test_name ... "
    
    # 发送请求并获取状态码
    response=$(curl -s -w "%{http_code}" -o /tmp/api_response "$url" 2>/dev/null)
    status_code="${response: -3}"
    
    if [ "$status_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ 通过${NC} ($description)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        
        # 如果是 JSON 响应，显示部分内容
        if [[ "$url" == *"/api/"* ]]; then
            content=$(cat /tmp/api_response | head -c 100)
            echo "   响应预览: ${content}..."
        fi
    else
        echo -e "${RED}✗ 失败${NC} (期望: $expected_status, 实际: $status_code)"
        echo "   URL: $url"
        if [ -f /tmp/api_response ]; then
            echo "   响应内容: $(cat /tmp/api_response | head -c 200)"
        fi
    fi
    echo ""
}

echo "🌐 1. 基础服务测试"
echo "=================="

# 前端服务测试
test_api "前端服务" "http://localhost:3000" "200" "前端页面正常加载"

# 后端服务测试
test_api "后端健康检查" "http://localhost:8000/health" "200" "后端服务正常运行"

echo ""
echo "🔗 2. API 代理测试"
echo "=================="

# 通过前端代理访问后端 API
test_api "文件列表API(代理)" "http://localhost:3000/api/list_files" "200" "通过前端代理获取文件列表"

test_api "数据库连接API(代理)" "http://localhost:3000/api/database_connections" "200" "通过前端代理获取数据库连接"

# 直接访问后端 API（对比测试）
test_api "文件列表API(直接)" "http://localhost:8000/api/list_files" "200" "直接访问后端获取文件列表"

test_api "数据库连接API(直接)" "http://localhost:8000/api/database_connections" "200" "直接访问后端获取数据库连接"

echo ""
echo "📊 3. 数据一致性测试"
echo "=================="

# 比较代理和直接访问的结果是否一致
echo -n "测试 $((TOTAL_TESTS + 1)): 数据一致性检查 ... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))

proxy_response=$(curl -s "http://localhost:3000/api/list_files")
direct_response=$(curl -s "http://localhost:8000/api/list_files")

if [ "$proxy_response" = "$direct_response" ]; then
    echo -e "${GREEN}✓ 通过${NC} (代理和直接访问返回相同数据)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ 失败${NC} (代理和直接访问返回不同数据)"
    echo "   代理响应: $proxy_response"
    echo "   直接响应: $direct_response"
fi

echo ""
echo "🐳 4. Docker 容器状态检查"
echo "========================"

# 检查容器状态
echo -n "测试 $((TOTAL_TESTS + 1)): Docker 容器状态 ... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))

container_status=$(docker-compose -f config/docker/docker-compose.yml ps)

if echo "$container_status" | grep -q "Up" && echo "$container_status" | grep -q "healthy"; then
    echo -e "${GREEN}✓ 通过${NC} (所有容器正常运行)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
    echo "$container_status"
else
    echo -e "${RED}✗ 失败${NC} (容器状态异常)"
    echo "$container_status"
fi

echo ""
echo "📋 测试总结"
echo "=========="
echo "总测试数: $TOTAL_TESTS"
echo "通过测试: $PASSED_TESTS"
echo "失败测试: $((TOTAL_TESTS - PASSED_TESTS))"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 所有测试通过！Docker API 修复成功！${NC}"
    exit 0
else
    echo -e "${RED}❌ 部分测试失败，需要进一步检查${NC}"
    exit 1
fi

# 清理临时文件
rm -f /tmp/api_response
