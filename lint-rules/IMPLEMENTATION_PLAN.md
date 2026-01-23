# Lint 规则完善实施计划

> **创建时间**: 2026-01-23  
> **状态**: 📋 待实施

## 📊 规则实施状态

### ESLint 规则

| 规则名称 | 优先级 | 状态 | 文件 |
|---------|--------|------|------|
| `no-mui-in-new-layout` | 🔴 高 | ✅ 已实现 | `rules/no-mui-in-new-layout.js` |
| `no-hardcoded-colors` | 🔴 高 | ✅ 已实现 | `rules/no-hardcoded-colors.js` |
| `require-i18n` | 🔴 高 | ✅ 已实现 | `rules/require-i18n.js` |
| `no-console` | 🔴 高 | ✅ 已实现 | `rules/no-console.js` |
| `no-empty-catch` | 🔴 高 | ✅ 已实现 | `rules/no-empty-catch.js` |
| `require-error-logging` | 🟡 中 | ✅ 已实现 | `rules/require-error-logging.js` |
| `no-fetch-in-useeffect` | 🟡 中 | ✅ 已实现 | `rules/no-fetch-in-useeffect.js` |
| `require-tanstack-query` | 🟡 中 | ✅ 已实现 | `rules/require-tanstack-query.js` |
| `no-arbitrary-tailwind` | 🟡 中 | ✅ 已实现 | `rules/no-arbitrary-tailwind.js` |
| `enforce-import-order` | 🟢 低 | ✅ 已实现 | `rules/enforce-import-order.js` |

**完成度**: 10/10 (100%) ✅

### Pylint 检查器

| 检查器名称 | 优先级 | 状态 | 文件 |
|-----------|--------|------|------|
| `response-format` | 🔴 高 | ✅ 已实现 | `checkers/response_format.py` |
| `connection-pool` | 🔴 高 | ✅ 已实现 | `checkers/connection_pool.py` |
| `no-chinese-messages` | 🔴 高 | ✅ 已实现 | `checkers/no_chinese_messages.py` |
| `no-print-statements` | 🟡 中 | ✅ 已实现 | `checkers/no_print_statements.py` |

**完成度**: 4/4 (100%) ✅

## 🎯 实施步骤

### 阶段 1: 实现高优先级规则（本周）

#### 1.1 ESLint: no-console

**目的**: 禁止使用 `console.log/error/warn/debug`，强制使用 logger

**实现文件**: `lint-rules/eslint/rules/no-console.js`

**测试文件**: `lint-rules/eslint/tests/no-console.test.js`

#### 1.2 ESLint: no-empty-catch

**目的**: 禁止空的 catch 块，必须处理或记录错误

**实现文件**: `lint-rules/eslint/rules/no-empty-catch.js`

**测试文件**: `lint-rules/eslint/tests/no-empty-catch.test.js`

#### 1.3 Pylint: no-chinese-messages

**目的**: 检测中文消息，要求使用英文或 MessageCode

**实现文件**: `lint-rules/pylint/duckquery_pylint/checkers/no_chinese_messages.py`

**测试文件**: `lint-rules/pylint/duckquery_pylint/tests/test_no_chinese_messages.py`

### 阶段 2: 实现中优先级规则（下周）

#### 2.1 ESLint: require-error-logging

**目的**: catch 块必须记录错误到 logger

**实现文件**: `lint-rules/eslint/rules/require-error-logging.js`

**测试文件**: `lint-rules/eslint/tests/require-error-logging.test.js`

#### 2.2 Pylint: no-print-statements

**目的**: 禁止使用 print()，强制使用 logger

**实现文件**: `lint-rules/pylint/duckquery_pylint/checkers/no_print_statements.py`

**测试文件**: `lint-rules/pylint/duckquery_pylint/tests/test_no_print_statements.py`

### 阶段 3: 配置和集成（下周）

#### 3.1 更新 ESLint 配置

**文件**: `frontend/eslint.config.js`

**内容**: 启用新规则

#### 3.2 更新 Pylint 配置

**文件**: `api/.pylintrc`

**内容**: 启用新检查器

#### 3.3 更新 CI/CD

**文件**: `.github/workflows/lint.yml`

**内容**: 确保 CI 运行所有规则

## 📝 实施清单

### 准备工作

- [ ] 创建规则实现文件
- [ ] 创建测试文件
- [ ] 准备测试用例

### ESLint 规则实现

- [ ] 实现 `no-console` 规则
- [ ] 编写 `no-console` 测试
- [ ] 实现 `no-empty-catch` 规则
- [ ] 编写 `no-empty-catch` 测试
- [ ] 实现 `require-error-logging` 规则
- [ ] 编写 `require-error-logging` 测试

### Pylint 检查器实现

- [ ] 实现 `no-chinese-messages` 检查器
- [ ] 编写 `no-chinese-messages` 测试
- [ ] 实现 `no-print-statements` 检查器
- [ ] 编写 `no-print-statements` 测试

### 配置更新

- [ ] 更新 `frontend/eslint.config.js`
- [ ] 更新 `api/.pylintrc`
- [ ] 更新 `.github/workflows/lint.yml`
- [ ] 更新 `lint-rules/eslint/index.js`
- [ ] 更新 `lint-rules/pylint/duckquery_pylint/__init__.py`

### 测试验证

- [ ] 运行 ESLint 测试套件
- [ ] 运行 Pylint 测试套件
- [ ] 在实际项目中测试规则
- [ ] 修复发现的问题

### 文档更新

- [ ] 更新 `lint-rules/README.md`
- [ ] 更新 `lint-rules/IMPLEMENTATION_SUMMARY.md`
- [ ] 更新 `lint-rules/QUICK_START.md`
- [ ] 创建迁移指南

## 🔧 技术细节

### ESLint 规则结构

```javascript
module.exports = {
  meta: {
    type: 'problem',  // 'problem', 'suggestion', or 'layout'
    docs: {
      description: '规则描述',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: 'code',  // 可选：如果规则可以自动修复
    messages: {
      messageId: '错误消息模板',
    },
    schema: [],  // 规则选项的 JSON Schema
  },
  create(context) {
    return {
      // AST 节点访问器
      NodeType(node) {
        // 检查逻辑
        context.report({
          node,
          messageId: 'messageId',
          data: { /* 消息数据 */ },
        });
      },
    };
  },
};
```

### Pylint 检查器结构

```python
from pylint.checkers import BaseChecker

class MyChecker(BaseChecker):
    name = 'my-checker'
    priority = -1
    
    msgs = {
        'W9999': (
            '错误消息: %s',
            'message-id',
            '详细说明'
        ),
    }
    
    def visit_node_type(self, node):
        """访问特定类型的 AST 节点"""
        # 检查逻辑
        self.add_message('message-id', node=node, args=(data,))
```

## 📚 参考资源

### ESLint

- [ESLint 规则开发指南](https://eslint.org/docs/developer-guide/working-with-rules)
- [ESLint AST Explorer](https://astexplorer.net/)
- [ESLint 规则测试](https://eslint.org/docs/developer-guide/working-with-rules#rule-unit-tests)

### Pylint

- [Pylint 自定义检查器](https://pylint.pycqa.org/en/latest/how_tos/custom_checkers.html)
- [Astroid AST](https://pylint.pycqa.org/projects/astroid/en/latest/)
- [Pylint 消息代码](https://pylint.pycqa.org/en/latest/user_guide/messages/messages_overview.html)

## 🎓 开发指南

### 创建新的 ESLint 规则

1. 在 `lint-rules/eslint/rules/` 创建规则文件
2. 在 `lint-rules/eslint/tests/` 创建测试文件
3. 在 `lint-rules/eslint/index.js` 中注册规则
4. 运行测试: `npm test`
5. 在项目中测试: `cd frontend && npm run lint`

### 创建新的 Pylint 检查器

1. 在 `lint-rules/pylint/duckquery_pylint/checkers/` 创建检查器文件
2. 在 `lint-rules/pylint/duckquery_pylint/tests/` 创建测试文件
3. 在 `lint-rules/pylint/duckquery_pylint/__init__.py` 中注册检查器
4. 重新安装插件: `pip install -e lint-rules/pylint/`
5. 运行测试: `pytest lint-rules/pylint/duckquery_pylint/tests/`
6. 在项目中测试: `cd api && pylint --load-plugins=duckquery_pylint <file>`

## 📊 预期时间

| 阶段 | 任务 | 预计时间 |
|------|------|---------|
| 阶段 1 | 实现 3 个高优先级规则 | 2-3 天 |
| 阶段 2 | 实现 2 个中优先级规则 | 1-2 天 |
| 阶段 3 | 配置和集成 | 1 天 |
| 测试和修复 | 全面测试和问题修复 | 1-2 天 |
| **总计** | | **5-8 天** |

## 🚀 快速开始

### 立即开始实施

```bash
# 1. 创建规则文件
cd lint-rules

# 2. ESLint 规则
cd eslint/rules
touch no-console.js no-empty-catch.js require-error-logging.js

# 3. Pylint 检查器
cd ../../pylint/duckquery_pylint/checkers
touch no_chinese_messages.py no_print_statements.py

# 4. 创建测试文件
cd ../tests
touch test_no_chinese_messages.py test_no_print_statements.py

cd ../../../eslint/tests
touch no-console.test.js no-empty-catch.test.js require-error-logging.test.js
```

---

**创建者**: AI Assistant  
**下次更新**: 实施完成后
