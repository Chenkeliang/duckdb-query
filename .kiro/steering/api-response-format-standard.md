# API 响应格式与 i18n 国际化标准（2026-01 更新）

> **最后更新**: 2026-01-19  
> **版本**: 2.0  
> **状态**: ✅ 已验证与代码一致

## 🎯 核心设计

### 设计原则
1. **国际化优先**：所有响应包含 `messageCode` 用于前端翻译
2. **向后兼容**：保留 `message` 字段作为后备显示
3. **前后端联动**：后端定义 MessageCode，前端翻译显示

### 数据流

```
后端 API 响应
    ↓
{ success, data, messageCode, message, timestamp }
    ↓
前端接收响应
    ↓
使用 messageCode 查找 i18n 翻译
    ↓
显示本地化消息（toast/alert）
```

## 📐 标准响应格式

### 成功响应

```json
{
  "success": true,
  "data": { /* 实际返回的数据 */ },
  "messageCode": "TABLE_CREATED",
  "message": "表创建成功",
  "timestamp": "2026-01-19T08:00:00.000Z"
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "CONNECTION_FAILED",
    "message": "无法连接到数据库",
    "details": { "host": "localhost", "port": 3306 }
  },
  "messageCode": "CONNECTION_FAILED",
  "message": "无法连接到数据库",
  "timestamp": "2026-01-19T08:00:00.000Z"
}
```

### 列表响应

```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100
  },
  "messageCode": "TABLES_RETRIEVED",
  "message": "获取表列表成功",
  "timestamp": "2026-01-19T08:00:00.000Z"
}
```


## 🔧 后端实现

### 1. MessageCode 枚举

**位置**: `api/utils/response_helpers.py`

```python
from enum import Enum

class MessageCode(str, Enum):
    """
    消息代码枚举（用于国际化）
    
    命名规范: RESOURCE_ACTION_STATUS
    
    新增接口必须先在此枚举中登记，禁止使用硬编码字符串。
    """
    # 通用
    OPERATION_SUCCESS = "OPERATION_SUCCESS"
    ITEMS_RETRIEVED = "ITEMS_RETRIEVED"
    
    # 表相关
    TABLES_RETRIEVED = "TABLES_RETRIEVED"
    TABLE_CREATED = "TABLE_CREATED"
    TABLE_DELETED = "TABLE_DELETED"
    TABLE_NOT_FOUND = "TABLE_NOT_FOUND"
    
    # 连接相关
    CONNECTION_TEST_SUCCESS = "CONNECTION_TEST_SUCCESS"
    CONNECTION_TEST_FAILED = "CONNECTION_TEST_FAILED"
    CONNECTION_CREATED = "CONNECTION_CREATED"
    CONNECTION_FAILED = "CONNECTION_FAILED"
    
    # 查询相关
    QUERY_SUCCESS = "QUERY_SUCCESS"
    QUERY_FAILED = "QUERY_FAILED"
    
    # 错误
    VALIDATION_ERROR = "VALIDATION_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"
```

### 2. 响应辅助函数

```python
def create_success_response(
    data: Any,
    message_code: MessageCode,
    message: Optional[str] = None
) -> dict:
    """创建成功响应"""
    return {
        "success": True,
        "data": data,
        "messageCode": message_code.value,
        "message": message or DEFAULT_MESSAGES.get(message_code, ""),
        "timestamp": _get_utc_timestamp()
    }

def create_error_response(
    code: Union[str, MessageCode],
    message: str,
    details: Optional[dict] = None
) -> dict:
    """创建错误响应"""
    code_str = code.value if isinstance(code, MessageCode) else str(code)
    return {
        "success": False,
        "error": {"code": code_str, "message": message, "details": details or {}},
        "messageCode": code_str,
        "message": message,
        "timestamp": _get_utc_timestamp()
    }

def create_list_response(
    items: list,
    total: int,
    message_code: MessageCode,
    message: Optional[str] = None
) -> dict:
    """创建列表响应"""
    return create_success_response(
        data={"items": items, "total": total},
        message_code=message_code,
        message=message
    )
```

### 3. 在端点中使用

```python
from utils.response_helpers import create_success_response, create_error_response, MessageCode

@router.post("/api/duckdb/tables")
async def create_table(request: CreateTableRequest):
    try:
        result = await table_service.create(request)
        return create_success_response(
            data={"table": result},
            message_code=MessageCode.TABLE_CREATED
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=create_error_response(
                code=MessageCode.INTERNAL_ERROR,
                message=str(e)
            )
        )
```

## 🌐 前端 i18n 实现

### 1. 翻译文件结构

```
frontend/src/i18n/locales/
├── zh/
│   ├── common.json      # 通用翻译
│   └── errors.json      # MessageCode 翻译
└── en/
    ├── common.json
    └── errors.json
```

### 2. errors.json 翻译文件

**中文** (`frontend/src/i18n/locales/zh/errors.json`):
```json
{
  "OPERATION_SUCCESS": "操作成功",
  "TABLE_CREATED": "表创建成功",
  "TABLE_DELETED": "表已删除",
  "TABLE_NOT_FOUND": "表不存在",
  "CONNECTION_TEST_SUCCESS": "连接测试成功",
  "CONNECTION_TEST_FAILED": "连接测试失败",
  "QUERY_SUCCESS": "查询成功",
  "QUERY_FAILED": "查询执行失败",
  "VALIDATION_ERROR": "参数验证失败",
  "INTERNAL_ERROR": "系统内部错误"
}
```

**英文** (`frontend/src/i18n/locales/en/errors.json`):
```json
{
  "OPERATION_SUCCESS": "Operation successful",
  "TABLE_CREATED": "Table created successfully",
  "TABLE_DELETED": "Table deleted",
  "TABLE_NOT_FOUND": "Table not found",
  "CONNECTION_TEST_SUCCESS": "Connection test successful",
  "CONNECTION_TEST_FAILED": "Connection test failed",
  "QUERY_SUCCESS": "Query successful",
  "QUERY_FAILED": "Query execution failed",
  "VALIDATION_ERROR": "Validation failed",
  "INTERNAL_ERROR": "Internal server error"
}
```

### 3. 前端使用方式

```typescript
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

function MyComponent() {
  const { t } = useTranslation('errors');

  const handleAction = async () => {
    try {
      const response = await createTable(data);
      
      if (response.success) {
        // 使用 messageCode 获取本地化消息
        const message = t(response.messageCode) || response.message;
        toast.success(message);
      } else {
        const message = t(response.messageCode) || response.message;
        toast.error(message);
      }
    } catch (error) {
      toast.error(t('INTERNAL_ERROR'));
    }
  };
}
```

### 4. API 客户端封装

```typescript
// frontend/src/api/client.ts

import i18n from '@/i18n';

export function getLocalizedMessage(response: StandardResponse): string {
  // 优先使用 i18n 翻译
  const translated = i18n.t(`errors:${response.messageCode}`);
  
  // 如果翻译不存在（返回 key 本身），使用后端返回的 message
  if (translated === response.messageCode) {
    return response.message;
  }
  
  return translated;
}

// 使用示例
const response = await createTable(data);
const message = getLocalizedMessage(response);
toast.success(message);
```

## 📋 MessageCode 命名规范

### 命名格式

```
<RESOURCE>_<ACTION>_<STATUS>
```

### 示例

| MessageCode | 说明 |
|-------------|------|
| `TABLE_CREATED` | 表创建成功 |
| `TABLE_DELETED` | 表删除成功 |
| `TABLE_NOT_FOUND` | 表不存在 |
| `TABLES_RETRIEVED` | 获取表列表成功 |
| `CONNECTION_TEST_SUCCESS` | 连接测试成功 |
| `CONNECTION_TEST_FAILED` | 连接测试失败 |
| `QUERY_SUCCESS` | 查询成功 |
| `QUERY_FAILED` | 查询失败 |
| `VALIDATION_ERROR` | 参数验证失败 |
| `INTERNAL_ERROR` | 系统内部错误 |

## 🔄 新增 MessageCode 流程

### 1. 后端添加枚举

```python
# api/utils/response_helpers.py
class MessageCode(str, Enum):
    # ... 现有代码
    NEW_FEATURE_SUCCESS = "NEW_FEATURE_SUCCESS"  # 新增
```

### 2. 后端添加默认消息

```python
DEFAULT_MESSAGES = {
    # ... 现有代码
    MessageCode.NEW_FEATURE_SUCCESS: "新功能操作成功",  # 新增
}
```

### 3. 前端添加翻译

```json
// zh/errors.json
{
  "NEW_FEATURE_SUCCESS": "新功能操作成功"
}

// en/errors.json
{
  "NEW_FEATURE_SUCCESS": "New feature operation successful"
}
```

## 🚫 禁止的做法

### ❌ 硬编码消息

```python
# 错误
return {"success": True, "message": "操作成功"}

# 正确
return create_success_response(data={}, message_code=MessageCode.OPERATION_SUCCESS)
```

### ❌ 前端硬编码提示

```typescript
// 错误
toast.success('表创建成功');

// 正确
toast.success(t(response.messageCode) || response.message);
```

### ❌ 不使用 MessageCode 枚举

```python
# 错误
return create_success_response(data={}, message_code="TABLE_CREATED")

# 正确
return create_success_response(data={}, message_code=MessageCode.TABLE_CREATED)
```

## 📁 相关文件

| 文件 | 用途 |
|------|------|
| `api/utils/response_helpers.py` | MessageCode 枚举和响应辅助函数 |
| `frontend/src/i18n/locales/zh/errors.json` | 中文翻译 |
| `frontend/src/i18n/locales/en/errors.json` | 英文翻译 |
| `frontend/src/api/client.ts` | API 客户端封装 |

---

**维护者**: 项目团队  
**审核周期**: 每月更新
