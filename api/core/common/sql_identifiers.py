"""SQL 标识符与字符串字面量转义 —— 全后端唯一来源。

历史上 `_quote_identifier` 在 8 个模块里各抄一份两行实现,其中
set_operation_generator 那份漏了转义(注释写"转义列名"却没转),构成注入面。
凡把标识符(表/列/别名)或字符串值拼进 SQL 的地方,一律用本模块,不再各写。
"""
from __future__ import annotations


def quote_identifier(identifier: object) -> str:
    """把单个 SQL 标识符转义并加双引号包裹(内嵌双引号翻倍)。

    保留非 ASCII(中文表名/别名照常);接受任意对象,先 str() 兜底。
    quote_identifier('a"b') == '"a""b"'
    """
    escaped = str(identifier).replace('"', '""')
    return f'"{escaped}"'


def escape_string_literal(value: object) -> str:
    """把值转义为可安全嵌入单引号 SQL 字符串的内容(单引号翻倍)。

    只转义引号本身,不加外层引号——调用方按 `'{escape_string_literal(v)}'`
    使用。用于 read_xlsx('path')、ATTACH 'conn_str' 这类字符串参数。
    escape_string_literal("Q1's") == "Q1''s"
    """
    return str(value).replace("'", "''")
