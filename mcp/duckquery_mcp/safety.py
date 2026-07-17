import re

# EXPLAIN alone only prints a plan; EXPLAIN ANALYZE actually executes the
# wrapped statement to collect real runtime metrics (same as Postgres) — a
# negative lookahead keeps it out of the read-safe allowlist so e.g.
# "EXPLAIN ANALYZE DELETE FROM t" isn't waved through read-only mode.
# PIVOT/UNPIVOT/SUMMARIZE/FROM-first/TABLE/VALUES 是 DuckDB 的只读查询语句
# (改写型如 CREATE TABLE x AS PIVOT... 以 CREATE 开头,仍走写门)。
_READ = re.compile(
    r"^\s*(SELECT|WITH|EXPLAIN(?!\s+ANALYZE)|PRAGMA|DESCRIBE|SHOW"
    r"|PIVOT|UNPIVOT|SUMMARIZE|FROM|TABLE|VALUES)\b",
    re.I,
)

# 注释与字符串/标识符字面量——先抹平,避免把字面量里的分号/关键字当真
_COMMENTS_AND_STRINGS = re.compile(
    r"--[^\n]*|/\*.*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"",
    re.S,
)

# 任意位置出现即视为写(整词)。覆盖 DuckDB 的写/DDL/副作用语句。
# WITH ... DELETE、SELECT 1; DROP ... 这类只看开头会漏,靠这一层兜住。
_WRITE_KEYWORDS = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|ATTACH|DETACH"
    r"|COPY|INSTALL|LOAD|EXPORT|IMPORT|VACUUM|CHECKPOINT|CALL|SET|RESET"
    r"|GRANT|REVOKE|MERGE|ANALYZE)\b",
    re.I,
)


def is_write_sql(sql: str) -> bool:
    """True unless the SQL is UNAMBIGUOUSLY a single read-only statement.

    保守分类(宁可误判为写):先剥离注释与字符串字面量,再要求
    (1) 非空、(2) 单语句(去掉尾分号后不含 ';')、(3) 开头是只读关键字、
    (4) 全文不含任何写关键字。任一不满足即判写——只读误判只会多要一次
    confirm/被读-only 模式拒,而漏判会放行破坏性语句(Codex P0-4)。
    """
    stripped = _COMMENTS_AND_STRINGS.sub(" ", sql or "").strip()
    if not stripped:
        return True
    # 多语句:去掉结尾分号后仍含 ';' → 拒
    if ";" in stripped.rstrip().rstrip(";"):
        return True
    if _READ.match(stripped) is None:
        return True
    if _WRITE_KEYWORDS.search(stripped):
        return True
    return False


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
