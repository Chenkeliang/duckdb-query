# 国际化强制规范（2026-01 更新）

> **创建时间**: 2026-01-23  
> **版本**: 1.0  
> **状态**: ✅ 强制执行

## 🎯 核心原则

### 1. 强制国际化
- **禁止硬编码中文** - 所有用户可见文本必须使用 i18n
- **禁止中文 message** - API 响应、日志、错误信息禁止中文
- **统一翻译管理** - 所有文本集中在翻译文件中
- **多语言支持** - 支持中文、英文等多语言切换

### 2. 适用范围
- **前端 UI 文本** - 按钮、标签、提示、错误信息
- **API 响应消息** - 成功/错误消息使用 messageCode
- **日志输出** - 日志消息使用英文
- **代码注释** - 可以使用中文（开发者可见）

## 🚫 严格禁止

### 前端禁止项

```typescript
// ❌ 禁止 1: 硬编码中文文本
<Button>提交</Button>
<div>欢迎使用 DuckQuery</div>
const message = "操作成功";

// ❌ 禁止 2: 中文 toast 消息
toast.success('删除成功');
toast.error('连接失败');

// ❌ 禁止 3: 中文 placeholder
<Input placeholder="请输入表名" />

// ❌ 禁止 4: 中文 label
<Label>用户名</Label>

// ❌ 禁止 5: 中文错误提示
throw new Error('参数不能为空');
```

### 后端禁止项

```python
# ❌ 禁止 1: 中文响应消息
return {"message": "操作成功"}

# ❌ 禁止 2: 中文错误消息
raise HTTPException(status_code=400, detail="参数错误")

# ❌ 禁止 3: 中文日志
logger.info("用户登录成功")

# ❌ 禁止 4: 中文异常消息
raise ValueError("表名不能为空")

# ❌ 禁止 5: 中文 Pydantic 错误消息
class MyModel(BaseModel):
    name: str = Field(..., description="名称")  # description 可以中文（API 文档）
    
    @validator('name')
    def validate_name(cls, v):
        if not v:
            raise ValueError('名称不能为空')  # ❌ 禁止中文
```

## ✅ 正确做法

### 前端 i18n 使用

```typescript
// ✅ 正确：使用 i18n
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');
  
  return (
    <>
      {/* UI 文本 */}
      <Button>{t('actions.submit')}</Button>
      <div>{t('welcome.title')}</div>
      
      {/* Toast 消息 */}
      <button onClick={() => {
        toast.success(t('messages.deleteSuccess'));
      }}>
        {t('actions.delete')}
      </button>
      
      {/* Input placeholder */}
      <Input placeholder={t('table.namePlaceholder')} />
      
      {/* Label */}
      <Label>{t('user.username')}</Label>
      
      {/* 错误提示 */}
      {error && <div>{t('errors.required')}</div>}
    </>
  );
}
```

### 翻译文件结构

```
frontend/src/i18n/locales/
├── zh/
│   ├── common.json       # 通用翻译
│   ├── errors.json       # 错误消息（MessageCode 翻译）
│   ├── table.json        # 表相关
│   ├── query.json        # 查询相关
│   └── datasource.json   # 数据源相关
└── en/
    ├── common.json
    ├── errors.json
    ├── table.json
    ├── query.json
    └── datasource.json
```

### 翻译文件示例

**中文** (`zh/common.json`):
```json
{
  "actions": {
    "submit": "提交",
    "cancel": "取消",
    "delete": "删除",
    "edit": "编辑",
    "save": "保存"
  },
  "welcome": {
    "title": "欢迎使用 DuckQuery",
    "subtitle": "强大的数据查询工具"
  },
  "messages": {
    "deleteSuccess": "删除成功",
    "saveSuccess": "保存成功",
    "operationFailed": "操作失败"
  }
}
```

**英文** (`en/common.json`):
```json
{
  "actions": {
    "submit": "Submit",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "save": "Save"
  },
  "welcome": {
    "title": "Welcome to DuckQuery",
    "subtitle": "Powerful Data Query Tool"
  },
  "messages": {
    "deleteSuccess": "Deleted successfully",
    "saveSuccess": "Saved successfully",
    "operationFailed": "Operation failed"
  }
}
```

### 后端 MessageCode 使用

```python
# ✅ 正确：使用 MessageCode + 英文消息
from utils.response_helpers import create_success_response, MessageCode

@router.post("/api/tables")
async def create_table(request: CreateTableRequest):
    try:
        result = await table_service.create(request)
        return create_success_response(
            data={"table": result},
            message_code=MessageCode.TABLE_CREATED,
            message="Table created successfully"  # 英文消息作为后备
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=create_error_response(
                code=MessageCode.VALIDATION_ERROR,
                message=f"Validation failed: {str(e)}"  # 英文消息
            )
        )
```

### 后端日志使用

```python
# ✅ 正确：日志使用英文
import logging

logger = logging.getLogger(__name__)

@router.post("/api/tables")
async def create_table(request: CreateTableRequest):
    logger.info(
        "Creating table",  # 英文消息
        extra={
            "table_name": request.table_name,
            "user_id": current_user.id,
        }
    )
    
    try:
        result = await table_service.create(request)
        logger.info(
            "Table created successfully",  # 英文消息
            extra={"table_name": result.name}
        )
        return create_success_response(...)
    except Exception as e:
        logger.error(
            "Failed to create table",  # 英文消息
            exc_info=True,
            extra={"table_name": request.table_name}
        )
        raise
```

## 📋 i18n 最佳实践

### 1. 翻译 Key 命名规范

```typescript
// ✅ 好的命名（语义化、层级清晰）
t('table.actions.delete')
t('query.errors.syntaxError')
t('datasource.connection.testSuccess')

// ❌ 差的命名（不清晰、难维护）
t('msg1')
t('deleteTable')
t('error')
```

### 2. 带参数的翻译

```typescript
// 翻译文件
{
  "table": {
    "deleteConfirm": "确定要删除表 {{tableName}} 吗？",
    "rowCount": "共 {{count}} 行"
  }
}

// 使用
t('table.deleteConfirm', { tableName: 'users' })
t('table.rowCount', { count: 1000 })
```

### 3. 复数形式处理

```typescript
// 翻译文件
{
  "table": {
    "itemCount": "{{count}} item",
    "itemCount_plural": "{{count}} items"
  }
}

// 使用
t('table.itemCount', { count: 1 })   // "1 item"
t('table.itemCount', { count: 5 })   // "5 items"
```

### 4. 默认值处理

```typescript
// ✅ 提供默认值（防止翻译缺失）
t('table.deleteSuccess', { defaultValue: 'Table deleted successfully' })

// ❌ 不提供默认值（翻译缺失时显示 key）
t('table.deleteSuccess')  // 可能显示 "table.deleteSuccess"
```

## 🔧 ESLint 规则

### require-i18n 规则（已实现）

```javascript
// lint-rules/eslint/rules/require-i18n.js
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: '检测硬编码的中文字符串，要求使用 i18n',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noChinese: '检测到中文字符串 "{{text}}"，请使用 i18n 翻译: t("{{suggestedKey}}")',
    },
  },
  create(context) {
    const chineseRegex = /[\u4e00-\u9fa5]/;
    
    return {
      Literal(node) {
        if (typeof node.value === 'string' && chineseRegex.test(node.value)) {
          // 排除注释、import 语句等
          const parent = node.parent;
          if (
            parent.type === 'ImportDeclaration' ||
            parent.type === 'ImportSpecifier'
          ) {
            return;
          }
          
          context.report({
            node,
            messageId: 'noChinese',
            data: {
              text: node.value.substring(0, 20),
              suggestedKey: 'your.translation.key',
            },
          });
        }
      },
      TemplateLiteral(node) {
        node.quasis.forEach((quasi) => {
          if (chineseRegex.test(quasi.value.raw)) {
            context.report({
              node: quasi,
              messageId: 'noChinese',
              data: {
                text: quasi.value.raw.substring(0, 20),
                suggestedKey: 'your.translation.key',
              },
            });
          }
        });
      },
    };
  },
};
```

### Pylint 规则建议

```python
# lint-rules/pylint/duckquery_pylint/checkers/no_chinese_messages.py

import re
from pylint.checkers import BaseChecker

class NoChinessMessagesChecker(BaseChecker):
    """检查是否有中文消息"""
    
    name = 'no-chinese-messages'
    msgs = {
        'W9020': (
            '检测到中文消息: %s，请使用英文或 MessageCode',
            'chinese-message',
            '用户可见的消息应使用英文或 MessageCode'
        ),
    }
    
    chinese_pattern = re.compile(r'[\u4e00-\u9fa5]')
    
    def visit_call(self, node):
        """检查函数调用"""
        # 检查 logger 调用
        if hasattr(node.func, 'attrname'):
            if node.func.attrname in ('info', 'warning', 'error', 'debug'):
                self._check_args(node)
        
        # 检查 HTTPException
        if hasattr(node.func, 'name') and node.func.name == 'HTTPException':
            self._check_args(node)
    
    def _check_args(self, node):
        """检查参数中是否有中文"""
        for arg in node.args:
            if hasattr(arg, 'value') and isinstance(arg.value, str):
                if self.chinese_pattern.search(arg.value):
                    self.add_message(
                        'chinese-message',
                        node=arg,
                        args=(arg.value[:20],)
                    )
```

## 📊 检查清单

### 代码提交前检查

- [ ] 所有 UI 文本使用 `t()` 函数
- [ ] 所有 toast 消息使用 i18n
- [ ] 所有 placeholder 使用 i18n
- [ ] 所有 label 使用 i18n
- [ ] 后端响应使用 MessageCode
- [ ] 后端日志使用英文
- [ ] 后端异常消息使用英文
- [ ] 通过 ESLint `require-i18n` 检查

### 翻译文件检查

- [ ] 中英文翻译文件结构一致
- [ ] 所有 key 都有对应翻译
- [ ] 翻译文本准确、自然
- [ ] 参数占位符正确
- [ ] 复数形式处理正确

## 🎯 迁移指南

### 步骤 1: 识别硬编码文本

```bash
# 使用 ESLint 检查
cd frontend && npm run lint

# 或使用 grep 搜索中文
grep -r "[\u4e00-\u9fa5]" src/ --include="*.tsx" --include="*.ts"
```

### 步骤 2: 添加翻译

```json
// zh/common.json
{
  "table": {
    "deleteSuccess": "删除成功"
  }
}

// en/common.json
{
  "table": {
    "deleteSuccess": "Deleted successfully"
  }
}
```

### 步骤 3: 替换硬编码

```typescript
// 修改前
toast.success('删除成功');

// 修改后
import { useTranslation } from 'react-i18next';
const { t } = useTranslation('common');
toast.success(t('table.deleteSuccess'));
```

### 步骤 4: 验证

```bash
# 运行 ESLint
npm run lint

# 切换语言测试
# 在浏览器中切换中英文，确保所有文本正确显示
```

## 🌍 支持的语言

| 语言 | 代码 | 状态 |
|------|------|------|
| 中文（简体） | zh | ✅ 支持 |
| English | en | ✅ 支持 |
| 日本語 | ja | 📋 计划中 |
| 한국어 | ko | 📋 计划中 |

## 📁 相关文件

| 文件 | 用途 |
|------|------|
| `frontend/src/i18n/config.js` | i18n 配置 |
| `frontend/src/i18n/locales/zh/` | 中文翻译文件 |
| `frontend/src/i18n/locales/en/` | 英文翻译文件 |
| `lint-rules/eslint/rules/require-i18n.js` | ESLint 规则 |
| `api/utils/response_helpers.py` | MessageCode 定义 |

## 🔗 参考资源

- [react-i18next 文档](https://react.i18next.com/)
- [i18next 文档](https://www.i18next.com/)
- [API 响应格式标准](./api-response-format-standard.md)

---

**维护者**: 项目团队  
**审核周期**: 每季度更新  
**强制执行**: ✅ 是
