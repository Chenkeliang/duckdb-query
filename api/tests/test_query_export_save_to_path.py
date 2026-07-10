"""桌面直写:POST /api/query-results/export/{file_id}/save-to-path。

与 async-tasks 的 export-to-path 同一门控(ALLOW_ARBITRARY_LOCAL_PATHS=1)与
路径校验(utils/local_export.py);本文件验证 query_export 侧的接线。
"""

import asyncio

import pytest

from core.common.exceptions import ValidationError as APIValidationError
from routers.query_export import SaveExportToPathRequest, save_query_export_to_path


def _run(file_id, target_path):
    return asyncio.run(
        save_query_export_to_path(file_id, SaveExportToPathRequest(target_path=target_path))
    )


def test_403_outside_desktop_mode(monkeypatch, tmp_path):
    monkeypatch.delenv("ALLOW_ARBITRARY_LOCAL_PATHS", raising=False)
    resp = _run("f1", str(tmp_path / "o.parquet"))
    assert resp.status_code == 403


def test_rejects_traversal_file_id(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    with pytest.raises(APIValidationError):
        _run("../secret", str(tmp_path / "o.parquet"))


def test_400_on_relative_target(monkeypatch):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    resp = _run("f1", "relative.parquet")
    assert resp.status_code == 400


def test_404_when_export_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    monkeypatch.setattr("routers.query_export._find_export_file", lambda fid: None)
    resp = _run("f1", str(tmp_path / "o.parquet"))
    assert resp.status_code == 404


def test_happy_path_copies_export(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    src = tmp_path / "cache.parquet"
    src.write_bytes(b"PAR1demo")
    monkeypatch.setattr("routers.query_export._find_export_file", lambda fid: str(src))
    out = tmp_path / "chosen.parquet"

    resp = _run("f1", str(out))

    assert resp["success"] is True
    assert resp["data"]["size_bytes"] == 8
    assert out.read_bytes() == b"PAR1demo"
