# Requirements Document

## Introduction

本需求文档旨在修复新版查询工作台（Query Workbench）中发现的三个交互问题，确保视觉效果和交互行为与 `docs/demo` 中的演示版本保持一致。

**技术约束**：
- 必须使用 shadcn/ui + Tailwind CSS + React 组件
- 布局使用 react-resizable-panels（已在 Phase 1 中集成）
- `docs/demo` 仅作为视觉效果和交互行为的参考标准
- 不照搬 demo 的 JS 实现，而是用 React 通用组件实现相同效果

## Glossary

- **DataSourcePanel**: 数据源面板，显示可用数据表的侧边栏组件
- **TreeSection**: 数据源面板中的可折叠分组组件（需使用 shadcn/ui Collapsible 组件）
- **ResultPanel**: 结果面板，显示查询结果的底部面板
- **QueryTabs**: 查询模式标签页组件（需使用 shadcn/ui Tabs 组件）
- **Demo**: `docs/demo/index.html` 中的演示版本，作为视觉和交互的参考标准
- **shadcn/ui**: 基于 Radix UI 的 React 组件库
- **Collapsible**: shadcn/ui 的可折叠组件
- **Tabs**: shadcn/ui 的标签页组件
- **ResizablePanel**: react-resizable-panels 库的面板组件

## Requirements

### Requirement 1: 数据源面板折叠功能

**User Story:** 作为用户，我希望能够折叠和展开数据源面板中的分组（如 DuckDB 表、数据库连接、系统表），以便更好地管理屏幕空间和专注于相关数据源。

**参考标准**：`docs/demo/index.html` 中数据源面板的折叠交互效果

**技术要求**：使用 shadcn/ui 的 Collapsible 组件实现

#### Acceptance Criteria

1. WHEN 用户点击 TreeSection 的标题栏 THEN 系统 SHALL 使用 Collapsible 组件切换该分组的展开/折叠状态
2. WHEN TreeSection 处于折叠状态 THEN 系统 SHALL 使用 CollapsibleContent 隐藏该分组下的所有表项
3. WHEN TreeSection 处于展开状态 THEN 系统 SHALL 使用 CollapsibleContent 显示该分组下的所有表项
4. WHEN 用户切换 TreeSection 状态 THEN 系统 SHALL 显示与 demo 相同的折叠/展开图标动画
5. WHEN 用户切换 TreeSection 状态 THEN 系统 SHALL 将状态持久化到 localStorage
6. WHEN 页面重新加载 THEN 系统 SHALL 从 localStorage 恢复上次的展开/折叠状态

### Requirement 2: 结果面板展开功能

**User Story:** 作为用户，我希望能够在折叠结果面板后重新展开它，以便查看查询结果。

**参考标准**：`docs/demo/index.html` 中结果面板的折叠/展开交互效果

**技术要求**：使用 react-resizable-panels 的 ResizablePanel 组件实现

#### Acceptance Criteria

1. WHEN 用户点击结果面板的折叠按钮 THEN 系统 SHALL 使用 ResizablePanel 的 collapse() 方法折叠面板
2. WHEN 结果面板处于折叠状态 THEN 系统 SHALL 显示展开按钮（与 demo 样式一致）
3. WHEN 用户点击展开按钮 THEN 系统 SHALL 使用 ResizablePanel 的 expand() 方法展开面板
4. WHEN 结果面板展开/折叠 THEN 系统 SHALL 使用与 demo 相同的平滑动画过渡
5. WHEN 用户调整结果面板高度后折叠再展开 THEN 系统 SHALL 恢复到折叠前的高度
6. WHEN 结果面板折叠/展开 THEN 系统 SHALL 保持与 demo 相同的视觉效果

### Requirement 3: 查询模式标签页一致性

**User Story:** 作为用户，我希望查询模式标签页（SQL 查询、JOIN 查询等）的视觉效果和交互方式与 demo 和数据源管理页面保持一致，以获得统一的用户体验。

**参考标准**：
- `docs/demo/index.html` 中的标签页视觉效果（`.tab-btn` 样式）
- `frontend/src/new/DataSource/DataSourcePage.tsx` 中的标签页实现

**技术要求**：使用 shadcn/ui 的 Tabs 组件，通过 className 覆盖默认样式

**当前问题**：
- 当前使用 shadcn/ui Tabs 的默认样式（`rounded-none`）
- Demo 使用自定义 `.tab-btn` 样式（圆角、间距、阴影）
- 需要通过 className 覆盖 shadcn/ui 的默认样式，实现与 demo 一致的视觉效果

**Demo 样式特征**：
```css
.tab-btn {
  padding: 0 0.75rem;
  height: 100%;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 6px;  /* 圆角 */
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tab-btn.active {
  background-color: hsl(var(--dq-muted));
  color: hsl(var(--dq-foreground));
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);  /* 阴影 */
}
```

#### Acceptance Criteria

1. WHEN 用户查看查询模式标签页 THEN 系统 SHALL 使用 shadcn/ui Tabs 组件并通过 className 覆盖样式
2. WHEN TabsList 渲染 THEN 系统 SHALL 应用 `bg-muted p-1 rounded-lg h-9 gap-1` 样式（与 demo 一致）
3. WHEN TabsTrigger 渲染 THEN 系统 SHALL 应用 `rounded-[6px]` 圆角样式（与 demo 一致）
4. WHEN TabsTrigger 处于激活状态 THEN 系统 SHALL 显示 `bg-surface text-foreground shadow-sm` 样式（与 demo 一致）
5. WHEN TabsTrigger 处于非激活状态 THEN 系统 SHALL 显示 `text-muted-foreground` 样式
6. WHEN 用户悬停在非激活 TabsTrigger 上 THEN 系统 SHALL 显示 `hover:text-foreground` 效果
7. WHEN 标签页包含图标 THEN 系统 SHALL 使用 `w-3 h-3` 图标大小和 `gap-2` 间距（与 demo 一致）
8. WHEN 用户在查询工作台和数据源管理页面间切换 THEN 系统 SHALL 保持标签页样式的一致性
