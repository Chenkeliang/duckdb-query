# DuckQuery 项目规范更新总结

> **更新日期**: 2026-01-19  
> **更新版本**: 3.0  
> **更新人员**: AI Assistant  
> **审核状态**: ✅ 待人工审核

## 📊 更新概览

本次更新对项目规范进行了全面的重写和扩充，确保规范文档与当前代码实现完全一致。

### 更新文件清单

| 文件 | 状态 | 变更类型 | 重要性 |
|------|------|----------|--------|
| `AGENTS.md` | ✅ 重写 | 重大更新 | 🔴 高 |
| `current-project-status.md` | ✅ 重写 | 重大更新 | 🔴 高 |
| `frontend-constraints.md` | ✅ 重写 | 重大更新 | 🔴 高 |
| `tanstack-query-standards.md` | ✅ 重写 | 重大更新 | 🔴 高 |
| `data-source-refresh-patterns.md` | ✅ 重写 | 重大更新 | 🔴 高 |
| `typescript-api-module-standards.md` | ✅ 重写 | 重大更新 | 🟡 中 |
| `backend-constraints.md` | ✅ 重写 | 重大更新 | 🟡 中 |

## 🔴 重大变更说明

### 1. 目录结构变更

**旧路径** → **新路径**：
- `frontend/src/new/` → `frontend/src/`（`new` 目录已不存在）
- `frontend/src/new/hooks/` → `frontend/src/hooks/`
- `frontend/src/new/utils/` → `frontend/src/utils/`
- `frontend/src/new/Query/` → `frontend/src/Query/`
- `frontend/src/new/DataSource/` → `frontend/src/DataSource/`
- `frontend/src/new/Layout/` → `frontend/src/Layout/`
- `frontend/src/new/components/ui/` → `frontend/src/components/ui/`


### 2. 导入路径变更

```typescript
// 旧路径
import { Button } from '@/components/ui/button';
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';

// 新路径
import { Button } from '@/components/ui/button';
import { useDuckDBTables } from '@/hooks/useDuckDBTables';
import { invalidateAfterTableCreate } from '@/utils/cacheInvalidation';
```

### 3. 后端新增规范

#### 时区处理规范

**核心原则**：根据目标字段的数据类型选择函数，而不是根据业务场景。

| 目标类型 | 函数 | 返回值 | 使用场景 |
|----------|------|--------|----------|
| `str` | `get_current_time_iso()` | `"2026-01-19T16:00:00+08:00"` | JSON 文件、API 响应 |
| `datetime` | `get_current_time()` | `datetime(带时区)` | Pydantic 模型、ORM |
| `datetime(UTC)` | `get_storage_time()` | `datetime(UTC naive)` | DuckDB 存储 |

**注意**：两个函数返回的是**同一个时间点**，只是格式不同。

#### 表名处理规范

| 场景 | `allow_leading_digit` | 说明 |
|------|----------------------|------|
| 用户提供表别名 | `True` | 尊重用户输入 |
| 文件名作为默认值 | `False` | 避免数字开头 |

### 4. API 响应格式与 i18n 联动

**响应格式**：
```json
{
  "success": true,
  "data": {},
  "messageCode": "TABLE_CREATED",
  "message": "表创建成功",
  "timestamp": "2026-01-19T08:00:00.000Z"
}
```

**前后端联动流程**：
1. 后端使用 `MessageCode` 枚举定义消息代码
2. 后端返回 `messageCode` 和默认 `message`
3. 前端使用 `messageCode` 查找 i18n 翻译
4. 如果翻译存在，显示翻译；否则显示后端返回的 `message`

**新增 MessageCode 流程**：
1. 后端：在 `api/utils/response_helpers.py` 的 `MessageCode` 枚举中添加
2. 后端：在 `DEFAULT_MESSAGES` 中添加默认消息
3. 前端：在 `frontend/src/i18n/locales/zh/errors.json` 添加中文翻译
4. 前端：在 `frontend/src/i18n/locales/en/errors.json` 添加英文翻译

### 5. 缓存失效工具

所有缓存刷新必须使用 `frontend/src/utils/cacheInvalidation.ts` 中的函数：

| 函数 | 使用场景 |
|------|----------|
| `invalidateAfterTableCreate()` | 表创建后 |
| `invalidateAfterFileUpload()` | 文件上传后 |
| `invalidateAfterTableDelete()` | 表删除后 |
| `invalidateAfterDatabaseChange()` | 数据库连接变更后 |
| `invalidateAllDataCaches()` | 全局刷新 |

## ✅ 验证清单

- [x] 所有文件路径已验证存在
- [x] 所有 API 函数名称已验证正确
- [x] 所有 Hook 名称已验证正确
- [x] 所有缓存失效函数已验证正确
- [x] 时区处理规范已验证
- [x] 表名处理规范已验证

## 🔗 相关文档链接

### 核心规范文档

- [AGENTS.md](../../AGENTS.md) - 项目开发规范总览
- [当前项目状态](./current-project-status.md) - 项目整体状态和架构
- [前端开发约束](./frontend-constraints.md) - 前端开发规范
- [后端开发约束](./backend-constraints.md) - 后端开发规范
- [TanStack Query 使用标准](./tanstack-query-standards.md) - 数据获取规范
- [TypeScript API 模块标准](./typescript-api-module-standards.md) - API 模块使用指南
- [数据源刷新模式](./data-source-refresh-patterns.md) - 缓存刷新规范
- [API 统一化规则](./api-unification-rules.md) - API 调用规范
- [API 响应格式标准](./api-response-format-standard.md) - 响应格式规范

---

**文档维护者**: AI Assistant  
**下次审核时间**: 2026-02-19
