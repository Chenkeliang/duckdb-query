"""CSV 编码全链路：探测 → 原生读取 / UTF-8 转码兜底 → 表内容正确。

v1.2.1 起 pandas 兜底退役，统一为"转码 UTF-8 → DuckDB 原生 reader"。
断言口径不变：真实文件落库后的内容逐字符正确（防静默乱码）。
"""

import os
import shutil
import tempfile

import duckdb

from core.data.file_utils import (
    _detect_csv_encoding,
    detect_text_encoding,
    load_file_to_duckdb,
    transcode_to_utf8,
)


class TestEncodingDetection:
    def setup_method(self):
        self.test_dir = tempfile.mkdtemp()

    def teardown_method(self):
        shutil.rmtree(self.test_dir)

    def create_csv(self, filename, content, encoding):
        path = os.path.join(self.test_dir, filename)
        with open(path, "w", encoding=encoding) as f:
            f.write(content)
        return path

    def _load_and_read(self, path, table, reader_options=None):
        con = duckdb.connect()
        try:
            result = load_file_to_duckdb(
                con, table, path, "csv", reader_options=reader_options
            )
            rows = con.execute(f'SELECT * FROM "{table}" ORDER BY 1').fetchall()
            return result, rows
        finally:
            con.close()

    def test_utf8_csv(self):
        path = self.create_csv("utf8.csv", "col1,col2\n你好,world\n测试,test", "utf-8")
        _, rows = self._load_and_read(path, "t_utf8")
        assert {r[0] for r in rows} == {"你好", "测试"}

    def test_gbk_csv(self):
        """GBK（中文环境常见）：真实长度样本下探测应给 GB18030，内容逐字正确。

        探测是统计性的：几个字的极小样本 GBK/BIG5 天然不可分（字节空间重叠），
        极小文件请用显式编码（UI 高级选项），见 explicit 用例。"""
        lines = ["城市,销售额,备注"] + [
            f"上海市浦东新区,{i},第{i}季度销售数据统计汇总表" for i in range(1, 21)
        ]
        path = self.create_csv("gbk.csv", "\n".join(lines), "gbk")
        _, rows = self._load_and_read(path, "t_gbk")
        assert rows[0][0] == "上海市浦东新区"
        assert rows[0][2].startswith("第")

    def test_gb18030_pro_csv(self):
        """GB18030 特有字符（㑳）在显式编码下全链路存活。

        单字符文件在统计探测上 GB18030/BIG5HKSCS 不可分，此处验证的保证是
        "指定 GB18030 时四字节区字符逐位正确"，自动探测的极小样本限制同
        test_gbk_csv 说明。"""
        path = self.create_csv("gb18030.csv", "col1\n㑳", "gb18030")
        _, rows = self._load_and_read(
            path, "t_gb18030", reader_options={"encoding": "GB18030"}
        )
        assert rows[0][0] == "㑳"

    def test_latin1_csv(self):
        path = self.create_csv("latin1.csv", "col1,col2\nRésume,Café", "latin-1")
        _, rows = self._load_and_read(path, "t_latin1_basic")
        assert rows[0][0] == "Résume"
        assert rows[0][1] == "Café"

    def test_detect_fallback_returns_duckdb_supported_encoding(self, monkeypatch):
        """charset_normalizer 失败时的 gb 兜底必须返回 DuckDB 认识的 GB18030（不是 GBK）"""
        import charset_normalizer

        path = os.path.join(self.test_dir, "fallback.csv")
        with open(path, "wb") as f:
            f.write("col1\n你好\n".encode("gb18030"))

        monkeypatch.setattr(charset_normalizer, "from_bytes", lambda *_a, **_k: None)
        assert _detect_csv_encoding(path) == "GB18030"

    def test_explicit_encoding_transcodes_correctly(self):
        """显式指定编码时跳过探测——BIG5 小样本自动探测会误判"""
        path = os.path.join(self.test_dir, "big5.csv")
        with open(path, "wb") as f:
            f.write("名稱,數量\n龍騰,3\n鳳舞,7\n".encode("big5"))

        utf8_path = transcode_to_utf8(path, encoding="BIG5")
        try:
            with open(utf8_path, encoding="utf-8") as f:
                text = f.read()
            assert "龍騰" in text and "鳳舞" in text
        finally:
            os.remove(utf8_path)

    def test_detect_text_encoding_explicit_alias(self):
        """DuckDB 拼写（UTF-16LE 等）显式传入时映射到 Python codec"""
        path = self.create_csv("u16.csv", "col1\nabc", "utf-16-le")
        assert detect_text_encoding(path, explicit="UTF-16LE") == "utf-16-le"

    def test_latin1_family_loads_correctly_end_to_end(self):
        """latin-1 系文件（探测可能落到 CP1250/CP1252 等亲戚编码）落库后内容必须正确"""
        path = os.path.join(self.test_dir, "latin1_load.csv")
        with open(path, "wb") as f:
            f.write("name,v\nCafé,1\nRésumé,2\n".encode("latin-1"))

        _, rows = self._load_and_read(path, "t_latin1")
        assert [r[0] for r in rows] == ["Café", "Résumé"]

    def test_big5_forced_to_transcode_path(self):
        """DuckDB 原生 BIG5 解码错乱（不报错）——必须强制转码兜底，防静默坏数据"""
        path = os.path.join(self.test_dir, "big5_load.csv")
        with open(path, "wb") as f:
            f.write("名稱,數量\n龍騰,3\n鳳舞,7\n".encode("big5"))

        result, rows = self._load_and_read(
            path, "t_big5", reader_options={"encoding": "BIG5"}
        )
        assert result["fallback_used"] is True
        assert result["engine"] == "transcode"
        assert [r[0] for r in rows] == ["鳳舞", "龍騰"]

    def test_unknown_spelling_encoding_falls_back_to_transcode(self):
        """DuckDB 不认的编码拼写（如 EUC-TW 类）经兜底转码后内容仍正确"""
        path = os.path.join(self.test_dir, "sjis.csv")
        with open(path, "wb") as f:
            f.write("名前,数\nテスト,1\nデータ,2\n".encode("shift_jis"))

        # SHIFT_JIS DuckDB 原生认识——用一个原生拒绝的拼写走兜底:
        # johab(韩文,Python 认识、DuckDB 不认)
        path2 = os.path.join(self.test_dir, "johab.csv")
        with open(path2, "wb") as f:
            f.write("이름,값\n하나,1\n둘,2\n".encode("johab"))

        result, rows = self._load_and_read(
            path2, "t_johab", reader_options={"encoding": "johab"}
        )
        assert result["fallback_used"] is True
        assert {r[0] for r in rows} == {"하나", "둘"}
