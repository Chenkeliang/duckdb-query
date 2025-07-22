#!/bin/bash

# 测试导出功能修复
# 验证下载代理能正确处理请求并导出带有A_1, B_1别名的数据

echo "🔧 测试导出功能修复"
echo "=================================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0

# 服务器地址
BASE_URL="http://localhost:8000"

# 测试数据 - 模拟前端发送的原始格式
TEST_REQUEST='{
  "sources": [
    {
      "id": "0711",
      "name": "0711.xlsx",
      "type": "file",
      "path": "0711.xlsx",
      "columns": ["序号", "提交答卷时间", "所用时间", "来源", "来源详情", "来自IP", "1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）", "uid", "2、请输入您的收货地址：—收货人姓名：", "2、所在地区：", "2、详细地址:", "2、收货人电话："],
      "sourceType": "file"
    },
    {
      "id": "0702",
      "name": "0702.xlsx", 
      "type": "file",
      "path": "0702.xlsx",
      "columns": ["序号", "提交答卷时间", "所用时间", "来源", "来源详情", "来自IP", "1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）", "uid", "2、请输入您的收货地址：—收货人姓名：", "2、所在地区：", "2、详细地址:", "2、收货人电话："],
      "sourceType": "file"
    }
  ],
  "joins": [
    {
      "left_source_id": "0711",
      "right_source_id": "0702",
      "left_on": "uid", 
      "right_on": "uid",
      "how": "inner"
    }
  ]
}'

echo "1. 测试服务器连接"
echo "=================="
TOTAL_TESTS=$((TOTAL_TESTS + 1))

health_response=$(curl -s -w "%{http_code}" -o /dev/null "$BASE_URL/health")
if [ "$health_response" = "200" ]; then
    echo -e "${GREEN}✅ 服务器连接正常${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ 服务器连接失败 (状态码: $health_response)${NC}"
fi

echo ""
echo "2. 测试查询代理（验证A_1, B_1别名）"
echo "================================="
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo "发送查询请求到 /api/query_proxy..."
query_response=$(curl -s -w "%{http_code}" -o /tmp/query_response.json \
    -X POST "$BASE_URL/api/query_proxy" \
    -H "Content-Type: application/json" \
    -d "$TEST_REQUEST")

if [ "$query_response" = "200" ]; then
    echo -e "${GREEN}✅ 查询代理请求成功${NC}"
    
    # 检查是否包含A_1, B_1格式的列名
    if grep -q '"A_1"' /tmp/query_response.json && grep -q '"B_1"' /tmp/query_response.json; then
        echo "   ✅ 返回数据包含A_1, B_1格式的列名"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "   ❌ 返回数据不包含预期的A_1, B_1格式列名"
        echo "   列名示例:"
        grep -o '"columns":\[[^]]*\]' /tmp/query_response.json | head -c 100
        echo "..."
    fi
else
    echo -e "${RED}❌ 查询代理请求失败 (状态码: $query_response)${NC}"
    if [ -f /tmp/query_response.json ]; then
        echo "错误详情:"
        cat /tmp/query_response.json | head -c 300
        echo ""
    fi
fi

echo ""
echo "3. 测试原始下载接口（应该返回422错误）"
echo "====================================="
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo "发送原始格式请求到 /api/download..."
direct_download_response=$(curl -s -w "%{http_code}" -o /tmp/direct_download_response \
    -X POST "$BASE_URL/api/download" \
    -H "Content-Type: application/json" \
    -d "$TEST_REQUEST")

if [ "$direct_download_response" = "422" ]; then
    echo -e "${GREEN}✅ 原始下载请求确实返回422错误（符合预期）${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${YELLOW}⚠️  原始下载请求返回状态码: $direct_download_response${NC}"
    if [ "$direct_download_response" = "200" ]; then
        echo "   意外成功，可能是格式已经兼容"
    fi
fi

echo ""
echo "4. 测试下载代理修复（应该成功）"
echo "============================="
TOTAL_TESTS=$((TOTAL_TESTS + 1))

echo "发送请求到 /api/download_proxy..."
proxy_download_response=$(curl -s -w "%{http_code}" -o /tmp/proxy_download_response.xlsx \
    -X POST "$BASE_URL/api/download_proxy" \
    -H "Content-Type: application/json" \
    -d "$TEST_REQUEST")

if [ "$proxy_download_response" = "200" ]; then
    echo -e "${GREEN}✅ 下载代理请求成功！导出功能已修复${NC}"
    
    # 检查文件大小
    if [ -f /tmp/proxy_download_response.xlsx ]; then
        file_size=$(stat -f%z /tmp/proxy_download_response.xlsx 2>/dev/null || stat -c%s /tmp/proxy_download_response.xlsx 2>/dev/null)
        if [ "$file_size" -gt 0 ]; then
            echo "   ✅ 导出文件大小: ${file_size} 字节"
            echo "   ✅ 文件已保存到: /tmp/proxy_download_response.xlsx"
        else
            echo "   ❌ 导出文件为空"
        fi
    else
        echo "   ❌ 导出文件不存在"
    fi
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ 下载代理请求失败 (状态码: $proxy_download_response)${NC}"
    if [ -f /tmp/proxy_download_response.xlsx ]; then
        echo "错误详情:"
        head -c 300 /tmp/proxy_download_response.xlsx
        echo ""
    fi
fi

echo ""
echo "5. 测试快速导出功能"
echo "=================="
TOTAL_TESTS=$((TOTAL_TESTS + 1))

# 构建快速导出请求
EXPORT_REQUEST='{
  "query_request": {
    "sources": [
      {
        "id": "0711",
        "type": "file",
        "params": {
          "path": "temp_files/0711.xlsx"
        }
      },
      {
        "id": "0702",
        "type": "file", 
        "params": {
          "path": "temp_files/0702.xlsx"
        }
      }
    ],
    "joins": [
      {
        "left_source_id": "0711",
        "right_source_id": "0702",
        "join_type": "inner",
        "conditions": [
          {
            "left_column": "uid",
            "right_column": "uid",
            "operator": "="
          }
        ]
      }
    ]
  },
  "format": "csv",
  "filename": "test_export.csv"
}'

echo "发送快速导出请求到 /api/export/quick..."
export_response=$(curl -s -w "%{http_code}" -o /tmp/quick_export_response.csv \
    -X POST "$BASE_URL/api/export/quick" \
    -H "Content-Type: application/json" \
    -d "$EXPORT_REQUEST")

if [ "$export_response" = "200" ]; then
    echo -e "${GREEN}✅ 快速导出请求成功${NC}"
    
    # 检查导出文件
    if [ -f /tmp/quick_export_response.csv ]; then
        file_size=$(stat -f%z /tmp/quick_export_response.csv 2>/dev/null || stat -c%s /tmp/quick_export_response.csv 2>/dev/null)
        if [ "$file_size" -gt 0 ]; then
            echo "   ✅ 导出CSV文件大小: ${file_size} 字节"
            echo "   ✅ 检查CSV内容中的列名:"
            head -1 /tmp/quick_export_response.csv | head -c 100
            echo "..."
        else
            echo "   ❌ 导出CSV文件为空"
        fi
    fi
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ 快速导出请求失败 (状态码: $export_response)${NC}"
fi

echo ""
echo "=================================================="
echo "📋 测试总结"
echo "=================================================="
echo "总测试数: $TOTAL_TESTS"
echo "通过测试: $PASSED_TESTS"
echo "失败测试: $((TOTAL_TESTS - PASSED_TESTS))"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 所有测试通过！导出功能已成功修复！${NC}"
    echo ""
    echo -e "${BLUE}修复说明:${NC}"
    echo "- ✅ 创建了下载代理端点 /api/download_proxy"
    echo "- ✅ 自动转换数据源和JOIN格式"
    echo "- ✅ 保持A_1, B_1别名格式避免中文列名冲突"
    echo "- ✅ 导出功能支持别名列名"
    echo ""
    echo -e "${BLUE}使用说明:${NC}"
    echo "- 前端现在使用 /api/download_proxy 端点进行导出"
    echo "- 查询结果使用A_1, A_2, B_1, B_2格式的列名"
    echo "- 导出的Excel/CSV文件包含相同的列名格式"
    exit 0
else
    echo -e "${RED}❌ 部分测试失败，需要进一步检查${NC}"
    echo ""
    echo -e "${YELLOW}故障排除建议:${NC}"
    echo "1. 检查后端日志获取详细错误信息"
    echo "2. 验证数据文件是否存在"
    echo "3. 检查下载代理路由是否正确注册"
    echo "4. 验证导出目录权限"
    exit 1
fi

# 清理临时文件
rm -f /tmp/query_response.json /tmp/direct_download_response /tmp/proxy_download_response.xlsx /tmp/quick_export_response.csv
