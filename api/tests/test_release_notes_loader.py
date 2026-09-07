"""Versioned GitHub Release note resolution must fail closed."""

import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / ".github/scripts/load_release_notes.py"
SPEC = importlib.util.spec_from_file_location("load_release_notes", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_tag_version_resolves_to_matching_release_notes():
    assert MODULE.resolve_release_version(ROOT, "tag", "v2.0.0") == "2.0.0"
    notes = MODULE.load_release_notes(ROOT, "2.0.0")
    assert "主要更新" in notes
    assert "DuckDB 2.0" in notes
    assert "Upgrade procedure" in notes
    assert "\n\n---\n\n# DuckQuery v2.0.0 Release Notes" in notes


def test_workflow_dispatch_uses_package_version():
    assert MODULE.resolve_release_version(ROOT, "branch", "main") == "2.0.0"


def test_missing_release_notes_fail_before_creating_a_release():
    with pytest.raises(FileNotFoundError):
        MODULE.load_release_notes(ROOT, "9.9.9")
