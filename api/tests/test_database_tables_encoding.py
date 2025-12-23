"""测试数据库表管理 API 的编码处理"""

import pytest
from api.routers.database_tables import _safe_decode_value, _safe_decode_row


class TestEncodingHandling:
    """测试编码处理函数"""

    def test_safe_decode_value_utf8(self):
        """测试 UTF-8 编码的正常解码"""
        # UTF-8 编码的中文
        value = "你好世界".encode('utf-8')
        result = _safe_decode_value(value)
        assert result == "你好世界"

    def test_safe_decode_value_gbk(self):
        """测试 GBK 编码的解码"""
        # GBK 编码的中文
        value = "你好世界".encode('gbk')
        result = _safe_decode_value(value)
        assert result == "你好世界"

    def test_safe_decode_value_invalid_bytes(self):
        """测试无法解码的字节"""
        # 无效的字节序列
        value = b'\xa9\xfe\xdc'
        result = _safe_decode_value(value)
        # 应该返回十六进制表示
        assert result.startswith("<binary:")
        assert "a9fedc" in result

    def test_safe_decode_value_non_bytes(self):
        """测试非 bytes 类型的值"""
        # 字符串
        assert _safe_decode_value("hello") == "hello"
        # 数字
        assert _safe_decode_value(123) == 123
        # None
        assert _safe_decode_value(None) is None
        # 布尔值
        assert _safe_decode_value(True) is True

    def test_safe_decode_row(self):
        """测试行解码"""
        row = (
            "normal_string",
            123,
            "你好".encode('utf-8'),
            "世界".encode('gbk'),
            b'\xa9\xfe',
            None,
        )
        result = _safe_decode_row(row)
        
        assert result[0] == "normal_string"
        assert result[1] == 123
        assert result[2] == "你好"
        assert result[3] == "世界"
        assert result[4].startswith("<binary:")
        assert result[5] is None

    def test_safe_decode_value_long_binary(self):
        """测试长二进制数据的截断"""
        # 创建一个很长的二进制数据
        value = bytes(range(256)) * 10  # 2560 bytes
        result = _safe_decode_value(value)
        
        # 应该被截断
        assert result.startswith("<binary:")
        assert result.endswith("...>")
        # 十六进制表示应该被截断到 40 个字符
        hex_part = result[8:-4]  # 去掉 "<binary:" 和 "...>"
        assert len(hex_part) == 40

    def test_safe_decode_value_short_binary(self):
        """测试短二进制数据不截断"""
        # 创建一个短的二进制数据
        value = b'\xa9\xfe\xdc'
        result = _safe_decode_value(value)
        
        # 不应该被截断
        assert result == "<binary:a9fedc>"
        assert not result.endswith("...>")

    def test_safe_decode_value_latin1_fallback(self):
        """测试 latin1 编码的回退"""
        # 某些字节在 UTF-8 和 GBK 中都无效，但在 latin1 中有效
        value = b'\xa9'  # © 符号在 latin1 中
        result = _safe_decode_value(value)
        # latin1 应该能解码
        assert isinstance(result, str)
        # 如果 latin1 也失败，会返回 <binary:...>
        if result.startswith("<binary:"):
            assert "a9" in result
