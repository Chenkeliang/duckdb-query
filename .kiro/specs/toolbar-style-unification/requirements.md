# Requirements: SQL Query Toolbar Style Unification

## Overview

当前 SQL 查询面板和 JOIN 查询面板的工具栏按钮样式不一致。SQL 查询面板使用了填充式橙色按钮（如"执行"），而 JOIN 查询面板应采用相同的设计语言，包括一致的按钮样式、分隔符和布局。

## Current State Analysis

### SQL Query Panel (SQLToolbar.tsx)

按钮布局及样式：
- **执行** (`variant="default"`)：填充式橙色主按钮
- **异步执行** (`variant="outline"`)：边框式次要按钮
- **格式化** (`variant="ghost"`)：幽灵按钮
- **保存** (`variant="ghost"`)：幽灵按钮

特点：
- 所有按钮水平排列，无明确分隔符
- 使用 TooltipProvider 包裹提供快捷键提示
- 执行时间显示在右侧状态区域

### JOIN Query Panel (JoinQueryPanel.tsx lines 1460-1520)

按钮布局及样式：
- **执行** (`variant="default"`)：填充式橙色主按钮 ✓ 一致
- **清空** (`variant="ghost"`)：幽灵按钮
- **收藏** (`variant="ghost"`)：幽灵按钮

现有分隔符：
- 执行按钮后有一个 `<div className="w-[1px] h-4 bg-border mx-1" />`

缺失：
- 无"异步执行"按钮
- 无"格式化"按钮（JOIN 查询自动生成 SQL，格式化意义不大）

## Requirements

### R1: Visual Consistency

1.1. SQL 查询面板工具栏按钮应与 JOIN 查询面板采用相同的分隔符样式

1.2. 分隔符样式统一为：`<div className="w-[1px] h-4 bg-border mx-1" />`

1.3. 按钮分组逻辑：
   - 第一组：主要执行操作（执行、异步执行、取消）
   - 分隔符
   - 第二组：辅助操作（格式化、保存/收藏）

### R2: Button Style Consistency

2.1. 所有面板的"执行"按钮使用 `variant="default"` (填充式橙色)

2.2. "异步执行"按钮使用 `variant="outline"` (边框式)

2.3. "格式化"、"保存"、"清空"、"收藏"等辅助按钮使用 `variant="ghost"`

### R3: Tooltip Consistency

3.1. 所有可操作按钮应有 Tooltip 提示

3.2. 包含快捷键的按钮应在 Tooltip 中显示快捷键

## Success Criteria

- [ ] SQLToolbar 在"执行"/"异步执行"组和"格式化"/"保存"组之间添加分隔符
- [ ] 两个面板的按钮样式视觉上看起来一致
- [ ] 分隔符样式统一
