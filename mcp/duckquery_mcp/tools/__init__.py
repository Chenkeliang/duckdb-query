import inspect

from mcp.server.fastmcp import FastMCP

from duckquery_mcp.client import BackendError, BackendNotFound, DuckQueryClient
from duckquery_mcp.config import Config
from duckquery_mcp.safety import tool_allowed
from duckquery_mcp.tools import ai_settings, discover, export, passthrough, query, sources, transform


def register_all(mcp: FastMCP, client: DuckQueryClient, cfg: Config) -> None:
    def add(tier: str):
        """Register tool (only if its tier is allowed by mode), binding client/cfg and
        preserving the user-facing parameter signature for the MCP schema."""
        def deco(fn):
            if not tool_allowed(tier, cfg.mode):
                return fn
            sig = inspect.signature(fn)
            user_params = [p for n, p in sig.parameters.items() if n not in ("client", "cfg")]

            async def wrapped(**kwargs):
                try:
                    return await fn(client, cfg, **kwargs)
                except (BackendNotFound, BackendError) as exc:
                    return {"error": str(exc)}

            wrapped.__name__ = fn.__name__
            wrapped.__doc__ = fn.__doc__
            wrapped.__signature__ = sig.replace(parameters=user_params)
            mcp.tool()(wrapped)
            return fn
        return deco

    add("read")(discover.list_tables)
    add("read")(discover.describe_table)
    add("read")(discover.list_connections)
    add("read")(discover.list_db_objects)
    add("read")(query.run_sql)
    add("read")(query.federated_query)
    add("read")(query.ask)
    add("read")(query.explain_sql)
    add("read")(query.suggest_chart)
    add("read")(query.chat)
    add("read")(query.error_fix)
    add("write")(sources.add_connection)
    add("write")(sources.add_local_file_source)
    add("write")(sources.import_excel)
    add("write")(sources.paste_data)
    add("write")(sources.read_url)
    add("write")(transform.save_as_table)
    add("write")(transform.pivot)
    add("write")(transform.set_operations)
    add("read")(ai_settings.get_ai_settings)
    add("write")(ai_settings.configure_llm)
    add("write")(ai_settings.test_llm_provider)
    add("read")(export.export_results)
    add("read")(passthrough.duckquery_request)
