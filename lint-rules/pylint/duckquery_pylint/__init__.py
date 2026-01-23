"""
DuckQuery Pylint 插件

提供项目特定的代码规范检查
"""

from duckquery_pylint.checkers.response_format import ResponseFormatChecker
from duckquery_pylint.checkers.connection_pool import ConnectionPoolChecker
from duckquery_pylint.checkers.no_chinese_messages import NoChineseMessagesChecker
from duckquery_pylint.checkers.no_print_statements import NoPrintStatementsChecker


def register(linter):
    """注册所有检查器"""
    linter.register_checker(ResponseFormatChecker(linter))
    linter.register_checker(ConnectionPoolChecker(linter))
    linter.register_checker(NoChineseMessagesChecker(linter))
    linter.register_checker(NoPrintStatementsChecker(linter))
