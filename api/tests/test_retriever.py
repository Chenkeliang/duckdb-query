from core.services.retriever import KeywordRetriever


def test_selected_tables_come_first_then_keyword_matches():
    r = KeywordRetriever()
    out = r.retrieve(
        question="list all customers",
        selected_tables=["orders"],
        candidate_tables=["orders", "customers", "products"],
    )
    assert out[0] == "orders"          # 选中表优先
    assert "customers" in out          # 关键词 customer(s) 召回
    assert "products" not in out       # 无关不召回


def test_no_selected_falls_back_to_keyword_only():
    r = KeywordRetriever()
    out = r.retrieve(
        question="customer revenue by month",
        selected_tables=[],
        candidate_tables=["customers", "orders", "inventory"],
    )
    assert "customers" in out
    assert "inventory" not in out


def test_result_is_capped():
    r = KeywordRetriever(max_tables=2)
    out = r.retrieve(
        question="order data report",
        selected_tables=["a", "b", "c"],
        candidate_tables=["orders"],
    )
    assert len(out) == 2               # 截断到 max_tables
