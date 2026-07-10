"""AI 设置收拢进 system.db(system_app_settings KV,2026-07-10)。

背景:连接/收藏/快捷键早已在 system.db,唯独 AI 设置(含 Fernet 加密的
api_key)散在 data/ai_settings.json。收拢后单文件备份 system.db 即可带走
全部业务配置;旧 JSON 首次读取时自动导入并改名 .migrated 备份。
conftest 已把 CONFIG_DIR/DUCKDB_DATA_DIR 隔离到测试目录,可直连真实 system.db。
"""

import json

import pytest

from core.database.metadata_manager import metadata_manager
from core.services import ai_config


def _delete_ai_key():
    from core.database.duckdb_pool import with_system_connection

    with with_system_connection() as conn:
        conn.execute(
            "DELETE FROM system_app_settings WHERE key = ?", [ai_config._AI_SETTINGS_KEY]
        )


@pytest.fixture(autouse=True)
def _isolate_ai_settings_key():
    """前后都清 ai_settings 键:system.db 是整个测试会话共享的,残留会污染
    依赖"默认 disabled"假设的 test_ai_router(实测串染过,502 vs 400)。"""
    _delete_ai_key()
    yield
    _delete_ai_key()


# ---------- 通用 KV 原语 ----------

def test_app_setting_roundtrip_and_overwrite():
    key = "test_kv_roundtrip"
    assert metadata_manager.get_app_setting(key) is None  # 不存在 → None
    metadata_manager.save_app_setting(key, {"a": 1, "中文": "值"})
    assert metadata_manager.get_app_setting(key) == {"a": 1, "中文": "值"}
    metadata_manager.save_app_setting(key, {"a": 2})  # 覆盖(upsert)
    assert metadata_manager.get_app_setting(key) == {"a": 2}


# ---------- AI 设置走 system.db ----------

def _fresh_ai_state(monkeypatch, tmp_path):
    """把旧文件路径指到空 tmp(db 键的清理由 autouse fixture 负责)。"""
    monkeypatch.setattr(
        ai_config, "ai_settings_path", lambda: tmp_path / "ai_settings.json"
    )


def test_load_defaults_when_db_empty_and_no_legacy_file(monkeypatch, tmp_path):
    _fresh_ai_state(monkeypatch, tmp_path)
    cfg = ai_config.load_ai_settings()
    assert cfg["enabled"] is False and cfg["providers"] == []


def test_legacy_json_auto_migrates_into_db_and_renames(monkeypatch, tmp_path):
    _fresh_ai_state(monkeypatch, tmp_path)
    legacy = tmp_path / "ai_settings.json"
    legacy.write_text(
        json.dumps({"enabled": True, "providers": [{"id": "p1", "api_key": "enc:xx"}]}),
        encoding="utf-8",
    )

    cfg = ai_config.load_ai_settings()

    assert cfg["enabled"] is True and cfg["providers"][0]["id"] == "p1"
    # 已入库
    stored = metadata_manager.get_app_setting(ai_config._AI_SETTINGS_KEY)
    assert stored and stored["enabled"] is True
    # 旧文件改名备份,原名不再存在
    assert not legacy.exists()
    assert (tmp_path / "ai_settings.json.migrated").exists()


def test_save_to_db_preserves_existing_key_on_masked_input(monkeypatch, tmp_path):
    _fresh_ai_state(monkeypatch, tmp_path)
    ai_config.save_ai_settings(
        {"enabled": True, "providers": [{"id": "p1", "api_key": "sk-plain-123"}]}
    )
    first = metadata_manager.get_app_setting(ai_config._AI_SETTINGS_KEY)
    stored_key = first["providers"][0]["api_key"]
    assert stored_key and stored_key != "sk-plain-123"  # 已加密

    # 前端未改密钥(api_key 传空) → 保留原密文
    ai_config.save_ai_settings(
        {"enabled": True, "providers": [{"id": "p1", "api_key": ""}]}
    )
    second = metadata_manager.get_app_setting(ai_config._AI_SETTINGS_KEY)
    assert second["providers"][0]["api_key"] == stored_key
