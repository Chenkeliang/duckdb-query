# 多列筛选问题修复

## 问题描述

用户报告：在 TanStack Table 实现的数据表格中，当对多个列同时应用筛选时，结果不正确。

## 根本原因

问题出在 `selectedValues` 的数据类型处理上：

1. **内部状态使用 Set**：`useColumnFilter` Hook 内部使用 `Set<string>` 存储选中的值
2. **React 状态序列化**：当 `Set` 对象被传递到 React 状态（`columnFilters`）时，可能无法正确序列化
3. **类型不一致**：`customFilterFn` 假设 `selectedValues` 是 `Set`，但实际可能是数组或其他格式

## 修复方案

### 1. 在 FilterMenu 中转换 Set 为数组

**文件**: `frontend/src/new/Query/DataGrid/components/FilterMenu.tsx`

```typescript
// 确保 Set 被转换为数组以便序列化和状态管理
if (typeof next === 'object' && next !== null && 'selectedValues' in next) {
  const vf = next as ColumnFilterValue;
  const filterToApply = {
    selectedValues: Array.from(vf.selectedValues),
    mode: vf.mode,
  };
  onFilterChange?.(column, filterToApply);
} else {
  onFilterChange?.(column, next);
}
```

### 2. 在 customFilterFn 中兼容两种格式

**文件**: `frontend/src/new/Query/DataGrid/hooks/useDataGrid.ts`

```typescript
// 确保 selectedValues 是 Set（可能被序列化成数组）
const valuesSet = selectedValues instanceof Set 
  ? selectedValues 
  : new Set(Array.isArray(selectedValues) ? selectedValues : []);

if (!valuesSet || valuesSet.size === 0) {
  return mode === 'exclude';
}

const isSelected = valuesSet.has(cellStr);
return mode === 'include' ? isSelected : !isSelected;
```

### 3. 更新类型定义

**文件**: `frontend/src/new/Query/DataGrid/types.ts`

```typescript
export interface ColumnFilterValue {
  /** 选中的值（可以是 Set 或数组） */
  selectedValues: Set<string> | string[];
  /** 筛选模式：包含/排除 */
  mode: 'include' | 'exclude';
}
```

## 筛选逻辑说明

### 单列内多值：OR 逻辑

当一个列选中多个值时，使用 **OR 逻辑**（任一值匹配即可）：

```typescript
// 示例：商品名称列选中 ['苹果', '香蕉']
// 结果：显示商品名称为"苹果"或"香蕉"的行
selectedValues.has(cellStr) // 只要 cellStr 在 selectedValues 中就返回 true
```

### 多列筛选：AND 逻辑

当多个列都有筛选条件时，使用 **AND 逻辑**（所有列的条件都必须满足）：

```typescript
// 示例：
// - 类别列选中 ['水果', '蔬菜']
// - 商品名称列选中 ['苹果', '西红柿']
// 结果：显示（类别是水果或蔬菜）AND（商品名称是苹果或西红柿）的行
// 即：苹果（水果 AND 苹果）和西红柿（蔬菜 AND 西红柿）
```

这是 TanStack Table 的 `getFilteredRowModel()` 默认行为，无需额外配置。

## 测试覆盖

创建了完整的测试套件：`frontend/src/new/Query/DataGrid/hooks/__tests__/multiColumnFilter.test.ts`

测试场景包括：
- ✅ 单列筛选：选中多个值应使用 OR 逻辑
- ✅ 多列筛选：不同列应使用 AND 逻辑
- ✅ 多列筛选：复杂场景
- ✅ 排除模式：单列排除多个值
- ✅ selectedValues 为数组时也应正常工作
- ✅ 空值筛选

所有测试通过 ✅

## 验证步骤

1. 打开查询工作台
2. 执行查询获取数据
3. 对第一列应用筛选（选中多个值）
4. 对第二列应用筛选（选中多个值）
5. 验证结果：
   - 每列内的多个值使用 OR 逻辑
   - 不同列之间使用 AND 逻辑

## 相关文件

- `frontend/src/new/Query/DataGrid/hooks/useDataGrid.ts` - 自定义筛选函数
- `frontend/src/new/Query/DataGrid/hooks/useColumnFilter.ts` - 列筛选状态管理
- `frontend/src/new/Query/DataGrid/components/FilterMenu.tsx` - 筛选菜单 UI
- `frontend/src/new/Query/DataGrid/types.ts` - 类型定义
- `frontend/src/new/Query/DataGrid/hooks/__tests__/multiColumnFilter.test.ts` - 测试

## 注意事项

1. **Set vs Array**：内部使用 Set 提高查找性能，但传递给 React 状态时转换为数组
2. **向后兼容**：`customFilterFn` 同时支持 Set 和数组格式
3. **性能考虑**：对于大数据量，Set 的 `has()` 方法比数组的 `includes()` 更快（O(1) vs O(n)）

## 修复时间

2024-12-22
