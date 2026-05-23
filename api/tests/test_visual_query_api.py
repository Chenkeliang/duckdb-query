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
    FilterConfig,
    AggregationFunction,
    FilterOperator,
    VisualQueryMode,
)
from core.services.pivot_query_generator import GeneratedVisualQuery
from tests.pool_mock import bind_mock_duckdb_pool

client = TestClient(app)


def api_data(body: dict) -> dict:
    assert body["success"] is True, body
    return body["data"]


def api_errors(body: dict) -> list:
    assert body["success"] is False, body
    err = body.get("error") or {}
    details = err.get("details") if isinstance(err.get("details"), dict) else {}
    return (details or {}).get("errors") or [body.get("message") or err.get("message", "")]


# HTTP `/api/visual-query/*` 仅接受 pivot（与前端 PivotPanel 一致）
PIVOT_REQUEST_FIELDS = {
    "pivot_config": {
        "rows": ["col1"],
        "columns": [],
        "values": [{"column": "col2", "aggregation": "COUNT"}],
    },
}


def _with_pivot_request(body: dict) -> dict:
    return {**PIVOT_REQUEST_FIELDS, **body}


class TestVisualQueryGeneration:
    """Test visual query generation endpoint"""
    
    def test_generate_simple_query(self):
        """Test generating a simple visual query"""

        config_data = _with_pivot_request({
            "config": {
                "table_name": "test_table",
                "filters": [],
                },
            "preview": False,
            })

        generation_result = GeneratedVisualQuery(
            mode=VisualQueryMode.PIVOT,
            base_sql='SELECT "col1", "col2" FROM "test_table"',
            final_sql='SELECT "col1", "col2" FROM "test_table"',
            pivot_sql=None,
            warnings=[],
            metadata={"mode": VisualQueryMode.PIVOT.value},
        )

        with patch('routers.visual_query.validate_query_config') as mock_validate, \
             patch('routers.visual_query.generate_visual_query_sql') as mock_generate:

            mock_validate.return_value = Mock(
                is_valid=True,
                errors=[],
                warnings=[],
                complexity_score=1,
            )

            mock_generate.return_value = generation_result

            response = client.post("/api/visual-query/generate", json=config_data)

            assert response.status_code == 200
            inner = api_data(response.json())
            assert inner["sql"] == 'SELECT "col1", "col2" FROM "test_table"'
            assert inner["metadata"]["complexity_score"] == 1

    def test_missing_pivot_config_rejected(self):
        """缺少 pivot_config 时由 Pydantic 返回 422。"""
        response = client.post(
            "/api/visual-query/generate",
            json={
                "config": {
                    "table_name": "test_table",
                    "filters": [],
                },
            },
        )
        assert response.status_code == 422
    
    def test_generate_query_with_validation_errors(self):
        """Test query generation with validation errors - Pydantic rejects invalid config"""
        config_data = {
            "config": {
                "table_name": "",  # Invalid empty table name - FastAPI/Pydantic returns 422
                "filters": [],
                },
            "preview": False,
            }
        
        # FastAPI/Pydantic validation rejects empty table_name with 422
        response = client.post("/api/visual-query/generate", json=config_data)
        
        # Pydantic validation now returns 422 for invalid configuration
        assert response.status_code == 422

    def test_generate_complex_query(self):
        """Test generating a complex query with aggregations and filters"""

        config_data = _with_pivot_request({
            "config": {
                "table_name": "sales_data",
                "filters": [
                    {
                        "column": "status",
                        "operator": "=",
                        "value": "completed",
                        "logic_operator": "AND",
                    }
                ],
                "limit": 100,
                },
            "preview": False,
            })

        expected_sql = (
            'SELECT "region", SUM("amount") AS "total_sales" '
            'FROM "sales_data" WHERE "status" = \'completed\' '
            'GROUP BY "region" ORDER BY "total_sales" DESC LIMIT 100'
        )

        generation_result = GeneratedVisualQuery(
            mode=VisualQueryMode.PIVOT,
            base_sql=expected_sql,
            final_sql=expected_sql,
            pivot_sql=None,
            warnings=["复杂查询可能需要较长时间"],
            metadata={"mode": VisualQueryMode.PIVOT.value},
        )

        with patch('routers.visual_query.validate_query_config') as mock_validate, \
             patch('routers.visual_query.generate_visual_query_sql') as mock_generate:

            mock_validate.return_value = Mock(
                is_valid=True,
                errors=[],
                warnings=["复杂查询可能需要较长时间"],
                complexity_score=8,
            )

            mock_generate.return_value = generation_result

            response = client.post("/api/visual-query/generate", json=config_data)

            assert response.status_code == 200
            inner = api_data(response.json())
            assert inner["sql"] == expected_sql
            assert len(inner["warnings"]) > 0
            assert inner["metadata"]["complexity_score"] == 8


class TestVisualQueryPreview:
    """Test visual query preview endpoint"""
    
    def test_preview_query_success(self):
        """Test successful query preview"""
        config_data = _with_pivot_request({
            "config": {
                "table_name": "test_table",
                "filters": [],
                },
            "limit": 10
        })
        
        preview_sql = 'SELECT "name", "age" FROM "test_table"'
        generation_result = GeneratedVisualQuery(
            mode=VisualQueryMode.PIVOT,
            base_sql=preview_sql,
            final_sql=preview_sql,
            pivot_sql=None,
            warnings=[],
            metadata={"mode": VisualQueryMode.PIVOT.value},
        )

        with patch('routers.visual_query.validate_query_config') as mock_validate, \
             patch('routers.visual_query.generate_visual_query_sql') as mock_generate, \
             patch('routers.visual_query.with_duckdb_connection') as mock_pool:

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

            mock_con = Mock()
            bind_mock_duckdb_pool(mock_pool, mock_con)
            mock_con.execute.return_value.fetchdf.side_effect = [
                preview_data,
                pd.DataFrame({'total_rows': [1000]}),
            ]

            response = client.post("/api/visual-query/preview", json=config_data)

            assert response.status_code == 200
            envelope = response.json()
            assert envelope["success"] is True
            inner = envelope["data"]
            assert len(inner["data"]) == 3
            assert inner["row_count"] == 1000
            assert inner["returned_rows"] == 3
    
    def test_preview_query_validation_error(self):
        """Test preview with validation errors - Pydantic rejects invalid config"""
        config_data = _with_pivot_request({
            "config": {
                "table_name": "",
                "filters": [],
                },
            "limit": 10,
        })

        response = client.post("/api/visual-query/preview", json=config_data)

        assert response.status_code == 422


class TestTableMetadata:
    """Test table metadata endpoint"""
    
    def test_get_table_metadata_success(self):
        """Test successful table metadata retrieval"""
        with patch('routers.duckdb_query.with_duckdb_connection') as mock_db, \
             patch('routers.duckdb_query.get_table_metadata') as mock_metadata:
            
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_db, mock_con)
            
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
            
            response = client.get("/api/duckdb/tables/detail/test_table")
            
            assert response.status_code == 200
            table = api_data(response.json())["table"]
            assert table["table_name"] == "test_table"
            assert table["row_count"] == 1000
            assert table["column_count"] == 3
            assert len(table["columns"]) == 3
    
    def test_get_table_metadata_table_not_found(self):
        """Test table metadata for non-existent table"""
        with patch('routers.duckdb_query.with_duckdb_connection') as mock_db:
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_db, mock_con)
            
            # Mock empty tables list
            import pandas as pd
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
                'name': []
            })
            
            response = client.get("/api/duckdb/tables/detail/nonexistent_table")
            
            assert response.status_code == 404
            body = response.json()
            msg = body.get("error", {}).get("message", "") or body.get("message", "")
            assert "not found" in msg.lower() or "does not exist" in msg.lower()
            assert "detail" not in body

    def test_refresh_table_metadata_success(self):
        """Refreshing metadata should bypass cache."""
        with patch('routers.duckdb_query.with_duckdb_connection') as mock_db, \
             patch('routers.duckdb_query.get_table_metadata') as mock_metadata:

            mock_con = Mock()
            bind_mock_duckdb_pool(mock_db, mock_con)

            import pandas as pd
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
                'name': ['test_table']
            })

            from models.visual_query_models import TableMetadata, ColumnStatistics
            mock_metadata.return_value = TableMetadata(
                table_name="test_table",
                row_count=10,
                column_count=1,
                columns=[
                    ColumnStatistics(
                        column_name="col",
                        data_type="INTEGER",
                        null_count=0,
                        distinct_count=2,
                        sample_values=["1", "2"]
                    )
                ]
            )

            response = client.post("/api/duckdb/table/test_table/refresh")
            assert response.status_code == 200
            assert api_data(response.json())["refreshed"] is True
            mock_metadata.assert_called_once_with("test_table", mock_con, use_cache=False)

    def test_refresh_table_metadata_table_not_found(self):
        """Refreshing metadata should 404 when table does not exist."""
        with patch('routers.duckdb_query.with_duckdb_connection') as mock_db:
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_db, mock_con)

            import pandas as pd
            mock_con.execute.return_value.fetchdf.return_value = pd.DataFrame({
                'name': []
            })

            response = client.post("/api/duckdb/table/missing_table/refresh")
            assert response.status_code == 404


class TestErrorHandling:
    """Test error handling across all endpoints"""
    
    def test_malformed_json_request(self):
        """Test handling of malformed JSON requests"""
        response = client.post(
            "/api/visual-query/generate",
            content="invalid json",
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
                "table_name": 123,
                "filters": [],
            },
            "preview": False,
        }
        
        response = client.post("/api/visual-query/generate", json=config_data)
        
        assert response.status_code == 422  # Validation error


if __name__ == "__main__":
    pytest.main([__file__])
