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


def test_context_steers_pivot_to_conditional_aggregation():
    """透视引导必须常驻方言备忘:裸 PIVOT 会被 SELECT-only 闸拦下(见
    test_ai_error_doctor 的已知限制用例),模型需生成条件聚合。"""
    ctx = llm_context.build_nl2sql_context(schema_text="t(a INT)", locale="zh")
    assert "PIVOT" in ctx and "conditional aggregation" in ctx
