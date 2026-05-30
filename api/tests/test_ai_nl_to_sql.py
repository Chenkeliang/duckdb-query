from unittest.mock import MagicMock

from core.services import ai_nl_to_sql


def test_nl_to_sql_returns_safe_select():
    llm = MagicMock()
    llm.complete.return_value = '{"sql":"SELECT count(*) FROM orders","used_tables":["orders"]}'
    out = ai_nl_to_sql.nl_to_sql(llm, "多少订单", "ctx", "zh")
    assert out["safe"] is True
    assert out["sql"] == "SELECT count(*) FROM orders"
    assert out["used_tables"] == ["orders"]
    assert llm.complete.call_args[0][0] == "nl_to_sql"


def test_nl_to_sql_blocks_non_select():
    llm = MagicMock()
    llm.complete.return_value = '{"sql":"DELETE FROM orders","used_tables":["orders"]}'
    out = ai_nl_to_sql.nl_to_sql(llm, "删订单", "ctx", "zh")
    assert out["safe"] is False        # 非 SELECT 不作为可用 SQL
    assert out["sql"] == "DELETE FROM orders"  # 仍回传供查看


def test_nl_to_sql_tolerates_garbage_json():
    llm = MagicMock()
    llm.complete.return_value = "抱歉我不知道"
    out = ai_nl_to_sql.nl_to_sql(llm, "?", "ctx", "zh")
    assert out["safe"] is False
    assert out["sql"] == ""
    assert out["used_tables"] == []
