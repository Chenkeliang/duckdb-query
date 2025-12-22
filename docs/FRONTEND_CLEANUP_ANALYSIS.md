# 前端旧代码清理分析报告

> **分析时间**: 2024-12-22  
> **更新时间**: 2024-12-22（根据用户反馈修正）  
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

## 🔴 重要修正（根据依赖分析）

### 必须保留的文件

| 文件 | 原文档状态 | 修正后状态 | 原因 |
|------|-----------|-----------|------|
| `hooks/useDebounce.js` | ⚠️ 需检查 | ✅ **必须保留** | `useDuckQuery.js` 第3行引用 `globalDebounce` |
| `contexts/ToastContext.jsx` | ❌ 可删除 | ⚠️ **需等 Phase 2 完成** | 19个旧组件仍在引用 |
| `utils/visualQueryGenerator.js` | ❌ 已迁移 | ⚠️ **未迁移** | 被多个旧组件引用，`new/utils/` 中无对应文件 |
| `utils/visualQueryUtils.js` | ❌ 已迁移 | ⚠️ **未迁移** | 被多个旧组件引用，`new/utils/` 中无对应文件 |
| `types/visualQuery.js` | ❌ 已迁移 | ⚠️ **未迁移** | `new/types/` 中只有 `SelectedTable.ts` |

### ToastContext 依赖清单（19个文件）

以下旧组件仍在使用 `ToastContext`，必须先删除这些组件才能删除 `ToastContext`：

```
frontend/src/ShadcnApp.jsx
frontend/src/components/ChunkedUpload/ChunkedUploader.jsx
frontend/src/components/DataSourceManager/EnhancedFileUploader.jsx
frontend/src/components/DataSourceManager/DataPasteBoard.jsx
frontend/src/components/DataSourceManager/FileUploader.jsx
frontend/src/components/DataSourceManager/DataSourceList.jsx
frontend/src/components/DataSourceManager/DatabaseConnector.jsx
frontend/src/components/SQLFavorites/AddSQLFavoriteDialog.jsx
frontend/src/components/SQLFavorites/SQLFavoritesManager.jsx
frontend/src/components/Results/ModernDataDisplay.jsx
frontend/src/components/PostgreSQLManager/PostgreSQLConnector.jsx
frontend/src/components/QueryBuilder/QueryBuilder.jsx
frontend/src/components/QueryBuilder/VisualAnalysisPanel.jsx
frontend/src/components/QueryBuilder/__tests__/QueryBuilder.integration.test.jsx
frontend/src/components/DataGrid.jsx
```

### visualQueryUtils/Generator 依赖清单

以下文件引用了 `visualQueryUtils.js` 或 `visualQueryGenerator.js`：

```
frontend/src/hooks/useTypeConflictCheck.js
frontend/src/utils/visualQueryGenerator.js (互相引用)
frontend/src/utils/visualQueryUtils.js (互相引用)
frontend/src/components/QueryBuilder/SortControls.jsx
frontend/src/components/QueryBuilder/AggregationControls.jsx
frontend/src/components/QueryBuilder/ColumnSelector.jsx
frontend/src/components/QueryBuilder/QueryBuilder.jsx
frontend/src/components/QueryBuilder/PivotConfigurator.jsx
frontend/src/components/QueryBuilder/VisualAnalysisPanel.jsx
frontend/src/components/QueryBuilder/FilterControls.jsx
frontend/src/components/QueryBuilder/VisualAnalysis/FilterControls.jsx
frontend/src/components/QueryBuilder/VisualAnalysis/SQLPreview.jsx
frontend/src/utils/__tests__/visualQueryUtils.test.js
frontend/src/utils/__tests__/visualQueryGenerator.test.js
```

---

## 🗑️ 可安全删除的文件/文件夹

### Phase 1: 低风险清理（可立即执行）

```bash
# 删除测试文件
rm frontend/src/SidebarTest.jsx

# 删除旧样式（确认新布局不依赖后）
rm frontend/src/styles/tokens.css    # ✅ 无引用，可删除
```

**注意**: `modern.css` 需要等 `ShadcnApp.jsx` 删除后才能删除。

### Phase 2: 旧组件清理（需要验证构建）

删除整个 `frontend/src/components/` 目录下的旧组件：

| 目录 | 新组件位置 | 状态 |
|------|-----------|------|
| `AsyncTasks/` | `new/Query/AsyncTasks/` | ✅ 可删除 |
| `ChunkedUpload/` | 已集成到 UploadPanel | ✅ 可删除 |
| `common/` | 已迁移到 shadcn/ui | ✅ 可删除 |
| `DatabaseManager/` | `new/DataSource/` | ✅ 可删除 |
| `DataSourceManagement/` | `new/DataSource/` | ✅ 可删除 |
| `DataSourceManager/` | `new/DataSource/` | ✅ 可删除 |
| `DataVisualization/` | 暂未迁移 | ⚠️ 评估是否需要 |
| `DuckDBManager/` | `new/DataSource/` + `new/Query/` | ✅ 可删除 |
| `Layout/` | `new/Layout/` | ✅ 可删除 |
| `PostgreSQLManager/` | 已集成到 DatabaseForm | ✅ 可删除 |
| `QueryBuilder/` | `new/Query/VisualQuery/` | ✅ 可删除 |
| `Results/` | `new/Query/ResultPanel/` | ✅ 可删除 |
| `SmartPagination/` | 已集成到 DataGrid | ✅ 可删除 |
| `SQLFavorites/` | 功能已集成到新 SQL 面板 | ✅ 可删除 |
| `SystemMonitor/` | 暂未迁移 | ⚠️ 评估是否需要 |
| `ui/` | 已迁移到 `new/components/ui/` | ✅ 可删除 |
| `UnifiedQueryInterface/` | `new/Query/` | ✅ 可删除 |
| `VirtualTable/` | `new/Query/DataGrid/` | ✅ 可删除 |

**独立文件**：
```bash
rm frontend/src/components/DataGrid.jsx
rm frontend/src/components/DuckDBSQLEditor.jsx
rm frontend/src/components/EnhancedSQLExecutor.jsx
rm frontend/src/components/SQLTemplates.jsx
rm frontend/src/components/SQLValidator.jsx
rm frontend/src/components/StableTable.jsx
rm frontend/src/components/TreeTableView.jsx
# WelcomePage 需要迁移，暂不删除
```

### Phase 3: 入口和依赖清理（Phase 2 完成后）

```bash
# 删除旧入口
rm frontend/src/ShadcnApp.jsx

# 删除旧样式
rm frontend/src/styles/modern.css

# 删除旧 Context（所有依赖组件删除后）
rm frontend/src/contexts/ToastContext.jsx

# 删除旧 utils（所有依赖组件删除后）
rm frontend/src/utils/visualQueryGenerator.js
rm frontend/src/utils/visualQueryUtils.js
rm frontend/src/utils/colorUtils.js
rm frontend/src/utils/checkFontOptimization.js
rm -rf frontend/src/utils/__tests__/visualQueryUtils.test.js
rm -rf frontend/src/utils/__tests__/visualQueryGenerator.test.js

# 删除旧 types
rm frontend/src/types/visualQuery.js

# 删除旧 hooks（依赖组件删除后）
rm frontend/src/hooks/useTypeConflictCheck.js
```

### Phase 4: WelcomePage 迁移 ✅ 已完成

1. ✅ 将 `WelcomePage.jsx` 迁移到 `new/WelcomePage/WelcomePage.tsx`
2. ✅ 使用 shadcn/ui + Tailwind CSS 重写样式
3. ✅ 更新 `DuckQueryApp.jsx` 的 import
4. ✅ 删除旧文件：
```bash
rm frontend/src/components/WelcomePage.jsx  # 已删除
rm frontend/src/components/WelcomePage.css  # 已删除
rmdir frontend/src/components               # 已删除（目录为空）
```

---

## ⚠️ 必须保留的文件

| 文件/目录 | 原因 |
|-----------|------|
| `services/apiClient.js` | 新旧布局共用 |
| `services/asyncTasks.js` | 新旧布局共用 |
| `hooks/useDuckQuery.js` | 新布局仍在使用 |
| `hooks/useDebounce.js` | **useDuckQuery.js 依赖** |
| `utils/requestManager.js` | apiClient 依赖 |
| `i18n/` | 国际化配置，新旧共用 |
| `assets/` | Logo 等资源，新旧共用 |
| `lib/utils.ts` | cn() 工具函数，新布局使用 |
| `test/setup.ts` | 测试配置 |

---

## 📋 清理执行计划

### 执行前检查脚本

```bash
# Phase 2 前运行，确保无遗漏引用
cd frontend
npm run build  # 如果编译通过说明安全
npm run lint   # 检查代码规范
```

### Phase 1: 低风险清理

```bash
rm frontend/src/SidebarTest.jsx
rm frontend/src/styles/tokens.css
```

### Phase 2: 组件清理

```bash
# 删除旧组件目录
rm -rf frontend/src/components/AsyncTasks/
rm -rf frontend/src/components/ChunkedUpload/
rm -rf frontend/src/components/common/
rm -rf frontend/src/components/DatabaseManager/
rm -rf frontend/src/components/DataSourceManagement/
rm -rf frontend/src/components/DataSourceManager/
rm -rf frontend/src/components/DuckDBManager/
rm -rf frontend/src/components/Layout/
rm -rf frontend/src/components/PostgreSQLManager/
rm -rf frontend/src/components/QueryBuilder/
rm -rf frontend/src/components/Results/
rm -rf frontend/src/components/SmartPagination/
rm -rf frontend/src/components/SQLFavorites/
rm -rf frontend/src/components/ui/
rm -rf frontend/src/components/UnifiedQueryInterface/
rm -rf frontend/src/components/VirtualTable/

# 删除独立组件文件
rm frontend/src/components/DataGrid.jsx
rm frontend/src/components/DuckDBSQLEditor.jsx
rm frontend/src/components/EnhancedSQLExecutor.jsx
rm frontend/src/components/SQLTemplates.jsx
rm frontend/src/components/SQLValidator.jsx
rm frontend/src/components/StableTable.jsx
rm frontend/src/components/TreeTableView.jsx

# 验证构建
npm run build
```

### Phase 3: 入口和依赖清理

```bash
rm frontend/src/ShadcnApp.jsx
rm frontend/src/styles/modern.css
rm frontend/src/contexts/ToastContext.jsx
rm frontend/src/utils/visualQueryGenerator.js
rm frontend/src/utils/visualQueryUtils.js
rm frontend/src/utils/colorUtils.js
rm frontend/src/utils/checkFontOptimization.js
rm -rf frontend/src/utils/__tests__/visualQueryUtils.test.js
rm -rf frontend/src/utils/__tests__/visualQueryGenerator.test.js
rm frontend/src/types/visualQuery.js
rm frontend/src/hooks/useTypeConflictCheck.js

# 验证构建
npm run build
```

### Phase 4: WelcomePage 迁移后清理 ✅ 已完成

```bash
rm frontend/src/components/WelcomePage.jsx   # ✅ 已删除
rm frontend/src/components/WelcomePage.css   # ✅ 已删除
rmdir frontend/src/components                # ✅ 已删除（目录为空）
```

---

## 📦 package.json 依赖清理（Phase 3 后评估）

删除旧组件后，以下依赖可能不再需要：

```json
// 可能可以移除的 MUI 相关包
"@mui/material"
"@mui/icons-material"
"@emotion/react"
"@emotion/styled"

// 其他可能不再需要的包
// 需要逐个检查是否有其他引用
```

**注意**: 需要仔细检查每个包是否还有其他引用，建议使用：
```bash
grep -r "@mui" frontend/src --include="*.jsx" --include="*.tsx" --include="*.js" --include="*.ts"
```

---

## 📊 预估清理效果

| 指标 | 清理前 | 清理后 | 减少 |
|------|--------|--------|------|
| 组件目录数 | 18 | 0 | -18 |
| 旧组件文件 | ~80+ | 0 | ~80+ |
| 样式文件 | 3 | 1 | -2 |
| 代码行数 | ~15,000+ | ~0 | ~15,000+ |

---

## 📝 清理后需要更新的文档

1. **AGENTS.md** - 移除双入口相关说明
2. **`.kiro/steering/` 目录下的文件** - 更新文件引用
3. **docs/tasks/** - 更新相关任务文档

---

## 🔄 Phase 5: 目录结构重组

### 问题分析

当前 `new/` 组件依赖 `new/` 外部的共享模块，目录结构不清晰：

| 文件 | 被谁引用 | 问题 |
|------|---------|------|
| `hooks/useDuckQuery.js` | `DuckQueryApp.jsx` | 新 UI 核心 hook 不在 `new/` 下 |
| `hooks/useDebounce.js` | `useDuckQuery.js` 依赖 | 同上 |
| `services/apiClient.js` | 26+ 个 `new/` 组件 | 核心 API 不在 `new/` 下 |
| `services/asyncTasks.js` | `apiClient.js` 依赖 | 同上 |
| `utils/requestManager.js` | `apiClient.js` 依赖 | 同上 |
| `lib/utils.ts` | 50+ 个 `new/` 组件 (`cn()`) | 工具函数不在 `new/` 下 |
| `assets/` | `DuckQueryApp.jsx` (logo) | 资源文件 |
| `i18n/` | `main.jsx` + 全局使用 | 国际化配置 |

### 方案对比

#### 方案 A: 迁移到 `new/` 目录

```
frontend/src/new/
├── hooks/
│   ├── useDuckQuery.js     # 从 src/hooks/ 迁移
│   ├── useDebounce.js      # 从 src/hooks/ 迁移
│   └── ... (现有 hooks)
├── services/
│   ├── apiClient.js        # 从 src/services/ 迁移
│   ├── asyncTasks.js       # 从 src/services/ 迁移
│   └── requestManager.js   # 从 src/utils/ 迁移
├── lib/
│   └── utils.ts            # 从 src/lib/ 迁移
├── assets/                 # 从 src/assets/ 迁移
└── i18n/                   # 从 src/i18n/ 迁移
```

**优点**: 目录结构清晰，`new/` 完全自包含  
**缺点**: 需要更新大量 import 路径

#### 方案 B: 清理后提升 `new/` 到 `src/` 根目录（推荐）

清理完成后，`new/` 就是全部代码，直接把内容提到 `src/` 根目录：

```
frontend/src/
├── components/ui/          # 原 new/components/ui/
├── DataSource/             # 原 new/DataSource/
├── Query/                  # 原 new/Query/
├── Layout/                 # 原 new/Layout/
├── Settings/               # 原 new/Settings/
├── hooks/                  # 合并 new/hooks/ + 保留的旧 hooks
├── services/               # 保留原位置
├── utils/                  # 合并 new/utils/ + 保留的旧 utils
├── lib/                    # 保留原位置
├── assets/                 # 保留原位置
├── i18n/                   # 保留原位置
├── providers/              # 原 new/providers/
├── types/                  # 原 new/types/
├── DuckQueryApp.jsx        # 主入口
└── main.jsx                # 渲染入口
```

**优点**: 
- 消除 `new/` 中间层，路径更短
- 不需要大量修改 import（`@/services/` 等保持不变）
- 目录结构更扁平清晰

**缺点**: 
- 需要合并同名目录（如 `hooks/`、`utils/`）
- 需要更新 `@/new/` 开头的 import

### Phase 5 执行步骤（方案 B）

#### Step 5.1: 合并 hooks 目录

```bash
# 将保留的旧 hooks 迁移到 new/hooks/
mv frontend/src/hooks/useDuckQuery.js frontend/src/new/hooks/
mv frontend/src/hooks/useDebounce.js frontend/src/new/hooks/

# 更新 useDuckQuery.js 中的 import
# import { globalDebounce } from "./useDebounce";  # 路径不变
```

#### Step 5.2: 合并 utils 目录

```bash
# 将 requestManager 迁移到 new/utils/
mv frontend/src/utils/requestManager.js frontend/src/new/utils/

# 更新 apiClient.js 中的 import
# import requestManager from '../utils/requestManager';
# → import requestManager from '@/new/utils/requestManager';
```

#### Step 5.3: 迁移 services 目录

```bash
# 创建 new/services/ 并迁移
mkdir -p frontend/src/new/services
mv frontend/src/services/apiClient.js frontend/src/new/services/
mv frontend/src/services/asyncTasks.js frontend/src/new/services/
mv frontend/src/services/__tests__/ frontend/src/new/services/

# 更新所有 @/services/apiClient 为 @/new/services/apiClient
```

#### Step 5.4: 提升 new/ 到 src/ 根目录

```bash
# 将 new/ 内容移动到 src/ 根目录
mv frontend/src/new/* frontend/src/

# 删除空的 new/ 目录
rmdir frontend/src/new

# 更新所有 @/new/ 开头的 import
# 全局替换: @/new/ → @/
```

#### Step 5.5: 更新配置文件

```javascript
// vite.config.js - 路径别名可能需要调整
// tsconfig.json - paths 配置可能需要调整
```

### Phase 5 影响范围

| 操作 | 影响文件数 | 风险 |
|------|-----------|------|
| 迁移 useDuckQuery/useDebounce | 2 | 低 |
| 迁移 requestManager | 1 | 低 |
| 迁移 services/ | 3 | 中 |
| 提升 new/ 到 src/ | 100+ | 高（需要批量替换 import） |

### 建议执行时机

- **Phase 1-4**: 先完成旧代码清理
- **Phase 5**: 在清理完成、功能稳定后执行
- **建议**: 创建独立分支，充分测试后合并

---

## ⚡ 建议执行顺序

1. ✅ **先备份** - 创建 git 分支
2. ✅ **Phase 1** - 删除明确无用的文件
3. ✅ **构建验证** - `npm run build && npm run lint`
4. ✅ **Phase 2** - 删除旧组件
5. ✅ **构建验证** - 再次验证
6. ✅ **Phase 3** - 删除旧入口和依赖
7. ✅ **构建验证** - 再次验证
8. ✅ **Phase 4** - 迁移 WelcomePage
9. ⏳ **功能验证** - 完整功能测试
10. ⏳ **依赖清理** - 评估并移除不再需要的 npm 包
11. ⏳ **Phase 5** - 目录结构重组（可选，建议在稳定后执行）
12. ⏳ **最终验证** - 完整回归测试

---

**文档版本**: 1.2  
**最后更新**: 2024-12-22  
**修正内容**: 
- useDebounce.js 标记为必须保留
- ToastContext.jsx 标记为需等 Phase 2 完成
- visualQueryGenerator.js/visualQueryUtils.js 标记为未迁移
- types/visualQuery.js 标记为未迁移
- 添加依赖检查脚本
- 添加 package.json 依赖清理建议
- **新增 Phase 5: 目录结构重组**（处理共享模块位置问题）
