#!/bin/bash

echo "=== 测试DuckDB表删除功能修复 ==="

# 测试API端点是否可用
echo "1. 检查DuckDB可用表..."
curl -s "http://localhost:3000/api/duckdb/available_tables" | jq '.success, .count'

echo -e "\n2. 测试删除不存在的表（应该返回404）..."
curl -s -X DELETE "http://localhost:3000/api/duckdb/tables/non_existent_table" | jq '.detail'

echo -e "\n=== 测试完成 ==="
echo "如果看到正确的错误消息而不是路由未找到错误，说明修复成功！"