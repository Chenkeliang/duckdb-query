# Week 4 实施计划：AG-Grid 结果面板

## 概述

将旧版本的结果面板（ModernDataDisplay.jsx）迁移到新架构，使用 AG-Grid 替代自定义表格实现。AG-Grid 提供了企业级的表格功能，包括虚拟滚动、列过滤、排序、导出等，大大减少了开发工作量。

## 技术栈

| 类别 | 技术选型 | 说明 |
|------|---------|------|
| 表格组件 | `ag-grid-react` + `ag-grid-community` | 企业级表格库 |
| 状态管理 | TanStack Query | 数据获取和缓存 |
| 样式系统 | Tailwind CSS + CSS 变量 | 主题定制 |
| 类型检测 | 自定义 Hook | 基于数据样本 |
| 导出功能 | AG-Grid 内置 + 异步任务 API | 小/大数据集 |

## 文件结构

```
frontend/src/new/Query/ResultPanel/
├── ResultPanel.tsx              # 主容器组件
├── AGGridWrapper.tsx            # AG-Grid 封装组件
├── ResultToolbar.tsx            # 工具栏组件
├── ExportDialog.tsx             # 导出对话框
├── themes/
│   └── ag-grid-theme.css        # AG-Grid 主题定制
├── hooks/
│   ├── useAGGridConfig.ts       # AG-Grid 配置 Hook
│   ├── useColumnTypeDetection.ts # 列类型检测 Hook
│   ├── useGridStats.ts          # 表格统计信息 Hook
│   └── useColumnStats.ts        # 列统计信息 Hook（API 集成）
└── index.tsx                    # 导出文件
```

## Day 1: AG-Grid 基础集成

### 任务 16: 安装和配置 AG-Grid 依赖

**目标**: 安装 AG-Grid 并配置基础主题

**步骤**:
1. 安装依赖包
   ```bash
   npm install ag-grid-react ag-grid-community
   ```

2. 在 `main.tsx` 中导入 AG-Grid 样式
   ```typescript
   import 'ag-grid-community/styles/ag-grid.css';
   import 'ag-grid-community/styles/ag-theme-alpine.css';
   ```

3. 创建自定义主题文件 `themes/ag-grid-theme.css`
   ```css
   .ag-theme-alpine,
   .ag-theme-alpine-dark {
     --ag-background-color: hsl(var(--background));
     --ag-foreground-color: hsl(var(--foreground));
     --ag-border-color: hsl(var(--border));
     --ag-header-background-color: hsl(var(--muted));
     --ag-odd-row-background-color: hsl(var(--muted) / 0.3);
     --ag-row-hover-color: hsl(var(--surface-hover));
     --ag-font-family: var(--font-sans);
     --ag-font-size: 13px;
     --ag-row-height: 32px;
     --ag-header-height: 40px;
   }
   
   .dark .ag-theme-alpine {
     --ag-background-color: hsl(var(--background));
     --ag-foreground-color: hsl(var(--foreground));
   }
   ```

**验收标准**:
- [ ] AG-Grid 依赖安装成功
- [ ] 基础样式正确导入
- [ ] 自定义主题文件创建完成
- [ ] 深色/浅色主题切换正常

### 任务 17: 创建 AGGridWrapper 组件

**目标**: 封装 AG-Grid 组件，提供统一的配置和 API

**接口设计**:
```typescript
export interface AGGridWrapperProps {
  rowData: any[];
  columnDefs: ColDef[];
  onGridReady?: (params: { api: GridApi; columnApi: ColumnApi }) => void;
  loading?: boolean;
  className?: string;
}
```

**核心配置**:
```typescript
const defaultColDef: ColDef = {
  sortable: true,
  filter: true,
  resizable: true,
  flex: 1,
  minWidth: 100,
};

const gridOptions: GridOptions = {
  defaultColDef,
  rowSelection: 'multiple',
  enableRangeSelection: true,
  suppressRowClickSelection: true,
  animateRows: true,
};
```

**验收标准**:
- [ ] AGGridWrapper 组件创建完成
- [ ] 基础 Grid 配置正确
- [ ] onGridReady 事件正确处理
- [ ] 自动列宽调整功能正常

### 任务 18: 创建 useAGGridConfig Hook

**目标**: 基于数据自动生成 AG-Grid 列配置

**返回值**:
```typescript
interface UseAGGridConfigReturn {
  columnDefs: ColDef[];
  loading: boolean;
}
```

**验收标准**:
- [ ] Hook 创建完成
- [ ] 能够基于数据自动生成列配置
- [ ] 类型检测集成正确
- [ ] 过滤器类型配置正确

## Day 2: 列类型检测和格式化

### 任务 19: 实现 useColumnTypeDetection Hook

**目标**: 自动检测列的数据类型

**检测类型**:
- `number`: 数值类型（包括逗号分隔的数字）
- `date`: 日期类型（多种格式）
- `boolean`: 布尔类型
- `string`: 字符串类型

**返回值**:
```typescript
interface ColumnTypeInfo {
  [columnName: string]: {
    type: 'number' | 'date' | 'boolean' | 'string';
    confidence: number; // 0-1 之间的置信度
    nullable: boolean;
  };
}
```

**验收标准**:
- [ ] 四种基础类型检测正确
- [ ] 逗号分隔数字正确识别
- [ ] 多种日期格式正确识别
- [ ] 置信度计算合理

### 任务 20: 配置 AG-Grid 格式化器

**目标**: 根据列类型配置合适的显示格式

**格式化规则**:
| 类型 | valueFormatter | cellRenderer | cellClass |
|------|---------------|--------------|-----------|
| number | 千分位分隔符 | - | text-right |
| date | 本地化日期 | - | - |
| boolean | - | ✓/✗ 图标 | text-center |
| null | 'NULL' | - | text-muted-foreground italic |

**验收标准**:
- [ ] 数值格式化正确
- [ ] 日期格式化符合本地化要求
- [ ] 布尔值显示为图标
- [ ] NULL 值有特殊样式

### 任务 21: 配置列过滤器

**目标**: 根据列类型配置合适的过滤器

**过滤器映射**:
| 列类型 | AG-Grid 过滤器 |
|--------|---------------|
| string | agTextColumnFilter |
| number | agNumberColumnFilter |
| date | agDateColumnFilter |
| 分类 | agSetColumnFilter |

**Set Filter 集成**:
```typescript
const categoryColumnDef: ColDef = {
  field: 'category',
  filter: 'agSetColumnFilter',
  filterParams: {
    values: async (params) => {
      const stats = await getColumnStatistics(tableName, 'category');
      params.success(stats.distinct_values);
    },
  },
};
```

**验收标准**:
- [ ] 四种过滤器类型配置正确
- [ ] Set Filter 与 API 集成成功
- [ ] 过滤器数据缓存正常

## Day 3: ResultPanel 集成和工具栏

### 任务 22: 更新 ResultPanel 组件

**目标**: 集成 AG-Grid 到结果面板主组件

**状态管理**:
```typescript
interface ResultPanelState {
  gridApi: GridApi | null;
  columnApi: ColumnApi | null;
  loading: boolean;
  error: Error | null;
}
```

**验收标准**:
- [ ] AG-Grid 集成到 ResultPanel
- [ ] 加载状态显示正确
- [ ] 空状态和错误状态处理
- [ ] 数据更新响应正常

### 任务 23: 创建 ResultToolbar 组件

**目标**: 创建结果面板工具栏

**功能模块**:
1. 统计信息显示（总行数、过滤后行数、选中行数、执行时间）
2. 操作按钮（刷新、导出、全屏）
3. 列可见性控制下拉菜单

**验收标准**:
- [ ] 工具栏组件创建完成
- [ ] 统计信息显示正确
- [ ] 操作按钮功能正常
- [ ] 列可见性控制工作正常

### 任务 24: 创建 useGridStats Hook

**目标**: 监听 AG-Grid 事件，提供统计信息

**监听事件**:
- `filterChanged`: 过滤器变化
- `selectionChanged`: 选择变化
- `modelUpdated`: 数据模型更新

**验收标准**:
- [ ] 事件监听正确
- [ ] 统计信息实时更新
- [ ] 组件卸载时正确清理

## Day 4: 导出功能和测试

### 任务 25: 实现导出功能

**目标**: 实现数据导出功能

**导出策略**:
| 数据量 | 导出方式 | 格式支持 |
|--------|---------|---------|
| <10k 行 | 客户端直接导出 | CSV, JSON |
| ≥10k 行 | 异步任务导出 | CSV, JSON, Parquet |

**验收标准**:
- [ ] 小数据集导出功能正常
- [ ] 大数据集异步导出集成
- [ ] ExportDialog 组件完成
- [ ] 多种格式支持

### 任务 26: 配置多列排序和列固定

**目标**: 启用高级表格功能

**配置**:
```typescript
const gridOptions: GridOptions = {
  sortingOrder: ['asc', 'desc', null],
  multiSortKey: 'ctrl',
};

// 列固定
const colDef: ColDef = {
  pinned: 'left', // 或 'right'
};
```

**验收标准**:
- [ ] 多列排序功能正常
- [ ] 列固定功能正常
- [ ] 视觉指示器正确显示

### 任务 27: 测试和集成验证

**测试清单**:
- [ ] 大数据集渲染性能（10k+ 行）
- [ ] 所有过滤器类型
- [ ] 多列排序和列固定
- [ ] 导出功能
- [ ] 深色/浅色主题切换
- [ ] 响应式布局
- [ ] 与 QueryBuilder 的集成

## 性能要求

| 指标 | 目标值 |
|------|--------|
| 10k 行数据渲染 | < 100ms |
| 过滤操作响应 | < 50ms |
| 滚动帧率 | 60fps |
| 内存使用 | < 100MB (10k 行) |

## 与现有功能的对比

### ModernDataDisplay 功能迁移

| ModernDataDisplay 功能 | AG-Grid 实现 | 状态 |
|----------------------|-------------|------|
| Excel 风格列过滤 | agSetColumnFilter | ✅ 内置 |
| 列类型自动检测 | useColumnTypeDetection | 🔧 自定义 |
| 智能排序 | 内置 + comparator | ✅ 内置 |
| 虚拟滚动 | 内置 | ✅ 内置 |
| CSV 导出 | exportDataAsCsv | ✅ 内置 |
| 列宽调整 | 内置 | ✅ 内置 |
| 列固定 | pinned | ✅ 内置 |
| 全选/反选 | 内置 | ✅ 内置 |
| 重复项/唯一项筛选 | filterParams | 🔧 自定义 |

### 迁移策略

1. **保留 ModernDataDisplay** 作为备选方案
2. **新建 ResultPanel** 使用 AG-Grid
3. **通过 props 切换** 使用哪个实现
4. **逐步迁移** 验证功能完整性后再移除旧实现

## 风险和缓解措施

### 技术风险

| 风险 | 缓解措施 |
|------|---------|
| AG-Grid 学习曲线 | 提前阅读文档，参考官方示例 |
| 主题定制复杂 | 使用 CSS 变量，渐进式定制 |
| 性能问题 | 及时性能测试，优化配置参数 |

### 进度风险

| 风险 | 缓解措施 |
|------|---------|
| 任务估时不准 | 预留缓冲时间，优先核心功能 |
| 依赖阻塞 | 并行开发，模拟数据测试 |
| 集成问题 | 早期集成测试，及时发现问题 |

## 成功标准

### 功能完整性
- [ ] 所有 Week 4 任务完成
- [ ] 功能测试全部通过
- [ ] 性能指标达标

### 代码质量
- [ ] TypeScript 类型完整
- [ ] 组件接口设计合理
- [ ] 代码复用性好
- [ ] 错误处理完善

### 用户体验
- [ ] 界面响应流畅
- [ ] 操作逻辑直观
- [ ] 错误提示友好
- [ ] 主题适配完美
