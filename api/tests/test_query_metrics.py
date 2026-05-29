"""query_metrics 模块测试"""

from unittest.mock import MagicMock

from core.database.query_metrics import log_query_duration


def test_log_query_duration_slow_warning():
    logger = MagicMock()
    connection = MagicMock()
    log_query_duration(
        connection,
        "SELECT 1",
        1500.0,
        1,
        slow_warn_ms=1000,
        explain_threshold_ms=0,
        log=logger,
    )
    logger.warning.assert_called()


def test_log_query_duration_explain_when_over_threshold():
    logger = MagicMock()
    connection = MagicMock()
    connection.execute.return_value.fetchall.return_value = [("plan",)]
    log_query_duration(
        connection,
        "SELECT 1",
        5000.0,
        1,
        explain_threshold_ms=1000,
        log=logger,
    )
    connection.execute.assert_called_with("EXPLAIN SELECT 1")
    assert any(
        "Slow query execution plan" in str(call)
        for call in logger.warning.call_args_list
    )
