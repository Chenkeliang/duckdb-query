# JOIN ON 子句筛选器增强 - 任务清单

> **版本**: 1.1  
> **创建时间**: 2024-12-25  
> **更新时间**: 2024-12-25  
> **状态**: 🟢 设计审查完成，待实施

---

## 📋 任务总览

| 阶段 | 任务 | 状态 | 预估 | 实际 |
|------|------|------|------|------|
| 1 | 类型扩展 | ⬜ | 2h | - |
| 2 | PlacementSelector 组件 | ⬜ | 2h | - |
| 3 | FilterPopover 集成 | ⬜ | 2h | - |
| 4 | FilterChip 标记 | ⬜ | 1h | - |
| 5 | SQL 生成逻辑 | ⬜ | 3h | - |
| 6 | 测试 | ⬜ | 2h | - |
| 7 | 国际化 | ⬜ | 1h | - |

**图例**: ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ❌ 已取消

---

## Phase 1: 类型扩展

### Task 1.1: 扩展 FilterCondition 类型
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/types.ts`

- [ ] 添加 `FilterPlacement` 类型定义
- [ ] 扩展 `FilterCondition` 接口，添加 `placement?: FilterPlacement` 字段
- [ ] 添加 `PlacementContext` 接口

```typescript
// 新增类型
export type FilterPlacement = 'on' | 'where';

export interface PlacementContext {
  isRightTable: boolean;
  joinType: 'INNER JOIN' | 'LEFT JOIN' | 'RIGHT JOIN' | 'FULL JOIN';
}
```

### Task 1.2: 添加工具函数
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/filterUtils.ts`

- [ ] 实现 `separateConditionsByPlacement()` 函数
- [ ] 实现 `cloneTreeWithoutOnConditions()` 递归克隆函数 ✅ **新增**
- [ ] 实现 `getConditionsForTable()` 函数
- [ ] 实现 `generateConditionsSQL()` 函数
- [ ] 实现 `formatSingleCondition()` 辅助函数 ✅ **新增**
- [ ] 实现 `getDefaultPlacement()` 智能默认函数
- [ ] 导出新函数

---

## Phase 2: PlacementSelector 组件

### Task 2.1: 创建组件
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/PlacementSelector.tsx`

- [ ] 创建 `PlacementSelectorProps` 接口
- [ ] 实现 RadioGroup 选择器 UI
- [ ] 实现智能推荐逻辑（显示"推荐"标记）
- [ ] 添加帮助提示（Tooltip）
- [ ] 支持 disabled 状态

### Task 2.2: 添加样式
- [ ] ON 和 WHERE 选项使用不同颜色标识
- [ ] 适配暗色模式
- [ ] 响应式布局

---

## Phase 3: FilterPopover 集成

### Task 3.1: 添加 placement 状态
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/FilterPopover.tsx`

- [ ] 添加 `placementContext` prop
- [ ] 添加 `selectedPlacement` state
- [ ] 实现智能默认值选择逻辑

### Task 3.2: UI 集成
- [ ] 在操作符和值之后添加 PlacementSelector
- [ ] 编辑模式下正确回显 placement
- [ ] 表单重置时重置 placement

### Task 3.3: 提交逻辑
- [ ] handleSubmit 中设置 condition.placement
- [ ] 验证逻辑无需变更（placement 不需要验证）

---

## Phase 4: FilterChip 标记

### Task 4.1: 显示 placement 标记
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/FilterChip.tsx`

- [ ] 读取 node.placement 字段
- [ ] 显示 ON/WHERE 小标签
- [ ] ✅ 使用语义化 CSS 类 `bg-accent`/`bg-muted`（禁止 Tailwind 原色类）
- [ ] 标签可点击切换类型（P2 可选）

### Task 4.2: Tooltip 增强
- [ ] Tooltip 内容包含 placement 信息
- [ ] 说明 ON 和 WHERE 的区别

---

## Phase 5: SQL 生成逻辑

### Task 5.1: 修改 generateSQL 函数
**文件**: `frontend/src/new/Query/JoinQuery/JoinQueryPanel.tsx`

- [ ] 调用 `separateConditionsByPlacement()` 分离条件
- [ ] 修改 JOIN 子句生成逻辑，附加对应表的 ON 条件
- [ ] ✅ 使用 `cloneTreeWithoutOnConditions()` 递归移除 ON 条件生成 WHERE

### Task 5.2: 处理边界情况
- [ ] 无 placement 字段的旧数据默认为 'where'
- [ ] 多表 JOIN 正确分配 ON 条件到对应的 JOIN
- [ ] Raw SQL 节点归入 WHERE
- [ ] ✅ 嵌套 group 内的 ON 条件也被正确移除

### Task 5.3: 调试日志
- [ ] 添加 console.log 追踪条件分离结果（开发时用）

### Task 5.4: ✅ ON 条件 OR 逻辑限制 **新增**
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/DraggableFilterList.tsx`

- [ ] 拖拽逻辑检查 placement，禁止 `placement='on'` 的条件被拖入 OR 分组
- [ ] 尝试将包含 ON 条件的 AND 分组切换为 OR 时，显示提示
- [ ] 添加 Toast 或 Popover 提示说明限制原因

---

## Phase 6: 测试

### Task 6.1: 单元测试
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/__tests__/filterUtils.test.ts`

- [ ] 测试 `separateConditionsByPlacement()`
  - 空条件返回两个空数组
  - 只有 ON 条件
  - 只有 WHERE 条件
  - 混合条件正确分离
  - 无 placement 字段默认 WHERE
  
- [ ] ✅ 测试 `cloneTreeWithoutOnConditions()` **新增**
  - 嵌套 group 内的 ON 条件被移除
  - 空 group 自动裁剪
  - WHERE 条件保留
  - raw 节点保留
  
- [ ] 测试 `getConditionsForTable()`
  - 按表名正确过滤
  - 空数组返回空
  
- [ ] ✅ 测试 `generateConditionsSQL()` / `formatSingleCondition()` **扩展**
  - 空数组返回空字符串
  - 单条件
  - 多条件用 AND 连接
  - 各种操作符正确转换为 SQL

- [ ] 测试 `getDefaultPlacement()`
  - LEFT JOIN 右表 → on
  - INNER JOIN 右表 → where
  - 无 context → where

### Task 6.2: 手动测试
- [ ] 创建 LEFT JOIN 查询
- [ ] 添加右表筛选条件，选择 ON
- [ ] 验证 SQL 预览正确
- [ ] 执行查询，验证结果包含左表无匹配（NULL）行
- [ ] 切换条件到 WHERE，验证 NULL 行被过滤
- [ ] ✅ 测试嵌套 group 场景：(A AND B_on) OR C，验证 B_on 被正确移除 **新增**
- [ ] ✅ 测试企图拖入 OR 场景：尝试将 `placement='on'` 的条件拖入 OR 分组，验证 UI 正确阻止

> [!IMPORTANT]
> **实施注意**: 部署拖拽限制后，要确保 UI 确实不会把 `placement='on'` 的条件放进 OR 分组，否则会生成语义错误的 SQL

---

## Phase 7: 国际化

### Task 7.1: 添加 i18n keys
**文件**: `frontend/src/i18n/locales/zh.json` 和 `en.json`

- [ ] `filter.placement.label`: 应用位置 / Condition Placement
- [ ] `filter.placement.on`: ON 子句 / ON Clause
- [ ] `filter.placement.where`: WHERE 子句 / WHERE Clause
- [ ] `filter.placement.onHint`: 条件在 JOIN 时生效... / ...
- [ ] `filter.placement.whereHint`: 条件在 JOIN 后生效... / ...
- [ ] `filter.chip.onBadge`: ON
- [ ] `filter.chip.whereBadge`: WHERE

### Task 7.2: 导出更新
**文件**: `frontend/src/new/Query/JoinQuery/FilterBar/index.ts`

- [ ] 导出 PlacementSelector 组件
- [ ] 导出新类型和函数

---

## 🎯 验收标准

### 功能验收
- [ ] FilterPopover 显示"应用位置"选项
- [ ] 智能默认：LEFT JOIN 右表条件默认 ON
- [ ] FilterChip 显示 ON/WHERE 标记
- [ ] SQL 生成正确放置条件

### 性能验收
- [ ] 条件分离逻辑 O(n) 复杂度
- [ ] 无明显渲染延迟

### 兼容性验收
- [ ] 旧 filterTree 数据正常工作
- [ ] SQL 模式暂不支持解析 ON 条件（降级为 WHERE）

---

## 📝 备注

### 已知限制
1. SQL 模式 → Visual 模式不解析 ON 条件（复杂度高，P2 实现）
2. ✅ ON 条件仅支持 AND 逻辑，不支持 OR（有明确 UI 限制）
3. CROSS JOIN 不显示 placement 选项（无意义）

### 后续优化
1. 支持 SQL 模式解析 ON 条件
2. 支持批量切换条件类型
3. 支持拖拽条件到不同 placement 区域

### ✅ 审查反馈已处理
1. **WHERE 子句递归剥离** - 添加 `cloneTreeWithoutOnConditions()` 函数
2. **ON 条件 OR 逻辑** - 明确限制为仅支持 AND，添加 UI 限制
3. **Tailwind 原色类** - 改用语义化类 `bg-accent`/`bg-muted`
4. **PlacementContext 数据源** - 添加详细说明和示例代码
5. **FilterUtils 实现细节** - 添加 `formatSingleCondition()` 和测试覆盖要求
