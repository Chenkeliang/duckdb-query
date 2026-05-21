"""connection_alias 与前端 generateDatabaseAlias 对齐测试"""

import sys
from unittest.mock import MagicMock, patch

from core.common.connection_alias import (
    build_attach_list_from_datasource,
    generate_connection_alias,
    normalize_connection_id,
    resolve_attach_databases_for_async,
)
from models.query_models import AttachDatabase


class TestNormalizeConnectionId:
    def test_strips_db_prefix(self):
        assert normalize_connection_id("db_mysql_orders") == "mysql_orders"

    def test_passthrough_plain_id(self):
        assert normalize_connection_id("conn-1") == "conn-1"


class TestGenerateConnectionAlias:
    def test_matches_frontend_style(self):
        conn = MagicMock()
        conn.type = MagicMock(value="mysql")
        conn.name = "Orders DB"
        conn.id = "x"
        assert generate_connection_alias(conn) == "mysql_orders_db"

    def test_collision_suffix(self):
        conn = MagicMock()
        conn.type = MagicMock(value="mysql")
        conn.name = "shop"
        conn.id = "x"
        existing = {"mysql_shop"}
        assert generate_connection_alias(conn, existing) == "mysql_shop_1"


class TestResolveAttachForAsync:
    def test_explicit_attach_wins(self):
        attach = [AttachDatabase(alias="pg_db", connection_id="c1")]
        resolved, is_fed = resolve_attach_databases_for_async(attach, None)
        assert is_fed is True
        assert resolved == [{"alias": "pg_db", "connection_id": "c1"}]

    def test_empty_without_datasource(self):
        resolved, is_fed = resolve_attach_databases_for_async(None, None)
        assert is_fed is False
        assert resolved == []


class TestBuildAttachFromDatasource:
    def test_builds_for_mysql(self):
        conn = MagicMock()
        conn.type = MagicMock(value="mysql")
        conn.name = "shop"
        conn.id = "shop-id"

        mock_db_manager = MagicMock()
        mock_db_manager.get_connection.return_value = conn
        mock_module = MagicMock(db_manager=mock_db_manager)

        with patch.dict(
            sys.modules,
            {"core.database.database_manager": mock_module},
        ):
            result = build_attach_list_from_datasource(
                {"type": "mysql", "id": "db_shop-id"}
            )

        assert result == [{"alias": "mysql_shop", "connection_id": "shop-id"}]
