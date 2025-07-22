#!/bin/bash

# 简化的API测试脚本

API_BASE="http://localhost:8000"

echo "🧪 DataQuery Pro API 功能测试"
echo "================================"

echo ""
echo "1. 健康检查"
curl -s "$API_BASE/health" | head -3
echo ""

echo "2. 根路径"
curl -s "$API_BASE/" | head -3
echo ""

echo "3. 获取文件列表"
curl -s "$API_BASE/api/list_files" | head -3
echo ""

echo "4. 获取数据库连接列表"
curl -s "$API_BASE/api/database_connections" | head -3
echo ""

echo "5. 测试SQL执行"
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"sql": "SELECT 1 as test_column"}' \
  "$API_BASE/api/execute_sql" | head -3
echo ""

echo "6. 创建测试文件并上传"
cat > test_upload.csv << 'EOF'
id,name,age
1,张三,25
2,李四,30
EOF

echo "上传文件测试:"
curl -s -X POST -F "file=@test_upload.csv" "$API_BASE/api/upload" | head -3
echo ""

echo "7. 检查上传的文件"
curl -s "$API_BASE/api/list_files" | head -5
echo ""

echo "8. 预览上传的数据"
curl -s "$API_BASE/api/file_preview/test_upload.csv?rows=3" | head -5
echo ""

echo "9. 获取文件列名"
curl -s "$API_BASE/api/file_columns?filename=test_upload.csv" | head -3
echo ""

# 清理
rm -f test_upload.csv

echo "测试完成！"
echo "如果看到JSON响应，说明API正常工作"
echo "如果看到错误信息，说明需要检查后端服务"
