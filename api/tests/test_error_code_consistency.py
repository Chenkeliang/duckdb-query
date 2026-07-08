"""#16 回归：同一类错误（表不存在/语法错）在各查询 router 应返回一致的 HTTP 状态码。

修复前 join-query 用 analyze_error_type 把"表不存在"映射成 404，而
set-operations / pivot-query 的通用异常处理硬编码 500。现在三者共用
classify_exception，行为一致；识别不出的错误仍落到 500（与原硬编码一致）。
"""

from unittest.mock import Mock, patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from core.common.error_codes import classify_exception
from core.services.pivot_query_generator import GeneratedPivotQuery
from main import app
from models.pivot_query_models import PivotQueryMode
from tests.pool_mock import bind_mock_duckdb_pool

client = TestClient(app, raise_server_exceptions=False)

TABLE_NOT_FOUND_MSG = 'Catalog Error: Table with name "nope" does not exist!'
SYNTAX_MSG = "Parser Error: syntax error at or near \"SELCT\""


class TestClassifyException:
    def test_table_not_found_is_404(self):
        code, status = classify_exception(TABLE_NOT_FOUND_MSG)
        assert status == 404 and code.name == "TABLE_NOT_FOUND"

    def test_syntax_error_is_400(self):
        code, status = classify_exception(SYNTAX_MSG)
        assert status == 400 and code.name == "SQL_SYNTAX_ERROR"

    def test_unrecognized_is_500(self):
        code, status = classify_exception("some totally unexpected failure")
        assert status == 500 and code.name == "UNKNOWN_ERROR"


class TestSetOperationsErrorCodes:
    def _preview_with_execute_error(self, error_message):
        request_data = {
            "config": {
                "operation_type": "UNION",
                "tables": [
                    {"table_name": "nope", "selected_columns": ["id"], "alias": "a"},
                    {"table_name": "nope2", "selected_columns": ["id"], "alias": "b"},
                ],
                "use_by_name": False,
            },
            "preview": True,
            "include_metadata": False,
        }
        with patch("routers.set_operations.generate_set_operation_sql") as mock_gen, \
             patch("routers.set_operations.with_duckdb_connection") as mock_db:
            mock_gen.return_value = "SELECT id FROM nope UNION SELECT id FROM nope2 LIMIT 10"
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_db, mock_con)
            mock_con.execute.side_effect = Exception(error_message)
            return client.post("/api/set-operations/preview", json=request_data)

    def test_table_not_found_returns_404(self):
        resp = self._preview_with_execute_error(TABLE_NOT_FOUND_MSG)
        assert resp.status_code == 404, resp.text

    def test_unrecognized_error_still_500(self):
        resp = self._preview_with_execute_error("weird internal failure xyz")
        assert resp.status_code == 500, resp.text


class TestPivotErrorCodes:
    def _preview_with_execute_error(self, error_message):
        request_data = {
            "pivot_config": {
                "rows": ["region"],
                "columns": ["month"],
                "values": [{"column": "amount", "aggregation": "SUM"}],
            },
            "config": {"table_name": "nope", "filters": []},
            "limit": 10,
        }
        preview_sql = 'SELECT "region", "month", "amount" FROM "nope"'
        gen = GeneratedPivotQuery(
            mode=PivotQueryMode.PIVOT,
            base_sql=preview_sql,
            final_sql=preview_sql,
            pivot_sql=None,
            warnings=[],
            metadata={"mode": PivotQueryMode.PIVOT.value},
        )
        # 校验/生成通过，让执行阶段抛错 -> 通用 except -> classify_exception
        with patch("routers.pivot_query.validate_query_config") as mock_validate, \
             patch("routers.pivot_query.generate_pivot_query_sql") as mock_generate, \
             patch("routers.pivot_query.with_duckdb_connection") as mock_db:
            mock_validate.return_value = Mock(is_valid=True, errors=[], warnings=[])
            mock_generate.return_value = gen
            mock_con = Mock()
            bind_mock_duckdb_pool(mock_db, mock_con)
            mock_con.execute.side_effect = Exception(error_message)
            return client.post("/api/pivot-query/preview", json=request_data)

    def test_table_not_found_returns_404(self):
        resp = self._preview_with_execute_error(TABLE_NOT_FOUND_MSG)
        assert resp.status_code == 404, resp.text

    def test_unrecognized_error_still_500(self):
        resp = self._preview_with_execute_error("weird internal failure xyz")
        assert resp.status_code == 500, resp.text
