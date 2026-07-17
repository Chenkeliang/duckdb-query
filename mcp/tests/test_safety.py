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


def test_duckdb_read_only_statements_are_read_safe():
    """回归:PIVOT/SUMMARIZE 等 DuckDB 只读语句曾被误判为写操作,
    normal 模式下无谓要求 confirm、read-only 模式下被硬拦。"""
    assert is_write_sql("PIVOT t ON m USING SUM(v) GROUP BY c") is False
    assert is_write_sql("UNPIVOT t ON a, b INTO NAME k VALUE v") is False
    assert is_write_sql("SUMMARIZE t") is False
    assert is_write_sql("FROM t SELECT city LIMIT 1") is False
    assert is_write_sql("TABLE t") is False
    assert is_write_sql("VALUES (1), (2)") is False
    # 改写型包裹仍以 CREATE/INSERT 开头,不受放行影响
    assert is_write_sql("CREATE TABLE x AS PIVOT t ON m USING SUM(v)") is True
    assert is_write_sql("INSERT INTO x FROM t") is True


def test_explain_analyze_is_not_read_safe():
    """回归：EXPLAIN ANALYZE 会真的执行被包裹的语句(采集运行时指标)，不是
    纯粹展示执行计划——DuckDB 和 Postgres 语义一致。曾经的正则只看开头关键字，
    `EXPLAIN ANALYZE DELETE FROM t` 会被误判成只读安全。"""
    assert is_write_sql("EXPLAIN ANALYZE DELETE FROM t") is True


def test_multi_statement_bypass_is_blocked():
    """回归(Codex P0-4):只看开头关键字时,SELECT 打头的多语句会被误判只读,
    尾随的写语句被 DuckDB 执行。现在多语句一律判写。"""
    assert is_write_sql("SELECT 1; DROP TABLE t") is True
    assert is_write_sql("SELECT 1; DELETE FROM t") is True
    assert is_write_sql("SELECT 1;\nCREATE TABLE evil AS SELECT 1") is True
    # 尾随分号(单语句)不算多语句
    assert is_write_sql("SELECT * FROM t;") is False
    assert is_write_sql("SELECT * FROM t ; ") is False


def test_cte_wrapped_write_is_blocked():
    """回归(Codex P0-4):WITH ... DELETE/INSERT/UPDATE 曾因开头是 WITH 被判只读。"""
    assert is_write_sql("WITH x AS (SELECT 1) DELETE FROM t WHERE id IN (SELECT id FROM x)") is True
    assert is_write_sql("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x") is True
    assert is_write_sql("WITH x AS (SELECT 1) UPDATE t SET a=1") is True
    # 正常 CTE 读查询仍判只读
    assert is_write_sql("WITH x AS (SELECT 1) SELECT * FROM x") is False


def test_write_keyword_in_string_literal_is_not_misclassified():
    """字符串字面量里的写关键字不算真写(先剥离字面量),避免只读查询误判。"""
    assert is_write_sql("SELECT 'DROP TABLE x' AS note") is False
    assert is_write_sql("SELECT * FROM t WHERE msg = 'please delete me'") is False
    # 但列名恰好等于写关键字仍会被保守判写(可接受:只多一次 confirm)
    assert is_write_sql("SELECT col FROM t -- drop table t") is False  # 注释剥离
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


def test_export_and_ai_settings_require_confirm():
    """回归(Codex P0-5):export/configure_llm/test_provider 缺 per-call 确认门。
    read-only 模式硬拦、normal 模式无 confirm 即拦。"""
    import asyncio
    from duckquery_mcp.tools.export import export_results
    from duckquery_mcp.tools.ai_settings import configure_llm, test_llm_provider

    @dataclass
    class _Cfg:
        mode: str

    ro, normal = _Cfg("read-only"), _Cfg("normal")

    async def _run(fn, cfg, **kw):
        return await fn(None, cfg, **kw)

    # read-only:一律拦
    assert "read-only" in asyncio.run(_run(export_results, ro, sql="SELECT 1"))["error"]
    assert "read-only" in asyncio.run(_run(configure_llm, ro, settings={}))["error"]
    assert "read-only" in asyncio.run(_run(test_llm_provider, ro, provider_id="x"))["error"]
    # normal 无 confirm:拦
    assert "confirm" in asyncio.run(_run(export_results, normal, sql="SELECT 1"))["error"]
    assert "confirm" in asyncio.run(_run(configure_llm, normal, settings={}))["error"]
    assert "confirm" in asyncio.run(_run(test_llm_provider, normal, provider_id="x"))["error"]
