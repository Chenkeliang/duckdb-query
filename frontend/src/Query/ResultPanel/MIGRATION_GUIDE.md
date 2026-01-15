# AG Grid 到 DataGrid 迁移指南

## 概述

我们正在将 ResultPanel 中的 AG Grid 替换为基于 TanStack Table 的 DataGrid 组件。

## 当前状态

- ✅ DataGrid 组件已实现
- ✅ DataGridWrapper 兼容层已创建
- ✅ ResultPanel 支持两种网格切换
- ⏳ 默认仍使用 AG Grid（向后兼容）

## 迁移计划

### Phase 1: 并行运行（当前阶段）
- AG Grid 和 DataGrid 并存
- 通过工具栏按钮切换
- 用户可以测试新功能

### Phase 2: 默认切换
- 将 DataGrid 设为默认选项
- AG Grid 作为备选方案
- 收集用户反馈

### Phase 3: 完全替换
- 移除 AG Grid 相关代码
- 清理依赖
- 更新文档

## 功能对比

| 功能 | AG Grid | DataGrid | 状态 |
|------|---------|----------|------|
| 基础表格显示 | ✅ | ✅ | 完成 |
| 虚拟滚动 | ✅ | ✅ | 完成 |
| 列排序 | ✅ | ✅ | 完成 |
| 列筛选 | ✅ | ✅ | 完成 |
| 单元格选区 | ✅ | ✅ | 完成 |
| 复制功能 | ✅ | ✅ | 完成 |
| 列宽调整 | ✅ | ✅ | 完成 |
| 右键菜单 | ✅ | ✅ | 完成 |
| 键盘导航 | ✅ | ✅ | 完成 |
| 性能优化 | ✅ | ✅ | 完成 |

## 优势对比

### DataGrid 优势
- 🚀 更好的性能（10万行 × 200列）
- 📦 更小的包体积（无需 AG Grid 许可证）
- 🎨 更好的主题集成（shadcn/ui + Tailwind）
- 🔧 更灵活的定制
- 📱 更好的移动端支持

### AG Grid 优势
- 🏢 企业级功能丰富
- 📚 文档完善
- 🔄 现有代码稳定

## 废弃的文件

以下文件已标记为废弃，将在 Phase 3 移除：

- `AGGridWrapper.tsx` - 使用 `DataGridWrapper.tsx` 替代
- `CustomHeaderComponent.tsx` - 使用 DataGrid 内置列头替代
- `hooks/useAGGridConfig.ts` - 使用 DataGrid hooks 替代
- `ColumnFilterMenu.tsx` - 使用 DataGrid 内置筛选替代

## 开发者指南

### 如何切换到 DataGrid

在 ResultPanel 工具栏中，点击右侧的切换按钮即可在两种网格间切换。

### 如何测试 DataGrid

1. 打开任意查询结果页面
2. 点击工具栏中的 "AG Grid" / "DataGrid" 按钮切换
3. 测试以下功能：
   - 排序（点击列头）
   - 筛选（点击筛选图标）
   - 选区（拖拽选择单元格）
   - 复制（Ctrl+C 或右键菜单）
   - 键盘导航（方向键、Home/End 等）

### 如何报告问题

如果发现 DataGrid 的问题，请：
1. 切换回 AG Grid 验证问题是否存在
2. 记录重现步骤
3. 提交 Issue 并标记 `datagrid` 标签

## 相关文件

- `DataGrid/` - 新的 DataGrid 组件
- `DataGridWrapper.tsx` - 兼容层包装器
- `ResultPanel.tsx` - 主面板组件
- `ResultToolbar.tsx` - 工具栏（包含切换按钮）
