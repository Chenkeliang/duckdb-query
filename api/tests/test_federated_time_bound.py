from core.database.federated_time_bound import (
    is_time_type,
    classify_audit_column,
    detect_time_bound_candidates,
    default_time_bound_value,
)


def test_is_time_type_covers_native_and_duckdb():
    assert is_time_type("DATE")
    assert is_time_type("DATETIME")           # MySQL
    assert is_time_type("TIMESTAMP")
    assert is_time_type("timestamp without time zone")  # PG
    assert is_time_type("TIMESTAMP_NS")       # DuckDB
    assert not is_time_type("TIME")           # 排除
    assert not is_time_type("YEAR")
    assert not is_time_type("VARCHAR")


def test_classify_audit_column():
    assert classify_audit_column("created_at") == "create"
    assert classify_audit_column("gmt_create") == "create"
    assert classify_audit_column("ctime") == "create"
    assert classify_audit_column("updated_at") == "update"
    assert classify_audit_column("gmt_modified") == "update"
    assert classify_audit_column("mtime") == "update"
    assert classify_audit_column("user_id") is None


def test_detect_candidates_create_before_update():
    cols = [
        {"name": "id", "type": "BIGINT"},
        {"name": "updated_at", "type": "TIMESTAMP"},
        {"name": "created_at", "type": "DATETIME"},
        {"name": "name", "type": "VARCHAR"},
        {"name": "birthday", "type": "DATE"},  # 时间型但非审计名 → 不入选
    ]
    assert detect_time_bound_candidates(cols) == ["created_at", "updated_at"]


def test_default_time_bound_value_format():
    import datetime as dt
    v = default_time_bound_value(now=dt.datetime(2026, 6, 18, 15, 30), days=30)
    assert v == "2026-05-19 00:00:00"
