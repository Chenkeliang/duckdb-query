# DuckQuery Lint 规则架构设计

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     开发者工作流                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   编辑器实时检查                              │
│  ┌──────────────┐              ┌──────────────┐             │
│  │   VS Code    │              │  WebStorm    │             │
│  │   ESLint     │              │   Pylint     │             │
│  └──────────────┘              └──────────────┘             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Git 提交前检查                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Husky Pre-commit Hook                               │   │
│  │  - 检查暂存文件                                        │   │
│  │  - 阻止不合规代码提交                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   CI/CD 自动检查                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  GitHub Actions                                       │   │
│  │  - 前端 ESLint 检查                                    │   │
│  │  - 后端 Pylint 检查                                    │   │
│  │  - 生成检查报告                                        │   │
│  │  - 阻止不合规代码合并                                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 📦 目录结构设计

```
lint-rules/
├── README.md                       # 总览文档
├── QUICK_START.md                  # 快速入门
├── ARCHITECTURE.md                 # 架构设计（本文件）
├── FAQ.md                          # 常见问题
│
├── eslint/                         # 前端 ESLint 规则
│   ├── package.json                # NPM 包配置
│   ├── index.js                    # 插件入口
│   │
│   ├── rules/                      # 规则实现
│   │   ├── index.js                # 规则导出
│   │   ├── no-mui-in-new-layout.js
│   │   ├── no-fetch-in-useeffect.js
│   │   ├── require-tanstack-query.js
│   │   ├── no-hardcoded-colors.js
│   │   ├── no-arbitrary-tailwind.js
│   │   ├── enforce-import-order.js
│   │   └── require-i18n.js
│   │
│   ├── tests/                      # 规则测试
│   │   ├── no-mui-in-new-layout.test.js
│   │   └── ...
│   │
│   └── docs/                       # 规则文档
│       ├── no-mui-in-new-layout.md
│       └── ...
│
└── pylint/                         # 后端 Pylint 规则
    ├── setup.py                    # Python 包配置
    │
    ├── duckquery_pylint/           # 包目录
    │   ├── __init__.py             # 插件注册
    │   │
    │   ├── checkers/               # 检查器实现
    │   │   ├── __init__.py
    │   │   ├── response_format.py  # 响应格式检查
    │   │   ├── connection_pool.py  # 连接池检查
    │   │   ├── message_code.py     # MessageCode 检查
    │   │   └── async_task.py       # 异步任务检查
    │   │
    │   └── tests/                  # 检查器测试
    │       ├── test_response_format.py
    │       └── ...
    │
    └── docs/                       # 检查器文档
        ├── response-format.md
        └── ...
```

## 🔧 前端规则架构

### ESLint 插件结构

```javascript
// lint-rules/eslint/index.js
module.exports = {
  rules: {
    // 规则映射
    'no-mui-in-new-layout': require('./rules/no-mui-in-new-layout'),
    // ...
  },
  configs: {
    // 预设配置
    recommended: { /* ... */ },
    strict: { /* ... */ },
  },
};
```

### 规则实现模式

```javascript
// lint-rules/eslint/rules/example-rule.js
module.exports = {
  meta: {
    type: 'problem',           // 规则类型
    docs: { /* ... */ },       // 文档
    messages: { /* ... */ },   // 错误消息
    schema: [],                // 配置选项
    fixable: null,             // 是否可自动修复
  },
  
  create(context) {
    // 返回 AST 访问器
    return {
      ImportDeclaration(node) {
        // 检查逻辑
      },
      CallExpression(node) {
        // 检查逻辑
      },
    };
  },
};
```

### 规则执行流程

```
源代码
  │
  ▼
ESLint 解析器 (TypeScript/Babel)
  │
  ▼
生成 AST (抽象语法树)
  │
  ▼
遍历 AST 节点
  │
  ├─► ImportDeclaration → no-mui-in-new-layout
  ├─► CallExpression → no-fetch-in-useeffect
  ├─► JSXAttribute → no-hardcoded-colors
  └─► ...
  │
  ▼
收集错误/警告
  │
  ▼
输出报告
```

## 🐍 后端规则架构

### Pylint 插件结构

```python
# lint-rules/pylint/duckquery_pylint/__init__.py
def register(linter):
    """注册所有检查器"""
    linter.register_checker(ResponseFormatChecker(linter))
    linter.register_checker(ConnectionPoolChecker(linter))
    # ...
```

### 检查器实现模式

```python
# lint-rules/pylint/duckquery_pylint/checkers/example_checker.py
from pylint.checkers import BaseChecker
from pylint.interfaces import IAstroidChecker

class ExampleChecker(BaseChecker):
    __implements__ = IAstroidChecker
    
    name = 'example-checker'
    msgs = {
        'W9999': (
            '错误消息',
            'message-id',
            '详细说明'
        ),
    }
    
    def visit_functiondef(self, node):
        # 检查函数定义
        pass
    
    def visit_return(self, node):
        # 检查 return 语句
        pass
```

### 检查器执行流程

```
Python 源代码
  │
  ▼
Astroid 解析器
  │
  ▼
生成 AST
  │
  ▼
遍历 AST 节点
  │
  ├─► FunctionDef → ResponseFormatChecker
  ├─► Return → ResponseFormatChecker
  ├─► Call → ConnectionPoolChecker
  └─► ...
  │
  ▼
收集消息
  │
  ▼
输出报告
```

## 🔄 集成流程

### 1. 本地开发集成

```
开发者编写代码
  │
  ▼
编辑器 LSP 服务
  │
  ├─► ESLint Server (前端)
  │   └─► eslint-plugin-duckquery
  │
  └─► Pylint Server (后端)
      └─► duckquery-pylint
  │
  ▼
实时显示错误/警告
```

### 2. Git Hook 集成

```
git commit
  │
  ▼
Husky Pre-commit Hook
  │
  ├─► 获取暂存文件
  │
  ├─► 前端文件 → npm run lint
  │   └─► ESLint + duckquery 规则
  │
  ├─► 后端文件 → pylint
  │   └─► Pylint + duckquery 检查器
  │
  ▼
有错误? → 阻止提交
无错误? → 允许提交
```

### 3. CI/CD 集成

```
Push/PR 触发
  │
  ▼
GitHub Actions
  │
  ├─► Job: frontend-lint
  │   ├─► 安装依赖
  │   ├─► 链接 eslint-plugin-duckquery
  │   ├─► 运行 npm run lint
  │   └─► 上传报告
  │
  ├─► Job: backend-lint
  │   ├─► 安装依赖
  │   ├─► 安装 duckquery-pylint
  │   ├─► 运行 pylint
  │   └─► 上传报告
  │
  └─► Job: summary
      └─► 汇总结果
  │
  ▼
有错误? → 标记 PR 为失败
无错误? → 允许合并
```

## 📊 规则优先级设计

### 严重程度分级

| 级别 | 说明 | 示例 |
|------|------|------|
| `error` | 必须修复，阻止提交 | 新布局使用 MUI |
| `warn` | 建议修复，不阻止提交 | 硬编码颜色 |
| `off` | 禁用规则 | - |

### 规则分类

```
┌─────────────────────────────────────┐
│         架构约束规则 (error)          │
│  - no-mui-in-new-layout             │
│  - require-tanstack-query           │
│  - response-format                  │
│  - connection-pool                  │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│         代码质量规则 (warn)           │
│  - no-hardcoded-colors              │
│  - require-i18n                     │
│  - enforce-import-order             │
└─────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────┐
│         可选规则 (off/warn)          │
│  - 根据团队需求配置                   │
└─────────────────────────────────────┘
```

## 🎯 性能优化

### 前端优化

1. **增量检查**: 只检查修改的文件
2. **缓存结果**: ESLint 自动缓存检查结果
3. **并行执行**: 多文件并行检查

### 后端优化

1. **并行作业**: Pylint 支持多进程
2. **跳过测试**: 测试文件可以放宽规则
3. **选择性检查**: 只检查关键目录

## 🔐 安全考虑

1. **依赖安全**: 定期更新 ESLint/Pylint 版本
2. **代码注入**: 规则不执行用户代码
3. **权限控制**: CI/CD 使用最小权限

## 📈 扩展性设计

### 添加新规则

```
1. 创建规则文件
   ├─► 前端: lint-rules/eslint/rules/new-rule.js
   └─► 后端: lint-rules/pylint/duckquery_pylint/checkers/new_checker.py

2. 注册规则
   ├─► 前端: 在 rules/index.js 中导出
   └─► 后端: 在 __init__.py 中注册

3. 编写测试
   ├─► 前端: tests/new-rule.test.js
   └─► 后端: tests/test_new_checker.py

4. 编写文档
   ├─► 前端: docs/new-rule.md
   └─► 后端: docs/new-checker.md

5. 更新配置
   ├─► 前端: .eslintrc.js
   └─► 后端: .pylintrc
```

## 🔗 相关资源

- [ESLint 开发指南](https://eslint.org/docs/developer-guide/)
- [Pylint 自定义检查器](https://pylint.pycqa.org/en/latest/how_tos/custom_checkers.html)
- [Astroid 文档](https://pylint.pycqa.org/projects/astroid/en/latest/)
- [`AGENTS.md`](../AGENTS.md)

## 📝 维护指南

### 定期维护任务

- [ ] 每月更新依赖版本
- [ ] 每季度审查规则有效性
- [ ] 收集开发者反馈
- [ ] 优化规则性能
- [ ] 更新文档

### 问题排查

1. **规则不生效**: 检查配置文件和插件安装
2. **误报**: 调整规则逻辑或添加例外
3. **性能问题**: 优化 AST 遍历逻辑
4. **冲突**: 检查规则优先级和配置

---

**维护者**: DuckQuery 团队  
**最后更新**: 2026-01-08  
**版本**: 1.0
