# API 响应格式标准规范

## 🎯 目标

建立统一的、支持国际化的 API 响应格式标准，适用于所有后端 API 端点。

## 📐 标准响应格式

### 成功响应

```json
{
  "success": true,
  "data": {
    // 实际返回的数据
  },
  "messageCode": "OPERATION_SUCCESS",
  "message": "操作成功",
  "timestamp": "2024-12-02T19:08:05.123456Z"
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  },
  "messageCode": "ERROR_CODE",
  "message": "错误描述",
  "timestamp": "2024-12-02T19:08:05.123456Z"
}
```

### 列表响应

```json
{
  "success": true,
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "messageCode": "LIST_RETRIEVED",
  "message": "获取列表成功",
  "timestamp": "2024-12-02T19:08:05.123456Z"
}
```

## 📋 字段说明

### 必需字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `success` | boolean | 操作是否成功 | `true` / `false` |
| `messageCode` | string | 消息代码（用于国际化） | `"OPERATION_SUCCESS"` |
| `message` | string | 默认语言的消息文本 | `"操作成功"` |
| `timestamp` | string | ISO 8601 格式的 UTC 时间戳 | `"2024-12-02T19:08:05.123456Z"` |

### 条件字段

| 字段 | 类型 | 条件 | 说明 |
|------|------|------|------|
| `data` | object | success = true | 成功时返回的数据 |
| `error` | object | success = false | 失败时返回的错误信息 |

## 🔧 后端实现

### 1. 创建响应辅助函数模块

**位置**: `api/utils/response_helpers.py`

```python
"""
统一响应格式辅助函数
"""

from datetime import datetime
from typing import Any, Optional
from enum import Enum


class MessageCode(str, Enum):
    """消息代码枚举（用于国际化）"""
    # 根据具体业务定义消息代码
    OPERATION_SUCCESS = "OPERATION_SUCCESS"
    OPERATION_FAILED = "OPERATION_FAILED"
    # ... 更多消息代码


# 默认消息文本映射
DEFAULT_MESSAGES = {
    MessageCode.OPERATION_SUCCESS: "操作成功",
    MessageCode.OPERATION_FAILED: "操作失败",
    # ... 更多映射
}


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
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def create_error_response(
    code: str,
    message: str,
    details: Optional[dict] = None
) -> dict:
    """创建错误响应"""
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details or {}
        },
        "messageCode": code,
        "message": message,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def create_list_response(
    items: list,
    total: int,
    message_code: MessageCode,
    message: Optional[str] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None
) -> dict:
    """创建列表响应"""
    data = {
        "items": items,
        "total": total
    }
    
    if page is not None:
        data["page"] = page
    if page_size is not None:
        data["pageSize"] = page_size
    
    return create_success_response(
        data=data,
        message_code=message_code,
        message=message
    )
```

### 2. 在端点中使用

```python
from utils.response_helpers import (
    create_success_response,
    create_error_response,
    create_list_response,
    MessageCode
)

@router.post("/api/resource")
async def create_resource(data: dict):
    try:
        result = service.create(data)
        
        return create_success_response(
            data={"resource": result},
            message_code=MessageCode.RESOURCE_CREATED
        )
    except Exception as e:
        error_response = create_error_response(
            code="OPERATION_FAILED",
            message=f"创建失败: {str(e)}",
            details={"error": str(e)}
        )
        raise HTTPException(status_code=500, detail=error_response)


@router.get("/api/resources")
async def list_resources():
    try:
        resources = service.list_all()
        
        return create_list_response(
            items=[r.dict() for r in resources],
            total=len(resources),
            message_code=MessageCode.RESOURCES_RETRIEVED
        )
    except Exception as e:
        error_response = create_error_response(
            code="OPERATION_FAILED",
            message=f"获取列表失败: {str(e)}"
        )
        raise HTTPException(status_code=500, detail=error_response)
```

## 🌐 前端使用

### 1. 创建 i18n 配置

```javascript
// frontend/src/i18n/messages.js

export const messages = {
  'zh-CN': {
    'OPERATION_SUCCESS': '操作成功',
    'OPERATION_FAILED': '操作失败',
    'RESOURCE_CREATED': '资源创建成功',
    'RESOURCES_RETRIEVED': '获取资源列表成功',
    // ... 更多翻译
  },
  'en-US': {
    'OPERATION_SUCCESS': 'Operation successful',
    'OPERATION_FAILED': 'Operation failed',
    'RESOURCE_CREATED': 'Resource created successfully',
    'RESOURCES_RETRIEVED': 'Resources retrieved successfully',
    // ... more translations
  },
  'ja-JP': {
    'OPERATION_SUCCESS': '操作成功',
    'OPERATION_FAILED': '操作失敗',
    'RESOURCE_CREATED': 'リソースが正常に作成されました',
    'RESOURCES_RETRIEVED': 'リソースリストが正常に取得されました',
    // ... その他の翻訳
  }
};
```

### 2. 创建响应处理函数

```javascript
// frontend/src/utils/apiResponseHandler.js

export function handleApiResponse(response, i18n) {
  // 获取本地化消息
  const localizedMessage = i18n 
    ? (i18n.t(response.messageCode) || response.message)
    : response.message;

  if (response.success) {
    return {
      success: true,
      data: response.data,
      messageCode: response.messageCode,
      message: localizedMessage,
      timestamp: response.timestamp
    };
  } else {
    return {
      success: false,
      error: response.error,
      messageCode: response.messageCode,
      message: localizedMessage,
      timestamp: response.timestamp
    };
  }
}
```

### 3. 在组件中使用

```javascript
import { useTranslation } from 'react-i18n';
import { handleApiResponse } from '@/utils/apiResponseHandler';

function MyComponent() {
  const { t } = useTranslation();
  
  const handleAction = async () => {
    try {
      const response = await fetch('/api/resource', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      const handled = handleApiResponse(result, { t });
      
      if (handled.success) {
        toast.success(handled.message); // 显示本地化消息
      } else {
        toast.error(handled.message);
      }
    } catch (error) {
      toast.error('网络错误');
    }
  };
  
  return (
    // ... 组件 JSX
  );
}
```

## ✅ 实施检查清单

### 后端

- [ ] 创建 `api/utils/response_helpers.py`
- [ ] 定义 `MessageCode` 枚举
- [ ] 创建 `DEFAULT_MESSAGES` 映射
- [ ] 实现 `create_success_response()` 函数
- [ ] 实现 `create_error_response()` 函数
- [ ] 实现 `create_list_response()` 函数
- [ ] 更新所有端点使用新格式
- [ ] 确保所有响应包含必需字段
- [ ] 运行语法检查（无错误）

### 前端

- [ ] 创建 i18n 配置文件
- [ ] 添加所有 `MessageCode` 的翻译
- [ ] 创建响应处理函数
- [ ] 更新 API 调用使用响应处理函数
- [ ] 测试多语言切换

### 测试

- [ ] 测试成功响应格式
- [ ] 测试错误响应格式
- [ ] 测试列表响应格式
- [ ] 验证时间戳格式（ISO 8601）
- [ ] 验证国际化功能
- [ ] 测试所有端点

## 🎯 设计原则

### 1. 国际化优先

- 所有响应都包含 `messageCode` 用于前端翻译
- 保留 `message` 字段作为后备显示
- 支持多语言无缝切换

### 2. 向后兼容

- 保留 `message` 字段确保现有代码可以继续工作
- 渐进式迁移，不破坏现有功能

### 3. API 测试友好

- `message` 字段包含可读的默认文本
- 响应结构清晰，易于调试

### 4. 一致性

- 所有端点使用相同的响应格式
- 统一的错误处理方式
- 标准化的时间戳格式

## 📝 消息代码命名规范

### 命名格式

使用大写下划线格式（UPPER_SNAKE_CASE）：

```
<RESOURCE>_<ACTION>_<STATUS>
```

### 示例

```python
# 资源操作
RESOURCE_CREATED = "RESOURCE_CREATED"
RESOURCE_UPDATED = "RESOURCE_UPDATED"
RESOURCE_DELETED = "RESOURCE_DELETED"
RESOURCE_RETRIEVED = "RESOURCE_RETRIEVED"
RESOURCES_RETRIEVED = "RESOURCES_RETRIEVED"

# 测试/验证
CONNECTION_TEST_SUCCESS = "CONNECTION_TEST_SUCCESS"
CONNECTION_TEST_FAILED = "CONNECTION_TEST_FAILED"
VALIDATION_SUCCESS = "VALIDATION_SUCCESS"
VALIDATION_FAILED = "VALIDATION_FAILED"

# 批量操作
BATCH_OPERATION_SUCCESS = "BATCH_OPERATION_SUCCESS"
BATCH_OPERATION_FAILED = "BATCH_OPERATION_FAILED"

# 通用错误
OPERATION_FAILED = "OPERATION_FAILED"
INVALID_REQUEST = "INVALID_REQUEST"
NOT_FOUND = "NOT_FOUND"
PERMISSION_DENIED = "PERMISSION_DENIED"
```

## 🚫 禁止的做法

### ❌ 硬编码消息

```python
# 错误
return {"message": "操作成功"}

# 正确
return create_success_response(
    data={...},
    message_code=MessageCode.OPERATION_SUCCESS
)
```

### ❌ 不一致的响应格式

```python
# 错误 - 缺少 messageCode
return {
    "success": True,
    "data": {...},
    "message": "操作成功"
}

# 正确 - 包含所有必需字段
return {
    "success": True,
    "data": {...},
    "messageCode": "OPERATION_SUCCESS",
    "message": "操作成功",
    "timestamp": "2024-12-02T19:08:05Z"
}
```

### ❌ 直接返回数据

```python
# 错误
return datasources

# 正确
return create_list_response(
    items=[ds.dict() for ds in datasources],
    total=len(datasources),
    message_code=MessageCode.DATASOURCES_RETRIEVED
)
```

## 📚 参考实现

### 完整示例

参考 `api/routers/datasources.py` 中的实现：

- 测试连接端点
- 创建/更新/删除端点
- 列表查询端点
- 单个资源查询端点

### 相关文档

- [I18N 响应格式设计](.kiro/specs/backend-datasource-api-unification/I18N_RESPONSE_FORMAT.md)
- [响应格式实施指南](.kiro/specs/backend-datasource-api-unification/RESPONSE_FORMAT_IMPLEMENTATION.md)
- [设计文档](.kiro/specs/backend-datasource-api-unification/design.md)

## 🎉 优势总结

### 对开发者

- 🔧 **易于实现** - 使用辅助函数，几行代码搞定
- 📝 **易于维护** - 消息代码集中管理
- 🧪 **易于测试** - API 响应可读性好

### 对用户

- 🌍 **多语言支持** - 自动显示用户语言
- 🎯 **一致体验** - 所有消息统一翻译
- 🚀 **无缝切换** - 语言切换即时生效

### 对产品

- 📈 **国际化就绪** - 轻松支持新语言
- 🔄 **向后兼容** - 不破坏现有功能
- 🎨 **灵活扩展** - 易于添加新消息

---

**版本**: 1.0  
**创建时间**: 2024-12-02  
**适用范围**: 所有后端 API 端点  
**状态**: ✅ 标准规范
