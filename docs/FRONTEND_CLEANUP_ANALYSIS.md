# 前端旧代码清理分析报告

> **分析时间**: 2024-12-22  
> **当前状态**: 新布局 (`DuckQueryApp`) 已作为主入口，旧布局 (`ShadcnApp`) 仍保留但未使用

---

## 📊 当前架构概览

### 入口文件状态

| 文件 | 状态 | 说明 |
|------|------|------|
| `main.jsx` | ✅ 使用中 | 渲染 `DuckQueryApp`（新布局） |
| `DuckQueryApp.jsx` | ✅ 使用中 | 新布局入口，使用 shadcn/ui + Tailwind |
| `ShadcnApp.jsx` | ⚠️ 未使用 | 旧布局入口，使用 MUI，已不再被 main.jsx 引用 |
| `SidebarTest.jsx` | ❌ 可删除 | 测试文件，无引用 |

---

## 🗑️ 可安全删除的文件/文件夹

### 1. 旧入口文件

```
frontend/src/ShadcnApp.jsx          # 旧布局入口，已被 DuckQueryApp 替代
frontend/src/SidebarTest.jsx        # 测试文件
```

### 2. 旧组件目录 (`frontend/src/components/`)

以下组件已在 `frontend/src/new/` 中有对应的新实现：

| 旧组件 | 新组件位置 | 可删除 |
|--------|-----------|--------|
| `AsyncTasks/` | `new/Query/AsyncTasks/` | ✅ |
| `DatabaseManager/` | `new/DataSource/` | ✅ |
| `DataSourceManagement/` | `new/DataSource/` | ✅ |
| `DataSourceManager/` | `new/DataSource/` | ✅ |
| `DuckDBManager/` | `new/DataSource/` + `new/Query/` | ✅ |
| `Layout/` | `new/Layout/` | ✅ |
| `QueryBuilder/` | `new/Query/VisualQuery/` | ✅ |
| `Results/` | `new/Query/ResultPanel/` | ✅ |
| `UnifiedQueryInterface/` | `new/Query/` | ✅ |
| `VirtualTable/` | `new/Query/DataGrid/` | ✅ |
| `SQLFavorites/` | 功能已集成到新 SQL 面板 | ✅ |
| `SmartPagination/` | 已集成到 DataGrid | ✅ |
| `SystemMonitor/` | 暂未迁移，评估是否需要 | ⚠️ |
| `DataVisualization/` | 暂未迁移，评估是否需要 | ⚠️ |
| `ChunkedUpload/` | 已集成到 UploadPanel | ✅ |
| `PostgreSQLManager/` | 已集成到 DatabaseForm | ✅ |
| `common/` | 已迁移到 shadcn/ui | ✅ |
| `ui/` | 已迁移到 `new/components/ui/` | ✅ |

**独立文件**：
```
frontend/src/components/DataGrid.jsx           # 被 new/Query/DataGrid 替代
frontend/src/components/DuckDBSQLEditor.jsx    # 被 new/Query/SQLQuery 替代
frontend/src/components/EnhancedSQLExecutor.jsx # 被 new/Query/SQLQuery 替代
frontend/src/components/SQLTemplates.jsx       # 功能已集成
frontend/src/components/SQLValidator.jsx       # 功能已集成
frontend/src/components/StableTable.jsx        # 被 DataGrid 替代
frontend/src/components/TreeTableView.jsx      # 被 DataSourcePanel 替代
frontend/src/components/WelcomePage.jsx        # ⚠️ 仍被 DuckQueryApp 引用
frontend/src/components/WelcomePage.css        # ⚠️ WelcomePage 的样式
```

### 3. 旧样式文件

```
frontend/src/styles/modern.css    # 旧布局样式，新布局不使用
frontend/src/styles/tokens.css    # 旧 token 系统，新布局使用 tailwind.css
```

### 4. 旧 Context

```
frontend/src/contexts/ToastContext.jsx  # 已被 sonner 替代
```

### 5. 旧 Hooks

```
frontend/src/hooks/useDebounce.js         # 可能仍有引用，需检查
frontend/src/hooks/useTypeConflictCheck.js # 已迁移到 new/hooks/useTypeConflict.ts
```

**注意**: `useDuckQuery.js` 仍被新布局使用，不能删除。

### 6. 旧 Utils

```
frontend/src/utils/colorUtils.js           # 旧布局颜色工具
frontend/src/utils/checkFontOptimization.js # 开发工具
frontend/src/utils/visualQueryGenerator.js  # 已迁移到 new/utils/
frontend/src/utils/visualQueryUtils.js      # 已迁移到 new/utils/
```

**注意**: `requestManager.js` 仍被 apiClient.js 使用，不能删除。

### 7. 旧类型定义

```
frontend/src/types/visualQuery.js  # 已迁移到 new/types/
```

---

## ⚠️ 需要保留的文件

### 必须保留

| 文件/目录 | 原因 |
|-----------|------|
| `services/apiClient.js` | 新旧布局共用 |
| `services/asyncTasks.js` | 新旧布局共用 |
| `hooks/useDuckQuery.js` | 新布局仍在使用 |
| `utils/requestManager.js` | apiClient 依赖 |
| `i18n/` | 国际化配置，新旧共用 |
| `assets/` | Logo 等资源，新旧共用 |
| `lib/utils.ts` | cn() 工具函数，新布局使用 |
| `test/setup.ts` | 测试配置 |
| `components/WelcomePage.jsx` | DuckQueryApp 仍在 lazy import |

### 需要评估

| 文件/目录 | 说明 |
|-----------|------|
| `components/SystemMonitor/` | 系统监控功能，评估是否需要迁移 |
| `components/DataVisualization/` | 数据可视化，评估是否需要迁移 |
| `hooks/useDebounce.js` | 检查是否有其他引用 |

---

## 📋 清理执行计划

### Phase 1: 低风险清理（可立即执行）

```bash
# 删除测试文件
rm frontend/src/SidebarTest.jsx

# 删除旧样式（确认新布局不依赖后）
rm frontend/src/styles/modern.css
rm frontend/src/styles/tokens.css

# 删除旧 Context
rm frontend/src/contexts/ToastContext.jsx
```

### Phase 2: 组件清理（需要验证）

在删除前，运行以下检查：

```bash
# 检查是否有引用
grep -r "from.*components/" frontend/src --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts"
```

确认无引用后删除：

```bash
# 删除已迁移的组件目录
rm -rf frontend/src/components/AsyncTasks/
rm -rf frontend/src/components/DatabaseManager/
rm -rf frontend/src/components/DataSourceManagement/
rm -rf frontend/src/components/DataSourceManager/
rm -rf frontend/src/components/DuckDBManager/
rm -rf frontend/src/components/Layout/
rm -rf frontend/src/components/QueryBuilder/
rm -rf frontend/src/components/Results/
rm -rf frontend/src/components/UnifiedQueryInterface/
rm -rf frontend/src/components/VirtualTable/
rm -rf frontend/src/components/SQLFavorites/
rm -rf frontend/src/components/SmartPagination/
rm -rf frontend/src/components/ChunkedUpload/
rm -rf frontend/src/components/PostgreSQLManager/
rm -rf frontend/src/components/common/
rm -rf frontend/src/components/ui/

# 删除独立组件文件
rm frontend/src/components/DataGrid.jsx
rm frontend/src/components/DuckDBSQLEditor.jsx
rm frontend/src/components/EnhancedSQLExecutor.jsx
rm frontend/src/components/SQLTemplates.jsx
rm frontend/src/components/SQLValidator.jsx
rm frontend/src/components/StableTable.jsx
rm frontend/src/components/TreeTableView.jsx
```

### Phase 3: 入口清理（最后执行）

```bash
# 删除旧入口
rm frontend/src/ShadcnApp.jsx
```

### Phase 4: WelcomePage 迁移

1. 将 `WelcomePage.jsx` 迁移到 `new/` 目录
2. 使用 shadcn/ui 重写样式
3. 更新 `DuckQueryApp.jsx` 的 import
4. 删除旧文件

---

## 📊 预估清理效果

| 指标 | 清理前 | 清理后 | 减少 |
|------|--------|--------|------|
| 组件目录数 | 18 | 0 | -18 |
| 旧组件文件 | ~80+ | 0 | ~80+ |
| 样式文件 | 3 | 1 | -2 |
| 代码行数 | ~15,000+ | ~0 | ~15,000+ |

---

## ⚡ 建议执行顺序

1. **先备份** - 创建 git 分支
2. **Phase 1** - 删除明确无用的文件
3. **构建验证** - `npm run build && npm run lint`
4. **Phase 2** - 删除旧组件
5. **构建验证** - 再次验证
6. **Phase 3** - 删除旧入口
7. **Phase 4** - 迁移 WelcomePage
8. **最终验证** - 完整功能测试

---

## 📝 注意事项

1. **不要删除 `useDuckQuery.js`** - 新布局仍在使用
2. **不要删除 `requestManager.js`** - apiClient 依赖
3. **不要删除 `apiClient.js`** - 核心 API 客户端
4. **WelcomePage 需要迁移** - 目前仍被 DuckQueryApp 引用
5. **更新 steering 文档** - 清理后需要更新 `.kiro/steering/` 中的文件引用
6. **更新 AGENTS.md** - 移除双入口相关说明

---

**文档版本**: 1.0  
**最后更新**: 2024-12-22
