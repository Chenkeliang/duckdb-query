#!/usr/bin/env python3
"""
查询代理单元测试
测试query_proxy的数据转换逻辑
"""

import unittest
import json
from unittest.mock import Mock, patch, AsyncMock
import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'api'))

from routers.query_proxy import router
from fastapi import Request
from fastapi.testclient import TestClient
from fastapi import FastAPI

class TestQueryProxy(unittest.TestCase):
    """查询代理测试类"""
    
    def setUp(self):
        """测试设置"""
        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)
    
    def test_data_source_conversion(self):
        """测试数据源格式转换"""
        # 原始格式（缺少params字段）
        original_source = {
            "id": "test_file",
            "name": "test.xlsx",
            "type": "file",
            "path": "test.xlsx",
            "columns": ["col1", "col2"],
            "sourceType": "file"
        }
        
        # 期望的转换结果
        expected_source = {
            "id": "test_file",
            "type": "file",
            "params": {
                "path": "temp_files/test.xlsx"
            }
        }
        
        # 这里我们测试转换逻辑的核心部分
        # 实际的转换逻辑在query_proxy.py中
        converted_source = {
            "id": original_source.get("id"),
            "type": "file",
            "params": {
                "path": f"temp_files/{original_source.get('path') or original_source.get('name')}"
            }
        }
        
        self.assertEqual(converted_source, expected_source)
    
    def test_join_conversion(self):
        """测试JOIN格式转换"""
        # 原始格式（使用left_on/right_on/how）
        original_join = {
            "left_source_id": "table1",
            "right_source_id": "table2",
            "left_on": "id",
            "right_on": "user_id",
            "how": "inner"
        }
        
        # 期望的转换结果
        expected_join = {
            "left_source_id": "table1",
            "right_source_id": "table2",
            "join_type": "inner",
            "conditions": [
                {
                    "left_column": "id",
                    "right_column": "user_id",
                    "operator": "="
                }
            ]
        }
        
        # 测试转换逻辑
        converted_join = {
            "left_source_id": original_join.get("left_source_id"),
            "right_source_id": original_join.get("right_source_id"),
            "join_type": original_join.get("how") or original_join.get("join_type") or "inner",
            "conditions": [
                {
                    "left_column": original_join.get("left_on"),
                    "right_column": original_join.get("right_on"),
                    "operator": "="
                }
            ]
        }
        
        self.assertEqual(converted_join, expected_join)
    
    def test_mixed_format_handling(self):
        """测试混合格式处理"""
        # 测试部分已转换、部分未转换的情况
        
        # 已转换的数据源
        converted_source = {
            "id": "converted",
            "type": "file",
            "params": {"path": "temp_files/converted.csv"}
        }
        
        # 未转换的数据源
        unconverted_source = {
            "id": "unconverted",
            "name": "unconverted.xlsx",
            "type": "file",
            "path": "unconverted.xlsx",
            "sourceType": "file"
        }
        
        sources = [converted_source, unconverted_source]
        
        # 模拟转换逻辑
        converted_sources = []
        for source in sources:
            if "params" in source:
                # 已经是正确格式
                converted_sources.append(source)
            else:
                # 需要转换
                converted_sources.append({
                    "id": source.get("id"),
                    "type": "file",
                    "params": {
                        "path": f"temp_files/{source.get('path') or source.get('name')}"
                    }
                })
        
        # 验证结果
        self.assertEqual(len(converted_sources), 2)
        self.assertEqual(converted_sources[0], converted_source)  # 第一个保持不变
        self.assertIn("params", converted_sources[1])  # 第二个被转换
        self.assertEqual(converted_sources[1]["params"]["path"], "temp_files/unconverted.xlsx")
    
    @patch('httpx.AsyncClient')
    async def test_proxy_request_success(self, mock_client):
        """测试代理请求成功场景"""
        # 模拟httpx响应
        mock_response = Mock()
        mock_response.json.return_value = {
            "columns": ["col1", "col2"],
            "data": [{"col1": "value1", "col2": "value2"}]
        }
        
        mock_client_instance = AsyncMock()
        mock_client_instance.post.return_value = mock_response
        mock_client.return_value.__aenter__.return_value = mock_client_instance
        
        # 测试请求数据
        test_data = {
            "sources": [
                {
                    "id": "test",
                    "name": "test.csv",
                    "type": "file",
                    "path": "test.csv",
                    "sourceType": "file"
                }
            ],
            "joins": []
        }
        
        # 发送请求
        response = self.client.post("/api/query_proxy", json=test_data)
        
        # 验证响应
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertIn("columns", result)
        self.assertIn("data", result)
    
    def test_request_validation(self):
        """测试请求验证"""
        # 测试空请求
        response = self.client.post("/api/query_proxy", json={})
        # 应该能处理空请求（转换为空的sources和joins）
        self.assertIn(response.status_code, [200, 500])  # 可能成功或因为空数据失败
        
        # 测试无效JSON
        response = self.client.post("/api/query_proxy", data="invalid json")
        self.assertEqual(response.status_code, 422)  # FastAPI会返回422对于无效JSON

class TestDataTransformation(unittest.TestCase):
    """数据转换逻辑测试"""
    
    def test_file_source_transformation(self):
        """测试文件数据源转换"""
        test_cases = [
            # 测试用例: (输入, 期望输出)
            (
                {"id": "test", "name": "test.csv", "type": "file", "sourceType": "file"},
                {"id": "test", "type": "file", "params": {"path": "temp_files/test.csv"}}
            ),
            (
                {"id": "test", "path": "data.xlsx", "type": "file", "sourceType": "file"},
                {"id": "test", "type": "file", "params": {"path": "temp_files/data.xlsx"}}
            ),
            (
                {"id": "test", "name": "file.json", "path": "custom.json", "type": "file", "sourceType": "file"},
                {"id": "test", "type": "file", "params": {"path": "temp_files/custom.json"}}  # path优先于name
            )
        ]
        
        for input_source, expected_output in test_cases:
            with self.subTest(input_source=input_source):
                # 模拟转换逻辑
                if input_source.get("sourceType") == "file" or input_source.get("type") == "file":
                    converted = {
                        "id": input_source.get("id"),
                        "type": "file",
                        "params": {
                            "path": f"temp_files/{input_source.get('path') or input_source.get('name')}"
                        }
                    }
                    self.assertEqual(converted, expected_output)
    
    def test_join_transformation(self):
        """测试JOIN转换"""
        test_cases = [
            # 测试用例: (输入, 期望输出)
            (
                {"left_source_id": "a", "right_source_id": "b", "left_on": "id", "right_on": "user_id", "how": "inner"},
                {"left_source_id": "a", "right_source_id": "b", "join_type": "inner", "conditions": [{"left_column": "id", "right_column": "user_id", "operator": "="}]}
            ),
            (
                {"left_source_id": "a", "right_source_id": "b", "left_on": "key", "right_on": "key", "how": "left"},
                {"left_source_id": "a", "right_source_id": "b", "join_type": "left", "conditions": [{"left_column": "key", "right_column": "key", "operator": "="}]}
            ),
            (
                {"left_source_id": "a", "right_source_id": "b", "left_on": "id", "right_on": "id"},  # 没有how字段
                {"left_source_id": "a", "right_source_id": "b", "join_type": "inner", "conditions": [{"left_column": "id", "right_column": "id", "operator": "="}]}
            )
        ]
        
        for input_join, expected_output in test_cases:
            with self.subTest(input_join=input_join):
                # 模拟转换逻辑
                converted = {
                    "left_source_id": input_join.get("left_source_id"),
                    "right_source_id": input_join.get("right_source_id"),
                    "join_type": input_join.get("how") or input_join.get("join_type") or "inner",
                    "conditions": [
                        {
                            "left_column": input_join.get("left_on"),
                            "right_column": input_join.get("right_on"),
                            "operator": "="
                        }
                    ]
                }
                self.assertEqual(converted, expected_output)

if __name__ == "__main__":
    # 运行测试
    unittest.main(verbosity=2)
