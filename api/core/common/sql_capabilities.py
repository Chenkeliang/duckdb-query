"""Shared SQL capability checks that do not depend on a complete SQL grammar.

DuckDB adds syntax faster than third-party parsers.  This module deliberately uses
token positions for shallow, top-level properties (statement boundaries and row
limits), while keeping a fail-closed allowlist for execution safety.
"""

from __future__ import annotations

from typing import Iterable, Optional

import sqlglot


_QUERY_STARTERS = {"SELECT", "WITH", "VALUES", "FROM", "TABLE", "PIVOT", "UNPIVOT"}
_READ_ONLY_META_STARTERS = {"SHOW", "DESCRIBE", "DESC", "SUMMARIZE"}
_SIDE_EFFECT_WORDS = {
    "ALTER",
    "ATTACH",
    "CALL",
    "CHECKPOINT",
    "CONNECT",
    "COPY",
    "CREATE",
    "DELETE",
    "DETACH",
    "DISCONNECT",
    "DROP",
    "EXPORT",
    "FORCE",
    "IMPORT",
    "INSERT",
    "INSTALL",
    "LOAD",
    "MERGE",
    "RESET",
    "SET",
    "TRUNCATE",
    "UPDATE",
    "USE",
    "VACUUM",
}
_READ_ONLY_PRAGMAS = {
    "DATABASE_LIST",
    "DATABASE_SIZE",
    "FUNCTIONS",
    "PLATFORM",
    "SHOW",
    "SHOW_DATABASES",
    "SHOW_TABLES",
    "STORAGE_INFO",
    "TABLE_INFO",
    "VERSION",
}


def _tokens(sql: str):
    try:
        return sqlglot.tokenize(sql, read="duckdb")
    except Exception:  # pylint: disable=broad-except
        return []


def _upper_words(tokens: Iterable) -> list[str]:
    return [str(token.text).upper() for token in tokens]


def _has_side_effect_token(tokens: Iterable) -> bool:
    ignored_types = {
        sqlglot.TokenType.IDENTIFIER,
        sqlglot.TokenType.STRING,
    }
    return any(
        token.token_type not in ignored_types
        and str(token.text).upper() in _SIDE_EFFECT_WORDS
        for token in tokens
    )


def is_single_statement(sql: str) -> bool:
    """Return whether SQL contains one non-empty statement.

    A single terminal delimiter is accepted. Semicolons in strings/comments are not
    tokens and therefore cannot split the statement accidentally.
    """
    tokens = _tokens(sql)
    if not tokens:
        return False
    semicolons = [index for index, token in enumerate(tokens)
                  if token.token_type == sqlglot.TokenType.SEMICOLON]
    return not semicolons or semicolons == [len(tokens) - 1]


def statement_accepts_row_limit(sql: str) -> bool:
    """Return whether appending an outer LIMIT is structurally safe.

    This intentionally recognizes query starters rather than every DuckDB grammar
    production, so new SELECT clauses such as APPROX NEAREST and USING KEY remain
    compatible even before sqlglot learns their syntax.
    """
    tokens = _tokens(sql)
    if not tokens or not is_single_statement(sql):
        return False
    words = _upper_words(tokens)
    if words[0] not in _QUERY_STARTERS:
        return False
    return not _has_side_effect_token(tokens)


def top_level_row_limit_kind(sql: str) -> Optional[str]:
    """Return ``limit``/``fetch`` for an outer row-limit clause, else ``None``."""
    tokens = _tokens(sql)
    if not tokens or not is_single_statement(sql):
        return None
    depth = 0
    for token in tokens:
        kind = token.token_type
        if kind == sqlglot.TokenType.L_PAREN:
            depth += 1
        elif kind == sqlglot.TokenType.R_PAREN:
            depth = max(0, depth - 1)
        elif depth == 0 and kind in {sqlglot.TokenType.LIMIT, sqlglot.TokenType.FETCH}:
            return str(token.text).lower()
    return None


def remove_top_level_row_limit(sql: str) -> str:
    """Remove an outer LIMIT/FETCH clause using token source positions.

    The fallback is used only when the AST parser cannot understand newer DuckDB
    syntax. OFFSET preceding FETCH is preserved, matching sqlglot's AST rewrite.
    """
    tokens = _tokens(sql)
    if not tokens or not is_single_statement(sql):
        return sql.strip()
    depth = 0
    clause = None
    terminal_semicolon = None
    for token in tokens:
        kind = token.token_type
        if kind == sqlglot.TokenType.L_PAREN:
            depth += 1
        elif kind == sqlglot.TokenType.R_PAREN:
            depth = max(0, depth - 1)
        elif depth == 0 and kind in {sqlglot.TokenType.LIMIT, sqlglot.TokenType.FETCH}:
            clause = token
            break
    if clause is None:
        return sql.strip()
    if tokens[-1].token_type == sqlglot.TokenType.SEMICOLON:
        terminal_semicolon = tokens[-1]
    suffix_start = terminal_semicolon.start if terminal_semicolon else len(sql)
    return f"{sql[:clause.start].rstrip()}{sql[suffix_start:]}"


def is_read_only_sql(sql: str) -> bool:
    """Classify SQL accepted by user-facing read-only execution surfaces.

    Unknown/control statements fail closed.  Tokens inside literals and comments are
    already excluded by sqlglot's tokenizer, which avoids keyword-regex bypasses.
    """
    tokens = _tokens(sql)
    if not tokens or not is_single_statement(sql):
        return False
    words = _upper_words(tokens)
    first = words[0]
    if first == "EXPLAIN":
        remainder = sql[tokens[0].end + 1 :].strip()
        if remainder.upper().startswith("ANALYZE"):
            return False
        return statement_accepts_row_limit(remainder)
    if first == "PRAGMA":
        pragma_name = words[1] if len(words) > 1 else ""
        return pragma_name in _READ_ONLY_PRAGMAS and "=" not in words
    if first in _READ_ONLY_META_STARTERS:
        return not _has_side_effect_token(tokens[1:])
    if first not in _QUERY_STARTERS:
        return False
    return not _has_side_effect_token(tokens)
