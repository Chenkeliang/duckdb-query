import pytest
from duckquery_mcp.config import Config


@pytest.fixture
def cfg():
    return Config(api_base=None, mode="normal", timeout=5.0,
                  row_cap=200, probe_ports=(48001, 8000, 8001))
