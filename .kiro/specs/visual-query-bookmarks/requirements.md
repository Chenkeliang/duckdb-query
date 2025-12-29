# 可视化查询收藏功能 (Visual Query Bookmarks)

> **版本**: 1.0  
> **创建时间**: 2024-12-29  
> **状态**: 🟡 需求讨论中

---

## 📋 需求概述

为 DuckQuery 项目的可视化查询模式（JOIN 查询、集合操作）添加**SQL 收藏功能**，使用户能够将可视化构建的查询保存为书签，以便后续快速复用。

### 背景问题

1. **SQL 编辑器已有收藏**：`SQLQuery` 面板工具栏有收藏按钮，可将 SQL 保存到收藏夹
2. **可视化查询无收藏入口**：`JoinQueryPanel` 和 `SetOperationsPanel` 没有收藏按钮
3. **用户期望一致性**：用户希望在任何查询模式下都能保存常用查询

### 目标能力

| 目标 | 描述 |
|------|------|
| JOIN 查询可收藏 | 用户可将 JOIN 可视化构建的 SQL 保存到收藏夹 |
| 集合操作可收藏 | 用户可将 UNION/INTERSECT/EXCEPT 操作的 SQL 保存 |
| 体验一致 | 收藏按钮和对话框与 SQL 编辑器模式保持一致 |
| 复用现有组件 | 使用已有的 `SaveQueryDialog` 和 `useSavedQueries` Hook |

> [!NOTE]
> **本期范围**: 仅添加收藏入口，复用现有收藏基础设施，无需修改后端

---

## 🎯 用户故事

### 故事 1: JOIN 查询收藏
> 作为数据分析师，我经常需要将"订单表"和"用户表"进行 LEFT JOIN 查询，希望能保存这个查询配置，下次快速调用。

**验收标准**:
- [ ] JOIN 查询面板工具栏显示收藏按钮 (星形图标)
- [ ] 点击按钮弹出保存对话框，预填充生成的 SQL
- [ ] 保存成功后在收藏夹可见
- [ ] 从收藏夹加载后可在 SQL 编辑器中使用

### 故事 2: 集合操作收藏
> 作为用户，我需要定期合并多个数据表（UNION），希望保存这个操作供重复使用。

**验收标准**:
- [ ] 集合操作面板工具栏显示收藏按钮
- [ ] 预览 SQL 正确显示在对话框中
- [ ] 保存后可在收藏夹找到并使用

---

## 🔬 技术调研

### 现有组件分析

| 组件 | 位置 | 说明 |
|------|------|------|
| `SaveQueryDialog` | `Query/Bookmarks/SaveQueryDialog.tsx` | ✅ 可复用，接受 `sql` & `onSave` props |
| `useSavedQueries` | `Query/hooks/useSavedQueries.ts` | ✅ 提供 `saveQuery` mutation |
| `JoinQueryPanel` | `Query/JoinQuery/JoinQueryPanel.tsx` | ⚠️ 有 SQL 生成，缺收藏按钮 |
| `SetOperationsPanel` | `Query/SetOperations/SetOperationsPanel.tsx` | ⚠️ 有 SQL 生成，缺收藏按钮 |

### 差距分析

| 需要修改 | 工作量 |
|---------|--------|
| JoinQueryPanel 添加收藏按钮 | 小 |
| SetOperationsPanel 添加收藏按钮 | 小 |
| 新增组件/Hook | 无 |

---

## ✅ 验收标准

### 功能验收
- [ ] JOIN 查询面板有收藏按钮
- [ ] 集合操作面板有收藏按钮
- [ ] 点击收藏按钮打开 `SaveQueryDialog`
- [ ] 对话框中 SQL 预览与面板生成的 SQL 一致
- [ ] 保存成功后 Toast 提示
- [ ] 收藏夹列表可见新条目

### UI 一致性验收
- [ ] 收藏按钮样式与 SQL 编辑器一致
- [ ] 按钮位置在工具栏适当位置
- [ ] 暗色模式下显示正常

---

## 🚀 实现优先级

### P0 - 核心功能
1. JoinQueryPanel 添加收藏按钮和对话框
2. SetOperationsPanel 添加收藏按钮和对话框

### P1 - 增强 (未来迭代)
- 支持编辑已保存的可视化查询配置 (而非仅 SQL)
- 收藏夹支持标记查询来源类型 (SQL/JOIN/SET)
