"""/api/server-files/excel/import 的 create 模式表名唯一性回归测试。

覆盖 server_files.py 里独立于 file_ingestion_service.import_pending_excel_sheets
的另一套 mode 处理逻辑（见 docs/specs/proposals/drilldown-and-mcp-writeback.md
「附带发现：Excel 表名唯一性缺陷」）。
"""

from contextlib import contextmanager
from unittest.mock import patch

import duckdb
import openpyxl
import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from main import app
from core.common.config_manager import config_manager

client = TestClient(app, raise_server_exceptions=False)


def _unwrap(body: dict) -> dict:
    return body.get("data", body) if isinstance(body, dict) else {}


@pytest.fixture(scope="module", autouse=True)
def server_mount(tmp_path_factory):
    mount_dir = tmp_path_factory.mktemp("excel_mount")
    xlsx_path = mount_dir / "book.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Data"
    ws.append(["amount"])
    ws.append([10])
    ws.append([20])
    wb.save(xlsx_path)

    app_config = config_manager.get_app_config()
    app_config.server_data_mounts = [
        {"label": "ExcelMount", "path": str(mount_dir)},
    ]
    yield str(xlsx_path)


@pytest.fixture
def mem_con():
    con = duckdb.connect(":memory:")
    yield con
    con.close()


def test_server_excel_import_create_mode_auto_suffixes_on_conflict(server_mount, mem_con):
    xlsx_path = server_mount
    # 目标表已存在，模拟撞名
    mem_con.execute("CREATE TABLE sales AS SELECT 1 AS old_col")

    @contextmanager
    def _mem_duckdb():
        yield mem_con

    with patch("routers.server_files.with_duckdb_connection", _mem_duckdb):
        response = client.post(
            "/api/server-files/excel/import",
            json={
                "path": xlsx_path,
                "sheets": [
                    {
                        "name": "Data",
                        "target_table": "sales",
                        "header_rows": 1,
                        "header_row_index": 1,
                        "fill_merged": False,
                        "mode": "create",
                    }
                ],
            },
        )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("success") is True
    imported = _unwrap(body)["imported_tables"]
    assert len(imported) == 1
    new_table = imported[0]["table_name"]
    assert new_table != "sales"
    assert new_table == "sales_1"

    assert mem_con.execute("SELECT * FROM sales").fetchall() == [(1,)]
    assert mem_con.execute(f'SELECT COUNT(*) FROM "{new_table}"').fetchone()[0] == 2
