from dataclasses import dataclass

from duckquery_mcp.safety import confirm_required, is_write_sql, tool_allowed


def test_read_sql():
    assert is_write_sql("SELECT * FROM t") is False
    assert is_write_sql("  with x as (select 1) select * from x") is False


def test_write_sql():
    assert is_write_sql("DROP TABLE t") is True
    assert is_write_sql("delete from t") is True
    assert is_write_sql("garbage") is True  # unknown -> treat as write


def test_plain_explain_is_read_safe():
    assert is_write_sql("EXPLAIN SELECT * FROM t") is False


def test_explain_analyze_is_not_read_safe():
    """回归：EXPLAIN ANALYZE 会真的执行被包裹的语句(采集运行时指标)，不是
    纯粹展示执行计划——DuckDB 和 Postgres 语义一致。曾经的正则只看开头关键字，
    `EXPLAIN ANALYZE DELETE FROM t` 会被误判成只读安全。"""
    assert is_write_sql("EXPLAIN ANALYZE DELETE FROM t") is True
    assert is_write_sql("explain analyze delete from t") is True
    assert is_write_sql("EXPLAIN ANALYZE SELECT * FROM t") is True  # 保守：连读查询也一并需要确认


def test_tool_allowed_by_mode():
    assert tool_allowed("read", "read-only") is True
    assert tool_allowed("write", "read-only") is False
    assert tool_allowed("write", "normal") is True
    assert tool_allowed("write", "full") is True


@dataclass
class _FakeCfg:
    mode: str


def test_confirm_required_noop_for_non_mutating():
    assert confirm_required(_FakeCfg("normal"), False, False) is None


def test_confirm_required_blocks_outright_in_read_only():
    assert confirm_required(_FakeCfg("read-only"), True, True) is not None


def test_confirm_required_needs_confirm_true_in_normal_mode():
    assert confirm_required(_FakeCfg("normal"), True, False) is not None
    assert confirm_required(_FakeCfg("normal"), True, True) is None


def test_confirm_required_always_allows_in_full_mode():
    assert confirm_required(_FakeCfg("full"), True, False) is None
