"""
将 MySQL/DataGrip 风格的双引号字符串转为 DuckDB 单引号（联邦查询在 DuckDB 解析 SQL）。
"""

from __future__ import annotations

import re
from typing import List, Tuple

_COMPARISON_OPS = frozenset(
    {"=", "<>", "!=", "<", ">", "<=", ">=", "LIKE", "ILIKE"}
)

# 轻量分词：保留引号段位置，供改写
_TOKEN_PATTERN = re.compile(
    r"""
    ('(?:''|[^'])*')                    # 单引号字符串
    |("(?:[^"]|"")*")                   # 双引号段
    |(/\*[\s\S]*?\*/)                   # 块注释
    |(--[^\n]*)                         # 行注释
    |(\s+)                              # 空白
    |([(),.])                            # 分隔符
    |(<>)|(!=)|(<=)|(>=)|([=<>])        # 比较符
    |([A-Za-z_][A-Za-z0-9_]*)           # 词/标识符
    |(.)                                # 其它单字符
    """,
    re.VERBOSE,
)


def _tokenize_for_rewrite(sql: str) -> List[Tuple[str, int, int]]:
    """返回 (text, start, end) 列表。"""
    tokens: List[Tuple[str, int, int]] = []
    for m in _TOKEN_PATTERN.finditer(sql):
        tokens.append((m.group(0), m.start(), m.end()))
    return tokens


def _is_keyword(text: str, word: str) -> bool:
    return text.upper() == word.upper()


def _significant(tokens: List[Tuple[str, int, int]], index: int, delta: int) -> str | None:
    j = index + delta
    while 0 <= j < len(tokens):
        t = tokens[j][0]
        if not t.isspace():
            return t
        j += delta
    return None


def normalize_mysql_double_quoted_strings_for_duckdb(sql: str) -> str:
    """
    IN (...) 与比较运算右侧：把 "literal" 改为 'literal'。
    "schema"."table" 等带点号语境保留双引号。
    """
    if '"' not in sql:
        return sql

    tokens = _tokenize_for_rewrite(sql)
    if not tokens:
        return sql

    replacements: List[Tuple[int, int, str]] = []
    in_list_depth = 0
    expect_comparison_rhs = False

    for i, (text, start, end) in enumerate(tokens):
        if text.isspace():
            continue

        prev_text = _significant(tokens, i, -1)
        next_text = _significant(tokens, i, 1)

        upper = text.upper()
        if _is_keyword(text, "IN"):
            continue

        if text == "(":
            if prev_text and _is_keyword(prev_text, "IN"):
                in_list_depth += 1
            continue

        if text == ")":
            if in_list_depth > 0:
                in_list_depth -= 1
            continue

        if upper in _COMPARISON_OPS:
            expect_comparison_rhs = True
            continue

        if text.startswith('"') and text.endswith('"') and len(text) >= 2:
            is_qualified = prev_text == "." or next_text == "."
            should_convert = not is_qualified and (
                in_list_depth > 0 or expect_comparison_rhs
            )
            if should_convert:
                inner = text[1:-1].replace('""', '"')
                escaped = inner.replace("'", "''")
                replacements.append((start, end, f"'{escaped}'"))
            expect_comparison_rhs = False
            continue

        if expect_comparison_rhs and text != ",":
            expect_comparison_rhs = False

    if not replacements:
        return sql

    out = sql
    for start, end, repl in sorted(replacements, key=lambda x: x[0], reverse=True):
        out = out[:start] + repl + out[end:]
    return out
