#!/bin/bash

# 测试 full outer join 问题
echo "🔍 测试 Full Outer Join 查询"
echo "=================================================="

# 用户的查询请求
FULL_OUTER_JOIN_REQUEST='{
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
    },
    {
      "id": "sorder",
      "type": "mysql",
      "params": {
        "host": "rr-2ze4ks6ww80gpae5z723.mysql.rds.aliyuncs.com",
        "port": 3306,
        "user": "dataread",
        "password": "GQgx7jbP",
        "database": "store_order",
        "query": "SELECT * FROM dy_order limit 10"
      }
    }
  ],
  "joins": [
    {
      "left_source_id": "0711",
      "right_source_id": "sorder",
      "join_type": "outer",
      "conditions": [
        {
          "left_column": "uid",
          "right_column": "buyer_id",
          "operator": "="
        }
      ]
    }
  ]
}'

# 1. 测试单个数据源
echo "1. 测试单个数据源"
echo "=================="

echo "测试0711文件..."
SINGLE_0711_REQUEST='{
  "sources": [
    {
      "id": "0711",
      "type": "file",
      "params": {
        "path": "temp_files/0711.xlsx"
      }
    }
  ],
  "joins": []
}'

response_0711=$(curl -s -w "%{http_code}" -o /tmp/test_0711.json \
    -X POST "http://localhost:8000/api/query_proxy" \
    -H "Content-Type: application/json" \
    -d "$SINGLE_0711_REQUEST")

echo "0711文件查询状态码: $response_0711"
if [ "$response_0711" = "200" ]; then
    data_count=$(cat /tmp/test_0711.json | grep -o '"data":\[[^]]*\]' | grep -o '\[.*\]' | grep -o ',' | wc -l)
    echo "✅ 0711文件查询成功，数据行数: $((data_count + 1))"
    echo "列名预览:"
    cat /tmp/test_0711.json | grep -o '"columns":\[[^]]*\]' | head -c 200
    echo ""
else
    echo "❌ 0711文件查询失败"
    cat /tmp/test_0711.json | head -c 300
    echo ""
fi

echo ""

echo "测试MySQL数据源..."
SINGLE_MYSQL_REQUEST='{
  "sources": [
    {
      "id": "sorder",
      "type": "mysql",
      "params": {
        "host": "rr-2ze4ks6ww80gpae5z723.mysql.rds.aliyuncs.com",
        "port": 3306,
        "user": "dataread",
        "password": "GQgx7jbP",
        "database": "store_order",
        "query": "SELECT * FROM dy_order limit 10"
      }
    }
  ],
  "joins": []
}'

response_mysql=$(curl -s -w "%{http_code}" -o /tmp/test_mysql.json \
    -X POST "http://localhost:8000/api/query_proxy" \
    -H "Content-Type: application/json" \
    -d "$SINGLE_MYSQL_REQUEST")

echo "MySQL查询状态码: $response_mysql"
if [ "$response_mysql" = "200" ]; then
    echo "✅ MySQL查询成功"
    echo "列名预览:"
    cat /tmp/test_mysql.json | grep -o '"columns":\[[^]]*\]' | head -c 200
    echo ""
else
    echo "❌ MySQL查询失败"
    cat /tmp/test_mysql.json | head -c 300
    echo ""
fi

echo ""

# 2. 测试 Full Outer Join
echo "2. 测试 Full Outer Join"
echo "======================"

response_full_outer=$(curl -s -w "%{http_code}" -o /tmp/test_full_outer.json \
    -X POST "http://localhost:8000/api/query_proxy" \
    -H "Content-Type: application/json" \
    -d "$FULL_OUTER_JOIN_REQUEST")

echo "Full Outer Join 状态码: $response_full_outer"
if [ "$response_full_outer" = "200" ]; then
    echo "✅ Full Outer Join 查询成功"
    
    # 检查返回的数据行数
    if grep -q '"data":\[\]' /tmp/test_full_outer.json; then
        echo "⚠️  警告: 查询成功但返回0行数据"
        echo ""
        echo "可能原因分析:"
        echo "1. JOIN条件不匹配 (uid vs buyer_id)"
        echo "2. 数据类型不兼容"
        echo "3. 字段值不匹配"
        echo ""
    else
        echo "✅ 返回了数据"
        echo "列名:"
        cat /tmp/test_full_outer.json | grep -o '"columns":\[[^]]*\]' | head -c 300
        echo ""
        echo "数据预览:"
        cat /tmp/test_full_outer.json | grep -o '"data":\[[^]]*\]' | head -c 500
        echo ""
    fi
else
    echo "❌ Full Outer Join 查询失败"
    echo "错误详情:"
    cat /tmp/test_full_outer.json | head -c 500
    echo ""
fi

echo ""

# 3. 测试 Inner Join 对比
echo "3. 测试 Inner Join (对比)"
echo "========================"

INNER_JOIN_REQUEST='{
  "sources": [
    {
      "id": "0711",
      "type": "file",
      "params": {
        "path": "temp_files/0711.xlsx"
      }
    },
    {
      "id": "sorder",
      "type": "mysql",
      "params": {
        "host": "rr-2ze4ks6ww80gpae5z723.mysql.rds.aliyuncs.com",
        "port": 3306,
        "user": "dataread",
        "password": "GQgx7jbP",
        "database": "store_order",
        "query": "SELECT * FROM dy_order limit 10"
      }
    }
  ],
  "joins": [
    {
      "left_source_id": "0711",
      "right_source_id": "sorder",
      "join_type": "inner",
      "conditions": [
        {
          "left_column": "uid",
          "right_column": "buyer_id",
          "operator": "="
        }
      ]
    }
  ]
}'

response_inner=$(curl -s -w "%{http_code}" -o /tmp/test_inner.json \
    -X POST "http://localhost:8000/api/query_proxy" \
    -H "Content-Type: application/json" \
    -d "$INNER_JOIN_REQUEST")

echo "Inner Join 状态码: $response_inner"
if [ "$response_inner" = "200" ]; then
    if grep -q '"data":\[\]' /tmp/test_inner.json; then
        echo "⚠️  Inner Join 也返回0行数据"
        echo "   说明JOIN条件 uid = buyer_id 不匹配"
    else
        echo "✅ Inner Join 返回了数据"
        echo "   说明数据源连接正常，但Full Outer Join可能有其他问题"
    fi
else
    echo "❌ Inner Join 查询失败"
    cat /tmp/test_inner.json | head -c 300
    echo ""
fi

echo ""

# 4. 建议和解决方案
echo "4. 建议和解决方案"
echo "================"
echo "如果所有JOIN都返回0行数据，可能的原因："
echo "1. 字段名不匹配：检查0711文件中是否有'uid'字段，MySQL表中是否有'buyer_id'字段"
echo "2. 数据类型不匹配：uid和buyer_id的数据类型可能不兼容"
echo "3. 数据值不匹配：两个字段的值可能没有交集"
echo ""
echo "建议的调试步骤："
echo "1. 检查0711文件的uid字段值"
echo "2. 检查MySQL表的buyer_id字段值"
echo "3. 尝试使用LEFT JOIN或RIGHT JOIN"
echo "4. 检查数据类型转换"

# 清理临时文件
rm -f /tmp/test_*.json

echo ""
echo "=================================================="
echo "测试完成！"
