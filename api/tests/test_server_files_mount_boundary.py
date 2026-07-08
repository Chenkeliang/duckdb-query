"""#13 回归：挂载目录包含判断必须在路径分隔符边界上进行。

非桌面部署（ALLOW_ARBITRARY_LOCAL_PATHS 关闭）下，_resolve_path 用挂载目录白名单
限制可访问路径。曾经是裸 `real_path.startswith(root)`，同前缀的兄弟目录（挂载
/data/allowed 时的 /data/allowed_backup）会被误判为在范围内，绕过白名单。
"""

import os

import pytest

from core.common.exceptions import ValidationError as APIValidationError
from routers.server_files import _resolve_path


@pytest.fixture
def sibling_mounts(tmp_path, monkeypatch):
    # 强制走挂载白名单分支（而不是桌面模式的任意路径分支）
    monkeypatch.delenv("ALLOW_ARBITRARY_LOCAL_PATHS", raising=False)

    allowed = tmp_path / "allowed_data"
    allowed.mkdir()
    sibling = tmp_path / "allowed_data_backup"  # 同前缀，但不在 allowed 之内
    sibling.mkdir()
    (allowed / "ok.csv").write_text("a\n1\n", encoding="utf-8")
    (sibling / "secret.csv").write_text("s\n9\n", encoding="utf-8")

    # 直接 patch _resolve_path 唯一依赖的 _get_mount_configs，避免依赖全局 app_config
    # 单例的状态（别的 test 模块会残留 server_data_mounts，全量跑时相互污染）。
    mount = {
        "label": "m",
        "path": str(allowed),
        "real_path": os.path.realpath(str(allowed)),
        "exists": True,
    }
    monkeypatch.setattr("routers.server_files._get_mount_configs", lambda: [mount])
    yield allowed, sibling


def test_sibling_dir_with_shared_prefix_is_rejected(sibling_mounts):
    _, sibling = sibling_mounts
    with pytest.raises(APIValidationError):
        _resolve_path(str(sibling / "secret.csv"))


def test_file_inside_mount_is_accepted(sibling_mounts):
    allowed, _ = sibling_mounts
    real_path, _mount = _resolve_path(str(allowed / "ok.csv"))
    assert real_path == os.path.realpath(str(allowed / "ok.csv"))


def test_mount_root_itself_is_accepted(sibling_mounts):
    allowed, _ = sibling_mounts
    real_path, _mount = _resolve_path(str(allowed))
    assert real_path == os.path.realpath(str(allowed))
