"""普通页面查询/预览的 LIMIT 语义(复审验收 #1/#2/#3)。

max_query_rows 只是"用户未写 LIMIT 时的默认值",不是硬上限:
- 无 LIMIT → 最外层自动应用默认;
- 用户写 5000 → 用 5000;写 12000(> 默认)→ 用 12000,禁止压缩。
"""
from unittest.mock import patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from core.database.duckdb_engine import with_duckdb_connection
from main import app

client = TestClient(app)

TABLE = "qa_preview_rows"


@pytest.fixture(autouse=True, scope="module")
def _seed_table():
    with with_duckdb_connection() as con:
        con.execute(
            f'CREATE OR REPLACE TABLE "{TABLE}" AS SELECT * FROM range(2000) t(n)'
        )
    yield
    with with_duckdb_connection() as con:
        con.execute(f'DROP TABLE IF EXISTS "{TABLE}"')


def _execute_preview(sql: str) -> dict:
    r = client.post("/api/duckdb/execute", json={"sql": sql, "is_preview": True})
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_preview_no_user_limit_applies_default():
    # 验收 #1:无 LIMIT → 默认 500(mock)生效于最外层
    with patch("core.common.config_manager.config_manager") as mgr:
        mgr.get_app_config.return_value.max_query_rows = 500
        data = _execute_preview(f'SELECT * FROM "{TABLE}"')
    assert len(data["data"]) == 500


def test_preview_user_limit_smaller_is_used():
    # 验收 #2:用户 LIMIT 100(< 默认)→ 用 100
    with patch("core.common.config_manager.config_manager") as mgr:
        mgr.get_app_config.return_value.max_query_rows = 500
        data = _execute_preview(f'SELECT * FROM "{TABLE}" LIMIT 100')
    assert len(data["data"]) == 100


def test_preview_user_limit_larger_not_capped():
    # 验收 #3:用户 LIMIT 1200(> 默认 500)→ 用 1200,禁止压缩成默认值
    with patch("core.common.config_manager.config_manager") as mgr:
        mgr.get_app_config.return_value.max_query_rows = 500
        data = _execute_preview(f'SELECT * FROM "{TABLE}" LIMIT 1200')
    assert len(data["data"]) == 1200


def test_preview_subquery_limit_still_gets_outer_default():
    """复审 P1 反例:仅子查询有 LIMIT 900——旧子串判断("LIMIT" in sql)会完全跳过外层默认、
    返回 900 行。语义:子查询 LIMIT 属用户业务 SQL 保留,最外层仍补系统默认(AST 判定)。"""
    with patch("core.common.config_manager.config_manager") as mgr:
        mgr.get_app_config.return_value.max_query_rows = 500
        data = _execute_preview(
            f'SELECT * FROM (SELECT * FROM "{TABLE}" LIMIT 900) s'
        )
    assert len(data["data"]) == 500          # 外层默认生效
    assert data.get("preview_limit_applied") == 500


def test_preview_comment_mentioning_limit_still_gets_default():
    # 注释里的 LIMIT 不算用户 LIMIT(AST 天然正确;旧实现靠抹注释近似)
    with patch("core.common.config_manager.config_manager") as mgr:
        mgr.get_app_config.return_value.max_query_rows = 500
        data = _execute_preview(f'SELECT * FROM "{TABLE}" -- LIMIT 5')
    assert len(data["data"]) == 500
