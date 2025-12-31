# Tasks: SQL Query Toolbar Style Unification

## Overview

统一 SQL 查询面板和 JOIN 查询面板的工具栏按钮样式。

## Task List

### Task 1: Add Conditional Separator to SQLToolbar

**文件**: `frontend/src/new/Query/SQLQuery/SQLToolbar.tsx`

**修改内容**:
1. 添加 `Separator` 组件导入
2. 在组件内计算 `showSeparator` 条件
3. 在异步执行按钮和格式化按钮之间条件渲染分隔符
4. 分隔符代码：`<Separator orientation="vertical" className="h-4 mx-1" />`

**条件逻辑**:
```tsx
const showSeparator = (onAsyncExecute || isExecuting) && (onFormat || onSave);
```

**预计时间**: 10 分钟

---

### Task 2: Manual Verification

1. 运行 `npm run dev` 启动前端
2. 访问 `http://localhost:5173`
3. 打开 SQL 查询面板，确认分隔符显示正确
4. 切换到 JOIN 查询面板，对比样式一致性
5. 验证 Tooltip 快捷键提示仍正常工作
6. 测试边界情况：如果只有执行按钮没有格式化/保存，分隔符不应显示

---

### Task 3: (Optional) Unify JOIN Panel Separator

**可选优化**：将 JOIN 面板的分隔符也改为 `Separator` 组件，保持代码一致性。

**文件**: `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx`

**修改内容**:
- 替换 `<div className="w-[1px] h-4 bg-border mx-1" />` 为 `<Separator orientation="vertical" className="h-4 mx-1" />`

## Acceptance Criteria

- [ ] SQL 查询工具栏有分隔符
- [ ] 分隔符使用 `Separator` 组件（符合项目规范）
- [ ] 分隔符只在两组按钮都存在时显示
- [ ] Tooltip 快捷键提示正常工作
- [ ] 功能正常（执行、异步执行、格式化、保存按钮均可点击）
