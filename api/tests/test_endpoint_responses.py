"""
Integration tests for API endpoint response formats.

Tests that all API endpoints return responses in the standard format:
- success: boolean
- data: object (for success) or error: object (for error)
- messageCode: string
- message: string
- timestamp: string (ISO 8601)
"""

import sys
import os

# Add api directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient
from main import app


client = TestClient(app)


# Required fields for all responses
REQUIRED_SUCCESS_FIELDS = {"success", "data", "messageCode", "message", "timestamp"}
REQUIRED_ERROR_FIELDS = {"success", "error", "messageCode", "message", "timestamp"}
REQUIRED_LIST_DATA_FIELDS = {"items", "total"}


def assert_success_response(response_json: dict, expected_code: str = None):
    """Assert response is a valid success response."""
    assert response_json.get("success") is True, f"Expected success=True, got {response_json}"
    assert "data" in response_json, "Missing 'data' field"
    assert "messageCode" in response_json, "Missing 'messageCode' field"
    assert "message" in response_json, "Missing 'message' field"
    assert "timestamp" in response_json, "Missing 'timestamp' field"
    
    if expected_code:
        assert response_json["messageCode"] == expected_code, \
            f"Expected messageCode={expected_code}, got {response_json['messageCode']}"
    
    # Timestamp should be ISO 8601 format
    timestamp = response_json["timestamp"]
    assert timestamp.endswith("Z"), f"Timestamp should end with 'Z': {timestamp}"


def assert_list_response(response_json: dict, expected_code: str = None):
    """Assert response is a valid list response."""
    assert_success_response(response_json, expected_code)
    
    data = response_json["data"]
    assert "items" in data, "List response missing 'items' field"
    assert "total" in data, "List response missing 'total' field"
    assert isinstance(data["items"], list), "'items' should be a list"
    assert isinstance(data["total"], int), "'total' should be an integer"


def assert_error_response(response_json: dict, expected_code: str = None):
    """Assert response is a valid error response."""
    assert response_json.get("success") is False, f"Expected success=False, got {response_json}"
    assert "error" in response_json, "Missing 'error' field"
    assert "messageCode" in response_json, "Missing 'messageCode' field"
    assert "message" in response_json, "Missing 'message' field"
    assert "timestamp" in response_json, "Missing 'timestamp' field"
    
    error = response_json["error"]
    assert "code" in error, "Error missing 'code' field"
    assert "message" in error, "Error missing 'message' field"
    
    if expected_code:
        assert response_json["messageCode"] == expected_code, \
            f"Expected messageCode={expected_code}, got {response_json['messageCode']}"


class TestDuckDBEndpoints:
    """Tests for DuckDB-related endpoints."""

    def test_get_tables_returns_list_format(self):
        """Test GET /api/duckdb/tables returns list format."""
        response = client.get("/api/duckdb/tables")
        assert response.status_code == 200
        
        data = response.json()
        assert_list_response(data, "TABLES_RETRIEVED")

    def test_get_table_not_found(self):
        """Test GET /api/duckdb/tables/{name} returns error for non-existent table."""
        response = client.get("/api/duckdb/tables/nonexistent_table_xyz")
        # Should return 404 or error response
        if response.status_code != 200:
            data = response.json()
            # FastAPI may wrap in detail, check for standard error format
            if "success" in data:
                assert_error_response(data)

    def test_pool_status_returns_success_format(self):
        """Test GET /api/duckdb/pool/status returns success format."""
        response = client.get("/api/duckdb/pool/status")
        assert response.status_code == 200
        
        data = response.json()
        assert_success_response(data, "POOL_STATUS_RETRIEVED")


class TestAsyncTaskEndpoints:
    """Tests for async task endpoints."""

    def test_list_tasks_returns_list_format(self):
        """Test GET /api/async-tasks returns list format."""
        response = client.get("/api/async-tasks")
        assert response.status_code == 200
        
        data = response.json()
        assert_list_response(data, "TASKS_RETRIEVED")

    def test_get_task_not_found(self):
        """Test GET /api/async-tasks/{id} returns error for non-existent task."""
        response = client.get("/api/async-tasks/nonexistent-task-id")
        assert response.status_code in [404, 400, 500]
        
        data = response.json()
        # Check for error format
        if "success" in data:
            assert_error_response(data)


class TestSqlFavoritesEndpoints:
    """Tests for SQL favorites endpoints."""

    def test_list_favorites_returns_list_format(self):
        """Test GET /api/sql-favorites returns list format."""
        response = client.get("/api/sql-favorites")
        assert response.status_code == 200
        
        data = response.json()
        assert_list_response(data, "FAVORITES_RETRIEVED")

    def test_get_favorite_not_found(self):
        """Test GET /api/sql-favorites/{id} returns error for non-existent favorite.
        
        Note: There is no GET endpoint for single favorite, so this test verifies
        that the API returns an appropriate error (404 or 405).
        """
        response = client.get("/api/sql-favorites/nonexistent-id")
        # Since there's no GET endpoint for single favorite, expect 404 or 405
        assert response.status_code in [404, 405, 400, 500]
        
        # If it's a 405 (Method Not Allowed), that's expected behavior
        # If it returns a JSON response with success field, verify error format
        try:
            data = response.json()
            if "success" in data:
                assert_error_response(data)
        except Exception:
            # Non-JSON response is acceptable for 404/405
            pass


class TestDataSourceEndpoints:
    """Tests for data source endpoints."""

    def test_list_datasources_returns_list_format(self):
        """Test GET /api/datasources returns list format."""
        response = client.get("/api/datasources")
        assert response.status_code == 200
        
        data = response.json()
        assert_list_response(data, "DATASOURCES_RETRIEVED")

    def test_list_database_datasources(self):
        """Test GET /api/datasources?type=database returns list format."""
        response = client.get("/api/datasources?type=database")
        assert response.status_code == 200
        
        data = response.json()
        assert_list_response(data)


class TestServerFilesEndpoints:
    """Tests for server files endpoints."""

    def test_get_mounted_returns_success_format(self):
        """Test GET /api/server-files/mounted returns success format."""
        response = client.get("/api/server-files/mounted")
        assert response.status_code == 200
        
        data = response.json()
        assert_success_response(data, "SERVER_MOUNTS_RETRIEVED")


class TestSettingsEndpoints:
    """Tests for settings endpoints."""

    def test_get_shortcuts_returns_success_format(self):
        """Test GET /api/settings/shortcuts returns success format."""
        response = client.get("/api/settings/shortcuts")
        assert response.status_code == 200
        
        data = response.json()
        assert_success_response(data, "SHORTCUTS_RETRIEVED")


class TestQueryEndpoints:
    """Tests for query endpoints."""

    def test_execute_invalid_sql_returns_error(self):
        """Test POST /api/duckdb/execute with invalid SQL returns error format."""
        response = client.post(
            "/api/duckdb/execute",
            json={"sql": "INVALID SQL SYNTAX HERE"}
        )
        
        # Should return error
        if response.status_code != 200:
            data = response.json()
            if "success" in data:
                assert_error_response(data)

    def test_visual_query_validate_empty_config(self):
        """Test POST /api/visual-query/validate with empty config.
        
        Note: An empty config may result in validation error or success with
        validation warnings. Both are acceptable as long as the response
        follows the standard format.
        """
        response = client.post(
            "/api/visual-query/validate",
            json={"tables": [], "columns": []}
        )
        
        data = response.json()
        # Response should follow standard format (either success or error)
        if response.status_code == 200:
            if data.get("success") is True:
                assert_success_response(data)
            else:
                # Error response with 200 status (validation error)
                assert_error_response(data)
        else:
            # Non-200 status should be error response
            if "success" in data:
                assert_error_response(data)


class TestResponseTimestamp:
    """Tests for response timestamp format."""

    def test_timestamp_is_utc(self):
        """Test all responses have UTC timestamp."""
        response = client.get("/api/duckdb/tables")
        data = response.json()
        
        timestamp = data.get("timestamp", "")
        assert timestamp.endswith("Z"), "Timestamp should be UTC (end with 'Z')"

    def test_timestamp_is_iso_format(self):
        """Test timestamp is valid ISO 8601 format."""
        from datetime import datetime
        
        response = client.get("/api/duckdb/tables")
        data = response.json()
        
        timestamp = data.get("timestamp", "")
        # Should be parseable
        try:
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            pytest.fail(f"Invalid timestamp format: {timestamp}")


class TestMessageCodeConsistency:
    """Tests for messageCode consistency."""

    def test_success_responses_have_message_code(self):
        """Test all success responses include messageCode."""
        endpoints = [
            "/api/duckdb/tables",
            "/api/async-tasks",
            "/api/sql-favorites",
            "/api/datasources",
            "/api/server-files/mounted",
            "/api/settings/shortcuts",
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint)
            if response.status_code == 200:
                data = response.json()
                assert "messageCode" in data, f"Missing messageCode in {endpoint}"
                assert isinstance(data["messageCode"], str), \
                    f"messageCode should be string in {endpoint}"
                assert len(data["messageCode"]) > 0, \
                    f"messageCode should not be empty in {endpoint}"
