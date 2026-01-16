# API 响应格式标准化 - 快速参考

> **快速查找**: 开发过程中的常用代码片段和检查清单

---

## 🚀 快速开始

### 后端 - 创建新端点

```python
from utils.response_helpers import create_success_response, MessageCode

@router.get("/api/my-resource")
async def get_my_resource():
    # 1. 获取数据
    data = {"id": 1, "name": "example"}
    
    # 2. 返回标准响应
    return create_success_response(
        data=data,
        message_code=MessageCode.OPERATION_SUCCESS
    )
```

### 前端 - 调用 API

```typescript
import { normalizeResponse } from '@/api/client';

async function fetchData() {
  const response = await axios.get('/api/my-resource');
  const { data, messageCode } = normalizeResponse(response);
  
  toast.success(t(`success.${messageCode}`));
  return data;
}
```

---

## 📋 常用代码片段

### 后端

#### 成功响应

```python
return create_success_response(
    data=result,
    message_code=MessageCode.OPERATION_SUCCESS
)
```

#### 列表响应

```python
return create_list_response(
    items=[item.dict() for item in items],
    total=len(items),
    message_code=MessageCode.ITEMS_RETRIEVED,
    page=page,
    page_size=page_size
)
```

#### 错误响应

```python
from fastapi.responses import JSONResponse

return JSONResponse(
    status_code=404,
    content=create_error_response(
        code="RESOURCE_NOT_FOUND",
        message="资源不存在",
        details={"id": resource_id}
    )
)
```

#### Pydantic 模型包装

```python
# ❌ 错误
return MyResponse(data=result)

# ✅ 正确
response = MyResponse(data=result)
return create_success_response(
    data=response.dict(),
    message_code=MessageCode.OPERATION_SUCCESS
)
```

### 前端

#### 普通响应解包

```typescript
const { data, messageCode } = normalizeResponse(response);
```

#### 列表响应解包

```typescript
const { items, total, page, pageSize } = normalizeResponse(response);
```

#### 错误处理

```typescript
try {
  await fetchData();
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(t(`errors.${error.code}`) || error.message);
  }
}
```

#### 下载接口错误处理

```typescript
try {
  const blob = await downloadFile(url);
  // 处理文件...
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(t(`errors.${error.code}`) || error.message);
  }
}
```

---

## 🔍 检查清单

### 提交前检查（后端）

- [ ] 使用了 `create_success_response` / `create_list_response` / `create_error_response`
- [ ] MessageCode 已在枚举中定义
- [ ] Pydantic 模型已 `.dict()` 后包装
- [ ] 错误响应包含 `code` 和 `details`
- [ ] 列表响应包含 `total` 字段
- [ ] 下载接口错误返回 JSON

### 提交前检查（前端）

- [ ] 使用了 `normalizeResponse` 解包
- [ ] 列表数据从 `items/total` 获取
- [ ] 错误提示基于 `messageCode` 翻译
- [ ] 下载接口使用了 `parseBlobError`
- [ ] Toast 提示使用了 i18n

### MessageCode 检查

- [ ] 后端枚举已定义
- [ ] 前端翻译已添加（中英文）
- [ ] 命名符合规范（`RESOURCE_ACTION_STATUS`）
- [ ] 无重复定义

---

## 🎯 MessageCode 命名规范

### 格式

```
RESOURCE_ACTION_STATUS
```

### 示例

```python
# 成功
USER_CREATED = "USER_CREATED"
ORDER_UPDATED = "ORDER_UPDATED"
PRODUCT_DELETED = "PRODUCT_DELETED"

# 错误
USER_NOT_FOUND = "USER_NOT_FOUND"
VALIDATION_FAILED = "VALIDATION_FAILED"
PERMISSION_DENIED = "PERMISSION_DENIED"

# 列表
USERS_RETRIEVED = "USERS_RETRIEVED"
ORDERS_RETRIEVED = "ORDERS_RETRIEVED"
```

---

## 🚫 常见错误

### 后端

#### ❌ 错误 1: 直接返回 dict

```python
# ❌ 错误
return {"data": result}

# ✅ 正确
return create_success_response(
    data=result,
    message_code=MessageCode.OPERATION_SUCCESS
)
```

#### ❌ 错误 2: 直接返回 Pydantic 模型

```python
# ❌ 错误
return MyResponse(data=result)

# ✅ 正确
response = MyResponse(data=result)
return create_success_response(
    data=response.dict(),
    message_code=MessageCode.OPERATION_SUCCESS
)
```

#### ❌ 错误 3: 硬编码 messageCode

```python
# ❌ 错误
return create_success_response(
    data=result,
    message_code="OPERATION_SUCCESS"  # 字符串
)

# ✅ 正确
return create_success_response(
    data=result,
    message_code=MessageCode.OPERATION_SUCCESS  # 枚举
)
```

### 前端

#### ❌ 错误 1: 直接使用 response.data

```typescript
// ❌ 错误
const data = response.data;

// ✅ 正确
const { data } = normalizeResponse(response);
```

#### ❌ 错误 2: 列表数据取值错误

```typescript
// ❌ 错误
const tables = response.data.tables;

// ✅ 正确
const { items: tables, total } = normalizeResponse(response);
```

#### ❌ 错误 3: 错误提示不使用 i18n

```typescript
// ❌ 错误
toast.error(error.message);

// ✅ 正确
toast.error(t(`errors.${error.code}`) || error.message);
```

---

## 📊 响应格式速查

### 成功响应结构

```json
{
  "success": true,           // 必需
  "data": { ... },           // 必需
  "messageCode": "...",      // 必需
  "message": "...",          // 必需
  "timestamp": "..."         // 必需
}
```

### 列表响应结构

```json
{
  "success": true,
  "data": {
    "items": [...],          // 必需
    "total": 100,            // 必需
    "page": 1,               // 可选
    "pageSize": 20           // 可选
  },
  "messageCode": "...",
  "message": "...",
  "timestamp": "..."
}
```

### 错误响应结构

```json
{
  "success": false,          // 必需
  "error": {                 // 必需
    "code": "...",           // 必需
    "message": "...",        // 必需
    "details": {}            // 可选
  },
  "detail": "...",           // 必需（FastAPI 兼容）
  "messageCode": "...",      // 必需
  "message": "...",          // 必需
  "timestamp": "..."         // 必需
}
```

---

## 🔧 调试技巧

### 后端调试

#### 检查响应格式

```python
# 在端点中打印响应
response = create_success_response(...)
print(json.dumps(response, indent=2))
return response
```

#### 验证 MessageCode

```python
# 检查枚举是否存在
assert MessageCode.OPERATION_SUCCESS in MessageCode
```

### 前端调试

#### 检查解包结果

```typescript
const result = normalizeResponse(response);
console.log('Normalized:', result);
```

#### 检查 i18n 翻译

```typescript
const messageCode = 'OPERATION_SUCCESS';
const translated = t(`success.${messageCode}`);
console.log(`${messageCode} -> ${translated}`);
```

---

## 📞 获取帮助

### 常见问题

**Q: 如何添加新的 MessageCode？**  
A: 
1. 后端: 在 `api/utils/response_helpers.py` 的 `MessageCode` 枚举中添加
2. 前端: 在 `frontend/src/i18n/locales/zh/errors.json` 和 `en/errors.json` 中添加翻译

**Q: 下载接口如何处理错误？**  
A: 使用 `parseBlobError` 函数解析 blob 错误响应

**Q: 如何处理旧端点？**  
A: 使用 `normalizeResponseCompat` 函数自动检测格式

**Q: 性能有影响吗？**  
A: 性能开销 < 20%，且可通过 Gzip 压缩优化

### 联系方式

- **文档**: 查看 `design.md` 和 `requirements.md`
- **示例**: 查看 `examples/` 目录
- **问题**: 提交 Issue 或联系技术负责人

---

## 🔗 相关链接

- [完整设计文档](./design.md)
- [详细任务清单](./tasks.md)
- [实施总结](./IMPLEMENTATION_SUMMARY.md)
- [项目规范](.kiro/steering/api-response-format-standard.md)

---

**最后更新**: 2026-01-16  
**维护者**: 项目团队
