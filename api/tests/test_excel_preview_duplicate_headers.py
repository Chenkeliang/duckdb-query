"""Excel 预览:重复表头去重(复审 P2)。

去 pandas 后 _build_preview_from_rows 用原始表头作 records 的 dict 键,重名列(id,id)
后者覆盖前者、首列值丢失(旧 pandas 会给 id、id.1)。现与正式导入共用完整
表头规范化管线,columns 与 preview 逐位置对齐、两列值都在。
"""
from openpyxl import Workbook

from core.data.excel_import_manager import (
    _build_preview_from_rows,
    inspect_excel_sheets,
    load_excel_sheet_rows,
)


def test_preview_dedupes_duplicate_headers_no_value_loss():
    head_rows = [["id", "id"], [1, 2], [3, 4]]
    columns, preview = _build_preview_from_rows(head_rows)

    names = [c["name"] for c in columns]
    assert names == ["id", "id_1"]  # 去重(非两个 'id')
    # records 键与列名一致,第二列值不被首列覆盖
    assert preview == [{"id": 1, "id_1": 2}, {"id": 3, "id_1": 4}]


def test_preview_normal_headers_unchanged():
    head_rows = [["a", "b"], [1, 2]]
    columns, preview = _build_preview_from_rows(head_rows)
    assert [c["name"] for c in columns] == ["a", "b"]
    assert preview == [{"a": 1, "b": 2}]


def test_preview_three_duplicate_headers():
    head_rows = [["x", "x", "x"], [1, 2, 3]]
    columns, preview = _build_preview_from_rows(head_rows)
    assert [c["name"] for c in columns] == ["x", "x_1", "x_2"]
    assert preview == [{"x": 1, "x_1": 2, "x_2": 3}]


def test_real_excel_preview_headers_match_import(tmp_path):
    """Regression 2026-07: blank-like and sanitized headers must match on both paths."""
    path = tmp_path / "headers.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["   ", "nan", "order id", "order id"])
    sheet.append([1, 2, 3, 4])
    workbook.save(path)

    preview_info = inspect_excel_sheets(str(path))[0]
    preview_names = [column["name"] for column in preview_info["columns"]]
    imported_names, imported_rows = load_excel_sheet_rows(str(path))

    assert preview_names == imported_names == [
        "column_1",
        "column_2",
        "order_id",
        "order_id_1",
    ]
    assert preview_info["preview"] == [
        {"column_1": 1, "column_2": 2, "order_id": 3, "order_id_1": 4}
    ]
    assert imported_rows == [[1, 2, 3, 4]]
