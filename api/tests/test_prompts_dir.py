import importlib


def test_prompts_dir_uses_meipass_when_frozen(monkeypatch, tmp_path):
    monkeypatch.setattr("sys._MEIPASS", str(tmp_path), raising=False)
    monkeypatch.setattr("sys.frozen", True, raising=False)
    import core.services.llm_context as lc
    importlib.reload(lc)
    assert str(lc._PROMPTS_DIR) == str(tmp_path / "prompts")


def test_prompts_dir_falls_back_to_source_tree(monkeypatch):
    monkeypatch.delattr("sys._MEIPASS", raising=False)
    import core.services.llm_context as lc
    importlib.reload(lc)
    assert str(lc._PROMPTS_DIR).endswith("prompts")
