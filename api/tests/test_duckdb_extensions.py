"""
DuckDB 扩展管理测试

测试扩展配置、ATTACH SQL 生成等功能。

**Feature: duckdb-extension-unified-management**
"""

import gzip
import os
import tempfile

import pytest
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient

from main import app
from tests.pool_mock import bind_mock_duckdb_pool
from routers import duckdb_extensions


class TestDefaultExtensionConfiguration:
    """测试默认扩展配置"""

    def test_default_extensions_include_federated_query_extensions(self):
        """
        **Property 5: Configuration Default Extensions**
        **Validates: Requirements 1.4, 4.2**
        
        验证默认扩展列表包含 excel, json, parquet, mysql, postgres
        """
        from core.common.config_manager import AppConfig
        
        # 创建不带显式扩展配置的 AppConfig
        config = AppConfig()
        
        # 验证默认扩展列表
        expected_extensions = [
            "excel",
            "json",
            "parquet",
            "httpfs",
            "mysql",
            "postgres",
        ]
        assert config.duckdb_extensions == expected_extensions
        
        # 验证联邦查询扩展存在
        assert "mysql" in config.duckdb_extensions
        assert "postgres" in config.duckdb_extensions

    def test_custom_extensions_override_default(self):
        """测试自定义扩展列表覆盖默认值"""
        from core.common.config_manager import AppConfig
        
        custom_extensions = ["json", "parquet"]
        config = AppConfig(duckdb_extensions=custom_extensions)
        
        assert config.duckdb_extensions == custom_extensions
        assert "mysql" not in config.duckdb_extensions

    def test_empty_extensions_list_preserved(self):
        """测试空扩展列表被保留"""
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=[])
        
        assert config.duckdb_extensions == []


class TestSpatialExtensionOptional:
    """spatial 扩展（镜像/Dockerfile 预装）"""

    def test_spatial_point_construct(self):
        duckdb = pytest.importorskip("duckdb")
        con = duckdb.connect()
        con.execute("INSTALL spatial")
        con.execute("LOAD spatial")
        result = con.execute("SELECT ST_Point(1, 2)").fetchone()
        assert result is not None


class TestBuildAttachSQL:
    """测试 ATTACH SQL 生成"""

    def test_mysql_attach_sql_format(self):
        """
        **Property 2: ATTACH SQL Format for MySQL**
        **Validates: Requirements 2.2**
        
        验证 MySQL ATTACH SQL 格式正确
        """
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': 'test_password',
            'database': 'testdb',
            'port': 3306
        }
        
        sql = build_attach_sql('test_alias', config)
        
        # 验证 SQL 格式
        assert 'TYPE mysql' in sql
        assert 'host=localhost' in sql
        assert 'user=root' in sql
        assert 'database=testdb' in sql
        assert 'port=3306' in sql
        assert 'AS "test_alias"' in sql

    def test_postgres_attach_sql_format(self):
        """
        **Property 3: ATTACH SQL Format for PostgreSQL**
        **Validates: Requirements 2.3**
        
        验证 PostgreSQL ATTACH SQL 格式正确
        """
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'postgresql',
            'host': 'localhost',
            'username': 'postgres',
            'password': 'test_password',
            'database': 'testdb',
            'port': 5432
        }
        
        sql = build_attach_sql('pg_alias', config)
        
        # 验证 SQL 格式
        assert 'TYPE postgres' in sql
        assert 'host=localhost' in sql
        assert 'user=postgres' in sql
        assert 'dbname=testdb' in sql
        assert 'port=5432' in sql
        assert 'AS "pg_alias"' in sql

    def test_sqlite_attach_sql_format(self):
        """
        **Property 4: ATTACH SQL Format for SQLite**
        **Validates: Requirements 2.4**
        
        验证 SQLite ATTACH SQL 格式正确
        """
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'sqlite',
            'database': '/path/to/database.db'
        }
        
        sql = build_attach_sql('sqlite_alias', config)
        
        # 验证 SQL 格式
        assert 'TYPE sqlite' in sql
        assert '/path/to/database.db' in sql
        assert 'AS "sqlite_alias"' in sql

    def test_mysql_without_port(self):
        """测试 MySQL 不带端口的情况"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': 'password',
            'database': 'testdb'
        }
        
        sql = build_attach_sql('mysql_db', config)
        
        assert 'TYPE mysql' in sql
        assert 'host=localhost' in sql
        assert 'port=' not in sql

    def test_postgres_without_port(self):
        """测试 PostgreSQL 不带端口的情况"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'postgres',
            'host': 'localhost',
            'username': 'postgres',
            'password': 'password',
            'database': 'testdb'
        }
        
        sql = build_attach_sql('pg_db', config)
        
        assert 'TYPE postgres' in sql
        assert 'host=localhost' in sql
        assert 'port=' not in sql

    def test_unsupported_database_type_raises_error(self):
        """测试不支持的数据库类型抛出错误"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'oracle',
            'host': 'localhost',
            'username': 'user',
            'password': 'password',
            'database': 'testdb'
        }
        
        with pytest.raises(ValueError) as exc_info:
            build_attach_sql('oracle_db', config)
        
        assert 'Unsupported database type' in str(exc_info.value)

    def test_alias_with_embedded_quote_is_escaped_not_injected(self):
        """回归:alias 曾经是裸词拼接(`AS {alias}`,连引号都没有),
        比 execute_sql_and_persist 的 table_name 问题更严重——不需要
        闭合引号,直接就能在 ATTACH 语句里注入任意 SQL 子句。"""
        from core.database.duckdb_engine import build_attach_sql

        malicious_alias = 'x"; DROP TABLE users; --'
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': 'password',
            'database': 'testdb',
        }

        sql = build_attach_sql(malicious_alias, config)

        # 恶意内容必须整体落在转义后的引号标识符里,语句结构(TYPE 子句)完整
        assert sql.endswith('AS "x""; DROP TABLE users; --" (TYPE mysql)')

    def test_empty_password_handled(self):
        """测试空密码的处理"""
        from core.database.duckdb_engine import build_attach_sql
        
        config = {
            'type': 'mysql',
            'host': 'localhost',
            'username': 'root',
            'password': '',
            'database': 'testdb'
        }
        
        sql = build_attach_sql('mysql_db', config)
        
        assert 'TYPE mysql' in sql
        assert 'password=' in sql


class TestExtensionLoading:
    """测试扩展加载"""

    def test_resolve_duckdb_extensions_deduplicates(self):
        """测试扩展列表去重"""
        from core.database.duckdb_engine import _resolve_duckdb_extensions
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=["json", "JSON", "parquet", "json"])
        
        resolved = _resolve_duckdb_extensions(config)
        
        # 验证去重（忽略大小写）
        assert len(resolved) == 2
        assert "json" in resolved or "JSON" in resolved
        assert "parquet" in resolved

    def test_resolve_duckdb_extensions_preserves_order(self):
        """测试扩展列表保持顺序"""
        from core.database.duckdb_engine import _resolve_duckdb_extensions
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=["parquet", "json", "excel"])
        
        resolved = _resolve_duckdb_extensions(config)
        
        assert resolved == ["parquet", "json", "excel"]

    def test_resolve_duckdb_extensions_with_override(self):
        """测试扩展列表覆盖"""
        from core.database.duckdb_engine import _resolve_duckdb_extensions
        from core.common.config_manager import AppConfig
        
        config = AppConfig(duckdb_extensions=["json", "parquet"])
        override = ["mysql", "postgres"]
        
        resolved = _resolve_duckdb_extensions(config, override)

        assert resolved == ["mysql", "postgres"]


# ==================== 扩展管理页（Extensions Page）====================
# 覆盖 GET 目录清单 / POST 安装 / GET 安装进度 三个接口，以及后台安装线程的状态机。

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def _reset_install_state():
    """每个用例独立，避免内存态的安装进度串到下一个用例"""
    duckdb_extensions._install_state.clear()
    yield
    duckdb_extensions._install_state.clear()


class TestListExtensions:
    """GET /api/duckdb/extensions"""

    def test_list_returns_catalog_with_bundled_and_datasource_entries(self):
        response = client.get("/api/duckdb/extensions")
        assert response.status_code == 200

        body = response.json()
        assert body["success"] is True
        items = body["data"]["items"]
        names = {item["name"] for item in items}

        # 精选目录中的条目应存在
        assert "sqlite_scanner" in names
        # 目录不应混入未在精选清单中的扩展（即便 DuckDB 本身认识它们）
        assert "autocomplete" not in names
        assert "ui" not in names
        assert "tpch" not in names

        excel_item = next(item for item in items if item["name"] == "excel")
        assert excel_item["bundled"] is True
        assert excel_item["installed"] is True
        assert excel_item["category"] == "datasource"
        assert excel_item["description"]
        assert excel_item["description_en"]

        sqlite_item = next(item for item in items if item["name"] == "sqlite_scanner")
        assert sqlite_item["bundled"] is False
        assert sqlite_item["category"] == "datasource"


class TestInstallValidation:
    """POST /api/duckdb/extensions/{name}/install 的白名单校验"""

    def test_install_unknown_name_rejected(self):
        response = client.post("/api/duckdb/extensions/ui/install")
        assert response.status_code >= 400
        assert response.status_code < 500

    def test_install_path_traversal_name_rejected(self):
        response = client.post("/api/duckdb/extensions/../evil/install")
        assert response.status_code >= 400
        assert response.status_code < 500

    def test_install_bundled_name_rejected(self):
        response = client.post("/api/duckdb/extensions/excel/install")
        assert response.status_code >= 400
        assert response.status_code < 500
        body = response.json()
        assert body["success"] is False

    def test_install_already_in_progress_is_idempotent(self):
        """已在安装中时，POST 幂等返回当前进度，不重新起线程"""
        duckdb_extensions._set_install_state(
            "fts", status="downloading", progress=42, error=None
        )
        with patch.object(duckdb_extensions.threading, "Thread") as mock_thread:
            response = client.post("/api/duckdb/extensions/fts/install")
        assert response.status_code == 200
        assert response.json()["data"]["progress"] == 42
        assert response.json()["data"]["status"] == "downloading"
        mock_thread.assert_not_called()


class TestInstallStatus:
    """GET /api/duckdb/extensions/install/{name}"""

    def test_status_defaults_to_idle_when_untracked(self):
        response = client.get("/api/duckdb/extensions/install/vss")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data == {"status": "idle", "progress": 0, "error": None}


class _ImmediateThread:
    """把 threading.Thread 替换为同步执行，让安装线程的状态机可确定性地测试"""

    def __init__(self, target=None, args=(), kwargs=None, **_ignored):
        self._target = target
        self._args = args
        self._kwargs = kwargs or {}

    def start(self):
        self._target(*self._args, **self._kwargs)

    def join(self, *_args, **_kwargs):
        pass


def _fake_duckdb_connection(ext_dir: str):
    """构造一个假的 with_duckdb_connection()，回答 version/platform/extension_directory 查询"""
    mock_con = MagicMock()

    def fake_execute(sql, *args, **kwargs):
        result = MagicMock()
        if "version()" in sql:
            result.fetchone.return_value = ("v1.5.3",)
        elif "extension_directory" in sql:
            result.fetchone.return_value = (ext_dir,)
        elif "platform" in sql:
            result.fetchone.return_value = ("osx_arm64",)
        else:
            result.fetchone.return_value = (None,)
        return result

    mock_con.execute.side_effect = fake_execute
    return mock_con


class TestInstallProgressStateMachine:
    """安装线程的状态机：downloading -> verifying -> done / error（不真联网）"""

    def test_install_reaches_done_with_mocked_download(self):
        fake_payload = gzip.compress(b"fake-duckdb-extension-bytes")

        fake_response = MagicMock()
        fake_response.headers = {"Content-Length": str(len(fake_payload))}
        fake_response.read.side_effect = [fake_payload, b""]
        fake_response.__enter__.return_value = fake_response
        fake_response.__exit__.return_value = False

        with tempfile.TemporaryDirectory() as ext_dir:
            mock_con = _fake_duckdb_connection(ext_dir)
            with patch(
                "routers.duckdb_extensions.with_duckdb_connection"
            ) as mock_pool, patch(
                "routers.duckdb_extensions.urllib.request.urlopen",
                return_value=fake_response,
            ), patch.object(
                duckdb_extensions.threading, "Thread", _ImmediateThread
            ):
                bind_mock_duckdb_pool(mock_pool, mock_con)
                response = client.post("/api/duckdb/extensions/fts/install")
                assert response.status_code == 200

            state = duckdb_extensions._get_install_state("fts")
            assert state["status"] == "done"
            assert state["progress"] == 100
            assert state["error"] is None

            dest_path = os.path.join(ext_dir, "v1.5.3", "osx_arm64", "fts.duckdb_extension")
            assert os.path.exists(dest_path)
            with open(dest_path, "rb") as f:
                assert f.read() == b"fake-duckdb-extension-bytes"

    def test_install_error_path_is_readable_and_recoverable(self):
        """下载失败时状态置为 error，带可读错误信息，可重新点击安装重试"""
        with tempfile.TemporaryDirectory() as ext_dir:
            mock_con = _fake_duckdb_connection(ext_dir)
            with patch(
                "routers.duckdb_extensions.with_duckdb_connection"
            ) as mock_pool, patch(
                "routers.duckdb_extensions.urllib.request.urlopen",
                side_effect=OSError("network unreachable"),
            ), patch.object(
                duckdb_extensions.threading, "Thread", _ImmediateThread
            ):
                bind_mock_duckdb_pool(mock_pool, mock_con)
                response = client.post("/api/duckdb/extensions/vss/install")
                assert response.status_code == 200

            state = duckdb_extensions._get_install_state("vss")
            assert state["status"] == "error"
            assert state["error"]
            assert "vss" in state["error"]

            status_response = client.get("/api/duckdb/extensions/install/vss")
            assert status_response.json()["data"]["status"] == "error"
