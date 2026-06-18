from duckquery_mcp.safety import is_write_sql, tool_allowed


def test_read_sql():
    assert is_write_sql("SELECT * FROM t") is False
    assert is_write_sql("  with x as (select 1) select * from x") is False


def test_write_sql():
    assert is_write_sql("DROP TABLE t") is True
    assert is_write_sql("delete from t") is True
    assert is_write_sql("garbage") is True  # unknown -> treat as write


def test_tool_allowed_by_mode():
    assert tool_allowed("read", "read-only") is True
    assert tool_allowed("write", "read-only") is False
    assert tool_allowed("write", "normal") is True
    assert tool_allowed("write", "full") is True
