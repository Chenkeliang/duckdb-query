"""P1-12 复审:既有 app-config.json 里遗留的 duckdb_enable_profiling=query_tree
(旧版出厂默认,非用户刻意选择)会把完整执行树刷进 stderr。加载期应归一为
no_output,让已安装用户也享受新默认;非 query_tree 的值一律原样保留。
"""
import json

import core.common.config_manager as cm


def _write_cfg(config_dir, profiling_value):
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "app-config.json").write_text(
        json.dumps({"duckdb_enable_profiling": profiling_value}),
        encoding="utf-8",
    )


def test_legacy_query_tree_default_is_migrated_to_no_output(tmp_path):
    _write_cfg(tmp_path, "query_tree")
    app_config = cm.ConfigManager(config_dir=str(tmp_path)).load_app_config()
    assert app_config.duckdb_enable_profiling == "no_output"


def test_deliberate_json_profiling_is_preserved(tmp_path):
    # 只归一遗留的 query_tree;显式的 json / query_tree_optimizer 不动(诊断逃生口)
    _write_cfg(tmp_path, "json")
    app_config = cm.ConfigManager(config_dir=str(tmp_path)).load_app_config()
    assert app_config.duckdb_enable_profiling == "json"


def test_query_tree_optimizer_is_not_migrated(tmp_path):
    _write_cfg(tmp_path, "query_tree_optimizer")
    app_config = cm.ConfigManager(config_dir=str(tmp_path)).load_app_config()
    assert app_config.duckdb_enable_profiling == "query_tree_optimizer"


def test_no_output_stays_no_output(tmp_path):
    _write_cfg(tmp_path, "no_output")
    app_config = cm.ConfigManager(config_dir=str(tmp_path)).load_app_config()
    assert app_config.duckdb_enable_profiling == "no_output"
