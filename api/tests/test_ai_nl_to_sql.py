from unittest.mock import MagicMock

import duckdb
import pytest

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


# ---------- 自修复回路(validator 注入,真实 DuckDB 上校验与执行) ----------


@pytest.fixture(name="orders_con")
def _orders_con():
    con = duckdb.connect()
    con.execute("CREATE TABLE orders(order_id INTEGER, status VARCHAR)")
    con.execute("INSERT INTO orders VALUES (1,'active'),(2,'closed'),(3,'active')")
    yield con
    con.close()


def _make_validator(con):
    calls = []

    def _validate(sql):
        calls.append(sql)
        try:
            con.execute(f"EXPLAIN {sql}")
            return True, "ok"
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)

    return _validate, calls


def test_nl_to_sql_valid_first_try_skips_repair(orders_con):
    validate, calls = _make_validator(orders_con)
    llm = MagicMock()
    llm.complete.return_value = (
        '{"sql":"SELECT count(*) FROM orders","used_tables":["orders"]}'
    )
    out = ai_nl_to_sql.nl_to_sql(llm, "多少订单", "ctx", "zh", validator=validate)
    assert out["sql"] == "SELECT count(*) FROM orders"
    assert llm.complete.call_count == 1
    assert len(calls) == 1


def test_nl_to_sql_repairs_invalid_sql_and_result_executes(orders_con):
    """列名写错 → EXPLAIN 失败 → 报错医生修一轮 → 修复 SQL 在真实库上可执行出对的值。"""
    validate, _ = _make_validator(orders_con)
    llm = MagicMock()
    llm.complete.side_effect = [
        '{"sql":"SELECT count(*) FROM orders WHERE statuss = \'active\'",'
        '"used_tables":["orders"]}',
        '{"explanation":"列名写错","fixed_sql":'
        '"SELECT count(*) FROM orders WHERE status = \'active\'"}',
    ]
    out = ai_nl_to_sql.nl_to_sql(
        llm, "活跃订单数", "ctx", "zh", validator=validate, schema_text="orders(...)"
    )
    assert out["safe"] is True
    assert out["sql"] == "SELECT count(*) FROM orders WHERE status = 'active'"
    # AGENTS §10:生成的 SQL 必须真执行并断言结果值
    assert orders_con.execute(out["sql"]).fetchone()[0] == 2
    assert llm.complete.call_count == 2
    assert llm.complete.call_args_list[0][0][0] == "nl_to_sql"
    assert llm.complete.call_args_list[1][0][0] == "error_doctor"


def test_nl_to_sql_falls_back_when_repair_still_invalid(orders_con):
    """修复结果仍过不了校验 → 回退首轮 SQL,且只修一轮(恰好 2 次 LLM 调用)。"""
    validate, _ = _make_validator(orders_con)
    bad = "SELECT count(*) FROM orders WHERE statuss = 'active'"
    llm = MagicMock()
    llm.complete.side_effect = [
        f'{{"sql":"{bad}","used_tables":["orders"]}}',
        '{"explanation":"还是错的","fixed_sql":"SELECT nope FROM orders"}',
    ]
    out = ai_nl_to_sql.nl_to_sql(llm, "?", "ctx", "zh", validator=validate)
    assert out["sql"] == bad
    assert llm.complete.call_count == 2


def test_nl_to_sql_rejects_unsafe_repair(orders_con):
    """报错医生若吐出非 SELECT,安全闸拦下,回退首轮;不再对其跑校验。"""
    validate, calls = _make_validator(orders_con)
    bad = "SELECT count(*) FROM orders WHERE statuss = 'x'"
    llm = MagicMock()
    llm.complete.side_effect = [
        f'{{"sql":"{bad}","used_tables":["orders"]}}',
        '{"explanation":"?","fixed_sql":"DELETE FROM orders"}',
    ]
    out = ai_nl_to_sql.nl_to_sql(llm, "?", "ctx", "zh", validator=validate)
    assert out["sql"] == bad
    assert len(calls) == 1  # 只校验过首轮 SQL


def test_nl_to_sql_unsafe_generation_skips_validation():
    llm = MagicMock()
    llm.complete.return_value = '{"sql":"DELETE FROM orders","used_tables":["orders"]}'
    validate = MagicMock()
    out = ai_nl_to_sql.nl_to_sql(llm, "删订单", "ctx", "zh", validator=validate)
    assert out["safe"] is False
    validate.assert_not_called()


def test_nl_to_sql_validator_exception_falls_back():
    llm = MagicMock()
    llm.complete.return_value = (
        '{"sql":"SELECT count(*) FROM orders","used_tables":["orders"]}'
    )

    def _boom(_sql):
        raise RuntimeError("connection pool exhausted")

    out = ai_nl_to_sql.nl_to_sql(llm, "?", "ctx", "zh", validator=_boom)
    assert out["sql"] == "SELECT count(*) FROM orders"
    assert llm.complete.call_count == 1  # 不触发修复轮
