"""
检查是否使用 print() 语句

禁止使用 print() 输出日志，应使用 logging 模块
"""

from typing import TYPE_CHECKING

from pylint.checkers import BaseChecker

if TYPE_CHECKING:
    from pylint.lint import PyLinter


class NoPrintStatementsChecker(BaseChecker):
    """检查是否使用 print() 语句"""

    name = "no-print-statements"
    priority = -1

    msgs = {
        "W9030": (
            "使用 print() 输出日志，应使用 logging 模块",
            "print-statement",
            "应使用 logging.getLogger(__name__) 创建 logger，然后使用 logger.info/debug/error 等方法",
        ),
        "W9031": (
            "使用 print() 输出调试信息，应使用 logger.debug()",
            "print-for-debug",
            "调试信息应使用 logger.debug()，便于在生产环境中关闭",
        ),
    }

    options = (
        (
            "allow-print-in-tests",
            {
                "default": True,
                "type": "yn",
                "metavar": "<y or n>",
                "help": "是否允许在测试文件中使用 print()",
            },
        ),
    )

    def __init__(self, linter: "PyLinter") -> None:
        super().__init__(linter)
        self.allow_print_in_tests = True

    def open(self):
        """在检查开始时调用"""
        self.allow_print_in_tests = self.linter.config.allow_print_in_tests

    def visit_call(self, node):
        """检查函数调用"""
        # 检查是否是 print() 调用
        if hasattr(node.func, "name") and node.func.name == "print":
            # 如果在测试文件中且允许，则跳过
            if self.allow_print_in_tests and self._is_test_file():
                return

            # 检查是否是调试用途（通过参数判断）
            if self._is_debug_print(node):
                self.add_message("print-for-debug", node=node)
            else:
                self.add_message("print-statement", node=node)

    def _is_test_file(self):
        """检查当前文件是否是测试文件"""
        if not hasattr(self.linter, "current_file"):
            return False
        
        current_file = str(self.linter.current_file)
        return (
            "test_" in current_file
            or "_test.py" in current_file
            or "/tests/" in current_file
            or "\\tests\\" in current_file
        )

    def _is_debug_print(self, node):
        """判断是否是调试用途的 print"""
        # 如果 print 的内容包含变量名、类型等，可能是调试用途
        if not node.args:
            return False

        # 简单判断：如果参数中有多个变量或表达式，可能是调试
        return len(node.args) > 1


def register(linter: "PyLinter") -> None:
    """注册检查器"""
    linter.register_checker(NoPrintStatementsChecker(linter))
