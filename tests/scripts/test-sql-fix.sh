#!/bin/bash

# 测试修复后的SQL执行功能

API_BASE="http://localhost:8000"

echo "🧪 测试修复后的SQL执行功能"
echo "================================"

# 1. 创建测试文件
echo "1. 创建测试文件"
cat > test_sql_fix.csv << 'EOF'
id,name,age,city,salary
1,张三,25,北京,8000
2,李四,30,上海,12000
3,王五,28,广州,9500
4,赵六,35,深圳,15000
5,钱七,27,杭州,11000
EOF

# 2. 上传文件
echo "2. 上传测试文件"
upload_result=$(curl -s -X POST -F "file=@test_sql_fix.csv" "$API_BASE/api/upload")
echo "上传结果: $upload_result"

# 3. 测试简化的SQL执行
echo ""
echo "3. 测试简化的SQL执行 (新API)"
sql_result=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM test_sql_fix LIMIT 3", "filename": "test_sql_fix.csv"}' \
  "$API_BASE/api/execute_simple_sql")
echo "简化SQL执行结果: $sql_result"

# 4. 测试聚合查询
echo ""
echo "4. 测试聚合查询"
agg_result=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sql": "SELECT city, AVG(salary) as avg_salary, COUNT(*) as count FROM test_sql_fix GROUP BY city", "filename": "test_sql_fix.csv"}' \
  "$API_BASE/api/execute_simple_sql")
echo "聚合查询结果: $agg_result"

# 5. 测试条件查询
echo ""
echo "5. 测试条件查询"
filter_result=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sql": "SELECT name, age, salary FROM test_sql_fix WHERE age > 28 ORDER BY salary DESC", "filename": "test_sql_fix.csv"}' \
  "$API_BASE/api/execute_simple_sql")
echo "条件查询结果: $filter_result"

# 6. 测试原有的SQL执行API（修复后的格式）
echo ""
echo "6. 测试原有的SQL执行API（修复后的格式）"
original_result=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sql": "SELECT COUNT(*) as total_records FROM test_sql_fix", "datasource": {"type": "file", "filename": "test_sql_fix.csv"}}' \
  "$API_BASE/api/execute_sql")
echo "原有API执行结果: $original_result"

# 清理
rm -f test_sql_fix.csv

echo ""
echo "🎯 SQL功能测试总结"
echo "=================="
if echo "$sql_result" | grep -q "success"; then
    echo "✅ 简化SQL执行功能正常"
else
    echo "❌ 简化SQL执行功能有问题"
fi

if echo "$agg_result" | grep -q "success"; then
    echo "✅ 聚合查询功能正常"
else
    echo "❌ 聚合查询功能有问题"
fi

if echo "$filter_result" | grep -q "success"; then
    echo "✅ 条件查询功能正常"
else
    echo "❌ 条件查询功能有问题"
fi

echo ""
echo "📋 使用说明："
echo "- 使用 /api/execute_simple_sql 进行简单查询"
echo "- 参数格式: {\"sql\": \"SELECT * FROM table_name\", \"filename\": \"file.csv\"}"
echo "- 表名使用文件名（不含扩展名）"
