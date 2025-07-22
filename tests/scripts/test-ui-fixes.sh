#!/bin/bash

# 测试UI修复效果

echo "🔧 测试UI修复效果"
echo "================"

echo ""
echo "1. 测试数据源API响应"
echo "-------------------"

echo "📁 文件数据源："
curl -s http://localhost:8000/api/list_files | jq -r '.[]' | head -3

echo ""
echo "🗄️ 数据库连接："
curl -s http://localhost:8000/api/database_connections | jq '.connections[0] | {id, name, type}'

echo ""
echo "2. 测试Excel文件预览"
echo "-------------------"
echo "📊 0702.xlsx预览（应该返回200状态码）："
curl -s -w "HTTP状态码: %{http_code}\n" -o /dev/null http://localhost:8000/api/file_preview/0702.xlsx?rows=3

echo ""
echo "3. 前端页面状态"
echo "---------------"
echo "🌐 前端服务（应该返回200状态码）："
curl -s -w "HTTP状态码: %{http_code}\n" -o /dev/null http://localhost:3000

echo ""
echo "4. 修复验证清单"
echo "==============="
echo ""
echo "✅ 修复项目检查："
echo "□ QueryBuilder setSelectedSources错误 - 已修复props传递"
echo "□ 数据库类型显示unknown - 已修复为显示实际类型(MYSQL)"
echo "□ Excel文件预览500错误 - 已修复NaN值处理"
echo "□ MySQL配置未加载 - 已修复启动时自动加载"
echo "□ 前端疯狂请求 - 已修复防抖机制"

echo ""
echo "🎯 测试步骤："
echo "1. 访问 http://localhost:3000"
echo "2. 切换到'数据查询与结果'标签页"
echo "3. 在查询构建器中选择数据源"
echo "4. 验证数据库数据源显示'MYSQL'而不是'unknown'"
echo "5. 验证选择数据源不会报错"
echo "6. 在'数据源管理'标签页预览0702.xlsx文件"

echo ""
echo "🚀 预期结果："
echo "• 数据源选择：无JavaScript错误"
echo "• 数据库类型：显示'MYSQL'"
echo "• Excel预览：正常显示数据"
echo "• 页面响应：流畅无卡顿"
echo "• API请求：频率正常"

echo ""
echo "🎉 修复完成！请在浏览器中验证功能。"
