"""分块上传会话回收回归。

此前:未完成的上传(关标签页/断网)会把 upload_sessions 条目和 chunk 文件永久
留下;成功完成也只改状态不移除会话;进程重启后磁盘 chunk 目录彻底无人认领。
现在:complete 成功即移除会话;reap_stale_upload_sessions 按 TTL 回收
超时会话+分块目录,并扫掉不属于任何在册会话的磁盘孤儿目录。
"""
import asyncio
import os
import threading
import time
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app
import routers.chunked_upload as cu

client = TestClient(app)


def _make_session(upload_id: str, last_activity_ts: float, with_chunks: bool = True):
    chunks_dir = cu.get_chunks_dir(upload_id)
    if with_chunks:
        with open(os.path.join(chunks_dir, "chunk_000000"), "wb") as f:
            f.write(b"data")
    cu.upload_sessions[upload_id] = {
        "upload_id": upload_id,
        "file_name": "t.csv",
        "status": "uploading",
        "last_activity_ts": last_activity_ts,
        "chunks_dir": chunks_dir,
    }
    return chunks_dir


class TestReapStaleSessions:
    def setup_method(self):
        cu.upload_sessions.clear()

    def teardown_method(self):
        cu.upload_sessions.clear()

    def test_stale_session_and_chunks_removed(self):
        stale_ts = time.time() - cu.UPLOAD_SESSION_TTL_SECONDS - 10
        chunks_dir = _make_session("stale-1", stale_ts)

        removed = cu.reap_stale_upload_sessions()

        assert removed == 1
        assert "stale-1" not in cu.upload_sessions
        assert not os.path.exists(chunks_dir)

    def test_active_session_kept(self):
        chunks_dir = _make_session("active-1", time.time())

        removed = cu.reap_stale_upload_sessions()

        assert removed == 0
        assert "active-1" in cu.upload_sessions
        assert os.path.exists(chunks_dir)

    def test_orphan_disk_dir_reaped_fresh_kept(self):
        # 孤儿目录:磁盘上有、内存会话中无(进程重启后的典型残留)
        stale_orphan = cu.get_chunks_dir("orphan-old")
        fresh_orphan = cu.get_chunks_dir("orphan-new")
        old = time.time() - cu.UPLOAD_SESSION_TTL_SECONDS - 10
        os.utime(stale_orphan, (old, old))

        removed = cu.reap_stale_upload_sessions()

        assert removed == 1
        assert not os.path.exists(stale_orphan)
        assert os.path.exists(fresh_orphan)

    def test_reaped_session_returns_404_afterwards(self):
        stale_ts = time.time() - cu.UPLOAD_SESSION_TTL_SECONDS - 10
        _make_session("stale-2", stale_ts, with_chunks=False)
        cu.reap_stale_upload_sessions()

        resp = client.post(
            "/api/upload/chunk",
            data={"upload_id": "stale-2", "chunk_number": 0},
            files={"chunk": ("blob", b"xx")},
        )
        assert resp.status_code == 404

    def test_reaper_claim_prevents_late_chunk_success(self, monkeypatch):
        """回归(2026-07):回收已认领会话时，并发分块不能先报成功再被删除。"""
        payload = b"abc"
        resp = client.post(
            "/api/upload/init",
            data={
                "file_name": "reaper_race.csv",
                "file_size": str(len(payload)),
                "chunk_size": str(len(payload)),
            },
        )
        assert resp.status_code == 200
        upload_id = resp.json()["data"]["upload_id"]
        session = cu.upload_sessions[upload_id]
        session["last_activity_ts"] = time.time() - cu.UPLOAD_SESSION_TTL_SECONDS - 10
        chunks_dir = session["chunks_dir"]

        entered_rmtree = threading.Event()
        release_rmtree = threading.Event()
        real_rmtree = cu.shutil.rmtree

        def blocked_rmtree(path, *args, **kwargs):
            if path == chunks_dir:
                entered_rmtree.set()
                assert release_rmtree.wait(5)
            return real_rmtree(path, *args, **kwargs)

        monkeypatch.setattr(cu.shutil, "rmtree", blocked_rmtree)
        reaper = threading.Thread(target=cu.reap_stale_upload_sessions)
        reaper.start()
        try:
            assert entered_rmtree.wait(5)
            chunk_resp = client.post(
                "/api/upload/chunk",
                data={"upload_id": upload_id, "chunk_number": 0},
                files={"chunk": ("blob", payload)},
            )
        finally:
            release_rmtree.set()
            reaper.join(5)

        assert not reaper.is_alive()
        assert chunk_resp.status_code == 404
        assert upload_id not in cu.upload_sessions
        assert not os.path.exists(chunks_dir)

    def test_active_session_lease_blocks_reaping(self):
        """回归(2026-07):已开始处理的请求即使时间跨过 TTL 也不能被回收。"""
        stale_ts = time.time() - cu.UPLOAD_SESSION_TTL_SECONDS - 10
        chunks_dir = _make_session("active-lease", stale_ts)
        session = cu._acquire_upload_session("active-lease")
        try:
            session["last_activity_ts"] = stale_ts
            assert cu.reap_stale_upload_sessions() == 0
            assert "active-lease" in cu.upload_sessions
            assert os.path.exists(chunks_dir)
        finally:
            cu._release_upload_session("active-lease", session)

    def test_cancel_defers_cleanup_until_active_lease_released(self):
        """回归(2026-07):取消不能在活动请求写文件时并发删除分块目录。"""
        chunks_dir = _make_session("cancel-active", time.time())
        session = cu._acquire_upload_session("cancel-active")

        resp = client.delete("/api/upload/cancel/cancel-active")

        assert resp.status_code == 200
        assert "cancel-active" in cu.upload_sessions
        assert os.path.exists(chunks_dir)
        cleanup_dir = cu._release_upload_session("cancel-active", session)
        assert "cancel-active" not in cu.upload_sessions
        assert cleanup_dir == chunks_dir
        assert os.path.exists(chunks_dir)
        cu.shutil.rmtree(cleanup_dir)

    def test_processing_upload_cancel_returns_conflict(self):
        """回归(2026-07):已进入导入处理的上传不能谎报取消成功。"""
        chunks_dir = _make_session("processing", time.time())
        cu.upload_sessions["processing"]["status"] = "processing"
        cu.upload_sessions["processing"]["active_operations"] = 1

        resp = client.delete("/api/upload/cancel/processing")

        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "UPLOAD_PROCESSING"
        assert cu.upload_sessions["processing"]["status"] == "processing"
        assert os.path.exists(chunks_dir)

    def test_cancel_runs_directory_cleanup_via_to_thread(self, monkeypatch):
        """回归(2026-07):删除大量分块文件不能同步阻塞 FastAPI 事件循环。"""
        chunks_dir = _make_session("cancel-worker", time.time())
        calls = []

        async def fake_to_thread(func, *args, **kwargs):
            calls.append((func, args, kwargs))
            return func(*args, **kwargs)

        monkeypatch.setattr(asyncio, "to_thread", fake_to_thread)

        response = asyncio.run(cu.cancel_upload("cancel-worker"))

        assert response["success"] is True
        assert calls == [(cu.shutil.rmtree, (chunks_dir,), {"ignore_errors": True})]
        assert not os.path.exists(chunks_dir)

    def test_complete_runs_directory_cleanup_via_to_thread(self, monkeypatch):
        """回归(2026-07):完成上传时清理分块目录也不能阻塞事件循环。"""
        payload = b"a,b\n1,2\n"
        resp = client.post(
            "/api/upload/init",
            data={
                "file_name": "cleanup_worker.csv",
                "file_size": str(len(payload)),
                "chunk_size": str(len(payload)),
            },
        )
        upload_id = resp.json()["data"]["upload_id"]
        resp = client.post(
            "/api/upload/chunk",
            data={"upload_id": upload_id, "chunk_number": 0},
            files={"chunk": ("blob", payload)},
        )
        assert resp.status_code == 200
        chunks_dir = cu.upload_sessions[upload_id]["chunks_dir"]
        final_path = cu._get_final_file_path("cleanup_worker.csv")
        calls = []

        async def fake_process(*args, **kwargs):
            del args, kwargs
            return {"cleanup_path": None}

        async def fake_to_thread(func, *args, **kwargs):
            calls.append((func, args, kwargs))
            return func(*args, **kwargs)

        monkeypatch.setattr(cu, "_is_streaming_supported", lambda _ext: False)
        monkeypatch.setattr(cu, "process_uploaded_file", fake_process)
        monkeypatch.setattr(asyncio, "to_thread", fake_to_thread)

        try:
            response = asyncio.run(cu.complete_upload(upload_id))
            assert response["success"] is True
            assert (
                cu.shutil.rmtree,
                (chunks_dir,),
                {"ignore_errors": True},
            ) in calls
            assert not os.path.exists(chunks_dir)
        finally:
            if os.path.exists(final_path):
                os.unlink(final_path)


class TestSessionLifecycleViaEndpoints:
    def setup_method(self):
        cu.upload_sessions.clear()

    def teardown_method(self):
        cu.upload_sessions.clear()

    def test_init_and_chunk_refresh_last_activity(self):
        payload = b"a,b\n1,2\n"
        resp = client.post(
            "/api/upload/init",
            data={
                "file_name": "reaper_activity.csv",
                "file_size": str(len(payload)),
                "chunk_size": str(len(payload)),
            },
        )
        assert resp.status_code == 200
        upload_id = resp.json()["data"]["upload_id"]
        assert cu.upload_sessions[upload_id]["last_activity_ts"] > 0

        # 人为回拨活动时间,上传分块后应被刷新
        cu.upload_sessions[upload_id]["last_activity_ts"] = 1.0
        resp = client.post(
            "/api/upload/chunk",
            data={"upload_id": upload_id, "chunk_number": 0},
            files={"chunk": ("blob", payload)},
        )
        assert resp.status_code == 200
        assert cu.upload_sessions[upload_id]["last_activity_ts"] > 1.0

    def test_complete_upload_removes_session(self):
        payload = b"a,b\n1,2\n3,4\n"
        resp = client.post(
            "/api/upload/init",
            data={
                "file_name": "reaper_complete.csv",
                "file_size": str(len(payload)),
                "chunk_size": str(len(payload)),
            },
        )
        assert resp.status_code == 200
        upload_id = resp.json()["data"]["upload_id"]

        resp = client.post(
            "/api/upload/chunk",
            data={"upload_id": upload_id, "chunk_number": 0},
            files={"chunk": ("blob", payload)},
        )
        assert resp.status_code == 200

        # 走非流式(缓冲拼接)路径,避免测试依赖 FIFO 时序
        with patch.object(cu, "_is_streaming_supported", return_value=False):
            resp = client.post("/api/upload/complete", data={"upload_id": upload_id})
        assert resp.status_code == 200, resp.text

        # 成功后会话立即移除,不再永久滞留
        assert upload_id not in cu.upload_sessions
