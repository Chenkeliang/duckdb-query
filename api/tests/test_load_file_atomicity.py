"""load_file_to_duckdb / _load_json_file_as_variant：重新导入失败不能丢已有表。

回归背景：旧实现是先无条件 DROP TABLE IF EXISTS，再尝试原生读取，失败则回退
pandas；如果原生和 pandas 两条路都失败（比如"刷新"一个已存在的文件数据源时，
磁盘上的文件已经损坏/被替换成了无法解析的内容），目标表已经被删了、新表没建
成，数据永久丢失。修复后全程建到一张 staging 表，两条路都失败时目标表完全
不会被触碰。
"""

import os
import tempfile

import duckdb
import pytest

from core.data.file_utils import _load_json_file_as_variant, load_file_to_duckdb


@pytest.fixture
def con():
    connection = duckdb.connect()
    yield connection
    connection.close()


def _write_temp(suffix: str, content: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(content)
        return handle.name


class TestLoadFileToDuckdbAtomicity:
    def test_successful_refresh_replaces_data(self, con):
        """基本场景：正常刷新，新数据确实替换了旧数据。"""
        path1 = _write_temp(".csv", b"id,name\n1,old\n2,old2\n")
        path2 = _write_temp(".csv", b"id,name\n1,new\n")
        try:
            load_file_to_duckdb(con, "refresh_test", path1, "csv")
            assert con.execute("SELECT COUNT(*) FROM refresh_test").fetchone()[0] == 2

            load_file_to_duckdb(con, "refresh_test", path2, "csv")
            rows = con.execute("SELECT * FROM refresh_test").fetchall()
            assert rows == [("1", "new")]
        finally:
            os.unlink(path1)
            os.unlink(path2)

    def test_both_readers_failing_preserves_existing_table(self, con):
        """核心回归：原生 + pandas 都解析失败时，已有表必须原封不动。

        先用一段合法 CSV 建表，再用一个"刷新"操作去覆盖它——但"刷新"传入的是
        parquet 类型 + 纯随机字节：DuckDB 和 pandas/pyarrow 对 parquet 的
        magic bytes 校验都很严格，纯垃圾字节两条路都会确定性失败（不像 CSV，
        垃圾字节在 all_varchar 场景下反而可能被"成功"解析成乱码列，测不出
        "两条路都失败"这个场景）。
        """
        good_parquet_path = _write_temp(".csv", b"id,name\n1,keepme\n2,keepme2\n")
        garbage_parquet_path = _write_temp(".parquet", os.urandom(256))
        try:
            load_file_to_duckdb(con, "atomic_test", good_parquet_path, "csv")
            before = con.execute("SELECT * FROM atomic_test ORDER BY id").fetchall()
            assert before == [("1", "keepme"), ("2", "keepme2")]

            with pytest.raises(Exception):
                load_file_to_duckdb(con, "atomic_test", garbage_parquet_path, "parquet")

            after = con.execute("SELECT * FROM atomic_test ORDER BY id").fetchall()
            assert after == before  # 表完全没变
        finally:
            os.unlink(good_parquet_path)
            os.unlink(garbage_parquet_path)

    def test_failure_leaves_no_orphaned_staging_table(self, con):
        garbage_path = _write_temp(".parquet", os.urandom(256))
        try:
            with pytest.raises(Exception):
                load_file_to_duckdb(con, "never_created", garbage_path, "parquet")

            tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
            assert not any(name.startswith("__stage_") for name in tables)
            assert "never_created" not in tables
        finally:
            os.unlink(garbage_path)

    def test_first_time_creation_failure_leaves_nothing_behind(self, con):
        """目标表原本就不存在时失败：不留残表，也不误创建空表。"""
        garbage_path = _write_temp(".parquet", os.urandom(256))
        try:
            with pytest.raises(Exception):
                load_file_to_duckdb(con, "brand_new_table", garbage_path, "parquet")
            tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
            assert "brand_new_table" not in tables
        finally:
            os.unlink(garbage_path)


class TestLoadJsonVariantAtomicity:
    def test_successful_refresh_replaces_data(self, con):
        path1 = _write_temp(".json", b'[{"a": 1}, {"a": 2}]')
        path2 = _write_temp(".json", b'[{"a": 99}]')
        try:
            load_file_to_duckdb(con, "variant_refresh", path1, "json", import_mode="variant")
            assert con.execute("SELECT COUNT(*) FROM variant_refresh").fetchone()[0] == 2

            load_file_to_duckdb(con, "variant_refresh", path2, "json", import_mode="variant")
            assert con.execute("SELECT COUNT(*) FROM variant_refresh").fetchone()[0] == 1
        finally:
            os.unlink(path1)
            os.unlink(path2)

    def test_malformed_json_preserves_existing_table(self, con):
        """核心回归：JSON 解析失败（语法错误，read_json_auto 直接报错）时，
        已有表必须原封不动。"""
        good_path = _write_temp(".json", b'[{"a": 1}, {"a": 2}]')
        malformed_path = _write_temp(".json", b"{not valid json at all!!!")
        try:
            load_file_to_duckdb(con, "variant_atomic", good_path, "json", import_mode="variant")
            before = con.execute("SELECT COUNT(*) FROM variant_atomic").fetchone()[0]
            assert before == 2

            with pytest.raises(Exception):
                _load_json_file_as_variant(con, "variant_atomic", malformed_path, "json")

            after = con.execute("SELECT COUNT(*) FROM variant_atomic").fetchone()[0]
            assert after == before
        finally:
            os.unlink(good_path)
            os.unlink(malformed_path)

    def test_failure_leaves_no_orphaned_staging_tables(self, con):
        malformed_path = _write_temp(".json", b"{not valid json at all!!!")
        try:
            with pytest.raises(Exception):
                _load_json_file_as_variant(con, "never_created_variant", malformed_path, "json")
            tables = [r[0] for r in con.execute("SHOW TABLES").fetchall()]
            assert not any(
                name.startswith("__json_variant_raw_") or name.startswith("__json_variant_stage_")
                for name in tables
            )
        finally:
            os.unlink(malformed_path)
