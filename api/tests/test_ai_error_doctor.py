import json

from core.services import ai_error_doctor


class _FakeLLM:
    def __init__(self, reply):
        self._reply = reply
        self.calls = []

    def complete(self, feature, messages):
        self.calls.append((feature, messages))
        return self._reply


def test_explain_and_fix_parses_and_passes_safe_select():
    reply = json.dumps({"explanation": "列名写错了", "fixed_sql": "SELECT order_id FROM orders"})
    out = ai_error_doctor.explain_and_fix(
        _FakeLLM(reply), "SELECT order_idd FROM orders", "Binder Error: ...", "orders(order_id INT)"
    )
    assert out["explanation"] == "列名写错了"
    assert out["fixed_sql"] == "SELECT order_id FROM orders"
    assert out["safe"] is True


def test_explain_and_fix_rejects_non_select_fix():
    reply = json.dumps({"explanation": "x", "fixed_sql": "DROP TABLE orders"})
    out = ai_error_doctor.explain_and_fix(_FakeLLM(reply), "bad", "err", "")
    assert out["safe"] is False
    assert out["fixed_sql"] is None
    assert out["explanation"] == "x"


def test_explain_and_fix_tolerates_markdown_fenced_json():
    reply = "```json\n{\"explanation\": \"e\", \"fixed_sql\": \"SELECT 1\"}\n```"
    out = ai_error_doctor.explain_and_fix(_FakeLLM(reply), "s", "e", "")
    assert out["fixed_sql"] == "SELECT 1"
    assert out["safe"] is True


def test_explain_and_fix_handles_unparseable_reply():
    out = ai_error_doctor.explain_and_fix(_FakeLLM("totally not json"), "s", "e", "")
    assert out["fixed_sql"] is None
    assert out["safe"] is False
    assert isinstance(out["explanation"], str)


def test_is_select_only_accepts_set_ops_and_cte():
    """EXCEPT/INTERSECT/CTE 都是纯 SELECT 语句,安全闸必须放行(差异/交集场景)。"""
    assert ai_error_doctor._is_select_only(
        "SELECT uid FROM a EXCEPT SELECT uid FROM b"
    )
    assert ai_error_doctor._is_select_only(
        "SELECT uid FROM a INTERSECT SELECT uid FROM b"
    )
    assert ai_error_doctor._is_select_only(
        "WITH x AS (SELECT 1 AS v) SELECT * FROM x"
    )


def test_is_select_only_rejects_bare_pivot_statement():
    """已知限制(2026-07-22 场景实测):DuckDB 把 PIVOT 语句重写为 CREATE+SELECT,
    安全闸按非只读拦下。方言备忘引导模型改用条件聚合(见 duckdb_dialect.md)。"""
    assert not ai_error_doctor._is_select_only(
        "PIVOT orders ON status USING sum(amount) GROUP BY customer_id"
    )
    # 包子查询也一样被重写,不能放行
    assert not ai_error_doctor._is_select_only(
        "SELECT * FROM (PIVOT orders ON status USING sum(amount) GROUP BY customer_id)"
    )
