"""
连接池检查器

检查是否正确使用 DuckDB 连接池而非全局连接
"""

import astroid
from pylint.checkers import BaseChecker


class ConnectionPoolChecker(BaseChecker):
    """检查 DuckDB 连接池使用规范"""

    name = 'connection-pool'
    priority = -1

    msgs = {
        'W9010': (
            '禁止使用全局 duckdb.connect()，应使用连接池',
            'global-duckdb-connection',
            '必须使用 pool.get_connection() 或 with_duckdb_connection() 获取连接',
        ),
        'W9011': (
            '禁止在模块级别创建 DuckDB 连接',
            'module-level-connection',
            'DuckDB 连接应该在函数内部通过连接池获取',
        ),
        'W9012': (
            '未使用 with 语句管理连接，可能导致连接泄漏',
            'connection-not-in-context',
            '应使用 with pool.get_connection() as conn: 确保连接正确释放',
        ),
    }

    def __init__(self, linter=None):
        super().__init__(linter)
        self.in_function = False

    def visit_module(self, node):
        """访问模块"""
        self.in_function = False

    def visit_functiondef(self, node):
        """进入同步函数"""
        self.in_function = True

    def visit_asyncfunctiondef(self, node):
        """进入异步函数"""
        self.in_function = True

    def leave_functiondef(self, node):
        """离开同步函数"""
        self.in_function = False

    def leave_asyncfunctiondef(self, node):
        """离开异步函数"""
        self.in_function = False

    def visit_call(self, node):
        """检查函数调用"""
        # 检查 duckdb.connect() 调用
        if isinstance(node.func, astroid.Attribute):
            if (hasattr(node.func.expr, 'name') and 
                node.func.expr.name == 'duckdb' and 
                node.func.attrname == 'connect'):
                
                # 如果在模块级别调用，报错
                if not self.in_function:
                    self.add_message('module-level-connection', node=node)
                else:
                    # 检查是否在 with 语句中
                    parent = node.parent
                    in_with_statement = False
                    
                    while parent:
                        if isinstance(parent, astroid.With):
                            in_with_statement = True
                            break
                        parent = parent.parent
                    
                    if not in_with_statement:
                        self.add_message('connection-not-in-context', node=node)
                
                # 总是建议使用连接池
                self.add_message('global-duckdb-connection', node=node)

    def visit_assign(self, node):
        """检查赋值语句"""
        # 检查模块级别的连接赋值
        if not self.in_function:
            for target in node.targets:
                if isinstance(target, astroid.AssignName):
                    # 检查变量名是否暗示是数据库连接
                    if any(keyword in target.name.lower() for keyword in ['conn', 'connection', 'db', 'duckdb']):
                        # 检查赋值的值是否是 duckdb.connect()
                        if isinstance(node.value, astroid.Call):
                            if isinstance(node.value.func, astroid.Attribute):
                                if (hasattr(node.value.func.expr, 'name') and 
                                    node.value.func.expr.name == 'duckdb' and 
                                    node.value.func.attrname == 'connect'):
                                    self.add_message('module-level-connection', node=node)
