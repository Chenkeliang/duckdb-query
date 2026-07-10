"""桌面直写导出(POST /api/async-tasks/{id}/export-to-path)。

背景(2026-07-10): 桌面版下载此前经"系统浏览器命中 GET 流式端点"落盘——Windows 上
explorer.exe 对带 query string 的 URL 静默失败,且 GB 级文件要写两遍盘。改为后端
直接写用户经原生存盘对话框选定的路径;门控与 server_files 导入方向共用
ALLOW_ARBITRARY_LOCAL_PATHS=1(Web/Docker 不设 → 403)。
"""

import asyncio

import pytest

from routers.async_tasks import (
    ExportToPathRequest,
    _export_result_file_to_local_path,
    export_task_result_to_path,
)


# ---------- 路径/格式校验(helper 层) ----------

def test_rejects_bad_format(tmp_path):
    with pytest.raises(ValueError, match="format"):
        _export_result_file_to_local_path("t1", "xlsx", str(tmp_path / "out.xlsx"))


def test_rejects_relative_path():
    with pytest.raises(ValueError, match="absolute"):
        _export_result_file_to_local_path("t1", "csv", "out.csv")


def test_rejects_directory_target(tmp_path):
    with pytest.raises(ValueError, match="directory"):
        _export_result_file_to_local_path("t1", "csv", str(tmp_path))


def test_rejects_missing_parent(tmp_path):
    with pytest.raises(ValueError, match="Parent directory"):
        _export_result_file_to_local_path("t1", "csv", str(tmp_path / "no_such_dir" / "out.csv"))


def test_happy_path_copies_cached_export(monkeypatch, tmp_path):
    src = tmp_path / "cache.csv"
    src.write_text("a,b\n1,2\n", encoding="utf-8")
    monkeypatch.setattr(
        "routers.async_tasks.generate_download_file", lambda tid, fmt: str(src)
    )
    target = tmp_path / "chosen"
    target.mkdir()
    out = target / "result.csv"

    size = _export_result_file_to_local_path("t1", "csv", str(out))

    assert out.read_text(encoding="utf-8") == "a,b\n1,2\n"
    assert size == out.stat().st_size


# ---------- 桌面门控(端点层) ----------

def test_endpoint_403_outside_desktop_mode(monkeypatch, tmp_path):
    monkeypatch.delenv("ALLOW_ARBITRARY_LOCAL_PATHS", raising=False)
    resp = asyncio.run(
        export_task_result_to_path(
            "t1", ExportToPathRequest(format="csv", target_path=str(tmp_path / "o.csv"))
        )
    )
    assert resp.status_code == 403


def test_endpoint_allows_in_desktop_mode(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    monkeypatch.setattr(
        "routers.async_tasks._export_result_file_to_local_path", lambda *a: 7
    )
    resp = asyncio.run(
        export_task_result_to_path(
            "t1", ExportToPathRequest(format="csv", target_path=str(tmp_path / "o.csv"))
        )
    )
    # 成功路径返回 create_success_response 的 dict(FastAPI 层序列化)
    assert resp["success"] is True
    assert resp["data"]["size_bytes"] == 7


def test_endpoint_maps_validation_to_400(monkeypatch):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    resp = asyncio.run(
        export_task_result_to_path(
            "t1", ExportToPathRequest(format="csv", target_path="relative.csv")
        )
    )
    assert resp.status_code == 400
