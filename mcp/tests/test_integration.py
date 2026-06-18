import os
import pytest
from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.config import load_config
from duckquery_mcp.tools.query import run_sql

pytestmark = pytest.mark.skipif(
    not os.getenv("DUCKQUERY_INTEGRATION"),
    reason="set DUCKQUERY_INTEGRATION=1 with a running backend")


async def test_run_sql_live():
    cfg = load_config()
    out = await run_sql(DuckQueryClient(cfg), cfg, sql="SELECT 6*7 AS n")
    assert out["rows"] == [{"n": 42}]
