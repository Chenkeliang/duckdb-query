"""
Integration tests for visual query API endpoints

Tests the complete API workflow from request to response.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch

from main import app
from models.visual_query_models import (
    VisualQueryConfig,
    AggregationConfig,
    FilterConfig,
    SortConfig,
    AggregationFunction,
    FilterOperator,
    SortDirection,
    VisualQueryMode,
)
from core.visual_query_generator import GeneratedVisualQuery

client = TestClient(app)


class TestVisualQueryGeneration:
    """Test visual query generation endpoint"""
    
    def test_generate_simple_query(self):
        """Test generating a simple visual query"""

        config_data = {
            "config": {
                "table_name": "test_table",
                "selected_columns": ["col1", "col2"],
                "aggregations": [],
                "filters": [],
                "order_by": [],
                "is_distinct": False,
            },
            "preview": False,
            "include_metadata": True,
        }

        generation_result = GeneratedVisualQuery(
            mode=VisualQueryMode.REGULAR,
            base_sql='SELECT "col1", "col2" FROM "test_table"',
            final_sql='SELECT "col1", "col2" FROM "test_table"',
            pivot_sql=None,
            warnings=[],
            metadata={"mode": VisualQueryMode.REGULAR.value},
        )

        with patch('routers.query.validate_query_config') as mock_validate, \
             patch('routers.query.generate_visual_query_sql') as mock_generate, \
             patch('routers.query.estimate_query_performance') as mock_estimate:

            mock_validate.return_value = Mock(
                is_valid=True,
                errors=[],
                warnings=[],
                complexity_score=1,
            )

            mock_generate.return_value = generation_result

            mock_estimate.return_value = Mock(
                estimated_rows=100,
                estimated_time=0.5,
            )

            response = client.post("/api/visual-query/generate", json=config_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["sql"] == 'SELECT "col1", "col2" FROM "test_table"'
            assert data["metadata"]["estimated_rows"] == 100
    
    def test_generate_query_with_validation_errors(self):
        """Test query generation with validation errors"""
        config_data = {
            "config": {
                "table_name": "",  # Invalid empty table name
                "selected_columns": [],
                "aggregations": [],
                "filters": [],
                "order_by": [],
                "is_distinct": False
            },
            "preview": False,
            "include_metadata": False
        }
        
        with patch('routers.query.validate_query_config') as mock_validate:
            # Mock validation failure
            mock_validate.return_value = Mock(
                is_valid=False,
                errors=["表名不能为空"],
                warnings=[],
                complexity_score=0
            )
            
            response = client.post("/api/visual-query/generate", json=config_data)
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert "表名不能为空" in data["errors"]

    def test_generate_complex_query(self):
        """Test generating a complex query with aggregations and filters"""

        config_data = {
            "config": {
                "table_name": "sales_data",
                "selected_columns": ["region"],
                "aggregations": [
                    {
                        "column": "amount",
                        "function": "SUM",
                        "alias": "total_sales",
                    }
                ],
                "filters": [
                    {
                        "column": "status",
                        "operator": "=",
                        "value": "completed",
                        "logic_operator": "AND",
                    }
                ],
                "order_by": [
                    {
                        "column": "total_sales",
                        "direction": "DESC",
                        "priority": 0,
                    }
                ],
                "group_by": ["region"],
                "limit": 100,
                "is_distinct": False,
            },
            "preview": False,
            "include_metadata": True,
        }

        expected_sql = (
            'SELECT "region", SUM("amount") AS "total_sales" '
            'FROM "sales_data" WHERE "status" = \'completed\' '
            'GROUP BY "region" ORDER BY "total_sales" DESC LIMIT 100'
        )

        generation_result = GeneratedVisualQuery(
            mode=VisualQueryMode.REGULAR,
            base_sql=expected_sql,
            final_sql=expected_sql,
            pivot_sql=None,
            warnings=["复杂查询可能需要较长时间"],
            metadata={"mode": VisualQueryMode.REGULAR.value},
        )

        with patch('routers.query.validate_query_config') as mock_validate, \
             patch('routers.query.generate_visual_query_sql') as mock_generate, \
             patch('routers.query.estimate_query_performance') as mock_estimate:

            mock_validate.return_value = Mock(
                is_valid=True,
                errors=[],
                warnings=["复杂查询可能需要较长时间"],
                complexity_score=8,
            )

            mock_generate.return_value = generation_result

            mock_estimate.return_value = Mock(
                estimated_rows=50,
                estimated_time=1.2,
            )

            response = client.post("/api/visual-query/generate", json=config_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["sql"] == expected_sql
            assert len(data["warnings"]) > 0
            assert data["metadata"]["estimated_rows"] == 50


class TestVisualQueryPreview:
    """Test visual query preview endpoint"""
    
    def test_preview_query_success(self):
        """Test successful query preview"""
        config_data = {
            "config": {
                "table_name": "test_table",
                "selected_columns": ["name", "age"],
                "aggregations": [],
                "filters": [],
                "order_by": [],
                "is_distinct": False
            },
            "limit": 10
        }
        
        preview_sql = 'SELECT "name", "age" FROM "test_table"'
        generation_result = GeneratedVisualQuery(
            mode=VisualQueryMode.REGULAR,
            base_sql=preview_sql,
            final_sql=preview_sql,
            pivot_sql=None,
            warnings=[],
            metadata={"mode": VisualQueryMode.REGULAR.value},
        )

        with patch('routers.query.validate_query_config') as mock_validate, \
             patch('routers.query.generate_visual_query_sql') as mock_generate, \
             patch('routers.query.execute_query') as mock_execute, \
             patch('routers.query.estimate_query_performance') as mock_estimate:

            mock_validate.return_value = Mock(
                is_valid=True,
                errors=[],
                warnings=[],
                complexity_score=2,
            )

            mock_generate.return_value = generation_result

            import pandas as pd

            preview_data = pd.DataFrame({
                'name': ['Alice', 'Bob', 'Charlie'],
                'age': [25, 30, 35],
            })

            mock_execute.side_effect = [
                preview_data,
                pd.DataFrame({'total_rows': [1000]}),
            ]

            mock_estimate.return_value = Mock(estimated_time=0.2)

            response = client.post("/api/visual-query/preview", json=config_data)

            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert len(data["data"]) == 3
            assert data["row_count"] == 1000
            assert data["estimated_time"] == 0.2
    
    def test_preview_query_validation_error(self):
        """Test preview with validation errors"""
        config_data = {
            "config": {
                "table_name": "test_table",
                "selected_columns": [],
                "aggregations": [
                    {
                        "column": "",  # Invalid empty column
                        "function": "SUM"
                    }
                ],
                "filters": [],
                "order_by": [],
                "is_distinct": False
            },
            "limit": 10
        }
        
        with patch('routers.query.validate_query_config') as mock_validate:
            # Mock validation failure
            mock_validate.return_value = Mock(
                is_valid=False,
                errors=["聚合函数必须指定列名"],
                warnings=[],
                complexity_score=0
            )
            
            response = client.post("/api/visual-query/preview", json=config_data)
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert "聚合函数必须指定列名" in data["errors"]


class TestColumnStatistics:
    """Test column statistics endpoint"""
    
    def test_get_column_statistics_success(self):
        """Test successful column statistics retrieval"""
        with patch('routers.query.get_db_connection') as mock_db, \
             patch('routers.query.get_column_statistics') as mock_stats:
            
            # Mock database connection
            mock_con = Mock()
            mock_db.return_value = mock_con
            
            # Mock available tables
            import pandas as pd
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
                'name': ['test_table']
            })
            
            # Mock column statistics
            from models.visual_query_models import ColumnStatistics
            mock_stats.return_value = ColumnStatistics(
                column_name="age",
                data_type="INTEGER",
                null_count=5,
                distinct_count=50,
                min_value=18,
                max_value=65,
                avg_value=35.5,
                sample_values=["18", "25", "30", "35", "40"]
            )
            
            response = client.get("/api/visual-query/column-stats/test_table/age")
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["statistics"]["column_name"] == "age"
            assert data["statistics"]["data_type"] == "INTEGER"
            assert data["statistics"]["min_value"] == 18
            assert data["statistics"]["max_value"] == 65
    
    def test_get_column_statistics_table_not_found(self):
        """Test column statistics for non-existent table"""
        with patch('routers.query.get_db_connection') as mock_db:
            # Mock database connection
            mock_con = Mock()
            mock_db.return_value = mock_con
            
            # Mock empty tables list
            import pandas as pd
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
                'name': []
            })
            
            response = client.get("/api/visual-query/column-stats/nonexistent_table/age")
            
            assert response.status_code == 404
            assert "不存在" in response.json()["detail"]
class TestTableMetadata:
    """Test table metadata endpoint"""
    
    def test_get_table_metadata_success(self):
        """Test successful table metadata retrieval"""
        with patch('routers.query.get_db_connection') as mock_db, \
             patch('routers.query.get_table_metadata') as mock_metadata:
            
            # Mock database connection
            mock_con = Mock()
            mock_db.return_value = mock_con
            
            # Mock available tables
            import pandas as pd
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
                'name': ['test_table']
            })
            
            # Mock table metadata
            from models.visual_query_models import TableMetadata, ColumnStatistics
            mock_metadata.return_value = TableMetadata(
                table_name="test_table",
                row_count=1000,
                column_count=3,
                columns=[
                    ColumnStatistics(
                        column_name="id",
                        data_type="INTEGER",
                        null_count=0,
                        distinct_count=1000,
                        sample_values=["1", "2", "3"]
                    ),
                    ColumnStatistics(
                        column_name="name",
                        data_type="VARCHAR",
                        null_count=5,
                        distinct_count=995,
                        sample_values=["Alice", "Bob", "Charlie"]
                    ),
                    ColumnStatistics(
                        column_name="age",
                        data_type="INTEGER",
                        null_count=10,
                        distinct_count=50,
                        min_value=18,
                        max_value=65,
                        avg_value=35.5,
                        sample_values=["18", "25", "30"]
                    )
                ]
            )
            
            response = client.get("/api/visual-query/table-metadata/test_table")
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["metadata"]["table_name"] == "test_table"
            assert data["metadata"]["row_count"] == 1000
            assert data["metadata"]["column_count"] == 3
            assert len(data["metadata"]["columns"]) == 3
    
    def test_get_table_metadata_table_not_found(self):
        """Test table metadata for non-existent table"""
        with patch('routers.query.get_db_connection') as mock_db:
            # Mock database connection
            mock_con = Mock()
            mock_db.return_value = mock_con
            
            # Mock empty tables list
            import pandas as pd
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
                'name': []
            })
            
            response = client.get("/api/visual-query/table-metadata/nonexistent_table")
            
            assert response.status_code == 404
            assert "不存在" in response.json()["detail"]


class TestVisualQueryValidation:
    """Test visual query validation endpoint"""
    
    def test_validate_valid_config(self):
        """Test validation of valid configuration"""
        config_data = {
            "table_name": "test_table",
            "selected_columns": ["col1", "col2"],
            "aggregations": [
                {
                    "column": "amount",
                    "function": "SUM",
                    "alias": "total"
                }
            ],
            "filters": [
                {
                    "column": "status",
                    "operator": "=",
                    "value": "active",
                    "logic_operator": "AND"
                }
            ],
            "order_by": [
                {
                    "column": "col1",
                    "direction": "ASC",
                    "priority": 0
                }
            ],
            "is_distinct": False
        }
        
        with patch('routers.query.validate_query_config') as mock_validate:
            # Mock validation success
            mock_validate.return_value = Mock(
                is_valid=True,
                errors=[],
                warnings=["建议添加索引以提高性能"],
                complexity_score=5
            )
            
            response = client.post("/api/visual-query/validate", json=config_data)
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["is_valid"] is True
            assert len(data["errors"]) == 0
            assert len(data["warnings"]) == 1
            assert data["complexity_score"] == 5
    
    def test_validate_invalid_config(self):
        """Test validation of invalid configuration"""
        config_data = {
            "table_name": "",  # Invalid empty table name
            "selected_columns": [],
            "aggregations": [
                {
                    "column": "",  # Invalid empty column
                    "function": "SUM"
                }
            ],
            "filters": [
                {
                    "column": "status",
                    "operator": "=",
                    "value": None,  # Invalid null value
                    "logic_operator": "AND"
                }
            ],
            "order_by": [],
            "is_distinct": False
        }
        
        with patch('routers.query.validate_query_config') as mock_validate:
            # Mock validation failure
            mock_validate.return_value = Mock(
                is_valid=False,
                errors=[
                    "表名不能为空",
                    "聚合函数必须指定列名",
                    "筛选条件需要指定值"
                ],
                warnings=[],
                complexity_score=0
            )
            
            response = client.post("/api/visual-query/validate", json=config_data)
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["is_valid"] is False
            assert len(data["errors"]) == 3
            assert "表名不能为空" in data["errors"]
            assert "聚合函数必须指定列名" in data["errors"]
            assert "筛选条件需要指定值" in data["errors"]
    
    def test_validate_config_exception(self):
        """Test validation with exception handling"""
        config_data = {
            "table_name": "test_table",
            "selected_columns": ["col1"],
            "aggregations": [],
            "filters": [],
            "order_by": [],
            "is_distinct": False
        }
        
        with patch('routers.query.validate_query_config') as mock_validate:
            # Mock validation exception
            mock_validate.side_effect = Exception("Validation service unavailable")
            
            response = client.post("/api/visual-query/validate", json=config_data)
            
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert data["is_valid"] is False
            assert "配置验证失败" in data["errors"][0]


class TestErrorHandling:
    """Test error handling across all endpoints"""
    
    def test_malformed_json_request(self):
        """Test handling of malformed JSON requests"""
        response = client.post(
            "/api/visual-query/generate",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        
        assert response.status_code == 422  # Unprocessable Entity
    
    def test_missing_required_fields(self):
        """Test handling of missing required fields"""
        config_data = {
            "preview": False
            # Missing 'config' field
        }
        
        response = client.post("/api/visual-query/generate", json=config_data)
        
        assert response.status_code == 422  # Validation error
    
    def test_invalid_field_types(self):
        """Test handling of invalid field types"""
        config_data = {
            "config": {
                "table_name": 123,  # Should be string
                "selected_columns": "not_a_list",  # Should be list
                "aggregations": [],
                "filters": [],
                "order_by": [],
                "is_distinct": "not_a_boolean"  # Should be boolean
            },
            "preview": False,
            "include_metadata": True
        }
        
        response = client.post("/api/visual-query/generate", json=config_data)
        
        assert response.status_code == 422  # Validation error


if __name__ == "__main__":
    pytest.main([__file__])