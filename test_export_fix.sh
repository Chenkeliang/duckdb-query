#!/bin/bash

echo "🎯 开始导出功能修复验证测试..."
echo "测试时间: $(date)"
echo "============================================================"

# 1. 检查后端健康状态
echo "🔍 检查后端服务状态..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs | grep -q "200"; then
    echo "✅ 后端API服务正常运行"
    backend_health=true
else
    echo "❌ 无法连接到后端服务"
    backend_health=false
fi
echo

# 2. 测试快速导出API（基准测试）
echo "📤 测试快速导出API..."
quick_export_data='{
  "data": [
    {"id": "1", "name": "测试数据1", "value": "100"},
    {"id": "2", "name": "测试数据2", "value": "200"},
    {"id": "3", "name": "中文测试", "value": "测试值"}
  ],
  "columns": ["id", "name", "value"],
  "filename": "quick_export_test_'$(date +%s)'"
}'

quick_export_response=$(curl -s -o quick_export_test.xlsx -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$quick_export_data" \
  http://localhost:8000/api/export/quick)

if [ "$quick_export_response" = "200" ]; then
    file_size=$(wc -c < quick_export_test.xlsx 2>/dev/null || echo "0")
    echo "✅ 快速导出API测试成功！"
    echo "   - 文件大小: ${file_size} bytes"
    quick_export=true
else
    echo "❌ 快速导出API测试失败: HTTP $quick_export_response"
    quick_export=false
fi
echo

# 3. 测试download_proxy端点（修复验证）
echo "🔧 测试download_proxy端点对DuckDB表的处理..."
download_proxy_data='{
  "sources": [
    {
      "id": "query_result_08071348_dy",
      "name": "query_result_08071348_dy",
      "sourceType": "duckdb",
      "type": "table",
      "columns": ["id","order_id","showcase_id","payment_fee"],
      "columnCount": 4
    }
  ],
  "joins": []
}'

download_proxy_response=$(curl -s -o download_proxy_test.xlsx -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$download_proxy_data" \
  http://localhost:8000/api/download_proxy)

if [ "$download_proxy_response" = "200" ]; then
    file_size=$(wc -c < download_proxy_test.xlsx 2>/dev/null || echo "0")
    if [ "$file_size" -gt "0" ]; then
        echo "✅ 下载代理测试成功！"
        echo "   - 文件大小: ${file_size} bytes"
        download_proxy=true
    else
        echo "❌ 下载代理测试失败: 生成文件为空"
        download_proxy=false
    fi
else
    echo "❌ 下载代理测试失败: HTTP $download_proxy_response"
    # 尝试获取错误信息
    echo "📋 错误详情:"
    curl -s -X POST \
      -H "Content-Type: application/json" \
      -d "$download_proxy_data" \
      http://localhost:8000/api/download_proxy | head -500
    download_proxy=false
fi
echo

# 总结报告
echo "============================================================"
echo "🎯 测试总结报告:"
echo "   - 后端服务状态: $([ "$backend_health" = true ] && echo "✅ 正常" || echo "❌ 异常")"
echo "   - 快速导出API: $([ "$quick_export" = true ] && echo "✅ 正常" || echo "❌ 异常")"
echo "   - 下载代理API: $([ "$download_proxy" = true ] && echo "✅ 正常" || echo "❌ 异常")"

# 计算通过率
success_count=0
[ "$backend_health" = true ] && success_count=$((success_count + 1))
[ "$quick_export" = true ] && success_count=$((success_count + 1))
[ "$download_proxy" = true ] && success_count=$((success_count + 1))

echo
echo "📊 测试通过率: ${success_count}/3 ($((success_count * 100 / 3))%)"

if [ "$download_proxy" = true ]; then
    echo "🎉 导出功能修复验证成功！download_proxy端点现在可以正确处理DuckDB表类型的数据源。"
    exit 0
else
    echo "⚠️ 导出功能仍有问题，需要进一步调试。"
    exit 1
fi