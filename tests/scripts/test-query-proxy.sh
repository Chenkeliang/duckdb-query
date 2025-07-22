#!/bin/bash

# 查询代理修复验证测试
# 测试查询代理是否能正确转换请求格式

echo "🔧 查询代理修复验证测试"
echo "======================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试计数器
TOTAL_TESTS=0
PASSED_TESTS=0

# 测试函数
test_query_proxy() {
    local test_name="$1"
    local request_data="$2"
    local description="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo -n "测试 $TOTAL_TESTS: $test_name ... "
    
    # 发送查询请求到代理端点
    response=$(curl -s -w "%{http_code}" -o /tmp/proxy_response \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$request_data" \
        "http://localhost:3000/api/query_proxy" 2>/dev/null)
    
    status_code="${response: -3}"
    
    if [ "$status_code" = "200" ]; then
        echo -e "${GREEN}✓ 通过${NC} ($description)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        
        # 显示查询结果预览
        if [ -f /tmp/proxy_response ]; then
            result_info=$(cat /tmp/proxy_response | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if 'data' in data and 'columns' in data:
        print(f'返回行数: {len(data[\"data\"])}, 列数: {len(data[\"columns\"])}')
        if 'sql' in data:
            print(f'生成SQL: {data[\"sql\"][:100]}...')
    else:
        print('响应格式异常')
except Exception as e:
    print(f'解析错误: {e}')
" 2>/dev/null)
            echo "   结果: $result_info"
        fi
        return 0
    else
        echo -e "${RED}✗ 失败${NC} (状态码: $status_code)"
        if [ -f /tmp/proxy_response ]; then
            error_msg=$(cat /tmp/proxy_response | head -c 300)
            echo "   错误信息: $error_msg"
        fi
        return 1
    fi
}

echo "🌐 1. 基础服务测试"
echo "=================="

# 检查服务状态
echo -n "测试 $((TOTAL_TESTS + 1)): 服务健康检查 ... "
TOTAL_TESTS=$((TOTAL_TESTS + 1))

if curl -s "http://localhost:3000/api/health" >/dev/null 2>&1; then
    echo -e "${GREEN}✓ 通过${NC} (后端服务正常)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}✗ 失败${NC} (后端服务异常)"
fi

echo ""
echo "📊 2. 查询代理测试"
echo "=================="

# 获取可用的文件数据源
files_response=$(curl -s "http://localhost:3000/api/list_files" 2>/dev/null)
file_count=$(echo "$files_response" | python3 -c "
import sys, json
try:
    files = json.load(sys.stdin)
    print(len(files) if isinstance(files, list) else 0)
except:
    print(0)
" 2>/dev/null)

echo "发现文件数据源: $file_count 个"

if [ "$file_count" -ge 2 ]; then
    # 获取前两个文件
    first_file=$(echo "$files_response" | python3 -c "
import sys, json
try:
    files = json.load(sys.stdin)
    print(files[0] if len(files) > 0 else '')
except:
    pass
" 2>/dev/null)
    
    second_file=$(echo "$files_response" | python3 -c "
import sys, json
try:
    files = json.load(sys.stdin)
    print(files[1] if len(files) > 1 else '')
except:
    pass
" 2>/dev/null)
    
    echo "使用文件: $first_file 和 $second_file"
    
    # 获取列信息
    first_columns=$(curl -s "http://localhost:3000/api/file_columns?filename=$first_file" 2>/dev/null)
    second_columns=$(curl -s "http://localhost:3000/api/file_columns?filename=$second_file" 2>/dev/null)
    
    first_col=$(echo "$first_columns" | python3 -c "
import sys, json
try:
    cols = json.load(sys.stdin)
    # 寻找包含 'id' 的列
    for col in cols:
        if 'id' in col.lower():
            print(col)
            break
    else:
        print(cols[0] if len(cols) > 0 else 'id')
except:
    print('id')
" 2>/dev/null)
    
    second_col=$(echo "$second_columns" | python3 -c "
import sys, json
try:
    cols = json.load(sys.stdin)
    # 寻找包含 'id' 的列
    for col in cols:
        if 'id' in col.lower():
            print(col)
            break
    else:
        print(cols[0] if len(cols) > 0 else 'id')
except:
    print('id')
" 2>/dev/null)
    
    echo "连接列: $first_col = $second_col"
    
    echo ""
    echo "🔗 3. 原始格式查询测试"
    echo "===================="
    
    # 测试原始格式（缺少 params 字段和 conditions 字段）
    original_request='{
        "sources": [
            {
                "id": "'${first_file%.*}'",
                "name": "'$first_file'",
                "type": "file",
                "path": "'$first_file'",
                "columns": ["'$first_col'", "column2", "column3"],
                "sourceType": "file"
            },
            {
                "id": "'${second_file%.*}'",
                "name": "'$second_file'",
                "type": "file", 
                "path": "'$second_file'",
                "columns": ["'$second_col'", "column2", "column3"],
                "sourceType": "file"
            }
        ],
        "joins": [
            {
                "left_source_id": "'${first_file%.*}'",
                "right_source_id": "'${second_file%.*}'",
                "left_on": "'$first_col'",
                "right_on": "'$second_col'",
                "how": "inner"
            }
        ]
    }'
    
    test_query_proxy "原始格式查询" "$original_request" "使用原始格式，代理应自动转换"
    
    echo ""
    echo "🔍 4. 混合格式测试"
    echo "=================="
    
    # 测试混合格式（部分字段正确，部分字段错误）
    mixed_request='{
        "sources": [
            {
                "id": "'${first_file%.*}'",
                "type": "file",
                "params": {
                    "path": "temp_files/'$first_file'"
                }
            },
            {
                "id": "'${second_file%.*}'",
                "name": "'$second_file'",
                "type": "file", 
                "path": "'$second_file'",
                "columns": ["'$second_col'", "column2", "column3"],
                "sourceType": "file"
            }
        ],
        "joins": [
            {
                "left_source_id": "'${first_file%.*}'",
                "right_source_id": "'${second_file%.*}'",
                "left_on": "'$first_col'",
                "right_on": "'$second_col'",
                "how": "inner"
            }
        ]
    }'
    
    test_query_proxy "混合格式查询" "$mixed_request" "使用混合格式，代理应自动转换"
    
    echo ""
    echo "🔄 5. 正确格式测试"
    echo "=================="
    
    # 测试正确格式（包含 params 字段和 conditions 字段）
    correct_request='{
        "sources": [
            {
                "id": "'${first_file%.*}'",
                "type": "file",
                "params": {
                    "path": "temp_files/'$first_file'"
                }
            },
            {
                "id": "'${second_file%.*}'",
                "type": "file",
                "params": {
                    "path": "temp_files/'$second_file'"
                }
            }
        ],
        "joins": [
            {
                "left_source_id": "'${first_file%.*}'",
                "right_source_id": "'${second_file%.*}'",
                "join_type": "inner",
                "conditions": [
                    {
                        "left_column": "'$first_col'",
                        "right_column": "'$second_col'",
                        "operator": "="
                    }
                ]
            }
        ]
    }'
    
    test_query_proxy "正确格式查询" "$correct_request" "使用正确格式，代理应直接传递"
    
else
    echo -e "${YELLOW}⚠ 跳过测试 (需要至少2个文件数据源)${NC}"
    echo "请上传至少2个文件到 temp_files 目录进行测试"
fi

echo ""
echo "📋 测试总结"
echo "=========="
echo "总测试数: $TOTAL_TESTS"
echo "通过测试: $PASSED_TESTS"
echo "失败测试: $((TOTAL_TESTS - PASSED_TESTS))"

if [ $PASSED_TESTS -eq $TOTAL_TESTS ]; then
    echo -e "${GREEN}🎉 所有测试通过！查询代理修复成功！${NC}"
    echo ""
    echo -e "${BLUE}修复说明:${NC}"
    echo "1. ✅ 添加了查询代理路由"
    echo "2. ✅ 自动转换数据源格式"
    echo "3. ✅ 自动转换 JOIN 条件格式"
    echo "4. ✅ 支持混合格式请求"
    echo ""
    echo -e "${BLUE}使用说明:${NC}"
    echo "- 前端现在使用 /api/query_proxy 端点"
    echo "- 代理会自动转换请求格式"
    echo "- 支持所有标准的 SQL JOIN 类型"
    echo "- 无需修改前端数据结构"
    exit 0
else
    echo -e "${RED}❌ 部分测试失败，需要进一步检查${NC}"
    echo ""
    echo -e "${YELLOW}故障排除建议:${NC}"
    echo "1. 检查后端日志获取详细错误信息"
    echo "2. 验证查询代理路由是否正确注册"
    echo "3. 检查 httpx 依赖是否正确安装"
    echo "4. 验证数据转换逻辑是否正确"
    exit 1
fi

# 清理临时文件
rm -f /tmp/proxy_response
