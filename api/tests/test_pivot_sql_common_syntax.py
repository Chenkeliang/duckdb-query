"""Guard against Python 3.11 f-string / pylint parse regressions in pivot SQL helpers."""

import ast
from pathlib import Path

_SERVICES = Path(__file__).resolve().parents[1] / "core" / "services"


def test_pivot_query_sql_common_ast_parse():
    source = (_SERVICES / "pivot_query_sql_common.py").read_text(encoding="utf-8")
    ast.parse(source, filename="pivot_query_sql_common.py")


def test_pivot_query_generator_imports_sql_common():
    from core.services import pivot_query_generator  # noqa: F401
    from core.services import pivot_query_sql_common  # noqa: F401

    assert hasattr(pivot_query_sql_common, "_build_from_clause")
    assert hasattr(pivot_query_generator, "generate_pivot_query_sql")
