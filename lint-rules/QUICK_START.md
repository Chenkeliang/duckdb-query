# DuckQuery Lint 规则快速入门

## 🚀 5 分钟快速开始

### 1. 安装规则

```bash
# 在项目根目录运行
chmod +x scripts/setup-lint-rules.sh
./scripts/setup-lint-rules.sh
```

### 2. 运行检查

```bash
# 检查所有代码
./scripts/check-all.sh

# 或分别检查
cd frontend && npm run lint        # 前端
cd api && pylint .                 # 后端
```

### 3. 配置编辑器

#### VS Code

安装扩展：
- ESLint
- Pylint

配置 `.vscode/settings.json`:
```json
{
  "eslint.enable": true,
  "eslint.validate": [
    "javascript",
    "typescript",
    "typescriptreact"
  ],
  "python.linting.pylintEnabled": true,
  "python.linting.enabled": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

#### WebStorm / PyCharm

1. 打开 Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
2. 勾选 "Automatic ESLint configuration"
3. 打开 Settings → Tools → Python Integrated Tools
4. 设置 Pylint 为默认 linter

## 📋 常见错误及修复

### 前端错误

#### ❌ 错误 1: 新布局中使用 MUI

```typescript
// ❌ 错误
import { Button } from '@mui/material';

// ✅ 正确
import { Button } from '@/components/ui/button';
```

#### ❌ 错误 2: useEffect 中调用 API

```typescript
// ❌ 错误
const [tables, setTables] = useState([]);
useEffect(() => {
  fetch('/api/duckdb/tables')
    .then(r => r.json())
    .then(setTables);
}, []);

// ✅ 正确
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
const { tables } = useDuckDBTables();
```

#### ❌ 错误 3: 硬编码颜色

```typescript
// ❌ 错误
<div style={{ color: '#3b82f6' }}>文本</div>
<div className="text-[#3b82f6]">文本</div>

// ✅ 正确
<div className="text-primary">文本</div>
```

#### ❌ 错误 4: 硬编码中文文本

```typescript
// ❌ 错误：直接使用中文
<Button>提交</Button>
<div>欢迎使用</div>
const message = "操作成功";

// ✅ 正确：使用 i18n
import { useTranslation } from 'react-i18next';
const { t } = useTranslation('common');

<Button>{t('actions.submit')}</Button>
<div>{t('welcome.title')}</div>
const message = t('messages.success');
```

**为什么要这样做？**
- 支持多语言切换（中文/英文/日文）
- 统一管理所有文本
- 便于翻译和维护

### 后端错误

#### ❌ 错误 1: 直接返回字典

```python
# ❌ 错误
@router.get("/api/tables")
async def get_tables():
    return {"tables": tables}

# ✅ 正确
from utils.response_helpers import create_success_response, MessageCode

@router.get("/api/tables")
async def get_tables():
    return create_success_response(
        data={"tables": tables},
        message_code=MessageCode.OPERATION_SUCCESS
    )
```

#### ❌ 错误 2: 使用全局连接

```python
# ❌ 错误
import duckdb
conn = duckdb.connect('data.db')

def query():
    return conn.execute("SELECT * FROM table").fetchall()

# ✅ 正确
from core.duckdb_pool import pool

def query():
    with pool.get_connection() as conn:
        return conn.execute("SELECT * FROM table").fetchall()
```

#### ❌ 错误 3: 未定义的 MessageCode

```python
# ❌ 错误
return create_success_response(
    data={...},
    message_code="MY_CUSTOM_CODE"  # 未在 MessageCode 枚举中定义
)

# ✅ 正确
# 1. 在 api/utils/response_helpers.py 中添加:
class MessageCode(str, Enum):
    MY_CUSTOM_CODE = "MY_CUSTOM_CODE"

DEFAULT_MESSAGES = {
    MessageCode.MY_CUSTOM_CODE: "自定义消息",
}

# 2. 使用:
return create_success_response(
    data={...},
    message_code=MessageCode.MY_CUSTOM_CODE
)
```

## 🔧 高级配置

### 禁用特定规则

#### 前端 (ESLint)

```typescript
// 文件级别禁用
/* eslint-disable duckquery/no-mui-in-new-layout */

// 行级别禁用
import { Button } from '@mui/material'; // eslint-disable-line duckquery/no-mui-in-new-layout

// 块级别禁用
/* eslint-disable duckquery/no-hardcoded-colors */
const color = '#ff0000';
/* eslint-enable duckquery/no-hardcoded-colors */
```

#### 后端 (Pylint)

```python
# 文件级别禁用
# pylint: disable=direct-dict-return

# 函数级别禁用
def my_function():  # pylint: disable=direct-dict-return
    return {"data": "value"}

# 行级别禁用
return {"data": "value"}  # pylint: disable=direct-dict-return
```

### 调整规则严重程度

#### 前端

编辑 `frontend/.eslintrc.js`:
```javascript
rules: {
  'duckquery/no-hardcoded-colors': 'warn',  // 改为警告
  'duckquery/require-i18n': 'off',          // 关闭
}
```

#### 后端

编辑 `api/.pylintrc`:
```ini
[MESSAGES CONTROL]
disable=
    direct-dict-return,  # 禁用特定检查
```

## 📚 更多资源

- [完整规则文档](./README.md)
- [前端规则详解](./eslint/docs/)
- [后端规则详解](./pylint/docs/)
- [`AGENTS.md`](../AGENTS.md)

## 🤝 需要帮助？

- 查看 [常见问题](./FAQ.md)
- 提交 [Issue](https://github.com/your-org/duckquery/issues)
- 联系团队成员

## 🎯 下一步

1. ✅ 安装规则
2. ✅ 配置编辑器
3. ✅ 运行检查
4. 📖 阅读详细文档
5. 🚀 开始编码！
