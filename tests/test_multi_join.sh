#!/bin/bash

echo "🧪 测试多表JOIN功能"
echo "===================="

# 测试数据
curl -X POST "http://localhost:8000/api/query" \
  -H "Content-Type: application/json" \
  -d '{
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
            "join_type": "outer",
            "conditions": [
                {
                    "left_column": "uid",
                    "right_column": "uid",
                    "operator": "="
                }
            ]
        },
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
}' | jq '.data[0] | keys | length' 2>/dev/null

echo ""
echo "如果返回数字大于48（A表12列+B表12列+C表36列），则多表JOIN成功"
echo "如果返回24（只有A表和B表），则多表JOIN失败"
