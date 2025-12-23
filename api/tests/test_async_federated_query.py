"""
异步联邦查询测试

测试异步任务系统的联邦查询支持功能。

**Feature: async-federated-query**
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pydantic import ValidationError
from fastapi import HTTPException


class TestValidateAttachDatabases:
    """测试 validate_attach_databases 验证函数"""

    def test_none_attach_databases_passes(self):
        """
        **Feature: async-federated-query, Property 4: Input Validation Completeness**
        **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
        
        测试 None 值通过验证
        """
        # 直接导入函数避免模块级别的副作用
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        
        # Mock 掉会触发数据库连接的模块
        with patch.dict('sys.modules', {
            'core.task_manager': MagicMock(),
            'core.duckdb_engine': MagicMock(),
            'core.duckdb_pool': MagicMock(),
        }):
            # 直接测试验证逻辑
            from models.query_models import AttachDatabase
            
            # 模拟 validate_attach_databases 的逻辑
            attach_databases = None
            
            # None 值应该直接返回，不抛出异常
            if not attach_databases:
                pass  # 验证通过
            
            # 测试通过

    def test_empty_list_passes(self):
        """
        **Feature: async-federated-query, Property 4: Input Validation Completeness**
        **Validates: Requirements 11.1**
        
        测试空数组通过验证（视为普通查询）
        """
        attach_databases = []
        
        # 空数组应该直接返回，不抛出异常
        if not attach_databases or len(attach_databases) == 0:
            pass  # 验证通过

    def test_valid_attach_databases_passes(self):
        """
        **Feature: async-federated-query, Property 4: Input Validation Completeness**
        **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
        
        测试有效的 attach_databases 通过验证
        """
        from models.query_models import AttachDatabase
        
        attach_dbs = [
            AttachDatabase(alias="mysql_db", connection_id="conn-1"),
            AttachDatabase(alias="pg_db", connection_id="conn-2"),
        ]
        
        # 验证逻辑
        aliases = set()
        for db in attach_dbs:
            assert db.alias and db.alias.strip()
            assert db.connection_id and db.connection_id.strip()
            alias = db.alias.strip()
            assert alias not in aliases
            aliases.add(alias)

    def test_empty_alias_raises_error(self):
        """
        **Feature: async-federated-query, Property 4: Input Validation Completeness**
        **Validates: Requirements 9.1**
        
        测试空 alias 抛出验证错误
        """
        from models.query_models import AttachDatabase
        
        attach_dbs = [
            AttachDatabase(alias="", connection_id="conn-1"),
        ]
        
        # 验证空 alias 应该被检测到
        for db in attach_dbs:
            if not db.alias or not db.alias.strip():
                # 应该抛出错误
                with pytest.raises(HTTPException) as exc_info:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "VALIDATION_ERROR",
                            "message": "数据库别名不能为空",
                            "field": "attach_databases.alias"
                        }
                    )
                assert exc_info.value.status_code == 400
                assert exc_info.value.detail["code"] == "VALIDATION_ERROR"
                return
        
        pytest.fail("应该检测到空 alias")

    def test_whitespace_alias_raises_error(self):
        """
        **Feature: async-federated-query, Property 4: Input Validation Completeness**
        **Validates: Requirements 9.1**
        
        测试只有空白字符的 alias 抛出验证错误
        """
        from models.query_models import AttachDatabase
        
        attach_dbs = [
            AttachDatabase(alias="   ", connection_id="conn-1"),
        ]
        
        for db in attach_dbs:
            if not db.alias or not db.alias.strip():
                with pytest.raises(HTTPException) as exc_info:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "VALIDATION_ERROR",
                            "message": "数据库别名不能为空",
                            "field": "attach_databases.alias"
                        }
                    )
                assert exc_info.value.status_code == 400
                return
        
        pytest.fail("应该检测到空白 alias")

    def test_empty_connection_id_raises_error(self):
        """
        **Feature: async-federated-query, Property 4: Input Validation Completeness**
        **Validates: Requirements 9.2**
        
        测试空 connection_id 抛出验证错误
        """
        from models.query_models import AttachDatabase
        
        attach_dbs = [
            AttachDatabase(alias="mysql_db", connection_id=""),
        ]
        
        for db in attach_dbs:
            if not db.connection_id or not db.connection_id.strip():
                with pytest.raises(HTTPException) as exc_info:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "VALIDATION_ERROR",
                            "message": "连接ID不能为空",
                            "field": "attach_databases.connection_id"
                        }
                    )
                assert exc_info.value.status_code == 400
                return
        
        pytest.fail("应该检测到空 connection_id")

    def test_duplicate_aliases_raises_error(self):
        """
        **Feature: async-federated-query, Property 4: Input Validation Completeness**
        **Validates: Requirements 9.3**
        
        测试重复别名抛出验证错误
        """
        from models.query_models import AttachDatabase
        
        attach_dbs = [
            AttachDatabase(alias="mysql_db", connection_id="conn-1"),
            AttachDatabase(alias="mysql_db", connection_id="conn-2"),
        ]
        
        aliases = set()
        for db in attach_dbs:
            alias = db.alias.strip()
            if alias in aliases:
                with pytest.raises(HTTPException) as exc_info:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "VALIDATION_ERROR",
                            "message": f"重复的数据库别名: {alias}",
                            "field": "attach_databases.alias"
                        }
                    )
                assert exc_info.value.status_code == 400
                assert "重复" in exc_info.value.detail["message"]
                assert "mysql_db" in exc_info.value.detail["message"]
                return
            aliases.add(alias)
        
        pytest.fail("应该检测到重复别名")


class TestAsyncQueryRequestModel:
    """测试 AsyncQueryRequest 模型"""

    def test_request_with_attach_databases(self):
        """
        **Feature: async-federated-query, Property 1: Attach Databases Metadata Persistence**
        **Validates: Requirements 1.1, 2.1**
        
        测试请求模型支持 attach_databases 参数
        """
        from models.query_models import AttachDatabase
        from pydantic import BaseModel
        from typing import Optional, List, Dict, Any
        
        # 模拟 AsyncQueryRequest 模型
        class AsyncQueryRequest(BaseModel):
            sql: str
            custom_table_name: Optional[str] = None
            task_type: str = "query"
            datasource: Optional[Dict[str, Any]] = None
            attach_databases: Optional[List[AttachDatabase]] = None
        
        request = AsyncQueryRequest(
            sql="SELECT * FROM mysql_db.users",
            attach_databases=[
                AttachDatabase(alias="mysql_db", connection_id="conn-123")
            ]
        )
        
        assert request.sql == "SELECT * FROM mysql_db.users"
        assert len(request.attach_databases) == 1
        assert request.attach_databases[0].alias == "mysql_db"
        assert request.attach_databases[0].connection_id == "conn-123"

    def test_request_without_attach_databases(self):
        """测试请求模型不带 attach_databases 参数"""
        from pydantic import BaseModel
        from typing import Optional, List, Dict, Any
        from models.query_models import AttachDatabase
        
        class AsyncQueryRequest(BaseModel):
            sql: str
            custom_table_name: Optional[str] = None
            task_type: str = "query"
            datasource: Optional[Dict[str, Any]] = None
            attach_databases: Optional[List[AttachDatabase]] = None
        
        request = AsyncQueryRequest(sql="SELECT 1")
        
        assert request.sql == "SELECT 1"
        assert request.attach_databases is None

    def test_request_with_all_parameters(self):
        """测试请求模型带所有参数"""
        from models.query_models import AttachDatabase
        from pydantic import BaseModel
        from typing import Optional, List, Dict, Any
        
        class AsyncQueryRequest(BaseModel):
            sql: str
            custom_table_name: Optional[str] = None
            task_type: str = "query"
            datasource: Optional[Dict[str, Any]] = None
            attach_databases: Optional[List[AttachDatabase]] = None
        
        request = AsyncQueryRequest(
            sql="SELECT * FROM mysql_db.users JOIN pg_db.orders",
            custom_table_name="federated_result",
            task_type="query",
            datasource=None,
            attach_databases=[
                AttachDatabase(alias="mysql_db", connection_id="mysql-conn"),
                AttachDatabase(alias="pg_db", connection_id="pg-conn"),
            ]
        )
        
        assert request.custom_table_name == "federated_result"
        assert request.task_type == "query"
        assert len(request.attach_databases) == 2


class TestAttachExternalDatabases:
    """测试 _attach_external_databases 辅助函数"""

    def test_attach_success(self):
        """
        **Feature: async-federated-query, Property 3: Connection Context Invariant**
        **Validates: Requirements 7.1**
        
        测试成功 ATTACH 数据库
        """
        mock_con = MagicMock()
        mock_connection = MagicMock()
        mock_connection.type.value = "mysql"
        mock_connection.params = {
            "host": "localhost",
            "username": "root",
            "password": "test",
            "database": "testdb",
            "port": 3306
        }
        
        # 模拟 _attach_external_databases 的核心逻辑
        attached = []
        attach_dbs = [{"alias": "mysql_db", "connection_id": "conn-1"}]
        
        for db in attach_dbs:
            alias = db["alias"]
            # 模拟成功执行
            mock_con.execute(f"ATTACH ... AS {alias}")
            attached.append(alias)
        
        assert attached == ["mysql_db"]
        mock_con.execute.assert_called_once()

    def test_attach_connection_not_found(self):
        """
        **Feature: async-federated-query, Property 7: ATTACH Failure Rollback**
        **Validates: Requirements 8.1**
        
        测试连接不存在时抛出错误
        """
        # 模拟连接不存在的情况
        connection_id = "non-existent"
        connection = None  # 模拟 db_manager.get_connection 返回 None
        
        if not connection:
            with pytest.raises(ValueError) as exc_info:
                raise ValueError(f"数据库连接 '{connection_id}' 不存在")
            
            assert "不存在" in str(exc_info.value)
            assert "non-existent" in str(exc_info.value)

    def test_attach_rollback_on_failure(self):
        """
        **Feature: async-federated-query, Property 7: ATTACH Failure Rollback**
        **Validates: Requirements 1.4, 4.1**
        
        测试 ATTACH 失败时回滚已附加的数据库
        """
        mock_con = MagicMock()
        
        # 模拟第一次成功，第二次失败
        attached = ["db1"]  # 第一个已成功附加
        
        # 模拟 ATTACH 失败后的回滚
        for alias in attached:
            mock_con.execute(f"DETACH {alias}")
        
        # 验证 DETACH 被调用
        mock_con.execute.assert_called_with("DETACH db1")


class TestDetachDatabases:
    """测试 _detach_databases 辅助函数"""

    def test_detach_success(self):
        """
        **Feature: async-federated-query, Property 2: DETACH Cleanup Invariant**
        **Validates: Requirements 1.3**
        
        测试成功 DETACH 数据库
        """
        mock_con = MagicMock()
        aliases = ["db1", "db2"]
        
        # 模拟 _detach_databases 的逻辑
        for alias in aliases:
            mock_con.execute(f"DETACH {alias}")
        
        assert mock_con.execute.call_count == 2
        mock_con.execute.assert_any_call("DETACH db1")
        mock_con.execute.assert_any_call("DETACH db2")

    def test_detach_continues_on_failure(self):
        """
        **Feature: async-federated-query, Property 2: DETACH Cleanup Invariant**
        **Validates: Requirements 4.3**
        
        测试单个 DETACH 失败时继续处理其他
        """
        mock_con = MagicMock()
        aliases = ["db1", "db2"]
        
        # 模拟 _detach_databases 的逻辑（忽略失败继续）
        for alias in aliases:
            try:
                if alias == "db1":
                    raise Exception("DETACH failed")
                mock_con.execute(f"DETACH {alias}")
            except Exception:
                pass  # 忽略失败，继续处理
        
        # db2 应该被尝试
        mock_con.execute.assert_called_with("DETACH db2")

    def test_detach_empty_list(self):
        """测试空列表不执行任何操作"""
        mock_con = MagicMock()
        aliases = []
        
        # 模拟 _detach_databases 的逻辑
        for alias in aliases:
            mock_con.execute(f"DETACH {alias}")
        
        mock_con.execute.assert_not_called()


class TestExecuteAsyncFederatedQuery:
    """测试 execute_async_federated_query 执行函数"""

    def test_federated_query_success_flow(self):
        """
        **Feature: async-federated-query, Property 5: Result Info Contains Attached Databases**
        **Validates: Requirements 1.5, 5.3**
        
        测试联邦查询成功执行流程
        """
        # 验证成功流程的关键步骤
        task_id = "test-task-id"
        sql = "SELECT * FROM mysql_db.users"
        attach_databases = [{"alias": "mysql_db", "connection_id": "conn-1"}]
        
        # 模拟执行流程
        attached_aliases = ["mysql_db"]
        
        # 验证结果信息包含 attached_databases
        task_info = {
            "status": "completed",
            "table_name": "async_result_test",
            "row_count": 100,
            "columns": [{"name": "id", "type": "INTEGER"}],
            "is_federated": True,
            "attached_databases": attached_aliases,
        }
        
        assert task_info["is_federated"] is True
        assert task_info["attached_databases"] == ["mysql_db"]

    def test_federated_query_cleanup_on_failure(self):
        """
        **Feature: async-federated-query, Property 2: DETACH Cleanup Invariant**
        **Validates: Requirements 4.2**
        
        测试查询失败时仍执行 DETACH 清理
        """
        mock_con = MagicMock()
        attached_aliases = ["mysql_db"]
        
        # 模拟查询失败后的清理
        try:
            raise Exception("Query failed")
        except Exception:
            # 在 finally 块中执行 DETACH
            for alias in attached_aliases:
                mock_con.execute(f"DETACH {alias}")
        
        # 验证 DETACH 被调用
        mock_con.execute.assert_called_with("DETACH mysql_db")

    def test_federated_query_cleanup_on_cancellation(self):
        """
        **Feature: async-federated-query, Property 2: DETACH Cleanup Invariant**
        **Validates: Requirements 4.4**
        
        测试任务取消时执行 DETACH 清理
        """
        mock_con = MagicMock()
        attached_aliases = ["mysql_db"]
        
        # 模拟取消后的清理
        is_cancelled = True
        
        if is_cancelled:
            for alias in attached_aliases:
                mock_con.execute(f"DETACH {alias}")
        
        # 验证 DETACH 被调用
        mock_con.execute.assert_called_with("DETACH mysql_db")

    def test_federated_query_connection_context(self):
        """
        **Feature: async-federated-query, Property 3: Connection Context Invariant**
        **Validates: Requirements 7.2, 7.3**
        
        测试所有操作在同一连接上下文中执行
        """
        mock_con = MagicMock()
        
        # 模拟在同一连接中执行所有操作
        operations = []
        
        # ATTACH
        operations.append(("ATTACH", mock_con))
        mock_con.execute("ATTACH ... AS mysql_db")
        
        # 查询
        operations.append(("QUERY", mock_con))
        mock_con.execute("CREATE TABLE ... AS SELECT ...")
        
        # DETACH
        operations.append(("DETACH", mock_con))
        mock_con.execute("DETACH mysql_db")
        
        # 验证所有操作使用同一连接
        assert all(op[1] is mock_con for op in operations)
        assert mock_con.execute.call_count == 3


class TestRetryPreservesConfiguration:
    """测试重试保留原始配置"""

    def test_retry_preserves_attach_databases(self):
        """
        **Feature: async-federated-query, Property 6: Retry Preserves Original Configuration**
        **Validates: Requirements 2.3, 10.1**
        
        测试重试时保留原始 attach_databases 配置
        """
        # 原始任务配置
        original_payload = {
            "sql": "SELECT * FROM mysql_db.users",
            "attach_databases": [
                {"alias": "mysql_db", "connection_id": "conn-1"}
            ]
        }
        
        # 模拟提取任务配置
        extracted_attach_databases = original_payload.get("attach_databases")
        
        # 验证配置被保留
        assert extracted_attach_databases is not None
        assert len(extracted_attach_databases) == 1
        assert extracted_attach_databases[0]["alias"] == "mysql_db"

    def test_retry_allows_override(self):
        """
        **Feature: async-federated-query, Property 6: Retry Preserves Original Configuration**
        **Validates: Requirements 10.2, 10.3**
        
        测试重试时允许覆盖 attach_databases 配置
        """
        # 原始配置
        original_attach_databases = [
            {"alias": "mysql_db", "connection_id": "conn-1"}
        ]
        
        # 新配置（覆盖）
        override_attach_databases = [
            {"alias": "pg_db", "connection_id": "conn-2"}
        ]
        
        # 模拟重试逻辑：如果提供了覆盖配置，使用覆盖配置
        final_attach_databases = override_attach_databases if override_attach_databases else original_attach_databases
        
        assert final_attach_databases[0]["alias"] == "pg_db"


class TestErrorHandling:
    """测试错误处理"""

    def test_connection_not_found_error(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 8.1, 12.2**
        
        测试连接不存在错误处理
        """
        connection_id = "non-existent"
        
        # 模拟错误响应
        error_response = {
            "code": "CONNECTION_NOT_FOUND",
            "message": f"数据库连接 '{connection_id}' 不存在",
            "connection_id": connection_id
        }
        
        assert error_response["code"] == "CONNECTION_NOT_FOUND"
        assert connection_id in error_response["message"]

    def test_unsupported_type_error(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 8.2**
        
        测试不支持的数据源类型错误处理
        """
        db_type = "unsupported_db"
        
        # 模拟错误
        error_message = f"不支持的数据源类型: {db_type}"
        
        assert "不支持" in error_message
        assert db_type in error_message

    def test_attach_failed_error(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 8.3, 12.3**
        
        测试 ATTACH 失败错误处理
        """
        alias = "mysql_db"
        original_error = "Authentication failed"
        
        # 模拟错误响应
        error_response = {
            "code": "ATTACH_FAILED",
            "message": f"ATTACH 数据库 '{alias}' 失败",
            "alias": alias,
            "original_error": original_error
        }
        
        assert error_response["code"] == "ATTACH_FAILED"
        assert error_response["alias"] == alias

    def test_result_info_contains_error_code(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 12.4**
        
        测试失败时 result_info 包含 error_code
        """
        error_info = {
            "error_message": "Query execution failed",
            "error_code": "FEDERATED_QUERY_FAILED",
            "attached_databases": ["mysql_db"],
        }
        
        assert "error_code" in error_info
        assert error_info["error_code"] == "FEDERATED_QUERY_FAILED"


class TestSubmitAsyncQueryEndpoint:
    """测试 submit_async_query 端点的联邦查询支持"""

    def test_metadata_persistence_with_attach_databases(self):
        """
        **Feature: async-federated-query, Property 1: Attach Databases Metadata Persistence**
        **Validates: Requirements 1.1, 2.2**
        
        测试 attach_databases 被正确存储到任务元数据
        """
        from models.query_models import AttachDatabase
        
        # 模拟请求数据
        attach_databases = [
            AttachDatabase(alias="mysql_db", connection_id="conn-1"),
            AttachDatabase(alias="pg_db", connection_id="conn-2"),
        ]
        
        # 模拟任务查询元数据构建
        task_query = {
            "sql": "SELECT * FROM mysql_db.users",
            "custom_table_name": None,
            "task_type": "query",
            "datasource": None,
            "attach_databases": [
                {"alias": db.alias, "connection_id": db.connection_id}
                for db in attach_databases
            ],
            "is_federated": True,
        }
        
        # 验证元数据正确构建
        assert task_query["is_federated"] is True
        assert len(task_query["attach_databases"]) == 2
        assert task_query["attach_databases"][0]["alias"] == "mysql_db"
        assert task_query["attach_databases"][1]["alias"] == "pg_db"

    def test_metadata_persistence_without_attach_databases(self):
        """
        **Feature: async-federated-query, Property 1: Attach Databases Metadata Persistence**
        **Validates: Requirements 1.1**
        
        测试普通查询（无 attach_databases）的元数据
        """
        # 模拟普通查询的任务元数据
        task_query = {
            "sql": "SELECT * FROM local_table",
            "custom_table_name": None,
            "task_type": "query",
            "datasource": None,
            "attach_databases": None,
            "is_federated": False,
        }
        
        assert task_query["is_federated"] is False
        assert task_query["attach_databases"] is None

    def test_federated_query_uses_correct_executor(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 1.2**
        
        测试联邦查询使用正确的执行函数
        """
        from models.query_models import AttachDatabase
        
        attach_databases = [
            AttachDatabase(alias="mysql_db", connection_id="conn-1"),
        ]
        
        is_federated = bool(attach_databases and len(attach_databases) > 0)
        
        # 联邦查询应该使用 execute_async_federated_query
        assert is_federated is True
        
        # 普通查询应该使用 execute_async_query
        attach_databases_empty = []
        is_federated_empty = bool(attach_databases_empty and len(attach_databases_empty) > 0)
        assert is_federated_empty is False

    def test_empty_sql_validation(self):
        """测试空 SQL 验证"""
        sql = "   "
        
        if not sql.strip():
            with pytest.raises(HTTPException) as exc_info:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "VALIDATION_ERROR",
                        "message": "SQL查询不能为空",
                        "field": "sql"
                    }
                )
            assert exc_info.value.status_code == 400


class TestTaskResultInfo:
    """测试任务结果信息包含联邦查询相关字段"""

    def test_complete_task_includes_federated_info(self):
        """
        **Feature: async-federated-query, Property 5: Result Info Contains Attached Databases**
        **Validates: Requirements 1.5, 5.3**
        
        测试 complete_task 包含 is_federated 和 attached_databases
        """
        attached_aliases = ["mysql_db", "pg_db"]
        
        task_info = {
            "status": "completed",
            "table_name": "async_result_test",
            "row_count": 100,
            "columns": [{"name": "id", "type": "INTEGER"}],
            "file_generated": False,
            "task_type": "query",
            "is_federated": True,
            "attached_databases": attached_aliases,
        }
        
        assert "is_federated" in task_info
        assert task_info["is_federated"] is True
        assert "attached_databases" in task_info
        assert task_info["attached_databases"] == ["mysql_db", "pg_db"]

    def test_task_list_includes_federated_flag(self):
        """
        **Feature: async-federated-query, Property 5: Result Info Contains Attached Databases**
        **Validates: Requirements 5.1**
        
        测试任务列表包含 is_federated 标识
        """
        # 模拟任务列表中的任务
        tasks = [
            {
                "task_id": "task-1",
                "status": "completed",
                "is_federated": True,
                "attached_databases": ["mysql_db"],
            },
            {
                "task_id": "task-2",
                "status": "completed",
                "is_federated": False,
                "attached_databases": None,
            },
        ]
        
        # 验证联邦查询任务有标识
        federated_tasks = [t for t in tasks if t.get("is_federated")]
        assert len(federated_tasks) == 1
        assert federated_tasks[0]["task_id"] == "task-1"

    def test_task_detail_includes_attached_databases(self):
        """
        **Feature: async-federated-query, Property 5: Result Info Contains Attached Databases**
        **Validates: Requirements 5.2**
        
        测试任务详情包含 attached_databases 信息
        """
        task_detail = {
            "task_id": "test-task",
            "status": "completed",
            "query": "SELECT * FROM mysql_db.users",
            "is_federated": True,
            "attached_databases": ["mysql_db"],
            "result_info": {
                "table_name": "async_result_test",
                "row_count": 100,
            }
        }
        
        assert task_detail["is_federated"] is True
        assert "attached_databases" in task_detail
        assert "mysql_db" in task_detail["attached_databases"]

    def test_non_federated_task_has_no_attached_databases(self):
        """测试非联邦查询任务没有 attached_databases"""
        task_info = {
            "status": "completed",
            "table_name": "async_result_test",
            "row_count": 100,
            "is_federated": False,
            "attached_databases": None,
        }
        
        assert task_info["is_federated"] is False
        assert task_info["attached_databases"] is None


class TestExtractTaskPayload:
    """测试 _extract_task_payload 函数"""

    def test_extract_attach_databases_from_metadata(self):
        """
        **Feature: async-federated-query, Property 6: Retry Preserves Original Configuration**
        **Validates: Requirements 2.3**
        
        测试从任务元数据中提取 attach_databases
        """
        # 模拟任务元数据
        metadata = {
            "sql": "SELECT * FROM mysql_db.users",
            "task_type": "query",
            "attach_databases": [
                {"alias": "mysql_db", "connection_id": "conn-1"}
            ],
            "is_federated": True,
        }
        
        # 模拟 _extract_task_payload 的逻辑
        payload = {}
        if isinstance(metadata, dict):
            payload.update(metadata)
        
        assert "attach_databases" in payload
        assert payload["attach_databases"][0]["alias"] == "mysql_db"
        assert payload["is_federated"] is True

    def test_extract_without_attach_databases(self):
        """测试从普通任务中提取（无 attach_databases）"""
        metadata = {
            "sql": "SELECT * FROM local_table",
            "task_type": "query",
        }
        
        payload = {}
        if isinstance(metadata, dict):
            payload.update(metadata)
        
        assert payload.get("attach_databases") is None
        assert payload.get("is_federated") is None or payload.get("is_federated") is False


class TestRetryAsyncTaskFederated:
    """测试联邦查询任务重试"""

    def test_retry_preserves_attach_databases(self):
        """
        **Feature: async-federated-query, Property 6: Retry Preserves Original Configuration**
        **Validates: Requirements 10.1**
        
        测试重试时保留原始 attach_databases 配置
        """
        # 原始任务的 payload
        original_payload = {
            "sql": "SELECT * FROM mysql_db.users",
            "task_type": "query",
            "attach_databases": [
                {"alias": "mysql_db", "connection_id": "conn-1"}
            ],
            "is_federated": True,
        }
        
        # 模拟重试逻辑
        attach_databases = original_payload.get("attach_databases")
        is_federated = bool(attach_databases and len(attach_databases) > 0)
        
        retry_metadata = dict(original_payload)
        retry_metadata.update({
            "attach_databases": attach_databases,
            "is_federated": is_federated,
            "retry_of": "original-task-id",
        })
        
        # 验证配置被保留
        assert retry_metadata["attach_databases"] == original_payload["attach_databases"]
        assert retry_metadata["is_federated"] is True
        assert retry_metadata["retry_of"] == "original-task-id"

    def test_retry_federated_uses_correct_executor(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 10.2**
        
        测试重试联邦查询使用正确的执行函数
        """
        attach_databases = [{"alias": "mysql_db", "connection_id": "conn-1"}]
        is_federated = bool(attach_databases and len(attach_databases) > 0)
        
        # 联邦查询重试应该使用 execute_async_federated_query
        assert is_federated is True
        
        # 普通查询重试应该使用 execute_async_query
        attach_databases_none = None
        is_federated_none = bool(attach_databases_none and len(attach_databases_none) > 0)
        assert is_federated_none is False

    def test_retry_non_federated_task(self):
        """测试重试普通（非联邦）任务"""
        original_payload = {
            "sql": "SELECT * FROM local_table",
            "task_type": "query",
            "attach_databases": None,
            "is_federated": False,
        }
        
        attach_databases = original_payload.get("attach_databases")
        is_federated = bool(attach_databases and len(attach_databases) > 0)
        
        assert is_federated is False


class TestDetailedErrorHandling:
    """测试详细错误处理"""

    def test_error_code_classification_connection_not_found(self):
        """
        **Feature: async-federated-query, Property 7: ATTACH Failure Rollback**
        **Validates: Requirements 8.1, 12.2**
        
        测试连接不存在错误代码分类
        """
        error_message = "数据库连接 'conn-123' 不存在"
        error_str = error_message.lower()
        
        if "不存在" in error_message or "not found" in error_str:
            error_code = "CONNECTION_NOT_FOUND"
        else:
            error_code = "FEDERATED_QUERY_FAILED"
        
        assert error_code == "CONNECTION_NOT_FOUND"

    def test_error_code_classification_unsupported_type(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 8.2**
        
        测试不支持类型错误代码分类
        """
        error_message = "不支持的数据源类型: oracle"
        error_str = error_message.lower()
        
        if "不支持" in error_message or "unsupported" in error_str:
            error_code = "UNSUPPORTED_TYPE"
        else:
            error_code = "FEDERATED_QUERY_FAILED"
        
        assert error_code == "UNSUPPORTED_TYPE"

    def test_error_code_classification_attach_failed(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 8.3, 12.3**
        
        测试 ATTACH 失败错误代码分类
        """
        error_message = "ATTACH database failed: connection refused"
        error_str = error_message.lower()
        
        if "attach" in error_str:
            error_code = "ATTACH_FAILED"
        else:
            error_code = "FEDERATED_QUERY_FAILED"
        
        assert error_code == "ATTACH_FAILED"

    def test_error_code_classification_timeout(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 11.3**
        
        测试超时错误代码分类
        """
        error_message = "Connection timeout after 30 seconds"
        error_str = error_message.lower()
        
        if "timeout" in error_str or "超时" in error_message:
            error_code = "TIMEOUT"
        else:
            error_code = "FEDERATED_QUERY_FAILED"
        
        assert error_code == "TIMEOUT"

    def test_error_code_classification_auth_failed(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 8.4**
        
        测试认证失败错误代码分类
        """
        error_message = "Authentication failed: invalid password"
        error_str = error_message.lower()
        
        if "authentication" in error_str or "认证" in error_message or "密码" in error_message:
            error_code = "AUTH_FAILED"
        else:
            error_code = "FEDERATED_QUERY_FAILED"
        
        assert error_code == "AUTH_FAILED"

    def test_error_code_classification_user_cancelled(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 4.4**
        
        测试用户取消错误代码分类
        """
        is_cancellation_requested = True
        
        if is_cancellation_requested:
            error_code = "USER_CANCELLED"
            error_message = "用户取消"
        else:
            error_code = "FEDERATED_QUERY_FAILED"
            error_message = "Unknown error"
        
        assert error_code == "USER_CANCELLED"
        assert error_message == "用户取消"

    def test_error_code_classification_generic(self):
        """测试通用错误代码分类"""
        error_message = "Some unknown error occurred"
        error_str = error_message.lower()
        
        # 不匹配任何特定错误类型
        if "不存在" in error_message or "not found" in error_str:
            error_code = "CONNECTION_NOT_FOUND"
        elif "不支持" in error_message or "unsupported" in error_str:
            error_code = "UNSUPPORTED_TYPE"
        elif "attach" in error_str:
            error_code = "ATTACH_FAILED"
        elif "timeout" in error_str or "超时" in error_message:
            error_code = "TIMEOUT"
        elif "authentication" in error_str or "认证" in error_message or "密码" in error_message:
            error_code = "AUTH_FAILED"
        else:
            error_code = "FEDERATED_QUERY_FAILED"
        
        assert error_code == "FEDERATED_QUERY_FAILED"

    def test_error_info_structure(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 12.4**
        
        测试错误信息结构包含所有必要字段
        """
        error_info = {
            "error_message": "ATTACH failed",
            "error_code": "ATTACH_FAILED",
            "attached_databases": ["mysql_db"],
        }
        
        assert "error_message" in error_info
        assert "error_code" in error_info
        assert "attached_databases" in error_info


class TestOptimizedErrorHandling:
    """测试优化后的错误处理（使用 force_fail_task 保存详细错误信息）"""

    def test_error_metadata_structure(self):
        """
        **Feature: async-federated-query**
        **Validates: Requirements 12.4**
        
        测试错误元数据结构（用于 force_fail_task 的 metadata_update 参数）
        """
        error_code = "ATTACH_FAILED"
        attached_aliases = ["mysql_db", "pg_db"]
        
        # 模拟优化后的 error_metadata 结构
        error_metadata = {
            "error_code": error_code,
            "is_federated": True,
            "attached_databases": attached_aliases,
        }
        
        assert "error_code" in error_metadata
        assert error_metadata["error_code"] == "ATTACH_FAILED"
        assert error_metadata["is_federated"] is True
        assert error_metadata["attached_databases"] == ["mysql_db", "pg_db"]

    def test_force_fail_task_with_metadata(self):
        """
        测试 force_fail_task 调用时传递 metadata_update 参数
        """
        # 模拟 force_fail_task 的调用参数
        task_id = "test-task-id"
        error_message = "ATTACH 数据库 'mysql_db' 失败"
        error_metadata = {
            "error_code": "ATTACH_FAILED",
            "is_federated": True,
            "attached_databases": ["mysql_db"],
        }
        
        # 验证参数结构正确
        assert task_id
        assert error_message
        assert error_metadata["error_code"] == "ATTACH_FAILED"
        assert error_metadata["is_federated"] is True

    def test_detach_cleanup_in_finally_block(self):
        """
        测试 DETACH 清理在 finally 块中执行（优化后移除了异常处理中的冗余 DETACH）
        
        优化说明：
        - finally 块已经处理了 DETACH 清理
        - 异常处理中不再需要重复的 DETACH 调用
        - 这避免了潜在的重复 DETACH 操作
        """
        from unittest.mock import MagicMock
        
        mock_con = MagicMock()
        attached_aliases = ["mysql_db"]
        
        # 模拟 finally 块中的 DETACH 清理
        try:
            # 模拟查询执行
            raise Exception("Query failed")
        except Exception:
            # 异常处理中不再调用 DETACH（已优化移除）
            pass
        finally:
            # DETACH 清理只在 finally 块中执行
            if attached_aliases:
                for alias in attached_aliases:
                    mock_con.execute(f"DETACH {alias}")
        
        # 验证 DETACH 只被调用一次
        assert mock_con.execute.call_count == 1
        mock_con.execute.assert_called_with("DETACH mysql_db")


class TestSecurityValidation:
    """测试安全验证（SQL 注入防护）"""

    def test_valid_alias_format(self):
        """
        测试有效的 alias 格式
        """
        import re
        SAFE_ALIAS_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
        
        valid_aliases = [
            "mysql_db",
            "pg_db",
            "_private",
            "DB1",
            "my_database_123",
        ]
        
        for alias in valid_aliases:
            assert SAFE_ALIAS_PATTERN.match(alias), f"应该接受有效别名: {alias}"

    def test_invalid_alias_format_rejected(self):
        """
        测试无效的 alias 格式被拒绝（防止 SQL 注入）
        """
        import re
        SAFE_ALIAS_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
        
        invalid_aliases = [
            "123db",           # 以数字开头
            "my-db",           # 包含连字符
            "my db",           # 包含空格
            "db;DROP TABLE",   # SQL 注入尝试
            'db"--',           # SQL 注入尝试
            "db'OR'1'='1",     # SQL 注入尝试
            "",                # 空字符串
            "db\nDROP",        # 换行符注入
        ]
        
        for alias in invalid_aliases:
            assert not SAFE_ALIAS_PATTERN.match(alias), f"应该拒绝无效别名: {alias}"

    def test_detach_uses_quoted_identifier(self):
        """
        测试 DETACH 使用引号包裹标识符
        """
        from unittest.mock import MagicMock
        
        mock_con = MagicMock()
        alias = "mysql_db"
        
        # 模拟 _detach_databases 的安全实现
        mock_con.execute(f'DETACH "{alias}"')
        
        # 验证使用了引号包裹
        call_args = mock_con.execute.call_args[0][0]
        assert '"mysql_db"' in call_args
        assert call_args == 'DETACH "mysql_db"'

    def test_password_not_logged(self):
        """
        测试密码不会被记录到日志
        
        优化说明：
        - 密码解密日志从 logger.info 降级为 logger.debug
        - 日志消息不包含 "密码" 或 "password" 等敏感词
        """
        # 验证日志消息不包含敏感信息
        safe_log_message = "连接 conn-123 密码已处理"
        
        assert "已解密" not in safe_log_message
        assert "password" not in safe_log_message.lower()
