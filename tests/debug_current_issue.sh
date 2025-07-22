#!/bin/bash

# 调试当前422错误问题
echo "🔍 调试当前422错误问题"
echo "=================================================="

# 服务器地址
BASE_URL="http://localhost:8000"

# 您提供的实际请求数据
ACTUAL_REQUEST='{
  "sources": [
    {
      "id": "0711",
      "name": "0711.xlsx",
      "type": "file",
      "path": "0711.xlsx",
      "columns": ["序号","提交答卷时间","所用时间","来源","来源详情","来自IP","1、手机号（*请务必核对，填写的手机号是您下单AI学习圈的手机号）","uid","2、请输入您的收货地址：—收货人姓名：","2、所在地区：","2、详细地址:","2、收货人电话："],
      "sourceType": "file"
    },
    {
      "id": "0702",
      "name": "0702.xlsx",
      "type": "file",
      "path": "0702.xlsx",
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

echo "1. 测试原始请求到 /api/query（应该失败）"
echo "======================================="
echo "发送您提供的实际请求数据到 /api/query..."

direct_response=$(curl -s -w "%{http_code}" -o /tmp/direct_test.json \
    -X POST "$BASE_URL/api/query" \
    -H "Content-Type: application/json" \
    -d "$ACTUAL_REQUEST")

echo "状态码: $direct_response"
if [ "$direct_response" = "422" ]; then
    echo "✅ 确认：直接请求返回422错误（符合预期）"
    echo "错误详情:"
    cat /tmp/direct_test.json | head -c 500
    echo ""
else
    echo "❌ 意外：直接请求没有返回422错误"
fi

echo ""
echo "2. 测试相同请求到 /api/query_proxy（应该成功）"
echo "============================================="
echo "发送相同数据到 /api/query_proxy..."

proxy_response=$(curl -s -w "%{http_code}" -o /tmp/proxy_test.json \
    -X POST "$BASE_URL/api/query_proxy" \
    -H "Content-Type: application/json" \
    -d "$ACTUAL_REQUEST")

echo "状态码: $proxy_response"
if [ "$proxy_response" = "200" ]; then
    echo "✅ 查询代理成功处理请求"
    
    # 检查返回的列名
    if grep -q '"A_1"' /tmp/proxy_test.json; then
        echo "✅ 返回数据包含A_1别名格式"
    else
        echo "❌ 返回数据不包含预期的A_1别名格式"
    fi
    
    # 显示列名
    echo "返回的列名:"
    grep -o '"columns":\[[^]]*\]' /tmp/proxy_test.json | head -c 200
    echo "..."
    
else
    echo "❌ 查询代理请求失败"
    echo "错误详情:"
    cat /tmp/proxy_test.json | head -c 500
    echo ""
fi

echo ""
echo "3. 检查前端转换后的格式"
echo "======================"

# 模拟前端QueryBuilder.jsx中的转换逻辑
CONVERTED_REQUEST='{
  "sources": [
    {
      "id": "0711",
      "type": "file",
      "params": {
        "path": "temp_files/0711.xlsx"
      }
    },
    {
      "id": "0702",
      "type": "file",
      "params": {
        "path": "temp_files/0702.xlsx"
      }
    }
  ],
  "joins": [
    {
      "left_source_id": "0711",
      "right_source_id": "0702",
      "join_type": "inner",
      "conditions": [
        {
          "left_column": "uid",
          "right_column": "uid",
          "operator": "="
        }
      ]
    }
  ]
}'

echo "测试前端转换后的格式到 /api/query..."
converted_response=$(curl -s -w "%{http_code}" -o /tmp/converted_test.json \
    -X POST "$BASE_URL/api/query" \
    -H "Content-Type: application/json" \
    -d "$CONVERTED_REQUEST")

echo "状态码: $converted_response"
if [ "$converted_response" = "200" ]; then
    echo "✅ 转换后的格式直接请求成功"
    
    # 检查返回的列名
    if grep -q '"A_1"' /tmp/converted_test.json; then
        echo "✅ 返回数据包含A_1别名格式"
    else
        echo "❌ 返回数据不包含预期的A_1别名格式"
    fi
    
else
    echo "❌ 转换后的格式请求失败"
    echo "错误详情:"
    cat /tmp/converted_test.json | head -c 500
    echo ""
fi

echo ""
echo "4. 分析问题原因"
echo "=============="

if [ "$direct_response" = "422" ] && [ "$proxy_response" = "200" ]; then
    echo "✅ 查询代理工作正常"
    echo ""
    echo "🔍 问题分析："
    echo "1. 您的请求确实是原始格式（缺少params和conditions）"
    echo "2. 查询代理能够正确转换这种格式"
    echo "3. 问题可能是前端没有使用查询代理"
    echo ""
    echo "🔧 解决方案："
    echo "1. 确认前端使用的是 /api/query_proxy 而不是 /api/query"
    echo "2. 检查浏览器网络面板，确认实际发送的URL"
    echo "3. 清除浏览器缓存并重新加载页面"
    
elif [ "$proxy_response" != "200" ]; then
    echo "❌ 查询代理本身有问题"
    echo ""
    echo "🔧 需要修复查询代理的问题"
    
else
    echo "⚠️  情况异常，需要进一步调查"
fi

echo ""
echo "5. 检查服务器日志建议"
echo "===================="
echo "请检查后端服务器的控制台输出，查看："
echo "1. 是否有 '收到原始查询请求' 的日志（来自query_proxy）"
echo "2. 是否有直接到 /api/query 的请求日志"
echo "3. 任何错误或异常信息"

# 清理临时文件
rm -f /tmp/direct_test.json /tmp/proxy_test.json /tmp/converted_test.json

echo ""
echo "=================================================="
echo "调试完成！"
