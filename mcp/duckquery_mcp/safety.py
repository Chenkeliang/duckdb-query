import re

# EXPLAIN alone only prints a plan; EXPLAIN ANALYZE actually executes the
# wrapped statement to collect real runtime metrics (same as Postgres) — a
# negative lookahead keeps it out of the read-safe allowlist so e.g.
# "EXPLAIN ANALYZE DELETE FROM t" isn't waved through read-only mode.
_READ = re.compile(r"^\s*(SELECT|WITH|EXPLAIN(?!\s+ANALYZE)|PRAGMA|DESCRIBE|SHOW)\b", re.I)


def is_write_sql(sql: str) -> bool:
    """True unless the statement is clearly read-only."""
    return _READ.match(sql or "") is None


def tool_allowed(tier: str, mode: str) -> bool:
    """tier: 'read' | 'write'. mode: 'read-only' | 'normal' | 'full'."""
    if mode == "full":
        return True
    if mode == "normal":
        return True
    return tier == "read"  # read-only


def confirm_required(cfg, is_mutating: bool, confirm: bool) -> dict | None:
    """Shared gate for any tool call that can mutate/exfiltrate beyond a plain
    read: read-only mode blocks it outright; normal mode requires the caller
    (the LLM) to pass confirm=true; full mode always allows it. Returns an
    error dict to return verbatim when blocked, or None to proceed — mirrors
    the confirm=True pattern passthrough.duckquery_request already used for
    generic non-GET requests, now shared instead of re-implemented per tool.
    """
    if not is_mutating:
        return None
    if cfg.mode == "read-only":
        return {"error": "read-only mode: mutating operations are blocked."}
    if cfg.mode != "full" and not confirm:
        return {"error": "This is a mutating operation; pass confirm=true to proceed."}
    return None
