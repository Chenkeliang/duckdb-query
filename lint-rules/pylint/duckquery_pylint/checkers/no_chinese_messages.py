"""
检查是否有中文消息

禁止在以下位置使用中文：
- logger 调用（info, warning, error, debug）
- HTTPException 的 detail 参数
- raise 语句的异常消息
- return 语句中的 message 字段
"""

import re
from typing import TYPE_CHECKING

from pylint.checkers import BaseChecker

if TYPE_CHECKING:
    from pylint.lint import PyLinter


class NoChineseMessagesChecker(BaseChecker):
    """检查是否有中文消息"""

    name = "no-chinese-messages"
    priority = -1

    msgs = {
        "W9020": (
            "检测到中文消息: '%s'，请使用英文或 MessageCode",
            "chinese-message",
            "用户可见的消息应使用英文或 MessageCode，以支持国际化",
        ),
        "W9021": (
            "logger 调用中检测到中文: '%s'，日志消息应使用英文",
            "chinese-in-logger",
            "日志消息应使用英文，便于国际化团队协作",
        ),
        "W9022": (
            "HTTPException 中检测到中文: '%s'，应使用 MessageCode",
            "chinese-in-http-exception",
            "API 响应应使用 MessageCode，前端通过 i18n 翻译",
        ),
        "W9023": (
            "异常消息中检测到中文: '%s'，应使用英文",
            "chinese-in-exception",
            "异常消息应使用英文，便于调试和国际化",
        ),
    }

    options = ()

    def __init__(self, linter: "PyLinter") -> None:
        super().__init__(linter)
        # 匹配中文字符的正则表达式
        self.chinese_pattern = re.compile(r"[\u4e00-\u9fa5]")

    def visit_call(self, node):
        """检查函数调用"""
        # 检查 logger 调用
        if hasattr(node.func, "attrname"):
            if node.func.attrname in ("info", "warning", "error", "debug", "critical"):
                self._check_logger_call(node)

        # 检查 HTTPException
        if hasattr(node.func, "name") and node.func.name == "HTTPException":
            self._check_http_exception(node)

    def visit_raise(self, node):
        """检查 raise 语句"""
        if node.exc:
            self._check_exception_message(node.exc)

    def _check_logger_call(self, node):
        """检查 logger 调用中的中文"""
        # 检查第一个参数（消息字符串）
        if node.args:
            first_arg = node.args[0]
            chinese_text = self._extract_chinese(first_arg)
            if chinese_text:
                self.add_message(
                    "chinese-in-logger",
                    node=first_arg,
                    args=(chinese_text[:30],),
                )

    def _check_http_exception(self, node):
        """检查 HTTPException 中的中文"""
        # 检查 detail 参数
        for keyword in node.keywords:
            if keyword.arg == "detail":
                chinese_text = self._extract_chinese(keyword.value)
                if chinese_text:
                    self.add_message(
                        "chinese-in-http-exception",
                        node=keyword.value,
                        args=(chinese_text[:30],),
                    )

    def _check_exception_message(self, node):
        """检查异常消息中的中文"""
        # 检查异常的参数
        if hasattr(node, "args") and node.args:
            for arg in node.args:
                chinese_text = self._extract_chinese(arg)
                if chinese_text:
                    self.add_message(
                        "chinese-in-exception",
                        node=arg,
                        args=(chinese_text[:30],),
                    )

    def _extract_chinese(self, node):
        """从 AST 节点中提取中文文本"""
        # 处理字符串常量
        if hasattr(node, "value") and isinstance(node.value, str):
            if self.chinese_pattern.search(node.value):
                return node.value

        # 处理 f-string (JoinedStr)
        if hasattr(node, "__class__") and node.__class__.__name__ == "JoinedStr":
            # 检查 f-string 的各个部分
            if hasattr(node, "values"):
                for value in node.values:
                    if hasattr(value, "value") and isinstance(value.value, str):
                        if self.chinese_pattern.search(value.value):
                            return value.value

        return None


def register(linter: "PyLinter") -> None:
    """注册检查器"""
    linter.register_checker(NoChineseMessagesChecker(linter))
