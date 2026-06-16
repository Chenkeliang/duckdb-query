import importlib
import os

import pytest


def test_desktop_flag_allows_arbitrary_path(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    f = tmp_path / "data.csv"
    f.write_text("a,b\n1,2\n")
    import routers.server_files as sf
    importlib.reload(sf)
    real, mount = sf._resolve_path(str(f))
    assert real == str(f.resolve())


def test_desktop_flag_still_blocks_symlink(monkeypatch, tmp_path):
    from core.common.exceptions import SecurityError
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    target = tmp_path / "real.csv"
    target.write_text("x\n")
    link = tmp_path / "link.csv"
    link.symlink_to(target)
    import routers.server_files as sf
    importlib.reload(sf)
    with pytest.raises(SecurityError):
        sf._resolve_path(str(link))


def test_without_flag_enforces_allowlist(monkeypatch, tmp_path):
    from core.common.exceptions import ValidationError as APIValidationError
    monkeypatch.delenv("ALLOW_ARBITRARY_LOCAL_PATHS", raising=False)
    import routers.server_files as sf
    importlib.reload(sf)
    with pytest.raises(APIValidationError):
        sf._resolve_path(str(tmp_path / "nope.csv"))


def test_desktop_mount_dict_works_with_downstream_consumers(monkeypatch, tmp_path):
    """Regression: desktop mount dict must carry all keys _to_display_path and
    _build_breadcrumbs need, otherwise they crash with KeyError."""
    monkeypatch.setenv("ALLOW_ARBITRARY_LOCAL_PATHS", "1")
    sub = tmp_path / "subdir"
    sub.mkdir()
    f = sub / "report.csv"
    f.write_text("a,b\n1,2\n")

    import routers.server_files as sf
    importlib.reload(sf)

    real_path, mount = sf._resolve_path(str(f))

    # _to_display_path must not raise KeyError and must return a non-empty string
    display = sf._to_display_path(real_path, mount)
    assert display  # non-empty
    assert isinstance(display, str)

    # _build_breadcrumbs must not raise KeyError and must return at least the root crumb
    crumbs = sf._build_breadcrumbs(real_path, mount)
    assert isinstance(crumbs, list)
    assert len(crumbs) >= 1
    root_crumb = crumbs[0]
    assert root_crumb["is_root"] is True
    assert "name" in root_crumb
    assert "path" in root_crumb

    # Verify expected key shapes on the mount dict itself
    assert mount["label"] == "local"
    assert "path" in mount
    assert "real_path" in mount
    assert mount["real_path"] == os.path.dirname(real_path)
