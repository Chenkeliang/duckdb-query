"""Async result JSON/XLSX export regression tests."""

import json
import shutil
import uuid
from pathlib import Path

import pytest

from core.database.duckdb_engine import with_duckdb_connection
from core.services.task_manager import AsyncTask, TaskStatus
from core.services.task_utils import TaskUtils
from core.common.timezone_utils import get_storage_time
from routers.async_tasks import generate_download_file


def _completed_task(task_id: str, table_name: str) -> AsyncTask:
    return AsyncTask(
        task_id=task_id,
        status=TaskStatus.SUCCESS,
        created_at=get_storage_time(),
        query=f'SELECT * FROM "{table_name}"',
        result_info={"table_name": table_name},
    )


def _stage_bundled_excel_extension() -> None:
    with with_duckdb_connection() as con:
        extension_dir = con.execute(
            "SELECT current_setting('extension_directory')"
        ).fetchone()[0]
        version = con.execute("SELECT version()").fetchone()[0]
        platform = con.execute("PRAGMA platform").fetchone()[0]

    source = (
        Path(__file__).parents[1]
        / "extensions"
        / version
        / platform
        / "excel.duckdb_extension"
    )
    if not source.exists():
        pytest.skip(f"Bundled Excel extension is unavailable for {platform}")
    target = Path(extension_dir) / version / platform / source.name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


@pytest.mark.parametrize("format", ["json", "xlsx"])
def test_generate_download_file_executes_structured_copy_format(
    monkeypatch, tmp_path, format
):
    """2026-07-29: generated JSON/XLSX files must be readable with original values."""
    table_name = f"async_export_{uuid.uuid4().hex[:8]}"
    task_id = uuid.uuid4().hex
    target = tmp_path / f"result.{format}"

    if format == "xlsx":
        _stage_bundled_excel_extension()

    with with_duckdb_connection() as con:
        con.execute(
            f'''CREATE TABLE "{table_name}" AS
                SELECT 1 AS id, '中文' AS name
                UNION ALL
                SELECT 2 AS id, NULL AS name'''
        )

    monkeypatch.setattr(
        "routers.async_tasks.task_manager.get_task",
        lambda requested_id: _completed_task(requested_id, table_name),
    )

    try:
        generate_download_file(task_id, format, target_path=str(target))

        if format == "json":
            assert json.loads(target.read_text(encoding="utf-8")) == [
                {"id": 1, "name": "中文"},
                {"id": 2, "name": None},
            ]
        else:
            with with_duckdb_connection() as con:
                rows = con.execute(
                    "SELECT id, name FROM read_xlsx(?) ORDER BY id", [str(target)]
                ).fetchall()
            assert rows == [(1.0, "中文"), (2.0, None)]
    finally:
        with with_duckdb_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table_name}"')


def test_json_export_replaces_non_finite_numbers_without_changing_strings(
    monkeypatch, tmp_path
):
    """2026-07-29: async JSON must remain valid for strict RFC 8259 parsers."""
    table_name = f"async_export_{uuid.uuid4().hex[:8]}"
    task_id = uuid.uuid4().hex
    target = tmp_path / "non-finite.json"

    with with_duckdb_connection() as con:
        con.execute(
            f'''CREATE TABLE "{table_name}" AS SELECT
                'NaN'::DOUBLE AS nan_value,
                ['Infinity'::DOUBLE, 1::DOUBLE] AS list_value,
                {{'value': '-Infinity'::DOUBLE}} AS struct_value,
                'NaN Infinity -Infinity' AS text_value'''
        )

    monkeypatch.setattr(
        "routers.async_tasks.task_manager.get_task",
        lambda requested_id: _completed_task(requested_id, table_name),
    )

    try:
        generate_download_file(task_id, "json", target_path=str(target))
        data = json.loads(
            target.read_text(encoding="utf-8"),
            parse_constant=lambda value: (_ for _ in ()).throw(
                ValueError(f"Non-standard JSON constant: {value}")
            ),
        )
        assert data == [
            {
                "nan_value": None,
                "list_value": [None, 1.0],
                "struct_value": {"value": None},
                "text_value": "NaN Infinity -Infinity",
            }
        ]
    finally:
        with with_duckdb_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{table_name}"')


@pytest.mark.parametrize(
    ("extension", "expected_format", "expected_media_type"),
    [
        ("json", "json", "application/json"),
        (
            "xlsx",
            "xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    ],
)
def test_task_utils_recovers_structured_export_metadata(
    tmp_path, extension, expected_format, expected_media_type
):
    """2026-07-29: file recovery and response MIME preserve JSON/XLSX formats."""
    task_utils = TaskUtils(str(tmp_path))
    path = tmp_path / f"task-t1.{extension}"
    path.write_bytes(b"result")

    task = task_utils.create_recovered_task("t1", str(path))

    assert task.result_info["file_format"] == expected_format
    assert task_utils.get_media_type(str(path)) == expected_media_type
