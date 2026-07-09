"""Excel 表名唯一性回归测试：inspect 阶段批内去重 + import 阶段 create/replace 语义。

背景：docs/specs/proposals/drilldown-and-mcp-writeback.md 「七、桌面端上传入口重构」
「附带发现：Excel 表名唯一性缺陷」小节。
"""

from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

import duckdb
import openpyxl
import pytest

from core.data.excel_import_manager import cleanup_pending_excel
from core.services.file_ingestion_service import (
    import_pending_excel_sheets,
    inspect_excel_at_path,
    inspect_pending_excel,
    prepare_excel_pending,
)


@dataclass
class _SheetCfg:
    """duck-typed 版 ExcelImportSheet，仅保留 import_pending_excel_sheets 用到的字段。"""

    name: str
    target_table: str
    mode: str = "create"
    header_rows: int = 1
    header_row_index: int = 1
    fill_merged: bool = False


def _make_workbook(tmp_path: Path, sheets: dict) -> Path:
    xlsx = tmp_path / "book.xlsx"
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sheet_name, rows in sheets.items():
        ws = wb.create_sheet(title=sheet_name)
        for row in rows:
            ws.append(row)
    wb.save(xlsx)
    return xlsx


# ---------------------------------------------------------------------------
# inspect 阶段批内去重
# ---------------------------------------------------------------------------


def test_inspect_excel_at_path_dedupes_default_names(tmp_path):
    xlsx = _make_workbook(
        tmp_path,
        {
            "Sheet 1": [["a"], [1]],
            "Sheet_1": [["b"], [2]],
        },
    )

    out = inspect_excel_at_path(str(xlsx))
    names = [sheet["default_table_name"] for sheet in out["sheets"]]
    assert len(names) == len(set(names)), f"default_table_name 撞车: {names}"
    # 第二个 sheet 归一化后与第一个相同，应被追加 _1 后缀
    assert names[1] == f"{names[0]}_1"


def test_inspect_pending_excel_dedupes_default_names(tmp_path):
    xlsx = _make_workbook(
        tmp_path,
        {
            "Sheet 1": [["a"], [1]],
            "Sheet_1": [["b"], [2]],
        },
    )

    pending = prepare_excel_pending(str(xlsx), "book.xlsx")
    try:
        out = inspect_pending_excel(pending.file_id)
        names = [sheet["default_table_name"] for sheet in out["sheets"]]
        assert len(names) == len(set(names)), f"default_table_name 撞车: {names}"
        assert names[1] == f"{names[0]}_1"
    finally:
        cleanup_pending_excel(pending.file_id)


# ---------------------------------------------------------------------------
# import 阶段 create / replace 语义
# ---------------------------------------------------------------------------


@pytest.fixture
def duck_con():
    con = duckdb.connect()
    yield con
    con.close()


def test_import_create_mode_auto_suffixes_when_table_exists(tmp_path, duck_con):
    # 目标表已存在（模拟撞名）
    duck_con.execute("CREATE TABLE sales AS SELECT 1 AS old_col")

    xlsx = _make_workbook(tmp_path, {"Data": [["amount"], [10], [20]]})
    pending = prepare_excel_pending(str(xlsx), "sales.xlsx")
    try:
        with patch(
            "core.data.file_datasource_manager.file_datasource_manager.save_file_datasource",
            return_value=True,
        ):
            results = import_pending_excel_sheets(
                duck_con,
                pending.file_id,
                [_SheetCfg(name="Data", target_table="sales", mode="create")],
            )

        assert len(results) == 1
        assert results[0]["success"] is True
        new_table = results[0]["target_table"]
        assert new_table != "sales", "create 模式撞名应自动加后缀，而不是复用/覆盖已存在的表"
        assert new_table == "sales_1"

        # 两张表的数据都还在
        old_rows = duck_con.execute("SELECT * FROM sales").fetchall()
        assert old_rows == [(1,)]
        new_rows = duck_con.execute(f'SELECT COUNT(*) FROM "{new_table}"').fetchone()[0]
        assert new_rows == 2
    finally:
        cleanup_pending_excel(pending.file_id)


def test_import_create_mode_batch_internal_dedup(tmp_path, duck_con):
    """同一批里前面 sheet 刚建的表，后面 sheet 在 create 模式下也必须避开。"""
    xlsx = _make_workbook(
        tmp_path,
        {
            "First": [["amount"], [1]],
            "Second": [["amount"], [2], [3]],
        },
    )
    pending = prepare_excel_pending(str(xlsx), "batch.xlsx")
    try:
        with patch(
            "core.data.file_datasource_manager.file_datasource_manager.save_file_datasource",
            return_value=True,
        ):
            results = import_pending_excel_sheets(
                duck_con,
                pending.file_id,
                [
                    _SheetCfg(name="First", target_table="new_table", mode="create"),
                    _SheetCfg(name="Second", target_table="new_table", mode="create"),
                ],
            )

        assert all(r["success"] for r in results), results
        first_table = results[0]["target_table"]
        second_table = results[1]["target_table"]
        assert first_table == "new_table"
        assert second_table == "new_table_1"
        assert second_table != first_table

        assert duck_con.execute(f'SELECT COUNT(*) FROM "{first_table}"').fetchone()[0] == 1
        assert duck_con.execute(f'SELECT COUNT(*) FROM "{second_table}"').fetchone()[0] == 2
    finally:
        cleanup_pending_excel(pending.file_id)


def test_import_replace_mode_unchanged(tmp_path, duck_con):
    duck_con.execute("CREATE TABLE sales AS SELECT 999 AS old_col")

    xlsx = _make_workbook(tmp_path, {"Data": [["amount"], [10], [20], [30]]})
    pending = prepare_excel_pending(str(xlsx), "sales.xlsx")
    try:
        with patch(
            "core.data.file_datasource_manager.file_datasource_manager.save_file_datasource",
            return_value=True,
        ):
            results = import_pending_excel_sheets(
                duck_con,
                pending.file_id,
                [_SheetCfg(name="Data", target_table="sales", mode="replace")],
            )

        assert results[0]["success"] is True
        # replace 模式表名不变，撞名即覆盖（现有语义不回归）
        assert results[0]["target_table"] == "sales"
        rows = duck_con.execute("SELECT COUNT(*) FROM sales").fetchone()[0]
        assert rows == 3
        cols = [row[1] for row in duck_con.execute("PRAGMA table_info('sales')").fetchall()]
        assert cols == ["amount"], "replace 应该用新 sheet 的列结构覆盖旧表"
    finally:
        cleanup_pending_excel(pending.file_id)
