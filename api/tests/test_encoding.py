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
