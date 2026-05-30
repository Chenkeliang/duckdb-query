from unittest.mock import MagicMock

from core.services import ai_explain


def test_explain_sql_calls_llm_and_returns_explanation():
    llm = MagicMock()
    llm.complete.return_value = "这条 SQL 统计每个客户的订单数,并按订单数从多到少排序。"
    out = ai_explain.explain_sql(
        llm, "SELECT customer_id, count(*) FROM orders GROUP BY 1", "", "zh"
    )
    assert out["explanation"].startswith("这条 SQL")
    # 走的是 explain 功能位
    assert llm.complete.call_args[0][0] == "explain"
