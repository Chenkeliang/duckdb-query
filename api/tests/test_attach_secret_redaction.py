"""#19 回归：ATTACH 失败的错误信息不能把连接串里的明文口令带出去。

DuckDB 的 mysql/postgres 扩展在 ATTACH 失败时会把整条连接串（含
password=明文）原样回显进错误文本。这条文本会流向日志、异常消息、任务
元数据乃至 MCP/LLM 调用方，必须在离开 ATTACH 现场前脱敏。
"""

import duckdb
import pytest

from core.common.exceptions import DatabaseConnectionError
from core.database.duckdb_engine import with_duckdb_connection
from core.database.federated_attach import (
    attach_databases_on_connection,
    redact_connection_secrets,
)

SECRET = "SuperSecretPw123"


def test_redact_helper_masks_password_token():
    raw = (
        'Failed to connect to MySQL database with parameters '
        '"host=10.255.255.1 user=root password=SuperSecretPw123 database=prod port=3306"'
    )
    out = redact_connection_secrets(raw)
    assert SECRET not in out
    assert "password=***" in out
    # 其余连接参数保留，便于诊断
    assert "host=10.255.255.1" in out
    assert "user=root" in out


def test_redact_helper_case_insensitive_and_non_string():
    assert redact_connection_secrets("PASSWORD=abc def") == "PASSWORD=*** def"
    assert redact_connection_secrets(ValueError("password=xyz")) == "password=***"


def test_failed_attach_error_does_not_leak_password():
    """真实 DuckDB ATTACH 失败：抛出的异常文本里不能出现明文口令。"""
    db_config = {
        "type": "mysql",
        "host": "127.0.0.1",  # 本地空端口 → 立即 connection refused（快，不用等超时）
        "username": "root",
        "password": SECRET,
        "database": "prod",
        "port": 1,
    }
    with with_duckdb_connection() as con:
        try:
            con.execute("INSTALL mysql; LOAD mysql;")
        except Exception:
            pytest.skip("mysql extension unavailable in this environment")

        with pytest.raises(DatabaseConnectionError) as exc_info:
            attach_databases_on_connection(con, [("m", db_config)])

    err = exc_info.value
    # 异常消息本身
    assert SECRET not in str(err)
    assert "password=***" in str(err)
    # __cause__ 链已被切断（from None），不会有未脱敏的原始异常挂在后面
    assert err.__cause__ is None
    # 兜底：把整条异常链格式化出来也不能出现明文
    import traceback

    chain = "".join(
        traceback.format_exception(type(err), err, err.__traceback__)
    )
    assert SECRET not in chain
