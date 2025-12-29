# 统一查询历史记录 - 任务清单

> **版本**: 1.0  
> **创建时间**: 2024-12-29  
> **状态**: 🟡 待实施

---

## 📋 任务列表

### Phase 1: 核心实现

- [ ] **Task 1.1**: 修改 `QueryTabs/index.tsx`
  - [ ] 添加 `useGlobalHistory` 导入（已有，确认使用 `addToHistory`）
  - [ ] 创建 `createWrappedExecute` 工厂函数
  - [ ] 创建 `handleJoinExecute`、`handleSetExecute`、`handlePivotExecute`
  - [ ] 更新 `JoinQueryPanel` 的 `onExecute` prop
  - [ ] 更新 `SetOperationsPanel` 的 `onExecute` prop
  - [ ] 更新 `PivotTablePanel` 的 `onExecute` prop

### Phase 2: 验证

- [ ] **Task 2.1**: 功能测试
  - [ ] 测试 JOIN 查询历史记录
  - [ ] 测试集合操作历史记录
  - [ ] 测试透视表查询历史记录
  - [ ] 验证 SQL 面板无重复记录
  - [ ] 验证错误查询也被记录

---

## 📊 进度跟踪

| Phase | 状态 | 完成度 |
|-------|------|--------|
| Phase 1 | 🟡 待开始 | 0% |
| Phase 2 | ⚪ 待开始 | 0% |

---

## 📝 实施笔记

### 预估工时

| 任务 | 预估时间 |
|------|---------|
| Task 1.1 | 15 分钟 |
| Task 2.1 | 10 分钟 |
| **总计** | **25 分钟** |

### 风险点

1. **memo 依赖**：确保 `createWrappedExecute` 的依赖项正确，避免不必要的重渲染
2. **错误传播**：包装函数需正确重新抛出错误，确保子组件能显示错误状态
