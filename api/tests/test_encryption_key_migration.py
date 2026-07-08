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


class TestLegacyKeyHonorsEnvOverride:
    """历史密文按「v2 迁移之前那把有效密钥」解密——若某部署曾设过
    DUCKQUERY_ENCRYPTION_KEY,其历史密文就是用该 env 值加密的,_LEGACY_KEY 必须
    回落到它,不能写死成默认值(否则用错密钥解成乱码落库=不可逆数据损坏)。"""

    @staticmethod
    def _xor_b64(plaintext: str, key: str) -> str:
        data = plaintext.encode("utf-8")
        kb = key.encode("utf-8")
        return base64.b64encode(
            bytes([data[i] ^ kb[i % len(kb)] for i in range(len(data))])
        ).decode("utf-8")

    def test_legacy_key_falls_back_to_env_and_decrypts(self, tmp_path, monkeypatch):
        import importlib

        import utils.encryption_utils as enc_mod

        monkeypatch.setenv("DUCKQUERY_ENCRYPTION_KEY", "shared-across-machines")
        monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
        importlib.reload(enc_mod)
        try:
            assert enc_mod.EncryptionUtils._LEGACY_KEY == "shared-across-machines"
            legacy = self._xor_b64("envpw", "shared-across-machines")
            assert not legacy.startswith(enc_mod._V2_PREFIX)
            assert enc_mod.EncryptionUtils.decrypt_password(legacy) == "envpw"
        finally:
            # 还原模块到 env 未设状态,避免污染其它测试
            monkeypatch.undo()
            importlib.reload(enc_mod)

    def test_legacy_key_is_default_when_env_unset(self):
        # 常态(env 未设):回退到源码默认值,覆盖全部历史部署
        assert EncryptionUtils._LEGACY_KEY == _LEGACY_DEFAULT_KEY


class TestIsEncrypted:
    """is_encrypted 必须先剥掉 v2: 前缀再做 Base64 解码,否则会把自己产出的
    v2 密文误判成「未加密」。"""

    def test_recognizes_v2_ciphertext(self):
        v2 = EncryptionUtils.encrypt_password("hunter2")
        assert v2.startswith(_V2_PREFIX)
        assert EncryptionUtils.is_encrypted(v2) is True

    def test_recognizes_legacy_ciphertext(self):
        assert EncryptionUtils.is_encrypted(_legacy_encrypt("x")) is True

    def test_empty_is_not_encrypted(self):
        assert EncryptionUtils.is_encrypted("") is False


class TestAtomicSecretKeyLoad:
    """load_or_create_secret_key 并发首启只应写入一把密钥;os.link 保证输家读到的
    永远是赢家写满后的完整内容,不会出现空/半截密钥。"""

    @staticmethod
    def _worker(_):
        from core.common.paths import load_or_create_secret_key

        return load_or_create_secret_key()

    def test_concurrent_creators_converge_to_single_key(self, tmp_path, monkeypatch):
        import multiprocessing as mp
        import os

        monkeypatch.delenv("DUCKQUERY_ENCRYPTION_KEY", raising=False)
        cfg = tmp_path / "cfg"
        monkeypatch.setenv("CONFIG_DIR", str(cfg))

        ctx = mp.get_context("fork")
        with ctx.Pool(8) as pool:
            keys = pool.map(TestAtomicSecretKeyLoad._worker, range(8))

        assert len(set(keys)) == 1, f"race: {len(set(keys))} distinct keys written"
        assert all(len(k) >= 32 for k in keys), "short/partial key read"
        leftovers = [f for f in os.listdir(cfg) if f.endswith(".tmp")]
        assert not leftovers, f"temp files leaked: {leftovers}"


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
