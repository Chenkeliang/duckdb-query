"""
Integration tests for visual query builder end-to-end workflows

Tests complete workflows from frontend to backend integration.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
import pandas as pd
import tempfile
import os

from main import app
from core.duckdb_engine import get_db_connection

client = TestClient(app)


@pytest.fixture
def sample_data():
    """Create sample data for testing"""
    return pd.DataFrame({
        'id': range(1, 101),
        'name': [f'User_{i}' for i in range(1, 101)],
        'age': [20 + (i % 50) for i in range(100)],
        'city': ['New York', 'London', 'Tokyo', 'Paris', 'Berlin'] * 20,
        'salary': [30000 + (i * 1000) for i in range(100)],
        'department': ['Engineering', 'Sales', 'Marketing', 'HR'] * 25,
        'status': ['active', 'inactive'] * 50
    })


@pytest.fixture
def mock_duckdb_connection(sample_data):
    """Mock DuckDB connection with sample data"""
    mock_con = MagicMock()
    
    # Mock table existence check
    mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
        'name': ['test_employees']
    })
    
    # Mock table registration
    mock_con.register = MagicMock()
    
    # Mock query execution - return sample data
    mock_con.execute.return_value.fetchdf.return_value = sample_data
    
    return mock_con


class TestEndToEndWorkflows:
    """Test complete end-to-end workflows"""
    
    @patch('core.duckdb_engine.get_db_connection')
    def test_complete_visual_query_workflow(self, mock_get_db, sample_data, mock_duckdb_connection):
        """Test complete workflow from query generation to execution"""
        mock_get_db.return_value = mock_duckdb_connection
        
        # Step 1: Generate visual query
        config_data = {
            "config": {
                "table_name": "test_employees",
                "selected_columns": ["department", "city"],
                "aggregations": [
                    {
                        "column": "salary",
                        "function": "AVG",
                        "alias": "avg_salary"
                    },
                    {
                        "column": "id",
                        "function": "COUNT",
                        "alias": "employee_count"
                    }
                ],
                "filters": [
                    {
                        "column": "status",
                        "operator": "=",
                        "value": "active",
                        "logic_operator": "AND"
                    },
                    {
                        "column": "age",
                        "operator": ">",
                        "value": 25,
                        "logic_operator": "AND"
                    }
                ],
                "order_by": [
                    {
                        "column": "avg_salary",
                        "direction": "DESC",
                        "priority": 0
                    }
                ],
                "group_by": ["department", "city"],
                "limit": 50,
                "is_distinct": False
            },
            "preview": False,
            "include_metadata": True
        }
        
        with patch('routers.query.estimate_query_performance') as mock_estimate:
            mock_estimate.return_value = Mock(estimated_rows=100, estimated_time=0.5)
            response = client.post("/api/visual-query/generate", json=config_data)
        assert response.status_code == 200
        
        generation_result = response.json()
        assert generation_result["success"] is True
        assert "sql" in generation_result
        
        generated_sql = generation_result["sql"]
        
        # Verify SQL contains expected components
        assert 'SELECT "department", "city"' in generated_sql
        assert 'AVG("salary") AS "avg_salary"' in generated_sql
        assert 'COUNT("id") AS "employee_count"' in generated_sql
        assert 'WHERE "status" = \'active\'' in generated_sql
        assert 'AND "age" > 25' in generated_sql
        assert 'GROUP BY "department", "city"' in generated_sql
        assert 'ORDER BY "avg_salary" DESC' in generated_sql
        assert 'LIMIT 50' in generated_sql
        
        # Step 2: Preview the query
        preview_data = {
            "config": config_data["config"],
            "limit": 10
        }
        
        preview_result = sample_data.groupby(['department', 'city']).agg({
            'salary': 'mean',
            'id': 'count'
        }).reset_index().head(10)
        preview_result.columns = ['department', 'city', 'avg_salary', 'employee_count']

        with patch('routers.query.execute_query') as mock_execute, \
             patch('routers.query.estimate_query_performance') as mock_preview_estimate:

            mock_execute.side_effect = [
                preview_result,
                pd.DataFrame({'total_rows': [25]}),
            ]

            mock_preview_estimate.return_value = Mock(estimated_time=0.2)

            response = client.post("/api/visual-query/preview", json=preview_data)
        assert response.status_code == 200
        
        preview_response = response.json()
        assert preview_response["success"] is True
        assert len(preview_response["data"]) <= 10
        assert preview_response["row_count"] == 25
        
        # Step 3: Execute full query (simulated through regular query API)
        query_request = {
            "sources": [{
                "id": "test_employees",
                "type": "duckdb",
                "name": "test_employees"
            }],
            "joins": [],
            "sql": generated_sql,
            "is_preview": False
        }
        
        # Mock full query execution
        full_result = sample_data.groupby(['department', 'city']).agg({
            'salary': 'mean',
            'id': 'count'
        }).reset_index()
        full_result.columns = ['department', 'city', 'avg_salary', 'employee_count']
        
        mock_duckdb_connection.execute.return_value.fetchdf.return_value = full_result

        with patch('routers.query.execute_query') as mock_execute:
            mock_execute.return_value = full_result
            
            response = client.post("/api/query", json=query_request)
            assert response.status_code == 200
            
            query_response = response.json()
            assert "data" in query_response
            assert "columns" in query_response
            assert len(query_response["data"]) > 0
    
    @patch('core.duckdb_engine.get_db_connection')
    def test_visual_query_with_table_metadata(self, mock_get_db, mock_duckdb_connection):
        """Test workflow including table metadata retrieval"""
        mock_get_db.return_value = mock_duckdb_connection
        
        # Step 1: Get table metadata
        # Mock table info
        mock_duckdb_connection.execute.return_value.fetchdf.side_effect = [
            pd.DataFrame({'name': ['test_employees']}),  # Table exists check
            pd.DataFrame({'row_count': [1000]}),  # Row count
            pd.DataFrame({  # Column info
                'column_name': ['id', 'name', 'age', 'salary'],
                'column_type': ['INTEGER', 'VARCHAR', 'INTEGER', 'DOUBLE']
            }),
            # Column statistics for each column
            pd.DataFrame({
                'total_count': [1000], 'non_null_count': [1000], 
                'null_count': [0], 'distinct_count': [1000]
            }),
            pd.DataFrame({'min_val': [1], 'max_val': [1000], 'avg_val': [500.5]}),
            pd.DataFrame({'id': [1, 2, 3, 4, 5]}),
            # Repeat for other columns...
        ]
        
        response = client.get("/api/duckdb/tables/detail/test_employees")
        assert response.status_code == 200
        
        metadata_response = response.json()
        assert metadata_response["success"] is True
        assert metadata_response["table"]["table_name"] == "test_employees"
        assert metadata_response["table"]["row_count"] == 1000
        
        # Step 2: Get specific column statistics
        response = client.get("/api/visual-query/column-stats/test_employees/salary")
        assert response.status_code == 200
        
        stats_response = response.json()
        assert stats_response["success"] is True
        assert stats_response["statistics"]["column_name"] == "salary"
    
    def test_visual_query_validation_workflow(self):
        """Test query validation workflow"""
        # Test valid configuration
        valid_config = {
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
                    "column": "total",
                    "direction": "DESC",
                    "priority": 0
                }
            ],
            "group_by": ["col1", "col2"],
            "is_distinct": False
        }
        
        response = client.post("/api/visual-query/validate", json=valid_config)
        assert response.status_code == 200
        
        validation_response = response.json()
        assert validation_response["success"] is True
        assert validation_response["is_valid"] is True
        
        # Test invalid configuration
        invalid_config = {
            "table_name": "",  # Invalid
            "selected_columns": [],
            "aggregations": [
                {
                    "column": "",  # Invalid
                    "function": "SUM"
                }
            ],
            "filters": [],
            "order_by": [],
            "is_distinct": False
        }
        
        response = client.post("/api/visual-query/validate", json=invalid_config)
        assert response.status_code == 200
        
        validation_response = response.json()
        assert validation_response["success"] is True
        assert validation_response["is_valid"] is False
        assert len(validation_response["errors"]) > 0


class TestBackwardCompatibility:
    """Test backward compatibility with existing query system"""
    
    @patch('core.duckdb_engine.get_db_connection')
    def test_visual_query_integrates_with_existing_api(self, mock_get_db, sample_data, mock_duckdb_connection):
        """Test that visual queries work with existing query API"""
        mock_get_db.return_value = mock_duckdb_connection
        
        # Generate a visual query
        config_data = {
            "config": {
                "table_name": "test_table",
                "selected_columns": ["name", "age"],
                "aggregations": [],
                "filters": [
                    {
                        "column": "age",
                        "operator": ">",
                        "value": 30,
                        "logic_operator": "AND"
                    }
                ],
                "order_by": [
                    {
                        "column": "age",
                        "direction": "DESC",
                        "priority": 0
                    }
                ],
                "limit": 20,
                "is_distinct": False
            },
            "preview": False,
            "include_metadata": False
        }
        
        response = client.post("/api/visual-query/generate", json=config_data)
        assert response.status_code == 200
        
        generation_result = response.json()
        generated_sql = generation_result["sql"]
        
        # Use generated SQL with existing query API
        query_request = {
            "sources": [{
                "id": "test_table",
                "type": "duckdb",
                "name": "test_table"
            }],
            "joins": [],
            "sql": generated_sql,
            "is_preview": False
        }
        
        # Mock query execution
        filtered_data = sample_data[sample_data['age'] > 30].head(20)
        mock_duckdb_connection.execute.return_value.fetchdf.return_value = filtered_data
        
        with patch('routers.query.execute_query') as mock_execute:
            mock_execute.return_value = filtered_data
            
            response = client.post("/api/query", json=query_request)
            assert response.status_code == 200
            
            query_response = response.json()
            assert "data" in query_response
            assert len(query_response["data"]) <= 20
    
    def test_multi_table_queries_still_work(self):
        """Test that existing multi-table JOIN queries still work"""
        # This should work exactly as before, without visual query interference
        query_request = {
            "sources": [
                {
                    "id": "table1",
                    "type": "duckdb",
                    "name": "table1"
                },
                {
                    "id": "table2", 
                    "type": "duckdb",
                    "name": "table2"
                }
            ],
            "joins": [
                {
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
            ]
        }
        
        with patch('routers.query.get_db_connection') as mock_get_db, \
             patch('routers.query.execute_query') as mock_execute:
            
            # Mock successful execution
            mock_execute.return_value = pd.DataFrame({
                'table1_id': [1, 2, 3],
                'table1_name': ['A', 'B', 'C'],
                'table2_user_id': [1, 2, 3],
                'table2_value': [100, 200, 300]
            })
            
            response = client.post("/api/query", json=query_request)
            assert response.status_code == 200
            
            query_response = response.json()
            assert "data" in query_response
            assert len(query_response["data"]) == 3


class TestPerformanceAndScaling:
    """Test performance characteristics and scaling"""
    
    @patch('core.duckdb_engine.get_db_connection')
    def test_large_dataset_handling(self, mock_get_db, mock_duckdb_connection):
        """Test handling of large datasets"""
        mock_get_db.return_value = mock_duckdb_connection
        
        # Simulate large dataset
        large_data = pd.DataFrame({
            'id': range(1, 100001),  # 100k rows
            'category': ['A', 'B', 'C', 'D', 'E'] * 20000,
            'value': range(100000)
        })
        
        config_data = {
            "config": {
                "table_name": "large_table",
                "selected_columns": ["category"],
                "aggregations": [
                    {
                        "column": "value",
                        "function": "SUM",
                        "alias": "total_value"
                    }
                ],
                "filters": [],
                "order_by": [
                    {
                        "column": "total_value",
                        "direction": "DESC",
                        "priority": 0
                    }
                ],
                "group_by": ["category"],
                "limit": 100,
                "is_distinct": False
            },
            "preview": False,
            "include_metadata": True
        }
        
        # Mock performance estimation
        mock_duckdb_connection.execute.return_value.fetchdf.return_value = pd.DataFrame({
            'total_rows': [100000]
        })
        
        response = client.post("/api/visual-query/generate", json=config_data)
        assert response.status_code == 200
        
        generation_result = response.json()
        assert generation_result["success"] is True
        
        # Check that performance warnings are generated for large datasets
        if "metadata" in generation_result:
            metadata = generation_result["metadata"]
            assert "estimated_rows" in metadata
    
    def test_complex_query_performance_warnings(self):
        """Test performance warnings for complex queries"""
        # Create very complex configuration
        complex_config = {
            "table_name": "complex_table",
            "selected_columns": ["col1", "col2", "col3"],
            "aggregations": [
                {"column": f"metric_{i}", "function": "SUM", "alias": f"sum_{i}"}
                for i in range(10)  # Many aggregations
            ],
            "filters": [
                {"column": f"filter_{i}", "operator": "=", "value": f"value_{i}", "logic_operator": "AND"}
                for i in range(15)  # Many filters
            ],
            "order_by": [
                {"column": f"sum_{i}", "direction": "DESC", "priority": i}
                for i in range(5)  # Multiple sorts
            ],
            "group_by": ["col1", "col2", "col3"],
            "is_distinct": False
        }
        
        response = client.post("/api/visual-query/validate", json=complex_config)
        assert response.status_code == 200
        
        validation_response = response.json()
        assert validation_response["success"] is True
        
        # Should generate performance warnings
        assert len(validation_response["warnings"]) > 0
        assert any("性能" in warning for warning in validation_response["warnings"])


if __name__ == "__main__":
    pytest.main([__file__])