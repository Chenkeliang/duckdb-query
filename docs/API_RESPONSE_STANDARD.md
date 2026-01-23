# API 响应格式标准

> **版本**: 2.0  
> **最后更新**: 2026-01-23  
> **状态**: ✅ 已实施  
> **相关规范文档**: 详细规范请参考 [.kiro/steering/api-response-format-standard.md](../.kiro/steering/api-response-format-standard.md)

## 概述

本文档定义了 DuckQuery 项目所有 API 端点的标准响应格式。所有后端 API 必须遵循此标准，以确保前端能够统一处理响应。

## 标准响应格式

### 成功响应

```json
{
  "success": true,
  "data": {
    // 实际返回的数据
  },
  "messageCode": "OPERATION_SUCCESS",
  "message": "操作成功",
  "timestamp": "2026-01-16T12:00:00.000000Z"
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
  "messageCode": "ITEMS_RETRIEVED",
  "message": "获取列表成功",
  "timestamp": "2026-01-16T12:00:00.000000Z"
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "参数验证失败",
    "details": {
      "field": "name",
      "reason": "不能为空"
    }
  },
  "messageCode": "VALIDATION_ERROR",
  "message": "参数验证失败",
  "timestamp": "2026-01-16T12:00:00.000000Z"
}
```

## 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `success` | boolean | ✅ | 操作是否成功 |
| `data` | object | 成功时 | 返回的数据 |
| `error` | object | 失败时 | 错误信息 |
| `messageCode` | string | ✅ | 消息代码（用于 i18n） |
| `message` | string | ✅ | 默认消息文本 |
| `timestamp` | string | ✅ | ISO 8601 UTC 时间戳 |

### 列表数据字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `items` | array | ✅ | 数据列表 |
| `total` | number | ✅ | 总数量 |
| `page` | number | 可选 | 当前页码 |
| `pageSize` | number | 可选 | 每页数量 |

### 错误对象字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `code` | string | ✅ | 错误代码 |
| `message` | string | ✅ | 错误消息 |
| `details` | object | 可选 | 详细错误信息 |

## 后端使用示例

### Python/FastAPI

```python
from utils.response_helpers import (
    create_success_response,
    create_list_response,
    create_error_response,
    MessageCode,
)

# 成功响应
@router.get("/api/tables/{name}")
async def get_table(name: str):
    table = get_table_by_name(name)
    return create_success_response(
        data={"table": table},
        message_code=MessageCode.TABLE_RETRIEVED,
    )

# 列表响应
@router.get("/api/tables")
async def list_tables():
    tables = get_all_tables()
    return create_list_response(
        items=tables,
        total=len(tables),
        message_code=MessageCode.TABLES_RETRIEVED,
    )

# 错误响应
@router.post("/api/tables")
async def create_table(data: TableCreate):
    try:
        table = create_new_table(data)
        return create_success_response(
            data={"table": table},
            message_code=MessageCode.TABLE_CREATED,
        )
    except ValidationError as e:
        raise HTTPException(
            status_code=400,
            detail=create_error_response(
                code="VALIDATION_ERROR",
                message=str(e),
                details={"field": e.field}
            )
        )
```

## 前端使用示例

### TypeScript/React

```typescript
import { normalizeResponse, handleApiError } from '@/api/client';
import { showSuccessToast, handleApiErrorToast } from '@/utils/toastHelpers';

// 基础查询
async function fetchTable(name: string) {
  try {
    const response = await apiClient.get(`/api/tables/${name}`);
    const { data, messageCode } = normalizeResponse(response);
    
    showSuccessToast(t, messageCode);
    return data.table;
  } catch (error) {
    handleApiErrorToast(t, error, '获取表失败');
    throw error;
  }
}

// 列表查询
async function fetchTables() {
  const response = await apiClient.get('/api/tables');
  const { items, total, messageCode } = normalizeResponse(response);
  
  console.log(`获取到 ${total} 个表`);
  return items;
}

// 使用 TanStack Query
function useTable(name: string) {
  return useQuery({
    queryKey: ['table', name],
    queryFn: async () => {
      const response = await apiClient.get(`/api/tables/${name}`);
      const { data } = normalizeResponse(response);
      return data.table;
    },
  });
}
```

## MessageCode 命名规范

### 命名格式

```
<RESOURCE>_<ACTION>_<STATUS>
```

### 示例

| MessageCode | 说明 |
|-------------|------|
| `OPERATION_SUCCESS` | 通用成功 |
| `TABLE_CREATED` | 表创建成功 |
| `TABLE_DELETED` | 表删除成功 |
| `TABLES_RETRIEVED` | 获取表列表成功 |
| `VALIDATION_ERROR` | 参数验证失败 |
| `CONNECTION_TIMEOUT` | 连接超时 |

### 完整 MessageCode 列表

参见 `api/utils/response_helpers.py` 中的 `MessageCode` 枚举。

## 国际化支持

### 前端翻译文件

- 中文: `frontend/src/i18n/locales/zh/errors.json`
- 英文: `frontend/src/i18n/locales/en/errors.json`

### 使用方式

```typescript
import { useTranslation } from 'react-i18next';
import { showSuccessToast } from '@/utils/toastHelpers';

function MyComponent() {
  const { t } = useTranslation();
  
  const handleSuccess = (messageCode: string) => {
    // 自动从 errors.json 获取翻译
    showSuccessToast(t, messageCode);
  };
}
```

## 相关文件

| 文件 | 说明 |
|------|------|
| `api/utils/response_helpers.py` | 后端响应辅助函数和 MessageCode 枚举 |
| `frontend/src/api/client.ts` | 前端 API 客户端 |
| `frontend/src/api/types.ts` | 前端类型定义（StandardSuccess, StandardError） |
| `frontend/src/i18n/locales/*/errors.json` | i18n 翻译文件 |

## 相关规范文档

- [API 响应格式标准（详细版）](../.kiro/steering/api-response-format-standard.md) - 完整的规范文档
- [国际化强制规范](../.kiro/steering/i18n-enforcement-standards.md) - MessageCode 和 i18n 机制
- [前端开发约束](../.kiro/steering/frontend-constraints.md) - 前端 API 调用规范
- [后端开发约束](../.kiro/steering/backend-constraints.md) - 后端响应格式规范

## 测试

### 后端测试

```bash
cd api
python -m pytest tests/test_response_helpers.py -v
python -m pytest tests/test_endpoint_responses.py -v
```

### 前端测试

```bash
cd frontend
npm run test -- --run src/api/__tests__/client.test.ts
```
