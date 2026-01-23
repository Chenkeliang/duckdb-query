"""
测试 no-print-statements 检查器
"""

import astroid
import pytest
from pylint.testutils import CheckerTestCase

from duckquery_pylint.checkers.no_print_statements import NoPrintStatementsChecker


class TestNoPrintStatementsChecker(CheckerTestCase):
    """测试 NoPrintStatementsChecker"""

    CHECKER_CLASS = NoPrintStatementsChecker

    def test_print_statement(self):
        """测试 print() 语句"""
        code = '''
        print("Hello, World!")  #@
        '''
        node = astroid.extract_node(code)
        self.checker.visit_call(node)
        messages = self.linter.release_messages()
        assert len(messages) == 1
        assert messages[0].msg_id == "print-statement"

    def test_print_with_variable(self):
        """测试 print() 输出变量"""
        code = '''
        user_id = 123
        print(user_id)  #@
        '''
        node = astroid.extract_node(code)
        self.checker.visit_call(node)
        messages = self.linter.release_messages()
        assert len(messages) == 1
        assert messages[0].msg_id == "print-statement"

    def test_print_for_debug(self):
        """测试调试用途的 print()"""
        code = '''
        user_id = 123
        name = "Alice"
        print(user_id, name)  #@
        '''
        node = astroid.extract_node(code)
        self.checker.visit_call(node)
        messages = self.linter.release_messages()
        assert len(messages) == 1
        assert messages[0].msg_id == "print-for-debug"

    def test_print_with_fstring(self):
        """测试 print() 输出 f-string"""
        code = '''
        user_id = 123
        print(f"User ID: {user_id}")  #@
        '''
        node = astroid.extract_node(code)
        self.checker.visit_call(node)
        messages = self.linter.release_messages()
        assert len(messages) == 1
        assert messages[0].msg_id == "print-statement"

    def test_logger_usage(self):
        """测试使用 logger（应该通过）"""
        code = '''
        import logging
        logger = logging.getLogger(__name__)
        logger.info("User logged in")  #@
        '''
        node = astroid.extract_node(code)
        self.checker.visit_call(node)
        messages = self.linter.release_messages()
        assert len(messages) == 0

    def test_other_function_call(self):
        """测试其他函数调用（应该通过）"""
        code = '''
        def my_print(msg):
            pass
        my_print("test")  #@
        '''
        node = astroid.extract_node(code)
        self.checker.visit_call(node)
        messages = self.linter.release_messages()
        assert len(messages) == 0

    def test_multiple_prints(self):
        """测试多个 print() 语句"""
        code = '''
        print("Line 1")
        print("Line 2")
        print("Line 3")
        '''
        module = astroid.parse(code)
        
        count = 0
        for node in module.nodes_of_class(astroid.Call):
            if hasattr(node.func, 'name') and node.func.name == 'print':
                self.checker.visit_call(node)
                count += 1
        
        messages = self.linter.release_messages()
        # 应该检测到 3 个 print 语句
        assert len(messages) == 3
        assert all(msg.msg_id == "print-statement" for msg in messages)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
