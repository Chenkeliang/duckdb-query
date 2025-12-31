# Design: SQL Query Toolbar Style Unification

## Overview

本设计文档描述如何统一 SQL 查询面板和 JOIN 查询面板的工具栏按钮样式。

## Design Goals

1. **视觉一致性**：两个面板的工具栏看起来属于同一设计系统
2. **最小改动**：只修改需要统一的部分，保持现有功能不变
3. **可维护性**：考虑未来提取公共组件的可能性

## Proposed Changes

---

### [MODIFY] SQLToolbar.tsx

**文件**: `frontend/src/new/Query/SQLQuery/SQLToolbar.tsx`

#### 1. 添加 Separator 导入

```diff
+import { Separator } from '@/new/components/ui/separator';
```

#### 2. 条件渲染分隔符

分隔符只在"执行组"和"辅助组"都存在按钮时才渲染：

```tsx
// 判断是否需要显示分隔符
const showSeparator = (onAsyncExecute || isExecuting) && (onFormat || onSave);
```

#### 3. 插入分隔符

在异步执行按钮和格式化按钮之间：

```tsx
{/* 异步执行按钮 */}
{onAsyncExecute && ( ... )}

{/* 分隔符 - 只在两组按钮都存在时显示 */}
{showSeparator && (
  <Separator orientation="vertical" className="h-4 mx-1" />
)}

{/* 格式化按钮 */}
{onFormat && ( ... )}
```

> [!NOTE]
> 使用 shadcn/ui 的 `Separator` 组件替代 `w-[1px]` 任意值写法，符合项目规范 (AGENTS.md 5.1)。

#### 4. 保持 Tooltip 结构

分隔符插入在 `TooltipProvider` 内部、各 `Tooltip` 之间，不会破坏现有的快捷键提示功能。

---

### JOIN 面板说明

JOIN 查询面板 (`JoinQueryPanel.tsx`) 当前已满足同样的分组结构：

- 执行组：执行按钮
- 分隔符：`<div className="w-[1px] h-4 bg-border mx-1" />`（可选：后续统一改为 `Separator`）
- 辅助组：清空、收藏按钮

**无需额外调整**。如需代码一致性，可在后续迭代中将 JOIN 面板的分隔符也改为 `Separator` 组件。

---

## 按钮分组逻辑

```
| 执行 | 异步执行 | 分隔符 | 格式化 | 保存 |
|------|---------|--------|--------|------|
| default | outline |   |   | ghost | ghost |
```

## Verification Plan

### Manual Verification

1. 启动开发服务器：`npm run dev`（前端）
2. 打开浏览器访问 `http://localhost:5173`
3. 依次查看"SQL 查询"和"JOIN 查询"两个标签页
4. 对比两个工具栏的按钮样式和分隔符是否视觉一致
5. 确认 SQL 查询面板的"执行"/"异步执行"和"格式化"/"保存"之间有分隔符
6. **验证 Tooltip 提示仍然正常显示**（悬停显示快捷键）
7. **验证只传 onExecute 时（无 onFormat/onSave），分隔符不显示**

### Visual Comparison Checklist

- [ ] SQL 查询面板有分隔符分隔执行区和辅助区
- [ ] JOIN 查询面板保持现有分隔符
- [ ] 按钮颜色和样式一致（执行=橙色填充，其他=边框/幽灵）
- [ ] 快捷键 Tooltip 正常工作
- [ ] 无孤立分隔符（缺少第二组按钮时分隔符不渲染）
