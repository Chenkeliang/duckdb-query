"""测试数据库表管理 API 的编码处理"""

import pytest
from routers.database_tables import _safe_decode_value, _safe_decode_row


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
        """测试可被 latin1 解码的字节序列"""
        # 这些字节可以被 latin1 解码，不会返回 <binary:...>
        value = b'\xa9\xfe\xdc'
        result = _safe_decode_value(value)
        # latin1 可以解码任何单字节，所以返回字符串
        assert isinstance(result, str)
        # 如果 latin1 解码成功，结果是 ©þÜ
        assert result == "©þÜ"

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
            b'\xa9\xfe',  # latin1 可解码
            None,
        )
        result = _safe_decode_row(row)
        
        assert result[0] == "normal_string"
        assert result[1] == 123
        assert result[2] == "你好"
        assert result[3] == "世界"
        # latin1 解码结果
        assert result[4] == "©þ"
        assert result[5] is None

    def test_safe_decode_value_long_binary(self):
        """测试长二进制数据的解码（latin1 可解码）"""
        # 创建一个很长的二进制数据
        value = bytes(range(256)) * 10  # 2560 bytes
        result = _safe_decode_value(value)
        
        # latin1 可以解码任何单字节序列，所以返回字符串
        assert isinstance(result, str)
        assert len(result) == 2560

    def test_safe_decode_value_short_binary(self):
        """测试短二进制数据（latin1 可解码）"""
        # 这些字节可以被 latin1 解码
        value = b'\xa9\xfe\xdc'
        result = _safe_decode_value(value)
        
        # latin1 解码成功，返回字符串
        assert result == "©þÜ"

    def test_safe_decode_value_latin1_fallback(self):
        """测试 latin1 编码的回退"""
        # 某些字节在 UTF-8 和 GBK 中都无效，但在 latin1 中有效
        value = b'\xa9'  # © 符号在 latin1 中
        result = _safe_decode_value(value)
        # latin1 应该能解码
        assert isinstance(result, str)
        assert result == "©"
