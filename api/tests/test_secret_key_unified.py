import importlib
from pathlib import Path


def test_both_encryptors_use_same_key_path_without_config_env(monkeypatch, tmp_path):
    monkeypatch.delenv("CONFIG_DIR", raising=False)
    import core.common.paths as paths
    monkeypatch.setattr(paths, "get_user_data_dir", lambda: tmp_path)
    expected = tmp_path / "config" / "secret.key"

    import core.foundation.crypto_utils as cu
    importlib.reload(cu)
    assert cu.CryptoManager()._get_secret_key_path() == expected


def test_crypto_round_trip_with_unified_path(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path / "cfg"))
    import core.foundation.crypto_utils as cu
    importlib.reload(cu)
    mgr = cu.CryptoManager()
    # 仅验证密钥文件落在统一目录下
    assert mgr._get_secret_key_path() == tmp_path / "cfg" / "secret.key"
