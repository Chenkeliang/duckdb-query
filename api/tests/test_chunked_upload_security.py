"""分块上传安全回归(Codex P0-6):路径穿越 + 单块/累计大小绕过。

只测校验逻辑,不实际越目录写文件。
"""
import os
from unittest.mock import patch

import pytest

from fastapi.testclient import TestClient

from core.common.exceptions import ValidationError as APIValidationError
from main import app
import routers.chunked_upload as cu

client = TestClient(app)


class TestFinalPathContainment:
    def test_basename_strips_traversal(self, tmp_path):
        # _get_final_file_path 只取末段,恶意 ../ 名字被规约到 base_dir 内
        with patch.object(cu, "get_upload_dir", return_value=str(tmp_path / "uploads")):
            p = cu._get_final_file_path("../../evil.csv")
            base = os.path.realpath(os.path.dirname(str(tmp_path / "uploads")))
            assert os.path.realpath(p).startswith(base), p
            assert os.path.basename(p) == "evil.csv"


class TestInitUploadFileNameValidation:
    @pytest.mark.parametrize("bad", [
        "../../evil.csv", "a/b.csv", "a\\b.csv", "..", ".", "",
    ])
    def test_rejects_path_components(self, bad):
        resp = client.post("/api/upload/init", data={
            "file_name": bad, "file_size": "10", "chunk_size": "5",
        })
        # 400/422 皆可,关键是不接受(不进入会话)
        assert resp.status_code in (400, 422), (bad, resp.status_code, resp.text)

    def test_accepts_plain_basename(self):
        resp = client.post("/api/upload/init", data={
            "file_name": "data.csv", "file_size": "10", "chunk_size": "5",
        })
        assert resp.status_code == 200, resp.text


class TestChunkSizeGuards:
    def _init(self):
        r = client.post("/api/upload/init", data={
            "file_name": "sz.csv", "file_size": "10", "chunk_size": "5",
        })
        assert r.status_code == 200, r.text
        return r.json()["data"]["upload_id"]

    def test_oversized_chunk_rejected(self):
        uid = self._init()
        # 声明 chunk_size=5,却传 20 字节 → 拒
        resp = client.post("/api/upload/chunk", data={
            "upload_id": uid, "chunk_number": "0",
        }, files={"chunk": ("c", b"x" * 20, "application/octet-stream")})
        assert resp.status_code in (400, 422), resp.text

    def test_cumulative_over_declared_size_rejected(self):
        uid = self._init()
        # file_size=10, chunk_size=5, total_chunks=2。两块各 5 字节没问题,
        # 但若某块塞满 5 且再塞使累计超过 10 就该拒。这里第 0 块 5 字节 OK,
        # 第 1 块也 5 字节 OK(累计正好 10)。构造超额:手动改 received_bytes。
        ok0 = client.post("/api/upload/chunk", data={
            "upload_id": uid, "chunk_number": "0",
        }, files={"chunk": ("c", b"xxxxx", "application/octet-stream")})
        assert ok0.status_code == 200, ok0.text
        # 篡改会话累计到接近上限,再传一块使其超额
        cu.upload_sessions[uid]["received_bytes"] = 8
        over = client.post("/api/upload/chunk", data={
            "upload_id": uid, "chunk_number": "1",
        }, files={"chunk": ("c", b"xxxxx", "application/octet-stream")})
        assert over.status_code in (400, 422), over.text
