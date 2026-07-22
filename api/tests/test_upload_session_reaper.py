"""分块上传会话回收回归。

此前:未完成的上传(关标签页/断网)会把 upload_sessions 条目和 chunk 文件永久
留下;成功完成也只改状态不移除会话;进程重启后磁盘 chunk 目录彻底无人认领。
现在:complete 成功即移除会话;reap_stale_upload_sessions 按 TTL 回收
超时会话+分块目录,并扫掉不属于任何在册会话的磁盘孤儿目录。
"""
import os
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
