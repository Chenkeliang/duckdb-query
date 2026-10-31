"""Regression 2026-10-31 (#52): old ABI binaries shadowed an updated bare pyd."""

import importlib.machinery
from pathlib import Path

import pytest

from scripts.frozen_runtime_layout import canonicalize_duckdb_binary


SUFFIX = '.cp312-win_amd64.pyd'


@pytest.mark.parametrize('source_name', ['_duckdb.pyd', '_duckdb'+SUFFIX])
def test_windows_overwrite_replaces_the_preferred_legacy_binary(tmp_path, source_name):
    """Updating the same ABI path must select the new bytes without deleting files."""
    old = tmp_path/('_duckdb'+SUFFIX)
    old.write_bytes(b'legacy alpha')
    (tmp_path/'_duckdb.pyd').write_bytes(b'previous bare binary')
    keep = tmp_path/'user-owned.keep'
    keep.write_text('preserve')
    source = tmp_path/'new-module'
    source.write_bytes(b'new stable')
    result = canonicalize_duckdb_binary([(source_name, str(source), 'EXTENSION')], platform='win32', extension_suffix=SUFFIX)
    assert result == [('_duckdb'+SUFFIX, str(source), 'EXTENSION')]
    for name, path, _ in result:
        (tmp_path/name).write_bytes(Path(path).read_bytes())
    finder = importlib.machinery.FileFinder(str(tmp_path),
        (importlib.machinery.ExtensionFileLoader, [SUFFIX, '.pyd']))
    selected = finder.find_spec('_duckdb')
    assert selected.origin == str(old)
    assert old.read_bytes() == b'new stable'
    assert keep.read_text() == 'preserve'


def test_other_platforms_and_modules_keep_their_layout():
    """The Windows layout fix must not rename macOS/Linux libraries or other pyds."""
    entries = [('_duckdb.pyd', 'native-source', 'EXTENSION'), ('other.pyd', 'other-source', 'EXTENSION')]
    assert canonicalize_duckdb_binary(entries, platform='darwin') == entries
    assert canonicalize_duckdb_binary(entries, platform='linux') == entries
    assert canonicalize_duckdb_binary(entries, platform='win32', extension_suffix=SUFFIX)[1] == entries[1]


@pytest.mark.parametrize('entries', [[], [('_duckdb.pyd','one','EXTENSION'),('_duckdb'+SUFFIX,'two','EXTENSION')]])
def test_ambiguous_windows_bundles_fail_at_build_time(entries):
    """Do not publish a bundle if its native source identity is absent/ambiguous."""
    with pytest.raises(ValueError):
        canonicalize_duckdb_binary(entries, platform='win32', extension_suffix=SUFFIX)
