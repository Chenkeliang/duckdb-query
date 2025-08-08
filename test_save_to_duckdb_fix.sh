#!/bin/bash

echo "=== 测试保存查询结果到DuckDB功能修复 ==="

# 测试API端点是否可用
echo "1. 测试API端点可用性..."
curl -s -X POST "http://localhost:3000/api/save_query_to_duckdb" \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT 1 as test_col",
    "table_alias": "test_table_fix",
    "datasource": {
      "id": "duckdb_internal",
      "type": "duckdb"
    }
  }' | jq '.'

echo -e "\n2. 测试缺少参数的情况（应该返回400错误）..."
curl -s -X POST "http://localhost:3000/api/save_query_to_duckdb" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.detail'

echo -e "\n=== 测试完成 ==="
echo "如果第一个测试返回成功消息，说明修复有效！"