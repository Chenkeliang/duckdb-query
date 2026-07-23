"""JSONC 注释剥离回归。

旧实现(逐行 find('//') + 「前一字符是 :」的 URL 启发式 + 全局 DOTALL 块注释
正则)对字符串值不设防:裸 // 截断整行、/*..*/ 形状被静默删除——且损坏结果
会经 _update_existing_app_config 回存持久化。新实现为字符串感知状态机。
"""
import json

import pytest

from core.common.config_manager import ConfigManager, config_manager

strip = ConfigManager._strip_jsonc


class TestStringValuesSurvive:
    def test_bare_double_slash_inside_string(self):
        # 旧实现:行被截断在字符串中间,整份配置解析失败→静默重置
        content = '{\n  "description": "value with // inside not a comment"\n}'
        assert json.loads(strip(content)) == {
            "description": "value with // inside not a comment"
        }

    def test_url_value_with_real_trailing_comment(self):
        # 旧实现:http:// 里的 // 前是 :,整行(连同真注释)原样保留→解析失败
        content = (
            '{\n  "note": "See http://example.com", // TODO: revisit\n'
            '  "debug": false\n}'
        )
        assert json.loads(strip(content)) == {
            "note": "See http://example.com",
            "debug": False,
        }

    def test_block_comment_shape_inside_string(self):
        # 旧实现最恶劣的一类:字符串内的 /*..*/ 被静默删除,无任何报错
        content = '{\n  "path_pattern": "a/*wildcard*/b"\n}'
        assert json.loads(strip(content)) == {"path_pattern": "a/*wildcard*/b"}

    def test_escaped_quote_adjacent_to_comment_markers(self):
        content = '{\n  "v": "a \\"quoted\\" // still not a comment"\n}'
        assert json.loads(strip(content)) == {"v": 'a "quoted" // still not a comment'}


class TestGenuineCommentsStillStripped:
    def test_full_line_and_trailing_comments(self):
        content = (
            "{\n"
            "  // full line comment\n"
            '  "a": 1, // trailing comment\n'
            '  "b": "x"\n'
            "}"
        )
        assert json.loads(strip(content)) == {"a": 1, "b": "x"}

    def test_multiline_block_comment(self):
        content = '{\n  /* multi\n     line\n     comment */\n  "a": 1\n}'
        assert json.loads(strip(content)) == {"a": 1}

    def test_url_without_comment_untouched(self):
        content = '{\n  "endpoint": "https://api.example.com/v1"\n}'
        assert json.loads(strip(content)) == {"endpoint": "https://api.example.com/v1"}


def test_shipped_example_jsonc_parses(tmp_path):
    """真实模板回归:example.jsonc 必须解析成功且关键键在位。"""
    from pathlib import Path

    example = (
        Path(__file__).resolve().parents[2] / "config" / "app-config.example.jsonc"
    )
    assert example.exists(), str(example)
    parsed = json.loads(strip(example.read_text(encoding="utf-8")))
    assert isinstance(parsed, dict) and parsed, "example config parsed to empty"


def test_unterminated_block_comment_is_rejected():
    """回归(2026-07):未闭合块注释不能被吞到 EOF 后当成合法 JSON。"""
    with pytest.raises(ValueError, match="Unterminated JSONC block comment"):
        strip('{"max_query_rows": 123} /* unclosed')


def test_load_json_failure_keeps_runtime_fallback_contract(tmp_path):
    """回归(2026-07):坏文件运行时仍回退空配置，写入路径另行严格校验。"""
    bad = tmp_path / "bad.jsonc"
    bad.write_text("{ definitely not json", encoding="utf-8")
    assert config_manager._load_json(bad) == {}


def test_invalid_existing_config_is_not_overwritten(tmp_path):
    """回归(2026-07):启动迁移遇到坏配置时必须保留原文件供用户修复。"""
    config_file = tmp_path / "app-config.json"
    original = '{"max_query_rows": 4321} /* unclosed'
    config_file.write_text(original, encoding="utf-8")

    ConfigManager(config_dir=str(tmp_path))

    assert config_file.read_text(encoding="utf-8") == original


def test_invalid_existing_config_blocks_later_settings_write(tmp_path):
    """回归(2026-07):加载失败后的内存默认值不能在设置保存时覆盖坏文件。"""
    config_file = tmp_path / "app-config.json"
    original = '{"max_query_rows": 4321} /* unclosed'
    config_file.write_text(original, encoding="utf-8")
    manager = ConfigManager(config_dir=str(tmp_path))
    loaded_rows = manager.get_app_config().max_query_rows

    assert manager.update_app_config(max_query_rows=999) is False
    assert manager.get_app_config().max_query_rows == loaded_rows
    assert config_file.read_text(encoding="utf-8") == original
