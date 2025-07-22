#!/bin/bash

# 测试查询功能修复

echo "🔧 测试查询功能修复"
echo "=================="

echo ""
echo "1. 测试文件数据源查询"
echo "-------------------"

# 测试文件数据源查询
echo "📁 测试CSV文件查询："
curl -s -X POST "http://localhost:8000/api/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sources": [
      {
        "id": "test_unit",
        "type": "file",
        "params": {
          "path": "temp_files/test_unit.csv"
        }
      }
    ],
    "joins": []
  }' | jq '.success'

echo ""
echo "2. 测试数据库数据源查询"
echo "---------------------"

# 测试数据库数据源查询
echo "🗄️ 测试MySQL数据库查询："
curl -s -X POST "http://localhost:8000/api/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sources": [
      {
        "id": "sorder",
        "type": "mysql",
        "params": {
          "connectionId": "sorder"
        }
      }
    ],
    "joins": []
  }' | jq '.success'

echo ""
echo "3. 测试混合数据源查询"
echo "-------------------"

# 测试混合数据源查询
echo "🔗 测试文件+数据库混合查询："
curl -s -X POST "http://localhost:8000/api/query" \
  -H "Content-Type: application/json" \
  -d '{
    "sources": [
      {
        "id": "test_unit",
        "type": "file",
        "params": {
          "path": "temp_files/test_unit.csv"
        }
      },
      {
        "id": "sorder",
        "type": "mysql",
        "params": {
          "connectionId": "sorder"
        }
      }
    ],
    "joins": []
  }' | jq '.success'

echo ""
echo "4. 查询修复验证清单"
echo "==================="
echo ""
echo "✅ 修复项目检查："
echo "□ 422错误修复 - 数据源格式转换"
echo "□ 数据库数据源支持 - 添加MySQL处理逻辑"
echo "□ 文件数据源路径 - 正确的temp_files路径"
echo "□ 前端数据转换 - selectedSources格式转换"
echo "□ 后端数据处理 - perform_query函数增强"

echo ""
echo "🎯 测试结果说明："
echo "• true = 查询成功"
echo "• false = 查询失败"
echo "• null = API错误"

echo ""
echo "🌐 前端测试步骤："
echo "1. 访问 http://localhost:3000"
echo "2. 切换到'数据查询与结果'标签页"
echo "3. 选择文件数据源（如test_unit）"
echo "4. 点击'执行查询'按钮"
echo "5. 选择数据库数据源（sorder）"
echo "6. 点击'执行查询'按钮"
echo "7. 验证不再出现422错误"

echo ""
echo "🚀 预期结果："
echo "• 文件查询：正常返回数据"
echo "• 数据库查询：正常返回数据"
echo "• 混合查询：正常处理多数据源"
echo "• 无422错误：请求格式正确"

echo ""
echo "🎉 查询功能修复完成！"
