"""metadata 时间字段入库归一(UTC naive)回归。

Regression 2026-07-22: paste 等链路把带 +08:00 偏移的 created_at 传给
save_metadata,DuckDB 隐式转 TIMESTAMP 时丢弃偏移、保留钟面时间,存成
"伪 UTC" —— 表列表与 AI 目录的时间排序整体偏 8 小时。归一必须发生在
save_metadata/update_metadata 绑定之前。
"""

import uuid
from datetime import datetime

from core.data.file_datasource_manager import file_datasource_manager


def _probe_id() -> str:
    return f"_tz_probe_{uuid.uuid4().hex[:8]}"


def test_save_normalizes_offset_string_to_utc_naive():
    sid = _probe_id()
    try:
        file_datasource_manager.save_file_datasource({
            "source_id": sid,
            "filename": sid,
            "file_type": "duckdb_table",
            "created_at": "2026-07-22T16:49:25+08:00",
        })
        row = file_datasource_manager.get_file_datasource(sid)
        assert str(row["created_at"]).startswith("2026-07-22 08:49:25")
    finally:
        file_datasource_manager.delete_file_datasource(sid)


def test_save_keeps_naive_storage_time_unchanged():
    sid = _probe_id()
    try:
        file_datasource_manager.save_file_datasource({
            "source_id": sid,
            "filename": sid,
            "file_type": "duckdb_table",
            "created_at": datetime(2026, 7, 22, 8, 49, 25),
        })
        row = file_datasource_manager.get_file_datasource(sid)
        assert str(row["created_at"]).startswith("2026-07-22 08:49:25")
    finally:
        file_datasource_manager.delete_file_datasource(sid)


def test_update_normalizes_offset_string_too():
    sid = _probe_id()
    try:
        file_datasource_manager.save_file_datasource({
            "source_id": sid,
            "filename": sid,
            "file_type": "duckdb_table",
            "created_at": datetime(2026, 7, 1, 0, 0, 0),
        })
        file_datasource_manager.metadata_manager.update_file_datasource(
            sid, {"created_at": "2026-07-22T16:49:25+08:00"}
        )
        row = file_datasource_manager.get_file_datasource(sid)
        assert str(row["created_at"]).startswith("2026-07-22 08:49:25")
    finally:
        file_datasource_manager.delete_file_datasource(sid)
