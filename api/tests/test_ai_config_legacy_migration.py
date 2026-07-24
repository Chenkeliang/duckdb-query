"""legacy→profile 功能键一次性迁移回归(1.3.0 破坏性升级)。

旧用户存的 5 个独立功能键(chat/nl_to_sql/error_doctor/explain/suggest_chart)
及开发期 interim 的 agent 键,升级后必须自动搬到统一 Agent 的 per-profile 键
(data_qa/generate_sql/repair_sql/explain_sql/suggest_chart),删除旧键,幂等只迁
一次,且不参与运行时路由(运行时只按 profile.model_feature 解析)。
"""

from core.database.duckdb_pool import with_system_connection
from core.services import ai_config
from core.services.ai_config import _AI_SETTINGS_KEY, migrate_legacy_features_to_profiles


def _seed(blob):
    from core.database.metadata_manager import metadata_manager

    metadata_manager.save_app_setting(_AI_SETTINGS_KEY, blob)


def _clear():
    try:
        with with_system_connection() as conn:
            conn.execute(
                "DELETE FROM system_app_settings WHERE key = ?", [_AI_SETTINGS_KEY]
            )
    except Exception:  # noqa: BLE001  表未初始化(save_app_setting 会建表)
        pass


# ---- 纯函数层 ----

def test_migrates_all_legacy_keys_to_profile_keys():
    stored = {"features": {
        "chat": {"provider": "p1", "model": "m1"},
        "nl_to_sql": {"provider": "p2", "model": "m2"},
        "error_doctor": {"provider": "p3", "model": "m3"},
        "explain": {"provider": "p4", "model": "m4"},
        "suggest_chart": {"provider": "p5", "model": "m5"},
    }}
    out, changed = migrate_legacy_features_to_profiles(stored)
    assert changed is True
    feats = out["features"]
    # 旧键全删
    for k in ("chat", "nl_to_sql", "error_doctor", "explain"):
        assert k not in feats
    # 搬到 profile 键(只保留 provider/model,不含 enabled)
    assert feats["data_qa"] == {"provider": "p1", "model": "m1"}
    assert feats["generate_sql"] == {"provider": "p2", "model": "m2"}
    assert feats["repair_sql"] == {"provider": "p3", "model": "m3"}
    assert feats["explain_sql"] == {"provider": "p4", "model": "m4"}
    # suggest_chart 键名前后一致,原样保留
    assert feats["suggest_chart"] == {"provider": "p5", "model": "m5"}


def test_agent_interim_key_collapses_to_data_qa():
    """开发期 interim 迁移产物 agent → 收敛到 data_qa。"""
    stored = {"features": {"agent": {"provider": "p2", "model": "m2"}}}
    out, changed = migrate_legacy_features_to_profiles(stored)
    assert changed is True
    assert "agent" not in out["features"]
    assert out["features"]["data_qa"] == {"provider": "p2", "model": "m2"}


def test_existing_profile_key_not_overwritten():
    """目标 profile 键已配置时,旧键被删但不覆盖已有配置。"""
    stored = {"features": {
        "chat": {"provider": "old", "model": "old"},
        "data_qa": {"provider": "new", "model": "new"},
    }}
    out, changed = migrate_legacy_features_to_profiles(stored)
    assert changed is True
    assert "chat" not in out["features"]
    assert out["features"]["data_qa"]["provider"] == "new"


def test_error_doctor_wins_over_error_fix_for_repair_sql():
    """同 target 多来源:按 _LEGACY_TO_PROFILE 顺序取先者(error_doctor 先于 error_fix)。"""
    stored = {"features": {
        "error_fix": {"provider": "fix", "model": "fix"},
        "error_doctor": {"provider": "doctor", "model": "doctor"},
    }}
    out, changed = migrate_legacy_features_to_profiles(stored)
    assert changed is True
    assert "error_fix" not in out["features"]
    assert "error_doctor" not in out["features"]
    assert out["features"]["repair_sql"]["provider"] == "doctor"


def test_noop_when_no_legacy_keys():
    stored = {"features": {"data_qa": {"provider": "p2", "model": "m2"}}}
    out, changed = migrate_legacy_features_to_profiles(stored)
    assert changed is False
    assert out["features"]["data_qa"]["provider"] == "p2"


def test_noop_when_features_missing():
    stored = {"enabled": True}
    out, changed = migrate_legacy_features_to_profiles(stored)
    assert changed is False


# ---- 端到端:load_ai_settings 迁移并持久化,只迁一次 ----

def test_load_migrates_and_persists_once():
    _clear()
    try:
        _seed({
            "enabled": True,
            "providers": [{"id": "p1", "type": "openai", "models": ["m1"]}],
            "features": {
                "chat": {"provider": "p1", "model": "m1"},
                "nl_to_sql": {"provider": "p1", "model": "m1"},
            },
        })
        cfg = ai_config.load_ai_settings()
        assert "chat" not in cfg["features"]
        assert "nl_to_sql" not in cfg["features"]
        assert cfg["features"]["data_qa"] == {"provider": "p1", "model": "m1"}
        assert cfg["features"]["generate_sql"] == {"provider": "p1", "model": "m1"}
        # 已持久化:再次读取库里已无旧键(迁移只发生一次)
        from core.database.metadata_manager import metadata_manager

        raw = metadata_manager.get_app_setting(_AI_SETTINGS_KEY)
        assert "chat" not in raw["features"]
        assert raw["features"]["data_qa"]["provider"] == "p1"
    finally:
        _clear()
