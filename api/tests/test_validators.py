"""validators 模块：BaseAPIException 与专用 error_code。"""

import os
import sys

import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from core.common.exceptions import BaseAPIException
from core.common.validators import (
    sanitize_path,
    validate_alias,
    validate_pagination,
    validate_table_name,
)


def test_validate_table_name_invalid_format():
    with pytest.raises(BaseAPIException) as exc_info:
        validate_table_name("9starts_with_digit")
    exc = exc_info.value
    assert exc.status_code == 400
    assert exc.error_code == "INVALID_TABLE_NAME"
    assert exc.details["field"] == "table_name"


def test_validate_table_name_protected_schema():
    with pytest.raises(BaseAPIException) as exc_info:
        validate_table_name("information_schema.tables")
    exc = exc_info.value
    assert exc.status_code == 403
    assert exc.error_code == "PROTECTED_SCHEMA"


def test_validate_table_name_reserved_prefix():
    with pytest.raises(BaseAPIException) as exc_info:
        validate_table_name("system_config")
    exc = exc_info.value
    assert exc.status_code == 403
    assert exc.error_code == "RESERVED_NAME"


def test_validate_alias_missing():
    with pytest.raises(BaseAPIException) as exc_info:
        validate_alias("")
    assert exc_info.value.error_code == "MISSING_ALIAS"


def test_validate_pagination_invalid_limit():
    with pytest.raises(BaseAPIException) as exc_info:
        validate_pagination(99, 0)
    assert exc_info.value.error_code == "INVALID_LIMIT"
    assert exc_info.value.details["field"] == "limit"


def test_validate_pagination_invalid_offset():
    with pytest.raises(BaseAPIException) as exc_info:
        validate_pagination(20, -1)
    assert exc_info.value.error_code == "INVALID_OFFSET"


def test_sanitize_path_not_allowed(tmp_path):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    with pytest.raises(BaseAPIException) as exc_info:
        sanitize_path(str(outside), [str(allowed)])
    assert exc_info.value.error_code == "PATH_NOT_ALLOWED"
    assert exc_info.value.status_code == 403


def test_sanitize_path_rejects_prefix_sibling_directory(tmp_path):
    """兄弟目录 allowed_evil 以 allowed 为字符串前缀但不在其内,必须拒绝
    (裸 startswith 会误放行)。"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    sibling = tmp_path / "allowed_evil"
    sibling.mkdir()
    target = sibling / "secret.txt"
    target.write_text("x")
    with pytest.raises(BaseAPIException) as exc_info:
        sanitize_path(str(target), [str(allowed)])
    assert exc_info.value.error_code == "PATH_NOT_ALLOWED"


def test_sanitize_path_allows_file_inside_base(tmp_path):
    """白名单目录内的真实文件应放行,返回 realpath。"""
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    inside = allowed / "data.csv"
    inside.write_text("x")
    assert sanitize_path(str(inside), [str(allowed)]) == os.path.realpath(str(inside))


def test_async_tasks_invalid_limit_standard_envelope():
    """async_tasks 列表非法 limit 经 validate_pagination 返回标准信封。"""
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get("/api/async-tasks", params={"limit": 99, "offset": 0})
    assert response.status_code == 400
    body = response.json()
    assert body["success"] is False
    assert body["error"]["code"] == "INVALID_LIMIT"
    assert body["error"]["details"]["field"] == "limit"
    assert "detail" not in body
