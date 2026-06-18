from mcp.server.fastmcp import FastMCP

from duckquery_mcp.client import DuckQueryClient
from duckquery_mcp.config import load_config
from duckquery_mcp.tools import register_all


def build() -> FastMCP:
    cfg = load_config()
    client = DuckQueryClient(cfg)
    mcp = FastMCP("duckquery")
    register_all(mcp, client, cfg)
    return mcp


def run() -> None:
    build().run()  # stdio transport by default
