# 统一查询历史记录需求文档 (Unified Query History)

> **版本**: 1.0  
> **创建时间**: 2024-12-29  
> **状态**: 🟡 待审查

---

## 📋 需求概述

为 DuckQuery 项目**统一查询历史记录逻辑**，确保所有类型的查询（SQL、JOIN、集合操作、透视表）执行后都能正确记录到全局历史中。

### 背景问题

1. **历史记录分散在多个系统**：
   - `useGlobalHistory` - 全局历史 Hook（目标系统）
   - `useSQLEditor` - SQL 编辑器内部历史（localStorage `duckquery-sql-history`）
   - `useQueryBuilder` - 可视化查询构建器内部历史（localStorage `duckquery_query_history`）

2. **部分查询不记录历史**：
   - ✅ `SQLQueryPanel` - 正确调用 `addToHistory`
   - ❌ `JoinQueryPanel` - 仅调用 `onExecute`，无历史记录
   - ❌ `SetOperationsPanel` - 仅调用 `onExecute`，无历史记录
   - ❌ `PivotTablePanel` - 仅调用 `onExecute`，无历史记录

3. **用户反馈**：执行了查询但在历史记录面板中找不到

### 目标能力

| 目标 | 描述 |
|------|------|
| 统一历史记录 | 所有查询模式执行后都记录到 `useGlobalHistory` |
| 类型区分 | 历史记录包含查询类型（sql/join/set/pivot） |
| 最小改动 | 通过在 `QueryTabs` 层包装 `onExecute` 实现，避免修改每个 Panel |
| 去重逻辑 | `SQLQueryPanel` 已自行记录，避免重复记录 |

---

## 🔬 技术调研结果

### 现有代码分析

#### GlobalHistoryItem 数据结构

```typescript
// frontend/src/new/Query/hooks/useGlobalHistory.ts
interface GlobalHistoryItem {
  id: string;
  type: 'sql' | 'join' | 'set' | 'pivot';  // 查询类型
  sql: string;
  timestamp: number;
  executionTime?: number;
  rowCount?: number;
  error?: string;
  name?: string;
}
```

#### 各组件执行入口

| 组件 | 执行函数 | 是否记录历史 |
|------|---------|-------------|
| `SQLQueryPanel` | `handleExecute()` (L319-378) | ✅ 调用 `addToHistory({ type: 'sql', ... })` |
| `JoinQueryPanel` | `handleExecute()` → `onExecute(sql, source)` | ❌ |
| `SetOperationsPanel` | `handleExecute()` → `onExecute(sql, source)` | ❌ |
| `PivotTablePanel` | `handleExecute()` → `onExecute(sql, source)` | ❌ |

#### QueryTabs 传递链

```typescript
// QueryTabs/index.tsx
<JoinQueryPanel onExecute={onExecute} ... />
<SetOperationsPanel onExecute={onExecute} ... />
<PivotTablePanel onExecute={onExecute} ... />
```

`onExecute` 直接透传，无中间层包装。

---

## 🎯 用户故事

### 故事 1: JOIN 查询记录历史
> 作为数据分析师，我使用 JOIN 查询面板执行了一个多表关联查询，希望稍后能在历史记录中找到并重新执行。

**验收标准**:
- [ ] JOIN 查询执行成功后出现在历史记录面板
- [ ] 历史记录显示查询类型为 "join"
- [ ] 包含执行时间和 SQL 语句

### 故事 2: 集合操作记录历史
> 作为用户，我执行了 UNION 操作，希望能在历史中看到这条记录。

**验收标准**:
- [ ] 集合操作执行后出现在历史记录
- [ ] 类型标记为 "set"

### 故事 3: 透视表查询记录历史
> 作为用户，我创建了透视表查询，希望能保存到历史便于复用。

**验收标准**:
- [ ] 透视表查询执行后出现在历史记录
- [ ] 类型标记为 "pivot"

---

## ✅ 验收标准

### 功能验收
- [ ] 从 JOIN 面板执行的查询出现在全局历史
- [ ] 从集合操作面板执行的查询出现在全局历史
- [ ] 从透视表面板执行的查询出现在全局历史
- [ ] SQL 面板不重复记录（已有自己的记录逻辑）
- [ ] 历史记录的 `type` 字段正确标识查询类型

### 兼容性验收
- [ ] 不影响现有 SQL 面板的历史记录功能
- [ ] 不影响查询执行的正常流程
- [ ] 历史记录面板 UI 无需修改

---

## 📋 实现优先级

### P0 - 核心功能
1. 在 `QueryTabs` 中创建 `wrapExecute` 包装函数
2. 为 JOIN、集合操作、透视表面板传递包装后的执行函数

### P1 - 完善
3. 确保 SQL 面板不重复记录
4. 添加错误情况的历史记录
