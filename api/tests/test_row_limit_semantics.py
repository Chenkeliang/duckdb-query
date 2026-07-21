"""行数范围(全量/限制)产品语义端到端验收(复审终版)。

语义:max_query_rows 是"用户未写最外层 LIMIT 时的默认值",不是硬上限。
- 异步/导出 未勾选(默认):不加系统 LIMIT,尊重用户自带 LIMIT(全量≠删用户 LIMIT);
- 勾选:最外层缺 LIMIT 时补默认;用户写了 5000/12000 都用用户值;
- retry 保留原任务选择;异步下载/export-to-path 直接导任务结果表,不再碰 LIMIT;
- 生成式 SQL(JOIN/SET/Pivot)内部不加系统行数 LIMIT,只允许最外层。
"""
from unittest.mock import patch

import pytest

pytest.importorskip("httpx")

from fastapi.testclient import TestClient

from core.database.duckdb_engine import with_duckdb_connection
from main import app

client = TestClient(app)


# ---------- 验收 #4/#5/#6/#7(提交链路):apply_row_limit 显式透传,不猜测 ----------

def test_async_submit_threads_apply_row_limit_positional():
    """POST /api/async-tasks 的 apply_row_limit 按位置实参透传给后台执行函数。
    默认 False(全量);勾选 True。TestClient 会在响应后执行 background 任务。"""
    with patch("routers.async_tasks.execute_async_query") as mock_exec:
        r = client.post("/api/async-tasks", json={"sql": "SELECT * FROM range(10)"})
        assert r.status_code == 200, r.text
        args = mock_exec.call_args.args
        # (task_id, sql, custom_table_name, task_type, datasource, overwrite, apply_row_limit)
        assert args[1] == "SELECT * FROM range(10)"
        assert args[6] is False  # 默认全量

    with patch("routers.async_tasks.execute_async_query") as mock_exec:
        r = client.post(
            "/api/async-tasks",
            json={"sql": "SELECT * FROM range(10)", "apply_row_limit": True},
        )
        assert r.status_code == 200, r.text
        assert mock_exec.call_args.args[6] is True


# ---------- 验收 #8:retry 保留原任务的行数选择 ----------

def test_async_retry_preserves_apply_row_limit():
    with patch("routers.async_tasks.execute_async_query") as mock_exec:
        r = client.post(
            "/api/async-tasks",
            json={"sql": "SELECT * FROM range(10)", "apply_row_limit": True},
        )
        task_id = r.json()["data"]["task_id"]

    with patch("routers.async_tasks.execute_async_query") as mock_exec:
        r = client.post(f"/api/async-tasks/{task_id}/retry", json={})
        assert r.status_code == 200, r.text
        # retry 走 kwargs(overwrite=True, apply_row_limit=…)
        assert mock_exec.call_args.kwargs.get("apply_row_limit") is True


# ---------- 验收 #15/#16:服务端导出按显式选择执行(真实 COPY) ----------

class TestServerExportRowLimit:
    TABLE = "qa_export_rows"

    @classmethod
    def setup_class(cls):
        with with_duckdb_connection() as con:
            con.execute(
                f'CREATE OR REPLACE TABLE "{cls.TABLE}" AS SELECT * FROM range(2000) t(n)'
            )

    @classmethod
    def teardown_class(cls):
        with with_duckdb_connection() as con:
            con.execute(f'DROP TABLE IF EXISTS "{cls.TABLE}"')

    @staticmethod
    def _export(sql: str, **extra) -> int:
        r = client.post(
            "/api/query-results/export",
            json={"sql": sql, "format": "csv", **extra},
        )
        assert r.status_code == 200, r.text
        return int(r.json()["data"]["row_count_estimate"])

    def test_default_full_no_system_limit(self):
        # 未勾选(默认):全量 2000 行
        assert self._export(f'SELECT * FROM "{self.TABLE}"') == 2000

    def test_full_respects_user_limit(self):
        # 全量 ≠ 删用户 LIMIT:用户写 100 导 100
        assert self._export(f'SELECT * FROM "{self.TABLE}" LIMIT 100') == 100

    def test_limited_applies_default_when_missing(self):
        with patch("core.common.config_manager.config_manager") as mgr:
            mgr.get_app_config.return_value.max_query_rows = 500
            assert (
                self._export(f'SELECT * FROM "{self.TABLE}"', apply_row_limit=True)
                == 500
            )

    def test_limited_uses_user_limit_not_cap(self):
        # 默认值是兜底,不是硬上限:用户 1200 > 默认 500 仍导 1200
        with patch("core.common.config_manager.config_manager") as mgr:
            mgr.get_app_config.return_value.max_query_rows = 500
            assert (
                self._export(
                    f'SELECT * FROM "{self.TABLE}" LIMIT 1200', apply_row_limit=True
                )
                == 1200
            )
            assert (
                self._export(
                    f'SELECT * FROM "{self.TABLE}" LIMIT 100', apply_row_limit=True
                )
                == 100
            )


# ---------- 验收 #11:SET 各分支无系统 LIMIT,仅最终外层一次 ----------

def test_set_operation_branches_have_no_system_limit():
    from core.services.set_operation_generator import generate_set_operation_sql
    from models.set_operation_models import (
        SetOperationConfig,
        SetOperationType,
        TableConfig,
    )

    config = SetOperationConfig(
        operation_type=SetOperationType.UNION_ALL,
        use_by_name=True,
        tables=[
            TableConfig(table_name="t1", selected_columns=[]),
            TableConfig(table_name="t2", selected_columns=[]),
        ],
    )
    base = generate_set_operation_sql(config)
    assert "LIMIT" not in base.upper()  # 基础 SQL(路由 generate 用)零 LIMIT

    preview = generate_set_operation_sql(config, preview_limit=100)
    assert preview.upper().count("LIMIT") == 1  # 预览仅最外层一次
    assert preview.rstrip().upper().endswith("LIMIT 100")


# ---------- 验收 #12:Pivot 生成的最终 SQL 无行数 LIMIT(列上限探测另套规则) ----------

def test_pivot_final_sql_has_no_row_limit():
    from unittest.mock import Mock

    from core.services.pivot_query_generator import generate_pivot_query_sql
    from models.pivot_query_models import (
        AggregationFunction,
        PivotConfig,
        PivotQueryConfig,
        PivotValueConfig,
    )

    config = PivotQueryConfig(table_name="sales", filters=[])
    pivot_config = PivotConfig(
        rows=["region"],
        columns=["year"],
        values=[PivotValueConfig(column="amt", aggregation=AggregationFunction.SUM)],
        manual_column_values=["2022", "2023"],
    )
    with patch("core.services.pivot_query_generator.config_manager") as mgr:
        mgr.get_app_config.return_value = Mock(
            enable_pivot_tables=True, pivot_table_extension="pivot_table"
        )
        result = generate_pivot_query_sql(config, pivot_config=pivot_config)
    assert "LIMIT" not in result.final_sql.upper()
    assert "LIMIT" not in result.base_sql.upper()


# ---------- 验收 #25:Excel 预览列名与正式导入同一套去重(含大小写) ----------

def test_excel_preview_headers_match_import_dedup():
    from core.data.excel_import_manager import (
        _build_preview_from_rows,
        ensure_unique_columns,
    )

    from core.data.excel_import_manager import sanitize_identifier

    headers = ["id", "ID", "name", "id"]
    columns, preview = _build_preview_from_rows([headers, [1, 2, "a", 3]])
    preview_names = [c["name"] for c in columns]
    # 与导入路径同一管线(sanitize + 去重)
    expected = ensure_unique_columns(
        [sanitize_identifier(h, allow_leading_digit=True, prefix="col") for h in headers]
    )
    assert preview_names == expected == ["id", "ID_1", "name", "id_2"]
    assert preview[0] == {"id": 1, "ID_1": 2, "name": "a", "id_2": 3}

    # 特殊字符/空格/前导数字表头:预览列名 == 导入落表列名(同一 sanitize+去重,复审:Excel 规范化)
    headers2 = ["order id", "order id", "1abc", "总 金额"]
    columns2, preview2 = _build_preview_from_rows([headers2, [1, 2, 3, 4]])
    names2 = [c["name"] for c in columns2]
    expected2 = ensure_unique_columns(
        [sanitize_identifier(h, allow_leading_digit=True, prefix="col") for h in headers2]
    )
    assert names2 == expected2 == ["order_id", "order_id_1", "1abc", "总_金额"]
    assert preview2[0] == {"order_id": 1, "order_id_1": 2, "1abc": 3, "总_金额": 4}
