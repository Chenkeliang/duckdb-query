#!/bin/bash

# 验证前端是否使用了查询代理
echo "🔍 验证前端是否使用查询代理"
echo "=================================================="

# 服务器地址
BASE_URL="http://localhost:8000"

# 您提供的实际请求数据
ACTUAL_REQUEST='{
  "sources": [
    {
      "id": "0711",
      "name": "0711.csv",
      "type": "file",
      "path": "0711.csv",
      "columns": ["序号","提交答卷时间","所用时间","来源","来源详情","来自IP","1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）","uid","2、请输入您的收货地址：—收货人姓名：","2、所在地区：","2、详细地址:","2、收货人电话："],
      "sourceType": "file"
    },
    {
      "id": "0702",
      "name": "0702.csv",
      "type": "file",
      "path": "0702.csv",
      "columns": ["序号","提交答卷时间","所用时间","来源","来源详情","来自IP","1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）","uid","2、请输入您的收货地址：—收货人姓名：","2、所在地区：","2、详细地址:","2、收货人电话："],
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

echo "1. 测试查询代理（检查代理标识）"
echo "============================="

proxy_response=$(curl -s -w "%{http_code}" -o /tmp/proxy_verify.json \
    -X POST "$BASE_URL/api/query_proxy" \
    -H "Content-Type: application/json" \
    -d "$ACTUAL_REQUEST")

echo "状态码: $proxy_response"

if [ "$proxy_response" = "200" ]; then
    echo "✅ 查询代理请求成功"
    
    # 检查代理标识
    if grep -q '"_proxy_processed": true' /tmp/proxy_verify.json; then
        echo "✅ 确认：响应包含代理处理标识"
        proxy_timestamp=$(grep -o '"_proxy_timestamp": "[^"]*"' /tmp/proxy_verify.json)
        echo "   代理处理时间: $proxy_timestamp"
    else
        echo "❌ 警告：响应不包含代理处理标识"
    fi
    
    # 检查别名格式
    if grep -q '"A_1"' /tmp/proxy_verify.json; then
        echo "✅ 确认：返回数据包含A_1别名格式"
    else
        echo "❌ 警告：返回数据不包含A_1别名格式"
    fi
    
else
    echo "❌ 查询代理请求失败"
    cat /tmp/proxy_verify.json
fi

echo ""
echo "2. 前端使用指南"
echo "=============="
echo "如果您在前端看到422错误，请检查："
echo ""
echo "🔧 浏览器开发者工具检查："
echo "1. 打开浏览器开发者工具 (F12)"
echo "2. 切换到 Network (网络) 标签"
echo "3. 执行查询操作"
echo "4. 查看请求的URL是否为 '/api/query_proxy'"
echo "5. 如果是 '/api/query'，说明前端代码没有更新"
echo ""
echo "🔧 如果请求URL错误，请尝试："
echo "1. 清除浏览器缓存 (Ctrl+Shift+Delete)"
echo "2. 硬刷新页面 (Ctrl+Shift+R)"
echo "3. 重启前端开发服务器"
echo "4. 检查前端代码是否正确导入了 performQuery 函数"
echo ""
echo "🔧 如果请求URL正确但仍有422错误："
echo "1. 检查响应是否包含 '_proxy_processed': true"
echo "2. 如果包含，说明代理工作正常，问题可能在数据文件"
echo "3. 如果不包含，说明代理没有正确处理请求"

echo ""
echo "3. 验证数据文件"
echo "=============="

echo "检查数据文件是否存在..."
if [ -f "interactive-data-query/temp_files/0711.csv" ]; then
    echo "✅ 0711.csv 文件存在"
else
    echo "❌ 0711.csv 文件不存在"
    echo "   请确保文件位于 interactive-data-query/temp_files/ 目录下"
fi

if [ -f "interactive-data-query/temp_files/0702.csv" ]; then
    echo "✅ 0702.csv 文件存在"
else
    echo "❌ 0702.csv 文件不存在"
    echo "   请确保文件位于 interactive-data-query/temp_files/ 目录下"
fi

echo ""
echo "4. 测试建议"
echo "=========="
echo "如果问题仍然存在，请："
echo "1. 在浏览器中执行查询操作"
echo "2. 检查浏览器开发者工具的Network标签"
echo "3. 查看实际发送的请求URL和响应"
echo "4. 如果响应包含 '_proxy_processed': true，说明代理正常工作"
echo "5. 如果没有包含，说明请求没有经过代理"

# 清理临时文件
rm -f /tmp/proxy_verify.json

echo ""
echo "=================================================="
echo "验证完成！"
