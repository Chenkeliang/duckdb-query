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
        _export_result_file_to_local_path("t1", "xml", str(tmp_path / "out.xml"))


@pytest.mark.parametrize("fmt", ["json", "xlsx"])
def test_accepts_json_and_xlsx_formats(monkeypatch, tmp_path, fmt):
    """2026-07-29: desktop direct export supports all async download formats."""
    out = tmp_path / f"out.{fmt}"

    def fake_generate(_task_id, requested_format, target_path=None):
        assert requested_format == fmt
        assert target_path == str(out)
        out.write_bytes(b"result")
        return target_path

    monkeypatch.setattr("routers.async_tasks.generate_download_file", fake_generate)

    assert _export_result_file_to_local_path("t1", fmt, str(out)) == 6


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
    # 命中缓存:generate 返回缓存文件路径 → helper 分块拷贝到目标
    src = tmp_path / "cache.csv"
    src.write_text("a,b\n1,2\n", encoding="utf-8")
    monkeypatch.setattr(
        "routers.async_tasks.generate_download_file",
        lambda tid, fmt, target_path=None: str(src),
    )
    target = tmp_path / "chosen"
    target.mkdir()
    out = target / "result.csv"

    size = _export_result_file_to_local_path("t1", "csv", str(out))

    assert out.read_text(encoding="utf-8") == "a,b\n1,2\n"
    assert size == out.stat().st_size


def test_direct_write_skips_copy_when_no_cache(monkeypatch, tmp_path):
    # 未命中缓存:generate 收到 target_path 并直接写它(DuckDB COPY 直写,单遍磁盘写),
    # helper 识别 source == target,不再二次拷贝
    def fake_generate(tid, fmt, target_path=None):
        assert target_path is not None
        with open(target_path, "w", encoding="utf-8") as f:
            f.write("x,y\n")
        return target_path

    monkeypatch.setattr("routers.async_tasks.generate_download_file", fake_generate)
    out = tmp_path / "direct.csv"

    size = _export_result_file_to_local_path("t1", "csv", str(out))

    assert out.read_text(encoding="utf-8") == "x,y\n"
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
