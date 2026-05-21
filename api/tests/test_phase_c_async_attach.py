"""阶段 C：异步任务从 datasource 自动推导 attach"""

import sys
from unittest.mock import MagicMock, patch

from core.common.connection_alias import resolve_attach_databases_for_async


class TestSubmitAsyncAutoAttach:
    def test_datasource_only_resolves_federated(self):
        datasource = {"type": "postgresql", "id": "db_pg_main"}
        mock_conn = MagicMock()
        mock_conn.type = MagicMock(value="postgresql")
        mock_conn.name = "main"
        mock_conn.id = "pg_main"

        mock_db_manager = MagicMock()
        mock_db_manager.get_connection.return_value = mock_conn
        mock_module = MagicMock(db_manager=mock_db_manager)

        with patch.dict(
            sys.modules,
            {"core.database.database_manager": mock_module},
        ):
            attach_list, is_federated = resolve_attach_databases_for_async(
                None, datasource
            )

        assert is_federated is True
        assert len(attach_list) == 1
        assert attach_list[0]["connection_id"] == "pg_main"
        assert attach_list[0]["alias"] == "postgresql_main"
