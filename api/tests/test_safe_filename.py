"""safe_filename_base 的行为——下载(async_tasks)与查询导出(query_export)共用。

回归(2026-07): custom_filename 曾未清洗，可 ../ 穿越 exports 目录、
单引号打断 COPY ... TO '...'。清洗后两者都被消除。
"""

from utils.safe_filename import safe_filename_base


def test_strips_path_separators_no_traversal():
    # 斜杠→下划线、首尾点被 strip，结果里没有任何路径分隔符，无法逃出目标目录
    out = safe_filename_base("../../evil")
    assert "/" not in out and "\\" not in out
    assert not out.startswith(".")


def test_strips_single_quote_defuses_copy_injection():
    out = safe_filename_base("x'; COPY (SELECT 1) TO '/tmp/pwn.csv'; --")
    assert "'" not in out


def test_empty_or_dots_only_returns_empty_for_fallback():
    assert safe_filename_base("") == ""
    assert safe_filename_base(None) == ""
    assert safe_filename_base("...") == ""
    assert safe_filename_base("   ") == ""


def test_keeps_cjk_alnum_underscore_hyphen():
    assert safe_filename_base("销售_2025-Q1 report") == "销售_2025-Q1 report"


def test_length_capped_at_100():
    assert len(safe_filename_base("a" * 500)) == 100
