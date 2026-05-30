from core.services import llm_context


def test_context_includes_schema_dialect_examples_and_caps_few_shot():
    ctx = llm_context.build_nl2sql_context(
        schema_text="orders(id INTEGER, amount DOUBLE)",
        history=["SELECT 1"],
        locale="zh",
    )
    # 表 DDL 原样带入
    assert "orders(id INTEGER, amount DOUBLE)" in ctx
    # 方言备忘块在(种子文件存在)
    assert "DuckDB" in ctx
    # few-shot 截断到 3 条(种子有 4 条)
    assert ctx.count("Q:") == 3
    # 历史 SQL 带入
    assert "SELECT 1" in ctx


def test_context_survives_when_schema_empty():
    ctx = llm_context.build_nl2sql_context(schema_text="", history=None, locale="en")
    assert isinstance(ctx, str)
