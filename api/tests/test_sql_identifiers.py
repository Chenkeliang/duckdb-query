"""共享 SQL 转义(core.common.sql_identifiers)—— 消灭历史 8 份 _quote_identifier
副本(其中 set_operation_generator 那份漏转义、构成注入)后的唯一来源。"""
from core.common.sql_identifiers import escape_string_literal, quote_identifier


class TestQuoteIdentifier:
    def test_wraps_and_doubles_quotes(self):
        assert quote_identifier("col") == '"col"'
        assert quote_identifier('a"b') == '"a""b"'
        assert quote_identifier('"; DROP--') == '"""; DROP--"'

    def test_preserves_non_ascii(self):
        assert quote_identifier("金额") == '"金额"'

    def test_coerces_non_str(self):
        assert quote_identifier(123) == '"123"'


class TestEscapeStringLiteral:
    def test_doubles_single_quotes_no_outer_wrap(self):
        assert escape_string_literal("Q1's Data") == "Q1''s Data"
        assert escape_string_literal("plain") == "plain"

    def test_neutralizes_read_xlsx_injection(self):
        # sheet 名 x') UNION SELECT ... -- 经转义后不再打断 read_xlsx('...')
        evil = "x') UNION SELECT * FROM read_csv_auto('/etc/passwd')--"
        escaped = escape_string_literal(evil)
        assert "''" in escaped
        # 拼进单引号串后,原本的闭合单引号已被转义成 ''
        wrapped = f"read_xlsx('{escaped}')"
        assert "read_xlsx('x'') UNION" in wrapped

    def test_all_backend_quote_identifier_share_one_impl(self):
        # 8 处历史副本现在都指向同一个函数对象
        from routers.paste_data import _quote_identifier as a
        from core.database.duckdb_engine import _quote_identifier as b
        from core.data.file_utils import _quote_identifier as c
        from core.services.pivot_query_sql_common import _quote_identifier as d
        assert a is b is c is d is quote_identifier
