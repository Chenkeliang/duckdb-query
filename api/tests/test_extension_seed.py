"""Versioned extension seeding is shared by desktop and Docker."""

from pathlib import Path

from core.database.extension_seed import seed_extension_tree


def test_seed_extension_tree_copies_missing_and_preserves_user_file(tmp_path: Path):
    bundled = tmp_path / "bundled"
    runtime = tmp_path / "runtime"
    source = bundled / "v2.0.0" / "linux_arm64" / "excel.duckdb_extension"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"bundled")

    assert seed_extension_tree(bundled, runtime) == 1
    destination = runtime / source.relative_to(bundled)
    assert destination.read_bytes() == b"bundled"

    destination.write_bytes(b"user-updated")
    assert seed_extension_tree(bundled, runtime) == 0
    assert destination.read_bytes() == b"user-updated"
