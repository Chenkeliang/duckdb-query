"""
引擎兼容性配置测试

覆盖：
1. 配置读写往返（ConfigManager 落盘/重新加载）
2. apply_engine_compat_settings 对未加载扩展不抛错（try/except 分支）
3. 保存后新值在 duckdb_settings() 里可见（需要 sqlite_scanner，离线环境自动跳过）
4. 路由 GET/PUT 往返
"""

import logging

import pytest

duckdb = pytest.importorskip("duckdb")

from fastapi.testclient import TestClient

from core.common.config_manager import ConfigManager, config_manager
from core.database.duckdb_engine import ENGINE_COMPAT_OPTIONS, apply_engine_compat_settings
from main import app

client = TestClient(app)

_ALL_FALSE = {option: False for option in ENGINE_COMPAT_OPTIONS}


def test_engine_compat_defaults_to_all_false(tmp_path):
    mgr = ConfigManager(config_dir=str(tmp_path))
    assert mgr.get_app_config().engine_compat == _ALL_FALSE


def test_engine_compat_config_round_trip(tmp_path):
    mgr = ConfigManager(config_dir=str(tmp_path))

    new_values = {
        "sqlite_all_varchar": True,
        "mysql_incomplete_dates_as_nulls": False,
        "pg_array_as_varchar": True,
        "unsafe_enable_version_guessing": False,
    }
    assert mgr.update_app_config(engine_compat=new_values) is True

    # 重新从磁盘加载一个新实例，确认已持久化
    reloaded = ConfigManager(config_dir=str(tmp_path)).get_app_config().engine_compat
    assert reloaded == new_values


def test_apply_engine_compat_settings_swallows_unrecognized_option(caplog):
    """扩展未加载（且关闭自动安装/加载）时，SET GLOBAL 应被逐项吞掉，不抛错。"""
    con = duckdb.connect()
    try:
        con.execute("SET autoinstall_known_extensions=false")
        con.execute("SET autoload_known_extensions=false")

        all_true = {option: True for option in ENGINE_COMPAT_OPTIONS}
        with caplog.at_level(logging.DEBUG, logger="core.database.duckdb_engine"):
            apply_engine_compat_settings(con, all_true)  # 不应抛出任何异常

        skipped_messages = [r.getMessage() for r in caplog.records if "skipped" in r.getMessage()]
        assert skipped_messages, "扩展未加载时应记录 debug 日志，而不是静默丢失信息"
        assert any("sqlite_all_varchar" in m for m in skipped_messages)
    finally:
        con.close()


def test_apply_engine_compat_settings_accepts_empty_config():
    """空/None 用户配置仍应可应用固定的源值保真设置，且不抛错。"""
    con = duckdb.connect()
    try:
        apply_engine_compat_settings(con, None)
        apply_engine_compat_settings(con, {})
    finally:
        con.close()


def test_sqlite_all_varchar_visible_in_duckdb_settings_after_apply():
    """保存后新值需在 duckdb_settings() 里可见（sqlite_all_varchar，需要 sqlite_scanner）。"""
    con = duckdb.connect()
    try:
        try:
            con.execute("INSTALL sqlite_scanner")
            con.execute("LOAD sqlite_scanner")
        except Exception:
            pytest.skip("sqlite_scanner not installable in this environment (offline)")

        apply_engine_compat_settings(con, {"sqlite_all_varchar": True})
        row = con.execute(
            "SELECT value FROM duckdb_settings() WHERE name = 'sqlite_all_varchar'"
        ).fetchone()
        assert row is not None
        assert row[0] == "true"
    finally:
        con.close()


def test_engine_compat_router_get_put_round_trip():
    original = dict(config_manager.get_app_config().engine_compat or {})
    try:
        get_resp = client.get("/api/app-config/engine-compat")
        assert get_resp.status_code == 200
        data = get_resp.json()["data"]
        assert set(data.keys()) == set(ENGINE_COMPAT_OPTIONS)

        put_resp = client.put(
            "/api/app-config/engine-compat",
            json={
                "sqlite_all_varchar": True,
                "mysql_incomplete_dates_as_nulls": True,
                "pg_array_as_varchar": False,
                "unsafe_enable_version_guessing": False,
            },
        )
        assert put_resp.status_code == 200
        assert put_resp.json()["data"]["sqlite_all_varchar"] is True

        got = client.get("/api/app-config/engine-compat")
        got_data = got.json()["data"]
        assert got_data["sqlite_all_varchar"] is True
        assert got_data["mysql_incomplete_dates_as_nulls"] is True
        assert got_data["pg_array_as_varchar"] is False
    finally:
        config_manager.update_app_config(engine_compat=original)


class _RecordingConnection:
    def __init__(self):
        self.calls = []

    def execute(self, sql):
        self.calls.append(sql)


def test_apply_engine_compat_all_false_sends_explicit_false():
    """全 False 也要显式下发 SET GLOBAL x=false（在关闭 autoinstall 的守卫内,
    不触发联网）：SET GLOBAL 是实例级黏性状态,只有显式发 false 才能把之前
    开过的开关真正关掉——否则用户在 UI 关掉、接口返 200,引擎却仍停在 true。"""
    con = _RecordingConnection()
    apply_engine_compat_settings(con, _ALL_FALSE)
    # autoinstall 守卫仍在首尾
    assert con.calls[0] == "SET autoinstall_known_extensions=false"
    assert con.calls[-1] == "SET autoinstall_known_extensions=true"
    # 四个开关都显式发 =false（而非旧行为"什么都不发"）
    for option in ENGINE_COMPAT_OPTIONS:
        assert f"SET GLOBAL {option}=false" in con.calls


def test_apply_engine_compat_true_disables_autoinstall_around_set():
    """True 开关 SET 期间必须临时关闭 autoinstall（初始化路径禁网），完成后恢复。"""
    con = _RecordingConnection()
    apply_engine_compat_settings(con, {"sqlite_all_varchar": True})
    assert con.calls[0] == "SET autoinstall_known_extensions=false"
    assert con.calls[-1] == "SET autoinstall_known_extensions=true"
    assert "SET GLOBAL sqlite_all_varchar=true" in con.calls


def test_mysql_flag_columns_are_never_coerced_to_boolean():
    """回归(2026-07-21):MySQL TINYINT(1)/BIT(1) 的 0/1 曾在查询与导出中变成 FALSE/TRUE。"""
    con = _RecordingConnection()

    apply_engine_compat_settings(con, None)

    assert "SET GLOBAL mysql_tinyint1_as_boolean=false" in con.calls
    assert "SET GLOBAL mysql_bit1_as_boolean=false" in con.calls
    assert "SET GLOBAL mysql_tinyint1_as_boolean=true" not in con.calls
    assert "SET GLOBAL mysql_bit1_as_boolean=true" not in con.calls


def test_mysql_flag_settings_are_false_in_duckdb_when_extension_available():
    """回归(2026-07-21):真实 DuckDB 设置必须保留 MySQL 物理 0/1，不能只验证 mock SQL。"""
    con = duckdb.connect()
    try:
        try:
            con.execute("SET autoinstall_known_extensions=false")
            con.execute("LOAD mysql")
        except Exception:
            pytest.skip("mysql extension is not installed in this environment")

        apply_engine_compat_settings(con, None)
        values = dict(
            con.execute(
                "SELECT name, value FROM duckdb_settings() "
                "WHERE name IN ('mysql_tinyint1_as_boolean', 'mysql_bit1_as_boolean')"
            ).fetchall()
        )
        assert values == {
            "mysql_tinyint1_as_boolean": "false",
            "mysql_bit1_as_boolean": "false",
        }
    finally:
        con.close()
