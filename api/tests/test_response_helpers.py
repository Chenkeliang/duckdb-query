"""
Tests for response_helpers module.

Tests the standard API response format functions:
- create_success_response
- create_list_response
- create_error_response
- MessageCode enum
- DEFAULT_MESSAGES mapping
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import datetime
from utils.response_helpers import (
    create_success_response,
    create_list_response,
    create_error_response,
    MessageCode,
    DEFAULT_MESSAGES,
)


class TestCreateSuccessResponse:
    """Tests for create_success_response function."""

    def test_basic_success_response(self):
        """Test basic success response structure."""
        result = create_success_response(
            data={"key": "value"},
            message_code=MessageCode.OPERATION_SUCCESS
        )
        
        assert result["success"] is True
        assert result["data"] == {"key": "value"}
        assert result["messageCode"] == "OPERATION_SUCCESS"
        assert "message" in result
        assert "timestamp" in result

    def test_success_response_with_custom_message(self):
        """Test success response with custom message."""
        result = create_success_response(
            data={"id": 123},
            message_code=MessageCode.TABLE_CREATED,
            message="Custom success message"
        )
        
        assert result["message"] == "Custom success message"
        assert result["messageCode"] == "TABLE_CREATED"

    def test_success_response_default_message(self):
        """Test success response uses default message from mapping."""
        result = create_success_response(
            data={},
            message_code=MessageCode.OPERATION_SUCCESS
        )
        
        expected_message = DEFAULT_MESSAGES.get(MessageCode.OPERATION_SUCCESS, "")
        assert result["message"] == expected_message

    def test_success_response_timestamp_format(self):
        """Test timestamp is in ISO 8601 format."""
        result = create_success_response(
            data={},
            message_code=MessageCode.OPERATION_SUCCESS
        )
        
        timestamp = result["timestamp"]
        assert timestamp.endswith("Z")
        # Should be parseable as ISO format
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    def test_success_response_with_none_data(self):
        """Test success response with None data."""
        result = create_success_response(
            data=None,
            message_code=MessageCode.OPERATION_SUCCESS
        )
        
        assert result["success"] is True
        assert result["data"] is None

    def test_success_response_with_list_data(self):
        """Test success response with list data."""
        data = [{"id": 1}, {"id": 2}]
        result = create_success_response(
            data=data,
            message_code=MessageCode.ITEMS_RETRIEVED
        )
        
        assert result["data"] == data


class TestCreateListResponse:
    """Tests for create_list_response function."""

    def test_basic_list_response(self):
        """Test basic list response structure."""
        items = [{"id": 1}, {"id": 2}, {"id": 3}]
        result = create_list_response(
            items=items,
            total=10,
            message_code=MessageCode.ITEMS_RETRIEVED
        )
        
        assert result["success"] is True
        assert result["data"]["items"] == items
        assert result["data"]["total"] == 10
        assert result["messageCode"] == "ITEMS_RETRIEVED"

    def test_list_response_with_pagination(self):
        """Test list response with pagination parameters."""
        items = [{"id": 1}]
        result = create_list_response(
            items=items,
            total=100,
            message_code=MessageCode.ITEMS_RETRIEVED,
            page=2,
            page_size=20
        )
        
        assert result["data"]["page"] == 2
        assert result["data"]["pageSize"] == 20
        assert result["data"]["total"] == 100

    def test_list_response_without_pagination(self):
        """Test list response without pagination parameters."""
        items = []
        result = create_list_response(
            items=items,
            total=0,
            message_code=MessageCode.ITEMS_RETRIEVED
        )
        
        assert "page" not in result["data"]
        assert "pageSize" not in result["data"]

    def test_list_response_empty_items(self):
        """Test list response with empty items."""
        result = create_list_response(
            items=[],
            total=0,
            message_code=MessageCode.ITEMS_RETRIEVED
        )
        
        assert result["data"]["items"] == []
        assert result["data"]["total"] == 0


class TestCreateErrorResponse:
    """Tests for create_error_response function."""

    def test_basic_error_response(self):
        """Test basic error response structure."""
        result = create_error_response(
            code="VALIDATION_ERROR",
            message="Validation failed"
        )
        
        assert result["success"] is False
        assert result["error"]["code"] == "VALIDATION_ERROR"
        assert result["error"]["message"] == "Validation failed"
        assert result["messageCode"] == "VALIDATION_ERROR"
        assert result["message"] == "Validation failed"
        assert "timestamp" in result

    def test_error_response_with_details(self):
        """Test error response with details."""
        details = {"field": "email", "reason": "invalid format"}
        result = create_error_response(
            code="VALIDATION_ERROR",
            message="Validation failed",
            details=details
        )
        
        assert result["error"]["details"] == details

    def test_error_response_without_details(self):
        """Test error response without details defaults to empty dict."""
        result = create_error_response(
            code="INTERNAL_ERROR",
            message="Something went wrong"
        )
        
        assert result["error"]["details"] == {}

    def test_error_response_has_detail_field(self):
        """Test error response includes detail field for FastAPI compatibility."""
        result = create_error_response(
            code="NOT_FOUND",
            message="Resource not found"
        )
        
        assert "detail" in result
        assert result["detail"] == "Resource not found"

    def test_error_response_with_message_code_enum(self):
        """Test error response accepts MessageCode enum as code parameter."""
        result = create_error_response(
            code=MessageCode.VALIDATION_ERROR,
            message="Validation failed"
        )
        
        # code should be converted to string
        assert result["success"] is False
        assert result["error"]["code"] == "VALIDATION_ERROR"
        assert result["messageCode"] == "VALIDATION_ERROR"
        assert isinstance(result["error"]["code"], str)
        assert isinstance(result["messageCode"], str)

    def test_error_response_with_string_code(self):
        """Test error response accepts string as code parameter."""
        result = create_error_response(
            code="CUSTOM_ERROR",
            message="Custom error message"
        )
        
        assert result["error"]["code"] == "CUSTOM_ERROR"
        assert result["messageCode"] == "CUSTOM_ERROR"


class TestMessageCodeEnum:
    """Tests for MessageCode enum."""

    def test_message_code_values_are_strings(self):
        """Test all MessageCode values are strings."""
        for code in MessageCode:
            assert isinstance(code.value, str)

    def test_common_message_codes_exist(self):
        """Test common message codes exist."""
        expected_codes = [
            "OPERATION_SUCCESS",
            "OPERATION_FAILED",
            "ITEMS_RETRIEVED",
            "VALIDATION_ERROR",
            "INTERNAL_ERROR",
            "QUERY_SUCCESS",
            "TABLE_CREATED",
            "TABLE_DELETED",
            "CONNECTION_TEST_SUCCESS",
            "CONNECTION_TEST_FAILED",
            "FILE_UPLOADED",
            "TASK_SUBMITTED",
        ]
        
        actual_codes = [code.value for code in MessageCode]
        for expected in expected_codes:
            assert expected in actual_codes, f"Missing MessageCode: {expected}"

    def test_message_code_uniqueness(self):
        """Test all MessageCode values are unique."""
        values = [code.value for code in MessageCode]
        assert len(values) == len(set(values)), "Duplicate MessageCode values found"


class TestDefaultMessages:
    """Tests for DEFAULT_MESSAGES mapping."""

    def test_all_message_codes_have_default_message(self):
        """Test all MessageCode enums have a default message."""
        missing = []
        for code in MessageCode:
            if code not in DEFAULT_MESSAGES:
                missing.append(code.value)
        
        assert len(missing) == 0, f"Missing default messages for: {missing}"

    def test_default_messages_are_non_empty(self):
        """Test all default messages are non-empty strings."""
        for code, message in DEFAULT_MESSAGES.items():
            assert isinstance(message, str), f"{code.value} message is not a string"
            assert len(message) > 0, f"{code.value} has empty message"

    def test_default_messages_are_chinese(self):
        """Test default messages contain Chinese characters (for zh locale)."""
        # At least some messages should contain Chinese
        chinese_count = 0
        for message in DEFAULT_MESSAGES.values():
            if any('\u4e00' <= char <= '\u9fff' for char in message):
                chinese_count += 1
        
        # Most messages should be in Chinese
        assert chinese_count > len(DEFAULT_MESSAGES) * 0.5, \
            "Expected most default messages to be in Chinese"


class TestResponseConsistency:
    """Tests for response format consistency."""

    def test_success_and_list_have_same_base_fields(self):
        """Test success and list responses have consistent base fields."""
        success = create_success_response(
            data={},
            message_code=MessageCode.OPERATION_SUCCESS
        )
        list_resp = create_list_response(
            items=[],
            total=0,
            message_code=MessageCode.ITEMS_RETRIEVED
        )
        
        base_fields = {"success", "data", "messageCode", "message", "timestamp"}
        assert base_fields.issubset(success.keys())
        assert base_fields.issubset(list_resp.keys())

    def test_error_has_required_fields(self):
        """Test error response has all required fields."""
        error = create_error_response(
            code="TEST_ERROR",
            message="Test error"
        )
        
        required_fields = {"success", "error", "messageCode", "message", "timestamp", "detail"}
        assert required_fields.issubset(error.keys())
        
        error_fields = {"code", "message", "details"}
        assert error_fields.issubset(error["error"].keys())
