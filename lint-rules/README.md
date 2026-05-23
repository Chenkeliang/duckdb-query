# DuckQuery 自定义 Lint 规则

本目录包含 DuckQuery 项目的自定义代码规范检查规则。

## 📋 目录

- [前端规则 (ESLint)](#前端规则-eslint)
- [后端规则 (Pylint)](#后端规则-pylint)
- [安装与使用](#安装与使用)
- [开发新规则](#开发新规则)

## 🎯 前端规则 (ESLint)

### 已实现的规则

| 规则名称 | 严重程度 | 说明 |
|---------|---------|------|
| `duckquery/no-mui-in-new-layout` | error | 禁止在新布局中使用 MUI 组件 |
| `duckquery/no-fetch-in-useeffect` | error | 禁止在 useEffect 中直接调用 API |
| `duckquery/require-tanstack-query` | error | 强制使用 TanStack Query 管理服务端数据 |
| `duckquery/no-hardcoded-colors` | warn | 禁止硬编码颜色值 |
| `duckquery/no-arbitrary-tailwind` | error | 禁止使用 Tailwind arbitrary values |
| `duckquery/enforce-import-order` | warn | 强制导入顺序规范 |
| `duckquery/require-i18n` | warn | 检测中文字符串，要求使用 i18n 国际化 |

详细文档：[eslint/docs/](./eslint/docs/)

## 🐍 后端规则 (Pylint)

### 已实现的检查器

| 检查器名称 | 消息代码 | 说明 |
|-----------|---------|------|
| `response-format` | W9001, W9002, W9003 | 检查是否使用统一响应格式 |
| `connection-pool` | W9010, W9011, W9012 | 检查是否使用连接池 |

**注意**：自定义检查器默认在 `.pylintrc` 中被禁用。如需启用，请在配置文件中添加：
```ini
[MESSAGES CONTROL]
enable=
    W9001,W9002,W9003,  # response-format
    W9010,W9011,W9012   # connection-pool
```

详细文档：[pylint/docs/](./pylint/docs/)

## 🚀 安装与使用

### 快速开始

```bash
# 安装所有规则
./scripts/setup-lint-rules.sh

# 运行检查
npm run lint              # 前端检查
cd api && pylint .        # 后端检查

# 或者一次性检查所有
./scripts/check-all.sh
```

### 前端 (ESLint)

```bash
cd lint-rules/eslint
npm install
npm link

cd ../../frontend
npm link eslint-plugin-duckquery
```

### 后端 (Pylint)

```bash
cd lint-rules/pylint
pip install -e .

cd ../../api
pylint --load-plugins=duckquery_pylint .
```

## 🛠️ 开发新规则

### 前端规则开发

1. 在 `lint-rules/eslint/rules/` 创建新规则文件
2. 在 `lint-rules/eslint/rules/index.js` 中注册规则
3. 在 `lint-rules/eslint/tests/` 添加测试
4. 在 `lint-rules/eslint/docs/` 添加文档

示例：

```javascript
// lint-rules/eslint/rules/my-new-rule.js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '规则描述',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      myMessage: '错误消息',
    },
  },
  create(context) {
    return {
      // 实现检查逻辑
    };
  },
};
```

### 后端检查器开发

1. 在 `lint-rules/pylint/duckquery_pylint/checkers/` 创建新检查器
2. 在 `lint-rules/pylint/duckquery_pylint/__init__.py` 中注册
3. 在 `lint-rules/pylint/duckquery_pylint/tests/` 添加测试
4. 在 `lint-rules/pylint/docs/` 添加文档

示例：

```python
# lint-rules/pylint/duckquery_pylint/checkers/my_checker.py
from pylint.checkers import BaseChecker

class MyChecker(BaseChecker):
    name = 'my-checker'
    msgs = {
        'W9999': (
            '错误消息',
            'my-message-id',
            '详细说明'
        ),
    }
    
    def visit_functiondef(self, node):
        # 实现检查逻辑
        pass
```

## 📚 相关文档

- [`AGENTS.md`](../AGENTS.md)
- [ESLint 官方文档](https://eslint.org/docs/developer-guide/working-with-rules)
- [Pylint 官方文档](https://pylint.pycqa.org/en/latest/how_tos/custom_checkers.html)

## 🤝 贡献指南

1. 新规则必须有完整的测试覆盖
2. 新规则必须有详细的文档说明
3. 规则实现要考虑性能影响
4. 错误消息要清晰、可操作

## 📝 更新日志

- 2026-01-23: 修复 Pylint 4.x 兼容性问题，完成所有规则测试验证
- 2026-01-08: 初始版本，包含 7 个前端规则和 2 个后端检查器
