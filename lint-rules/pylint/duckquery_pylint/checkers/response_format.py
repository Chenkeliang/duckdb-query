"""
响应格式检查器

检查 API 端点是否使用统一的响应格式
"""

import astroid
from pylint.checkers import BaseChecker
from pylint.interfaces import IAstroidChecker


class ResponseFormatChecker(BaseChecker):
    """检查 API 响应格式是否符合规范"""

    __implements__ = IAstroidChecker

    name = 'response-format'
    priority = -1

    msgs = {
        'W9001': (
            '直接返回字典，应使用 create_success_response() 或 create_error_response()',
            'direct-dict-return',
            '后端 API 必须使用统一响应格式辅助函数',
        ),
        'W9002': (
            '缺少 messageCode 字段，响应格式不完整',
            'missing-message-code',
            '统一响应格式必须包含 messageCode 字段用于国际化',
        ),
        'W9003': (
            '未导入响应辅助函数，建议导入 create_success_response',
            'missing-response-helper-import',
            '应该从 utils.response_helpers 导入响应辅助函数',
        ),
    }

    def __init__(self, linter=None):
        super().__init__(linter)
        self.has_response_helper_import = False
        self.is_router_file = False

    def visit_module(self, node):
        """访问模块，检查是否是路由文件"""
        # 检查文件路径是否在 routers/ 目录下
        if node.file and 'routers/' in node.file:
            self.is_router_file = True
        else:
            self.is_router_file = False
        
        self.has_response_helper_import = False

    def visit_importfrom(self, node):
        """检查是否导入了响应辅助函数"""
        if node.modname == 'utils.response_helpers':
            self.has_response_helper_import = True

    def visit_functiondef(self, node):
        """检查函数定义"""
        # 只检查路由文件中的异步函数
        if not self.is_router_file:
            return
        
        # 检查是否是路由处理函数（通常是异步函数）
        if not node.is_async:
            return
        
        # 检查函数装饰器，确认是路由函数
        has_route_decorator = False
        for decorator in node.decorators.nodes if node.decorators else []:
            if isinstance(decorator, astroid.Call):
                if hasattr(decorator.func, 'attrname'):
                    if decorator.func.attrname in ('get', 'post', 'put', 'delete', 'patch'):
                        has_route_decorator = True
                        break
        
        if not has_route_decorator:
            return
        
        # 检查函数体中的 return 语句
        for child in node.nodes_of_class(astroid.Return):
            self._check_return_statement(child)

    def _check_return_statement(self, node):
        """检查 return 语句"""
        if node.value is None:
            return
        
        # 检查是否直接返回字典字面量
        if isinstance(node.value, astroid.Dict):
            # 检查字典中是否有 messageCode 字段
            has_message_code = False
            for key in node.value.keys:
                if isinstance(key, astroid.Const) and key.value == 'messageCode':
                    has_message_code = True
                    break
            
            if not has_message_code:
                self.add_message('direct-dict-return', node=node)
        
        # 检查是否调用了响应辅助函数
        elif isinstance(node.value, astroid.Call):
            func_name = None
            if isinstance(node.value.func, astroid.Name):
                func_name = node.value.func.name
            elif isinstance(node.value.func, astroid.Attribute):
                func_name = node.value.func.attrname
            
            # 如果不是响应辅助函数，给出警告
            if func_name not in ('create_success_response', 'create_error_response', 'create_list_response'):
                if not self.has_response_helper_import:
                    self.add_message('missing-response-helper-import', node=node)

    def leave_module(self, node):
        """离开模块时的检查"""
        # 如果是路由文件但没有导入响应辅助函数，给出提示
        if self.is_router_file and not self.has_response_helper_import:
            # 检查是否有任何路由函数
            has_route_function = False
            for func in node.nodes_of_class(astroid.FunctionDef):
                if func.decorators:
                    for decorator in func.decorators.nodes:
                        if isinstance(decorator, astroid.Call):
                            if hasattr(decorator.func, 'attrname'):
                                if decorator.func.attrname in ('get', 'post', 'put', 'delete', 'patch'):
                                    has_route_function = True
                                    break
                if has_route_function:
                    break
            
            if has_route_function:
                self.add_message('missing-response-helper-import', node=node, line=1)
