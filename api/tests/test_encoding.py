import os
import shutil
import tempfile
import pytest
import pandas as pd
from core.data.file_utils import read_file_by_type

class TestEncodingDetection:
    def setup_method(self):
        self.test_dir = tempfile.mkdtemp()

    def teardown_method(self):
        shutil.rmtree(self.test_dir)

    def create_csv(self, filename, content, encoding):
        path = os.path.join(self.test_dir, filename)
        with open(path, 'w', encoding=encoding) as f:
            f.write(content)
        return path

    def test_utf8_csv(self):
        """Test reading standard UTF-8 CSV"""
        content = "col1,col2\n你好,world\n测试,test"
        path = self.create_csv("utf8.csv", content, "utf-8")
        
        df = read_file_by_type(path, "csv")
        assert df.iloc[0, 0] == "你好"
        assert df.iloc[1, 0] == "测试"

    def test_gbk_csv(self):
        """Test reading GBK encoded CSV (common in Chinese environments)"""
        # GBK: 你好 in hex is C4 E3 BA C3
        content = "col1,col2\n你好,world\n测试,test"
        path = self.create_csv("gbk.csv", content, "gbk")
        
        df = read_file_by_type(path, "csv")
        assert df.iloc[0, 0] == "你好"
        assert df.iloc[1, 0] == "测试"

    def test_gb18030_pro_csv(self):
        """Test GB18030 specific characters"""
        # 㑳 (Uncommon Chinese char, likely GB18030)
        content = "col1\n㑳"
        path = self.create_csv("gb18030.csv", content, "gb18030")
        
        df = read_file_by_type(path, "csv")
        assert df.iloc[0, 0] == "㑳"

    def test_latin1_csv(self):
        """Test Latin-1 fallback for binary-like or western text"""
        content = "col1,col2\nRésume,Café"
        path = self.create_csv("latin1.csv", content, "latin-1")

        df = read_file_by_type(path, "csv")
        assert df.iloc[0, 0] == "Résume"
        assert df.iloc[0, 1] == "Café"

    def test_detect_fallback_returns_duckdb_supported_encoding(self, monkeypatch):
        """charset_normalizer 失败时的 gb 兜底必须返回 DuckDB 认识的 GB18030（不是 GBK）"""
        import charset_normalizer
        from core.data.file_utils import _detect_csv_encoding

        path = os.path.join(self.test_dir, "fallback.csv")
        with open(path, "wb") as f:
            f.write("col1\n你好\n".encode("gb18030"))

        monkeypatch.setattr(charset_normalizer, "from_bytes", lambda *_a, **_k: None)
        assert _detect_csv_encoding(path) == "GB18030"

    def test_explicit_encoding_overrides_detection(self):
        """显式指定编码时跳过探测——BIG5 小样本自动探测会误判"""
        path = os.path.join(self.test_dir, "big5.csv")
        with open(path, "wb") as f:
            f.write("名稱,數量\n龍騰,3\n鳳舞,7\n".encode("big5"))

        df = read_file_by_type(path, "csv", encoding="BIG5")
        assert df.iloc[0, 0] == "龍騰"
        assert df.iloc[1, 0] == "鳳舞"

    def test_latin1_family_loads_correctly_end_to_end(self):
        """latin-1 系文件（探测可能落到 CP1250/CP1252 等亲戚编码）落库后内容必须正确"""
        import duckdb
        from core.data.file_utils import load_file_to_duckdb

        path = os.path.join(self.test_dir, "latin1_load.csv")
        with open(path, "wb") as f:
            f.write("name,v\nCafé,1\nRésumé,2\n".encode("latin-1"))

        con = duckdb.connect()
        try:
            load_file_to_duckdb(con, "t_latin1", path, "csv")
            rows = con.execute('SELECT name FROM "t_latin1" ORDER BY name').fetchall()
            assert [r[0] for r in rows] == ["Café", "Résumé"]
        finally:
            con.close()

    def test_big5_forced_to_pandas_path(self):
        """DuckDB 原生 BIG5 解码错乱（不报错）——必须强制 pandas，防静默坏数据"""
        import duckdb
        from core.data.file_utils import load_file_to_duckdb

        path = os.path.join(self.test_dir, "big5_load.csv")
        with open(path, "wb") as f:
            f.write("名稱,數量\n龍騰,3\n鳳舞,7\n".encode("big5"))

        con = duckdb.connect()
        try:
            result = load_file_to_duckdb(
                con, "t_big5", path, "csv", reader_options={"encoding": "BIG5"}
            )
            assert result["engine"] == "pandas"
            rows = con.execute('SELECT * FROM "t_big5" ORDER BY 1').fetchall()
            assert [r[0] for r in rows] == ["鳳舞", "龍騰"]
        finally:
            con.close()
