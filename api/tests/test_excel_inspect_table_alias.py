"""Excel inspect 应使用上传时的 table_alias 生成各 Sheet 的 default_table_name."""

from pathlib import Path
from unittest.mock import patch

from openpyxl import Workbook
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


@pytest.mark.parametrize("header_rows", [1])
def test_excel_inspect_default_names_use_upload_alias(tmp_path, header_rows):
    excel_path = Path(tmp_path) / "book.xlsx"
    wb = Workbook()
    ws1 = wb.active
    ws1.title = "Sheet1"
    ws1.append(["a"]); ws1.append([1])
    ws2 = wb.create_sheet("Data")
    ws2.append(["b"]); ws2.append([2])
    wb.save(excel_path)

    alias = "my_book"
    with patch("routers.file_ingestion.schedule_cleanup"):
        with open(excel_path, "rb") as handle:
            upload_resp = client.post(
                "/api/upload",
                data={"table_alias": alias},
                files={
                    "file": (
                        "book.xlsx",
                        handle,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
            )

    assert upload_resp.status_code == 200
    upload_body = upload_resp.json()
    upload_data = upload_body.get("data", upload_body)
    file_id = upload_data["pending_excel"]["file_id"]

    inspect_resp = client.post(
        "/api/data-sources/excel/inspect", json={"file_id": file_id}
    )
    assert inspect_resp.status_code == 200
    inspect_body = inspect_resp.json()
    inspect_data = inspect_body.get("data", inspect_body)
    assert inspect_data.get("default_table_prefix")
    prefix = inspect_data["default_table_prefix"]
    assert prefix == "my_book"
    for sheet in inspect_data["sheets"]:
        assert sheet["default_table_name"].startswith(prefix)
