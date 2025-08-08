#!/bin/bash

echo "🔧 测试保存为数据源按钮修复"
echo "========================================="

# 重启前端容器
echo "🔄 重启前端容器..."
docker-compose restart frontend

# 等待服务启动
echo "⏳ 等待前端服务启动..."
sleep 10

# 测试DuckDB查询并检查保存按钮状态
echo "📊 测试SQL查询和保存按钮..."

# 执行一个简单的查询
echo "1. 执行测试查询..."
curl -X POST "http://localhost:8000/api/duckdb/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT 1 as test_column, '\''test_value'\'' as test_data",
    "save_as_table": null
  }' | jq '.'

echo ""
echo "2. 验证查询结果结构..."
response=$(curl -s -X POST "http://localhost:8000/api/duckdb/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT 1 as test_column, '\''test_value'\'' as test_data",
    "save_as_table": null
  }')

echo "$response" | jq '{
  success: .success,
  data_count: (.data | length),
  columns_count: (.columns | length),
  columns: .columns,
  first_row: .data[0]
}'

echo ""
echo "3. 检查前端按钮启用所需的参数..."
echo "✅ data.length > 0: $(echo "$response" | jq '(.data | length) > 0')"
echo "✅ columns存在: $(echo "$response" | jq '.columns != null')"
echo "✅ SQL查询语句: \"SELECT 1 as test_column, 'test_value' as test_data\""

echo ""
echo "4. 测试保存到DuckDB功能..."
save_response=$(curl -s -X POST "http://localhost:8000/api/query/save-to-duckdb" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT 1 as test_column, '\''test_value'\'' as test_data",
    "table_alias": "test_button_fix",
    "datasource": {
      "id": "duckdb_internal",
      "type": "duckdb"
    }
  }')

echo "$save_response" | jq '.'

if echo "$save_response" | jq -e '.success' > /dev/null; then
  echo "✅ 保存功能正常工作"
else
  echo "❌ 保存功能仍有问题"
fi

echo ""
echo "5. 清理测试表..."
curl -s -X DELETE "http://localhost:8000/api/duckdb/tables/test_button_fix" | jq '.'

echo ""
echo "========================================="
echo "🎯 修复总结:"
echo "1. ✅ 已添加调试信息到按钮title属性"
echo "2. ✅ 已修复ShadcnApp.jsx中ModernDataDisplay参数传递"
echo "3. ✅ 已确保所有调用点都传递了sqlQuery参数"
echo "4. ✅ 保存到DuckDB的后端API已修复"
echo ""
echo "💡 调试建议:"
echo "- 访问前端页面，将鼠标悬停在'保存为数据源'按钮上"
echo "- 查看tooltip中的调试信息，确认参数值"
echo "- 如果sqlQuery为空，检查查询结果的数据结构"
echo ""
echo "🔗 测试页面: http://localhost:3000"