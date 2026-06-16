import importlib


def test_excel_import_manager_has_no_module_level_mkdir(monkeypatch, tmp_path):
    """导入模块不应在 __file__ 旁创建目录(冻结后只读会崩)。"""
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path / "ud")

    import core.data.excel_import_manager as eim
    importlib.reload(eim)
    # 模块级常量不应再是直接 mkdir 过的 Path;应通过函数惰性解析
    assert hasattr(eim, "_get_pending_base_dir")
    base = eim._get_pending_base_dir()
    assert base == tmp_path / "ud" / "temp_files" / "excel_pending"
