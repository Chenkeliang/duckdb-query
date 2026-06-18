import re

_READ = re.compile(r"^\s*(SELECT|WITH|EXPLAIN|PRAGMA|DESCRIBE|SHOW)\b", re.I)


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
