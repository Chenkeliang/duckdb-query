"""Calamine merged-cell inspection regression tests for legacy .xls files.

Previously _inspect_xls_sheets hard-coded has_merged_cells=False even though
python-calamine exposes merged_cell_ranges for BIFF workbooks.
"""
from pathlib import Path

import pytest

from core.data.excel_import_manager import _inspect_xls_sheets


@pytest.fixture()
def merged_and_plain_workbook():
    path = Path(__file__).parent / "fixtures" / "calamine_merged_cells.xls"
    assert path.read_bytes().startswith(bytes.fromhex("D0CF11E0A1B11AE1"))
    return str(path)


def test_calamine_inspect_detects_merged_cells(merged_and_plain_workbook):
    """Regression (2026-07): merged ranges in .xls files must be reported."""
    sheets = _inspect_xls_sheets(merged_and_plain_workbook)
    by_name = {sheet["name"]: sheet for sheet in sheets}

    assert by_name["merged"]["has_merged_cells"] is True
    assert by_name["plain"]["has_merged_cells"] is False


def test_calamine_inspect_keeps_row_and_preview_shape(merged_and_plain_workbook):
    """Merged-range inspection must preserve row counts and preview columns."""
    sheets = _inspect_xls_sheets(merged_and_plain_workbook)
    merged = next(sheet for sheet in sheets if sheet["name"] == "merged")
    assert merged["rows"] == 2
    assert merged["columns_count"] == 2
    assert merged["columns"]
