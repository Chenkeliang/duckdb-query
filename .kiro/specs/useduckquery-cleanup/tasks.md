# useDuckQuery 清理与状态管理重构 - 任务清单

> **版本**: 1.1  
> **创建时间**: 2024-12-24  
> **更新时间**: 2024-12-24（修正 7 处问题）  
> **预计时间**: 5 个工作日

---

## 📋 前置条件

- ✅ TanStack Query 已配置（`QueryProvider`）
- ✅ `cacheInvalidation.ts` 工具函数已存在
- ✅ `useDuckDBTables`, `useDatabaseConnections` 等 Hooks 已存在
- ✅ 项目构建正常（`npm run build`）

---

## 📚 技术规范（必读）

**开发前必须阅读**：
- [TanStack Query 规范](../../steering/tanstack-query-standards.md)
- [缓存失效迁移指南](../../../frontend/src/new/docs/MIGRATION_TO_TANSTACK_QUERY.md)
- [AGENTS.md](../../../AGENTS.md) - UI 样式规范

### 关键规范摘要

| 类别 | 规范 |
|------|------|
| **新 Hooks** | 使用 TypeScript（`.ts` / `.tsx`） |
| **状态存储** | localStorage key 保持不变 |
| **缓存失效** | 使用 `@/new/utils/cacheInvalidation.ts` 工具 |
| **API 调用** | 使用 `@/services/apiClient` 中的函数 |
| **queryKey** | **必须使用 cacheInvalidation 工具，禁止手写** |
| **禁止事项** | ❌ 新代码中调用 `requestManager` |

---

## 🎯 总体目标

1. 创建 6 个新 Hooks 替代 `useDuckQuery.js`
2. 改造 `DuckQueryApp.jsx` 使用新 Hooks
3. 更新相关组件的刷新机制
4. 删除 `useDuckQuery.js` 中的旧代码

---

## ⚠️ 关键兼容性要求（评审修正）

> [!CAUTION]
> 以下行为必须完整保留，否则会导致功能回退：

| # | 现有行为 | 必须保留的原因 |
|---|----------|----------------|
| 1 | `body` 添加 `dq-theme / dq-theme--dark / dq-theme--light` | `modern.css` 遗留样式依赖 |
| 2 | 派发 `duckquery-theme-change` 事件 | 可能有外部监听者 |
| 3 | 数据库连接"先测试后创建"流程 | 用户期望看到"测试失败"而非"创建失败" |
| 4 | 默认 Tab 为 `datasource` | 欢迎页关闭后落在数据源页 |
| 5 | 使用 `cacheInvalidation.ts` 工具 | 确保正确的 queryKey |
| 6 | `githubStars` 在 state 中 | `DuckQueryApp.jsx` 解构使用 |
| 7 | `setShowWelcome` 只支持关闭 | 不支持 `setShowWelcome(true)` |

---

## Phase 1: 创建新 Hooks（2天）

### Day 1: 基础状态 Hooks

- [ ] 1. 创建 `useThemePreference` Hook
  - 创建 `frontend/src/new/hooks/useThemePreference.ts`
  - 实现 `getInitialTheme()` 逻辑（从 localStorage / 系统偏好）
  - 实现 `setIsDarkMode` 和 `toggleTheme`
  - 实现 `useEffect` 同步到 DOM class 和 localStorage
  - **⚠️ 必须给 `html` 添加/移除 `dark` 类**
  - **⚠️ 必须给 `body` 添加 `dq-theme` 基类**
  - **⚠️ 必须给 `body` 切换 `dq-theme--dark` / `dq-theme--light`**
  - **⚠️ 必须派发 `duckquery-theme-change` 自定义事件**
  - 保持 localStorage key 为 `duck-query-theme`
  - 导出 `UseThemePreferenceReturn` 类型
  - _Requirements: 故事 1, 兼容性要求 #1, #2_

- [ ] 2. 创建 `useWelcomeState` Hook
  - 创建 `frontend/src/new/hooks/useWelcomeState.ts`
  - 实现 `shouldShowWelcome()` 逻辑（7 天规则）
  - 实现 `closeWelcome()` 并持久化到 localStorage
  - **⚠️ 只支持 `closeWelcome()`，不支持 `setShowWelcome(true)`**
  - 保持 localStorage key 为 `duck-query-welcome-shown`
  - _Requirements: 故事 2, 兼容性要求 #7_

- [ ] 3. 创建 `usePreviewState` Hook
  - 创建 `frontend/src/new/hooks/usePreviewState.ts`
  - 实现 `previewQuery` 状态管理
  - 实现 `setPreviewQuery` 和 `clearPreviewQuery`
  - _Requirements: 故事 5_

- [ ] 4. 创建 `useGithubStars` Hook（新增）
  - 创建 `frontend/src/new/hooks/useGithubStars.ts`
  - 实现异步获取 GitHub 星数
  - 返回 `{ githubStars: number | null, isLoading: boolean }`
  - **⚠️ 必须独立为 Hook，确保 `state.githubStars` 不是 undefined**
  - _Requirements: 兼容性要求 #6_

- [ ] 5. 为基础 Hooks 添加单元测试
  - 创建 `frontend/src/new/hooks/__tests__/useThemePreference.test.ts`
  - 创建 `frontend/src/new/hooks/__tests__/useWelcomeState.test.ts`
  - 创建 `frontend/src/new/hooks/__tests__/usePreviewState.test.ts`
  - 创建 `frontend/src/new/hooks/__tests__/useGithubStars.test.ts`
  - **测试 `useThemePreference`：body 类添加、事件派发**
  - 测试初始化、状态更新、持久化
  - _Requirements: 代码质量验收_

### Day 2: 操作 Hooks

- [ ] 6. 创建 `useAppActions` Hook
  - 创建 `frontend/src/new/hooks/useAppActions.ts`
  - 使用 `useQueryClient()` 获取 QueryClient
  - 实现 `refreshAllData()` 调用 `invalidateAllDataCaches(queryClient)`
  - **⚠️ 实现 `handleDatabaseConnect()` 必须保留"先测试后创建"流程：**
    1. 新建时：先调用 `testDatabaseConnection()` → 成功后 `createDatabaseConnection()`
    2. 已保存 + 存储密码：调用 `refreshDatabaseConnection()`
    3. **测试失败时返回"测试失败"消息，而非"创建失败"**
  - 实现 `handleDatabaseSaveConfig()` 逻辑（保存/更新）
  - **⚠️ 缓存失效必须使用工具函数：**
    - `invalidateAfterDatabaseChange(queryClient)` - 连接变更后
    - `invalidateAllDataCaches(queryClient)` - 全局刷新
    - **❌ 禁止手写 queryKey（如 `['datasources']`，正确的是 `['data-sources']`）**
  - _API: `testDatabaseConnection`, `refreshDatabaseConnection`, `createDatabaseConnection` from `@/services/apiClient`_
  - _缓存失效: `invalidateAfterDatabaseChange`, `invalidateAllDataCaches` from `@/new/utils/cacheInvalidation`_
  - _Requirements: 故事 3, 故事 4, 兼容性要求 #3, #5_

- [ ] 7. 创建 `useAppShell` 过渡壳 Hook
  - 创建 `frontend/src/new/hooks/useAppShell.ts`
  - 组合 `useThemePreference`, `useWelcomeState`, `usePreviewState`, `useGithubStars`, `useAppActions`
  - **⚠️ `currentTab` 默认值必须是 `'datasource'`（与原实现一致）**
  - **⚠️ `state` 必须包含 `githubStars`**
  - 导出与 `useDuckQuery` 兼容的 `{ state, actions }` 接口
  - `setShowWelcome(false)` 调用 `closeWelcome()`，`setShowWelcome(true)` 无效果
  - _Requirements: 兼容性要求 #4, #6, #7_

- [ ] 8. 为操作 Hooks 添加单元测试
  - 创建 `frontend/src/new/hooks/__tests__/useAppActions.test.ts`
  - 创建 `frontend/src/new/hooks/__tests__/useAppShell.test.ts`
  - Mock `useQueryClient` 和 API 调用
  - **测试 `useAppActions`：**
    - 先测试后创建流程
    - 调用正确的 cacheInvalidation 工具
    - 测试失败返回正确消息
  - **测试 `useAppShell`：**
    - 默认 Tab 为 `datasource`
    - 包含 `githubStars`
    - `setShowWelcome(true)` 无效果
  - _Requirements: 代码质量验收_

### Day 2 检查点

- [ ] 9. Checkpoint - 验证新 Hooks
  - 所有 6 个新 Hooks 文件已创建
  - TypeScript 类型检查通过 (`npx tsc --noEmit`)
  - 单元测试通过
  - 不影响现有代码（此时未替换）

---

## Phase 2: 替换 DuckQueryApp（1天）

### Day 3: 入口改造

- [ ] 10. 备份 DuckQueryApp.jsx
  - 创建 `DuckQueryApp.jsx.backup`（可选，用于回滚参考）
  - _Requirements: 风险缓解_

- [ ] 11. 修改 DuckQueryApp.jsx 导入
  - 移除 `import useDuckQuery from "./hooks/useDuckQuery"`
  - 添加 `import { useAppShell } from "./new/hooks/useAppShell"`
  - _Requirements: 兼容性验收_

- [ ] 12. 替换 Hook 调用
  - 将 `const { state, actions } = useDuckQuery()` 替换为 `const { state, actions } = useAppShell()`
  - 验证解构出的 `state` 和 `actions` 字段匹配
  - **⚠️ 确认 `state.githubStars` 存在且不是 undefined**
  - _Requirements: 兼容性验收_

- [ ] 13. 验证 DuckQueryApp 功能
  - 主题切换正常
  - **⚠️ 主题切换后 body 有 `dq-theme--dark` / `dq-theme--light` 类**
  - 欢迎页显示/关闭正常
  - **⚠️ 默认 Tab 是数据源页（不是查询工作台）**
  - **⚠️ `githubStars` 正常显示（如果 Header 使用）**
  - 标签页切换正常
  - 命令面板正常
  - 键盘快捷键正常
  - _Requirements: 兼容性验收_

---

## Phase 3: 更新调用方组件（1天）

### Day 4: 组件刷新机制改造

- [ ] 14. 更新 UploadPanel 组件
  - 检查 `onDataSourceSaved` prop 的使用
  - 方案 A：保持 prop，内部改用 `invalidateAfterFileUpload(queryClient)`
  - 方案 B：移除 prop，完全内部处理刷新
  - 确保上传成功后数据源列表更新
  - _缓存失效: `invalidateAfterFileUpload` from `@/new/utils/cacheInvalidation`_
  - _Requirements: 故事 3_

- [ ] 15. 更新 DataPasteCard 组件
  - 同 UploadPanel 处理方式
  - 确保粘贴数据成功后数据源列表更新
  - _Requirements: 故事 3_

- [ ] 16. 更新 DatabaseForm 组件
  - 检查 `onTest`, `onSave`, `onSaveConfig` props
  - 评估是否需要改为内部使用 `useAppActions`
  - 或保持 props，由父组件传入新的 actions
  - 确保操作成功后连接列表更新
  - _Requirements: 故事 4_

- [ ] 17. 更新 SavedConnectionsList 组件
  - 检查 `onRefresh` prop 的使用
  - 如果使用 TanStack Query，可能不需要 `refreshConfigs` 计数器
  - 验证列表是否自动响应缓存失效
  - _Requirements: 故事 3_

- [ ] 18. 更新 CommandPalette 刷新操作
  - 找到 `action === 'refresh'` 的处理逻辑
  - 确保调用新的 `refreshAllData` 或 `invalidateAllDataCaches`
  - _Requirements: 故事 3_

- [ ] 19. 更新 useKeyboardShortcuts 快捷键
  - 找到 `refreshData` 或 `refreshDataSources` 的配置
  - 确保调用新的刷新方法
  - _Requirements: 故事 3_

### Day 4 检查点

- [ ] 20. Checkpoint - 验证组件刷新
  - 上传文件 → 数据源列表自动更新 ✅
  - 粘贴数据 → 数据源列表自动更新 ✅
  - 保存连接 → 连接列表自动更新 ✅
  - 删除表 → 表列表自动更新 ✅
  - 全局刷新快捷键生效 ✅
  - 命令面板刷新生效 ✅

---

## Phase 4: 清理旧代码（0.5天）

### Day 5 上午: 代码清理

- [ ] 21. 清理 useDuckQuery.js 未使用的函数
  - 删除 `normalizeColumnType()`
  - 删除 `normalizeBooleanValue()`
  - 删除 `transformMetadataColumns()`
  - 删除 `buildColumnTypeMap()`
  - 删除 `quoteIdentifier()`
  - 删除 `escapeLikeValue()`
  - 删除 `escapeLiteralValue()`
  - 删除 `isNumericValue()`
  - 删除 `buildFilterConditions()`
  - 删除 `buildFilteredSql()`
  - 删除 `extractBaseSql()`
  - _Requirements: 清理验收_

- [ ] 22. 清理 useDuckQuery.js 未使用的状态
  - 删除 `queryResults` 状态
  - 删除 `activeFilters` 状态
  - 删除 `queryContext` 状态
  - 删除 `dataSources` 状态（如果完全由 TanStack Query 接管）
  - 删除 `databaseConnections` 状态（如果完全由 TanStack Query 接管）
  - 删除 `handleResultsReceived()`
  - 删除 `handleApplyResultFilters()`
  - _Requirements: 清理验收_

- [ ] 23. 评估 useDuckQuery.js 删除
  - 如果所有功能已迁移到新 Hooks
  - 且无其他文件引用 `useDuckQuery`
  - 则删除 `frontend/src/hooks/useDuckQuery.js`
  - 否则保留为精简壳子
  - _Requirements: 清理验收_

- [ ] 24. 清理 requestManager 新调用
  - 确认新代码中没有 `requestManager.clearAllCache()` 调用
  - 确认新代码中没有 `requestManager.clearCache()` 调用
  - `apiClient.js` 中的调用**暂时保留**（旧 API 层兼容）
  - _Requirements: 清理验收_

---

## Phase 5: 验证与文档（0.5天）

### Day 5 下午: 全面验证

- [ ] 25. 构建验证
  - 运行 `npm run build` 确保无错误
  - 运行 `npx tsc --noEmit` 确保类型正确
  - 运行 `npm run lint` 确保代码规范
  - _Requirements: 代码质量验收_

- [ ] 26. 功能验证（含兼容性检查）
  - 主题切换正常，刷新后保持 ✅
  - **⚠️ 主题切换后 body 有 `dq-theme--dark` / `dq-theme--light` 类 ✅**
  - **⚠️ 主题切换派发 `duckquery-theme-change` 事件 ✅**
  - 欢迎页首次显示，7天后再次显示 ✅
  - 上传文件后数据源列表自动更新 ✅
  - **⚠️ 新建数据库连接时，测试失败提示"测试失败"而非"创建失败" ✅**
  - 保存数据库连接后列表自动更新 ✅
  - 删除表后列表自动更新 ✅
  - 全局刷新快捷键可用 ✅
  - 异步任务预览 SQL 传递正常 ✅
  - **⚠️ 默认 Tab 是数据源页 ✅**
  - **⚠️ `githubStars` 正常工作（不是 undefined） ✅**
  - _Requirements: 功能验收清单_

- [ ] 27. 搜索残留引用
  - 搜索 `useDuckQuery` 确认无遗漏引用
  - 搜索 `triggerRefresh` 确认已全部替换
  - 搜索 `requestManager.clearAllCache` 确认新代码中无调用
  - _Requirements: 清理验收_

- [ ] 28. 更新文档
  - 更新 `AGENTS.md` 中关于状态管理的说明（如有）
  - 更新 `MIGRATION_TO_TANSTACK_QUERY.md` 标记旧 Hook 已废弃
  - 更新项目 README 中的架构说明（如有）
  - _Requirements: 交付物_

---

## 📊 进度跟踪

### Phase 1: 创建新 Hooks（2天）
- [ ] Day 1: 基础状态 Hooks（任务 1-5）
- [ ] Day 2: 操作 Hooks（任务 6-9）

### Phase 2: 替换 DuckQueryApp（1天）
- [ ] Day 3: 入口改造（任务 10-13）

### Phase 3: 更新调用方组件（1天）
- [ ] Day 4: 组件刷新机制改造（任务 14-20）

### Phase 4: 清理旧代码（0.5天）
- [ ] Day 5 AM: 代码清理（任务 21-24）

### Phase 5: 验证与文档（0.5天）
- [ ] Day 5 PM: 全面验证（任务 25-28）

---

## ⚠️ 注意事项

### 1. 保持 localStorage Key 不变
```
✓ duck-query-theme       # 主题偏好
✓ duck-query-welcome-shown  # 欢迎页状态
```
确保用户的现有设置不丢失。

### 2. 过渡壳接口兼容
```typescript
// useAppShell 必须返回与 useDuckQuery 相同的接口结构
{
  state: { isDarkMode, showWelcome, previewQuery, currentTab, githubStars },
  actions: { setIsDarkMode, setShowWelcome, setCurrentTab, ... }
}
```

### 3. 不修改 apiClient.js 中的 requestManager
现阶段保留 `apiClient.js` 中的 `requestManager.clearCache()` 调用，作为旧 API 层的兼容处理。

### 4. 数据库连接必须"先测试后创建"
```typescript
// 正确流程
1. testDatabaseConnection() → 失败则提示"测试失败"
2. createDatabaseConnection() → 失败则提示"创建失败"

// 错误流程（会导致功能回退）
1. createDatabaseConnection() → 失败提示"创建失败"（用户困惑）
```

### 5. 缓存失效必须使用工具函数
```typescript
// ✅ 正确
import { invalidateAfterDatabaseChange } from '@/new/utils/cacheInvalidation';
await invalidateAfterDatabaseChange(queryClient);

// ❌ 错误（queryKey 可能不匹配）
await queryClient.invalidateQueries({ queryKey: ['datasources'] }); // 正确的是 ['data-sources']
```

### 6. 回滚准备
在 Phase 4 之前，`useDuckQuery.js` 始终保留。如果出现问题，可以快速回滚到旧实现。

---

## 🎯 成功标准

### 功能完整性
- [ ] 所有用户故事验收标准通过
- [ ] 所有 7 项兼容性要求满足
- [ ] 无功能回退

### 代码质量
- [ ] 新 Hooks 100% TypeScript
- [ ] 单元测试覆盖核心逻辑
- [ ] 无 ESLint 错误
- [ ] 无 TypeScript 错误
- [ ] 构建成功

### 清理完成度
- [ ] `useDuckQuery.js` 已删除或精简至 <100 行
- [ ] 旧筛选逻辑完全移除
- [ ] 旧数据转换逻辑完全移除
- [ ] 新代码无 `requestManager` 调用

### 性能
- [ ] 无多余的 API 调用
- [ ] 刷新操作响应 <100ms
- [ ] 主题切换无闪烁

---

## 📝 附录：文件清单

### 新增文件
- `frontend/src/new/hooks/useThemePreference.ts`
- `frontend/src/new/hooks/useWelcomeState.ts`
- `frontend/src/new/hooks/usePreviewState.ts`
- `frontend/src/new/hooks/useGithubStars.ts` ← 新增
- `frontend/src/new/hooks/useAppActions.ts`
- `frontend/src/new/hooks/useAppShell.ts`
- `frontend/src/new/hooks/__tests__/useThemePreference.test.ts`
- `frontend/src/new/hooks/__tests__/useWelcomeState.test.ts`
- `frontend/src/new/hooks/__tests__/usePreviewState.test.ts`
- `frontend/src/new/hooks/__tests__/useGithubStars.test.ts` ← 新增
- `frontend/src/new/hooks/__tests__/useAppActions.test.ts`
- `frontend/src/new/hooks/__tests__/useAppShell.test.ts`

### 修改文件
- `frontend/src/DuckQueryApp.jsx`
- `frontend/src/new/DataSource/UploadPanel.tsx`
- `frontend/src/new/DataSource/DataPasteCard.tsx`
- `frontend/src/new/DataSource/DatabaseForm.tsx`
- `frontend/src/new/DataSource/SavedConnectionsList.tsx`（可能）
- `frontend/src/new/components/CommandPalette.tsx`（可能）
- `frontend/src/new/Settings/shortcuts/useKeyboardShortcuts.ts`

### 删除文件
- `frontend/src/hooks/useDuckQuery.js`（最终阶段）
