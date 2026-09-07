"""Release metadata must move as one unit across desktop and documentation."""

from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_v200_release_version_is_consistent_everywhere():
    package = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
    package_lock = json.loads(
        (ROOT / "frontend/package-lock.json").read_text(encoding="utf-8")
    )
    tauri = json.loads(
        (ROOT / "frontend/src-tauri/tauri.conf.json").read_text(encoding="utf-8")
    )
    cargo = tomllib.loads(
        (ROOT / "frontend/src-tauri/Cargo.toml").read_text(encoding="utf-8")
    )
    cargo_lock = tomllib.loads(
        (ROOT / "frontend/src-tauri/Cargo.lock").read_text(encoding="utf-8")
    )
    duckquery_lock = next(
        package for package in cargo_lock["package"] if package["name"] == "duckquery"
    )

    versions = {
        package["version"],
        package_lock["version"],
        package_lock["packages"][""]["version"],
        tauri["version"],
        cargo["package"]["version"],
        duckquery_lock["version"],
    }
    assert versions == {"2.0.0"}


def test_release_docs_and_default_duckdb_engine_pin_are_consistent():
    requirements = (ROOT / "api/requirements.txt").read_text(encoding="utf-8")
    assert re.search(r"^duckdb==1\.6\.0\.dev379$", requirements, re.MULTILINE)
    for readme in ("README.md", "README_en.md"):
        text = (ROOT / readme).read_text(encoding="utf-8")
        assert "v2.0.0" in text
        assert "v2.0.0-alpha39998" in text

    release_notes = ROOT / "docs/releases/v2.0.0.md"
    english_release_notes = ROOT / "docs/releases/v2.0.0_en.md"
    assert release_notes.exists() and english_release_notes.exists()
    assert "存储" in release_notes.read_text(encoding="utf-8")
    assert "new-database storage" in english_release_notes.read_text(
        encoding="utf-8"
    ).lower()


def test_mcp_capability_version_matches_package_metadata():
    mcp_project = tomllib.loads((ROOT / "mcp/pyproject.toml").read_text(encoding="utf-8"))
    mcp_init = (ROOT / "mcp/duckquery_mcp/__init__.py").read_text(encoding="utf-8")
    capability_source = (ROOT / "api/core/common/duckdb_capabilities.py").read_text(
        encoding="utf-8"
    )
    assert mcp_project["project"]["version"] == "0.4.0"
    assert '__version__ = "0.4.0"' in mcp_init
    assert '"package_version": "0.4.0"' in capability_source
