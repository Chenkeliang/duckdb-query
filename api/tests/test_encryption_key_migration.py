"""密码加密密钥迁移：本机随机密钥 + 历史默认密钥回退解密。

背景：encrypt_password 曾经用一个写死在源码里的默认密钥（从未被环境变量覆盖过，
见 encryption_utils.py 模块头部说明）。修复后新密文一律用本机随机生成、持久化
在 secret.key 的密钥加密，并加 "v2:" 前缀区分；不带前缀的历史密文按旧默认密钥
解密，读取时顺带用新密钥重新加密写回（懒迁移，不做批量操作）。
"""

import base64
import json

from core.database.metadata_manager import metadata_manager
from utils.encryption_utils import (
    EncryptionUtils,
    _LEGACY_DEFAULT_KEY,
    _V2_PREFIX,
    _load_persisted_key,
    decrypt_json,
    encrypt_json,
    json_needs_key_migration,
)


def _legacy_encrypt(plaintext: str) -> str:
    """模拟修复之前产出的历史密文：旧默认密钥、无 v2: 前缀。"""
    data = plaintext.encode("utf-8")
    key = _LEGACY_DEFAULT_KEY.encode("utf-8")
    xored = bytes([data[i] ^ key[i % len(key)] for i in range(len(data))])
    return base64.b64encode(xored).decode("utf-8")


class TestEncryptDecryptRoundTrip:
    def test_encrypt_produces_v2_prefix(self):
        assert EncryptionUtils.encrypt_password("hunter2").startswith(_V2_PREFIX)

    def test_round_trip_recovers_plaintext(self):
        encrypted = EncryptionUtils.encrypt_password("hunter2")
        assert EncryptionUtils.decrypt_password(encrypted) == "hunter2"

    def test_empty_password_is_noop(self):
        assert EncryptionUtils.encrypt_password("") == ""
        assert EncryptionUtils.decrypt_password("") == ""


class TestLegacyKeyFallback:
    def test_legacy_ciphertext_still_decrypts_correctly(self):
        legacy = _legacy_encrypt("old_password")
        assert not legacy.startswith(_V2_PREFIX)
        assert EncryptionUtils.decrypt_password(legacy) == "old_password"

    def test_needs_key_migration_true_for_legacy(self):
        assert EncryptionUtils.needs_key_migration(_legacy_encrypt("x")) is True

    def test_needs_key_migration_false_for_v2(self):
        v2 = EncryptionUtils.encrypt_password("x")
        assert EncryptionUtils.needs_key_migration(v2) is False

    def test_needs_key_migration_false_for_empty(self):
        assert EncryptionUtils.needs_key_migration("") is False


class TestJsonNeedsKeyMigration:
    def test_true_when_password_field_is_legacy(self):
        raw = json.loads(encrypt_json({"host": "db.example.com", "password": "pw"}))
        raw["password"] = _legacy_encrypt("pw")
        assert json_needs_key_migration(json.dumps(raw)) is True

    def test_false_when_all_fields_are_v2(self):
        raw = encrypt_json({"host": "db.example.com", "password": "pw"})
        assert json_needs_key_migration(raw) is False

    def test_false_for_empty_or_non_json(self):
        assert json_needs_key_migration("") is False
        assert json_needs_key_migration("not json") is False

    def test_decrypt_json_recovers_legacy_password_field(self):
        raw = json.loads(encrypt_json({"host": "db.example.com", "password": "pw"}))
        raw["password"] = _legacy_encrypt("pw")
        decrypted = decrypt_json(json.dumps(raw))
        assert decrypted["password"] == "pw"
        assert decrypted["host"] == "db.example.com"


class TestLoadPersistedKey:
    def test_generates_and_persists_when_missing(self, tmp_path, monkeypatch):
        monkeypatch.delenv("DUCKQUERY_ENCRYPTION_KEY", raising=False)
        monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
        key1 = _load_persisted_key()
        assert (tmp_path / "cfg" / "secret.key").exists()
        key2 = _load_persisted_key()
        assert key1 == key2

    def test_reuses_existing_secret_key_file(self, tmp_path, monkeypatch):
        """复用 core.security.encryption 已经生成的 secret.key，不新建一份。"""
        from cryptography.fernet import Fernet

        monkeypatch.delenv("DUCKQUERY_ENCRYPTION_KEY", raising=False)
        cfg_dir = tmp_path / "cfg"
        cfg_dir.mkdir()
        existing_key = Fernet.generate_key()
        (cfg_dir / "secret.key").write_bytes(existing_key)
        monkeypatch.setenv("CONFIG_DIR", str(cfg_dir))

        assert _load_persisted_key() == existing_key.decode("ascii")

    def test_env_override_takes_precedence(self, tmp_path, monkeypatch):
        monkeypatch.setenv("DUCKQUERY_ENCRYPTION_KEY", "explicit_override_key")
        monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
        assert _load_persisted_key() == "explicit_override_key"


class TestMetadataManagerLazyMigration:
    """get_metadata/list_metadata 读到历史密文时，顺带用新密钥重新加密写回。"""

    CONN_ID = "test_legacy_migration_conn"

    def _seed_legacy_row(self):
        from core.database.duckdb_pool import with_system_connection

        legacy_params_json = json.dumps(
            {"host": "legacy.example.com", "user": "root", "password": _legacy_encrypt("s3cret")}
        )
        with with_system_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO system_database_connections
                    (id, name, type, params, status)
                VALUES (?, ?, ?, ?, ?)
                """,
                [self.CONN_ID, self.CONN_ID, "mysql", legacy_params_json, "active"],
            )

    def _delete_row(self):
        from core.database.duckdb_pool import with_system_connection

        with with_system_connection() as conn:
            conn.execute(
                "DELETE FROM system_database_connections WHERE id = ?", [self.CONN_ID]
            )

    def _raw_params(self) -> str:
        from core.database.duckdb_pool import with_system_connection

        with with_system_connection() as conn:
            row = conn.execute(
                "SELECT params FROM system_database_connections WHERE id = ?", [self.CONN_ID]
            ).fetchone()
        return row[0]

    def test_get_metadata_migrates_legacy_row_in_place(self):
        self._seed_legacy_row()
        try:
            metadata_manager._cache.clear()
            data = metadata_manager.get_metadata("system_database_connections", self.CONN_ID)
            assert data is not None
            assert data["params"]["password"] == "s3cret"  # 读取即拿到正确明文

            # 落盘的密文应该已经被顺手升级成 v2
            assert not json_needs_key_migration(self._raw_params())

            # 再读一次仍然正确，且不再需要迁移（幂等，不会反复重写）
            metadata_manager._cache.clear()
            data2 = metadata_manager.get_metadata("system_database_connections", self.CONN_ID)
            assert data2["params"]["password"] == "s3cret"
        finally:
            self._delete_row()

    def test_list_metadata_migrates_legacy_row_in_place(self):
        self._seed_legacy_row()
        try:
            metadata_manager._cache.clear()
            rows = metadata_manager.list_metadata(
                "system_database_connections", {"id": self.CONN_ID}
            )
            assert len(rows) == 1
            assert rows[0]["params"]["password"] == "s3cret"
            assert not json_needs_key_migration(self._raw_params())
        finally:
            self._delete_row()

    def test_fresh_save_round_trips_through_get_metadata(self):
        """非历史数据路径完全不受影响：save_metadata -> get_metadata 明文一致。"""
        try:
            ok = metadata_manager.save_metadata(
                "system_database_connections",
                self.CONN_ID,
                {
                    "id": self.CONN_ID,
                    "name": self.CONN_ID,
                    "type": "mysql",
                    "params": {"host": "fresh.example.com", "password": "fresh_pw"},
                    "status": "active",
                },
            )
            assert ok is True
            metadata_manager._cache.clear()
            data = metadata_manager.get_metadata("system_database_connections", self.CONN_ID)
            assert data["params"]["password"] == "fresh_pw"
            assert not json_needs_key_migration(self._raw_params())
        finally:
            self._delete_row()
