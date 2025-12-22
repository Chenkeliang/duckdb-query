# 查询工作台功能增强需求文档

> **版本**: 1.1  
> **创建时间**: 2024-12-19  
> **更新时间**: 2024-12-19  
> **状态**: 📋 需求收集阶段

---

## 📋 需求概述

本文档涵盖查询工作台的四个主要功能增强需求：

1. **异步任务功能完善** - 完善异步任务发起流程，支持自定义表名/别名，完善任务面板功能
2. **TanStack Table 作为默认结果展示** - 替换 AG Grid，UI 风格保持一致
3. **TanStack Table 功能增强** - 补充列隐藏/显示、按列排序、导出 CSV/JSON 功能
4. **SQL 格式化增强** - 使用成熟组件实现 DataGrip 风格的专业 SQL 格式化

---

## 🔒 全局约束

### UI/UX 约束
- **必须使用 shadcn/ui + Tailwind CSS**，禁止使用 MUI 或自定义 CSS
- **UI 变更不能影响现有功能**，所有改动需要向后兼容
- **保持视觉一致性**，新组件风格与现有新布局保持统一
- **支持深色模式**，所有新增 UI 必须适配深色主题
- **国际化支持**，所有用户可见文本使用 i18n

### 技术约束
- **优先使用成熟开源组件**，禁止重复造轮子
- **遵循 TanStack Query 规范**，服务端数据获取必须使用 TanStack Query
- **TypeScript 类型完整**，所有新增代码必须有完整类型定义
- **错误处理完善**，所有 API 调用必须有错误处理和用户友好提示

### 性能约束
- **大数据量支持**，结果展示需支持 10 万行流畅滚动
- **导出性能**，10 万行数据导出 < 5 秒
- **格式化性能**，1000 行 SQL 格式化 < 1 秒
- **内存管理**，避免内存泄漏，及时清理事件监听器

---

## 1️⃣ 异步任务功能完善

### 1.1 背景与现状

**当前架构理解**：
异步任务是一个**三合一**的流程：
1. **触发查询** - 后端执行 SQL 查询
2. **保存到表** - 查询结果自动保存到 DuckDB 临时表（可自定义表名）
3. **支持导出** - 任务完成后可在异步任务面板下载 CSV/Parquet 文件

**当前状态**：
- 新布局 `AsyncTaskPanel.tsx` 已实现基础功能：任务列表、状态显示、取消/重试
- 旧布局 `AsyncTaskList.jsx` 功能更完善：下载结果、格式选择、自定义表名显示

**参考旧 UI 功能**（来自 `AsyncTaskList.jsx`）：
- ✅ 任务状态显示（排队中/运行中/成功/失败）
- ✅ 取消任务（带原因输入）
- ✅ 重试任务（带确认对话框）
- ✅ 下载结果文件（支持 CSV/Parquet 格式选择）
- ✅ 显示自定义表名（`result.custom_table_name`）
- ✅ 显示显示名（`result.display_name`）
- ✅ 任务类型标签

### 1.2 功能需求

#### 1.2.1 异步任务发起增强

**需求描述**：在发起异步任务时，支持用户自定义结果表的别名（表名）。

**功能点**：
- [ ] 在 SQL 面板添加"异步执行"按钮（与"执行"按钮并列）
- [ ] 点击后弹出简洁对话框，包含：
  - **自定义表名输入框**（可选，留空则自动生成 `async_result_{task_id}`）
  - **显示名输入框**（可选，用于在任务列表中显示友好名称）
- [ ] 支持快捷键触发（如 `Ctrl+Shift+Enter`）
- [ ] 提交后自动跳转/高亮异步任务面板

**注意**：不需要选择"任务类型"，因为异步任务本身就是三合一的流程。

**API 请求格式**（与现有 API 保持兼容）：
```typescript
interface AsyncQueryRequest {
  sql: string;
  custom_table_name?: string;  // 用户自定义表名（可选）
  display_name?: string;       // 显示名称（可选）
}
```

#### 1.2.2 异步任务面板功能完善

**需求描述**：将旧 UI 的完整功能迁移到新布局，使用 shadcn/ui 组件重写。

**功能点**：
- [ ] **下载结果文件**
  - 支持 CSV/Parquet 格式选择对话框
  - 显示格式说明（Parquet 适合大数据分析，CSV 兼容性好）
  - 下载进度/状态提示
  - 下载失败时显示错误信息
- [ ] **显示任务详情**
  - 自定义表名（如果有）
  - 显示名（如果有）
  - 文件生成状态
  - 执行时间
  - 结果行数
- [ ] **取消任务增强**
  - 取消原因输入框（可选）
  - 确认对话框
- [ ] **重试任务增强**
  - 确认对话框
  - 显示原始 SQL 预览
- [ ] **预览结果**
  - 点击后在 SQL 面板生成查询语句
  - 自动执行并显示结果

**⚠️ 异步任务成功后的侧边栏联动（重要）**：

异步任务成功创建 `async_result_xxx` 表后，必须自动刷新左侧数据源面板：

```typescript
// onSuccess 回调中必须同时刷新：
onSuccess: (data) => {
  // 1. 刷新任务列表
  queryClient.invalidateQueries({ queryKey: ['async-tasks'] });
  
  // 2. 刷新 DuckDB 表列表（关键！）
  queryClient.invalidateQueries({ queryKey: ['duckdb-tables'] });
  
  toast.success('异步任务已完成');
}
```

**用户体验要求**：
- 任务成功后，新创建的表应立即出现在左侧数据源面板
- 用户无需手动刷新页面或侧边栏

### 1.3 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 自定义表名已存在 | 后端返回错误，前端显示提示让用户修改表名 |
| 自定义表名包含非法字符 | 前端校验，只允许字母、数字、下划线，不能以数字开头 |
| 自定义表名过长 | 限制最大 64 字符 |
| SQL 为空 | 禁用异步执行按钮，显示提示 |
| 网络错误 | 显示错误提示，允许重试 |
| 任务执行超时 | 后端处理，前端显示超时状态 |
| 下载大文件 | 显示下载进度，支持取消 |
| 并发提交多个任务 | 允许，任务列表按时间排序 |

**⚠️ 表名冲突处理（重要）**：

当用户输入的自定义表名已存在时：

**方案 A（推荐）**：在对话框中添加"如果存在则覆盖"复选框
```
┌─────────────────────────────────────────────────┐
│ 结果表名（可选）:                               │
│ ┌─────────────────────────────────────────────┐ │
│ │ daily_report                                │ │
│ └─────────────────────────────────────────────┘ │
│ ☐ 如果表已存在则覆盖                            │
└─────────────────────────────────────────────────┘
```

**方案 B**：收到后端 "Table Exists" 错误时，显示确认对话框
- 提示："表 'xxx' 已存在，是否覆盖？"
- 选项：[取消] [修改表名] [覆盖]

**API 请求格式更新**：
```typescript
interface AsyncQueryRequest {
  sql: string;
  custom_table_name?: string;
  display_name?: string;
  overwrite_if_exists?: boolean;  // 新增：是否覆盖已存在的表
}
```

### 1.4 UI 设计参考

**异步执行对话框**（简洁版）：
```
┌─────────────────────────────────────────────────┐
│ 提交异步任务                              [×]   │
├─────────────────────────────────────────────────┤
│                                                 │
│ SQL 预览:                                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ SELECT * FROM orders WHERE ...              │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ 结果表名（可选）:                               │
│ ┌─────────────────────────────────────────────┐ │
│ │ my_orders_backup                            │ │
│ └─────────────────────────────────────────────┘ │
│ 留空则自动生成                                  │
│                                                 │
│ 显示名（可选）:                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ 订单数据备份                                │ │
│ └─────────────────────────────────────────────┘ │
│ 在任务列表中显示的友好名称                      │
│                                                 │
├─────────────────────────────────────────────────┤
│                        [取消]  [提交任务]       │
└─────────────────────────────────────────────────┘
```

**任务列表**：
```
┌─────────────────────────────────────────────────────────────────┐
│ 异步任务                                              [刷新]    │
├─────────────────────────────────────────────────────────────────┤
│ 状态    │ SQL                    │ 时间   │ 行数  │ 操作       │
├─────────┼────────────────────────┼────────┼───────┼────────────┤
│ ✓ 成功  │ SELECT * FROM orders...│ 2.3s   │ 1,234 │ [预览][下载]│
│         │ 表名: my_orders        │        │       │            │
├─────────┼────────────────────────┼────────┼───────┼────────────┤
│ ⏳ 运行中│ SELECT * FROM users... │ 15s    │ -     │ [取消]     │
├─────────┼────────────────────────┼────────┼───────┼────────────┤
│ ✗ 失败  │ SELECT * FROM xxx...   │ 0.5s   │ -     │ [重试]     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2️⃣ TanStack Table 作为默认结果展示

### 2.1 背景与现状

**当前状态**：
- 默认使用 AG Grid Community 版本
- 已实现 TanStack DataGrid 作为实验性功能（可通过按钮切换）
- TanStack DataGrid 已支持：虚拟滚动、单元格选区、多格式复制、列筛选

**切换原因**：
- AG Grid Community 版本功能受限（如 SetFilter 需要 Enterprise）
- TanStack Table 完全开源，无功能限制
- 更好的 React 集成和 TypeScript 支持
- 更小的包体积

### 2.2 功能需求

#### 2.2.1 默认使用 TanStack Table

**需求描述**：将 TanStack DataGrid 设为默认结果展示组件。

**功能点**：
- [ ] 修改 `ResultPanel.tsx` 默认值 `useNewDataGrid = true`
- [ ] 保留 AG Grid 作为备选（可通过工具栏按钮切换）
- [ ] 确保所有现有功能正常工作
- [ ] 用户偏好持久化（localStorage）

**约束**：
- 切换不能丢失当前数据
- 切换后统计信息正确更新
- 两种模式的工具栏功能对应正确

#### 2.2.2 UI 风格统一

**需求描述**：TanStack DataGrid 的 UI 风格应与 AG Grid 保持一致，使用 Tailwind CSS 实现。

**对比项**：

| 功能 | AG Grid | TanStack DataGrid | 需要调整 |
|------|---------|-------------------|----------|
| 表头样式 | 灰色背景，边框分隔 | 类似 | ✅ 已一致 |
| 单元格样式 | 白色背景，悬停高亮 | 类似 | ✅ 已一致 |
| 选中样式 | 蓝色背景 | 蓝色边框 | ⚠️ 需调整 |
| 滚动条 | 原生样式 | 原生样式 | ✅ 已一致 |
| 列宽调整 | 拖拽手柄 | 拖拽手柄 | ✅ 已一致 |
| 排序图标 | 箭头 | 箭头 | ✅ 已一致 |
| 筛选图标 | 漏斗 | 漏斗 | ✅ 已一致 |

**需要调整的样式**（使用 Tailwind CSS）：
- [ ] 选中行/单元格的背景色改为与 AG Grid 一致（`bg-primary/10`）
- [ ] 表头高度和字体大小统一
- [ ] 底部统计栏样式统一
- [ ] 深色模式适配

### 2.3 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| 数据为空 | 显示空状态提示 |
| 数据量超大（>10 万行） | 虚拟滚动，只渲染可见行 |
| 列数超多（>100 列） | 启用列虚拟化 |
| 单元格内容过长 | 截断显示，悬停显示完整内容 |
| 特殊值（NULL、undefined） | 显示为灰色 "NULL" 文本 |
| 布尔值 | 显示为图标（✓/✗） |
| 日期值 | 格式化显示 |
| 数值 | 右对齐，千分位格式化 |

### 2.4 性能要求

| 指标 | 要求 |
|------|------|
| 首次渲染（1000 行） | < 100ms |
| 滚动帧率（10 万行） | 60fps |
| 筛选响应时间 | < 200ms |
| 排序响应时间 | < 500ms |
| 内存占用（10 万行） | < 200MB |

**⚠️ 虚拟滚动与面板调整大小的兼容性（重要）**：

**问题描述**：
- TanStack Virtual 的虚拟列表高度是计算出来的
- 当用户拖拽 ResizablePanel 调整大小时，如果没有正确监听容器高度变化，会出现：
  - 列表底部大片空白
  - 滚动条错乱
  - 必须滚动一下才能恢复

**解决方案**：
- DataGrid 容器必须绑定 `ResizeObserver` 监听高度变化
- 高度变化时强制触发虚拟滚动的布局更新

**实现要求**：
```typescript
// 使用 ResizeObserver 监听容器大小变化
useEffect(() => {
  if (!containerRef.current) return;
  
  const resizeObserver = new ResizeObserver((entries) => {
    // 触发虚拟滚动重新计算
    virtualizer.measure();
  });
  
  resizeObserver.observe(containerRef.current);
  return () => resizeObserver.disconnect();
}, [virtualizer]);
```

---

## 3️⃣ TanStack Table 功能增强

### 3.1 背景与现状

**当前 TanStack DataGrid 已支持**：
- ✅ 虚拟滚动（10 万行流畅）
- ✅ 单元格选区（飞书式）
- ✅ 多格式复制（TSV/CSV/JSON）
- ✅ 列筛选（低基数/高基数自适应）
- ✅ 列排序（点击列头）
- ✅ 列宽调整（拖拽）
- ✅ 键盘导航

**缺失功能**：
- ❌ 列隐藏/显示
- ❌ 列冻结（Pinning）
- ❌ 导出 CSV/JSON 文件到本地
- ❌ 工具栏完整集成

### 3.2 功能需求

#### 3.2.1 列隐藏/显示

**需求描述**：支持用户隐藏/显示特定列。

**功能点**：
- [ ] 在工具栏添加"列"下拉菜单（使用 shadcn/ui DropdownMenu）
- [ ] 显示所有列的复选框列表（使用 DropdownMenuCheckboxItem）
- [ ] 支持"显示所有列"快捷操作
- [ ] 支持"重置列"恢复默认

**⚠️ 列可见性状态管理策略**：
- **仅会话级**：不持久化到 localStorage
- **原因**：查询工作台的 SQL 是动态的，不同查询返回不同的列结构。如果持久化，会导致：
  - 查询 Users 表隐藏 "password" 列后，查询 Orders 表时可能应用错误的隐藏状态
  - 列名对不上导致 UX 问题
- **行为**：每次执行新查询后，列可见性重置为全部显示

**注意**：这与现有 AG Grid 的行为一致（AG Grid 当前也没有持久化列可见性），不会影响现有功能。

**UI 组件**：
```tsx
// 使用 shadcn/ui 组件
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/new/components/ui/dropdown-menu';
```

#### 3.2.2 列冻结（Pinning）

**需求描述**：支持用户冻结列到左侧，滚动时保持可见（与 AG Grid 功能对齐）。

**功能点**：
- [ ] 支持冻结列到左侧（Pin Left）
- [ ] 支持取消冻结（Unpin）
- [ ] 冻结列在水平滚动时保持固定
- [ ] 冻结列与非冻结列之间有视觉分隔线
- [ ] 通过列头右键菜单操作冻结/取消冻结

**UI 交互**：
- 右键点击列头 → 显示上下文菜单
- 菜单选项：
  - "冻结到左侧" / "Pin to Left"
  - "取消冻结" / "Unpin"（仅对已冻结列显示）

**技术实现**：
- 使用 CSS `position: sticky` + `left: 0` 实现冻结效果
- 冻结列需要计算累积宽度设置正确的 `left` 值
- 冻结列背景色需要不透明，避免滚动时内容穿透

**边界情况**：
| 场景 | 处理方式 |
|------|----------|
| 冻结多列 | 支持，按冻结顺序从左到右排列 |
| 冻结所有列 | 禁止，至少保留一列非冻结 |
| 列宽调整后 | 自动重新计算冻结列位置 |
| 隐藏冻结列 | 允许，隐藏后自动调整其他冻结列位置 |

---

#### 3.2.3 导出 CSV/JSON

**需求描述**：支持将当前数据（考虑筛选后）导出为文件。

**⚠️ 前端导出 vs 后端导出的概念区分（重要）**：

| 导出方式 | 位置 | 数据范围 | 适用场景 |
|----------|------|----------|----------|
| **前端导出** | DataGrid 工具栏 | 仅当前预览数据（内存中的数据） | 快速导出小量数据 |
| **后端导出** | 异步任务面板 | 数据库全量数据 | 大数据量完整导出 |

**用户困惑风险**：
- 用户在 DataGrid 点"导出"，以为在导全量数据
- 实际只导出了当前预览的数据（如前 1000 行）
- 用户会认为是 Bug 或数据丢失

**解决方案 - 导出菜单设计**：

```
┌─────────────────────────────────────────┐
│ 导出                              [▼]   │
├─────────────────────────────────────────┤
│ 📄 导出为 CSV                           │
│ 📄 导出为 JSON                          │
├─────────────────────────────────────────┤
│ ⚠️ 仅导出当前预览数据 (1,000 行)        │
│    查询结果共 1,000,000 行              │
├─────────────────────────────────────────┤
│ 🚀 全量导出 (异步任务)                  │
│    导出完整查询结果到 CSV/Parquet       │
└─────────────────────────────────────────┘
```

**功能点**：
- [ ] 导出菜单顶部显示当前预览数据行数
- [ ] 如果查询结果被截断（如 LIMIT 1000），显示警告提示
- [ ] 添加"全量导出 (异步任务)"选项，点击跳转到异步任务对话框
- [ ] 导出 CSV 文件
  - 使用逗号分隔
  - 正确处理包含逗号/换行/引号的值（RFC 4180 标准）
  - 支持 UTF-8 BOM（Excel 兼容）
  - 文件名格式：`query_result_YYYYMMDD_HHmmss.csv`
- [ ] 导出 JSON 文件
  - 格式化输出（缩进 2 空格）
  - 数组格式
  - 文件名格式：`query_result_YYYYMMDD_HHmmss.json`
- [ ] 导出范围选择
  - 导出所有数据（默认）
  - 导出筛选后数据
  - 导出选中数据（如果有选区）

**⚠️ 客户端导出性能限制**：
- **上限**：客户端导出最大支持 **5 万行**
- **原因**：浏览器主线程进行大量字符串拼接和 Blob 生成会导致 UI 卡顿
- **超过限制时**：
  - 显示提示对话框："数据量较大（X 行），建议使用异步任务导出以获得更好的性能"
  - 提供两个选项：
    1. "仍然导出"（警告可能卡顿）
    2. "使用异步任务"（跳转到异步任务对话框）

**⚠️ 导出时的类型序列化（关键）**：

DuckDB 返回的数据可能包含特殊类型，必须正确处理：

| 类型 | 问题 | 解决方案 |
|------|------|----------|
| `BigInt` / `HUGEINT` | `JSON.stringify()` 遇到 BigInt 会抛出 `TypeError` 崩溃 | 在 `JSON.stringify` 中提供 `replacer` 函数，将 BigInt 转为字符串 |
| `LIST` (如 `[1, 2]`) | CSV 导出可能变成 `[object Object]` | 使用 `JSON.stringify()` 序列化为字符串 |
| `STRUCT` (如 `{'key': 'val'}`) | CSV 导出可能变成 `[object Object]` | 使用 `JSON.stringify()` 序列化为字符串 |
| `Date` / `Timestamp` | 格式不一致 | 统一转为 ISO 8601 格式 |

**实现要求**：
- 必须实现统一的 `serializeCellValue(value: unknown): string` 函数
- 该函数处理所有特殊类型，确保导出不会崩溃或乱码
- CSV 和 JSON 导出都必须使用此函数

**边界情况**：
| 场景 | 处理方式 |
|------|----------|
| 数据为空 | 禁用导出按钮，显示提示 |
| 数据量 > 5 万行 | 显示警告对话框，建议使用异步任务导出 |
| 数据量 > 50 万行 | 强制使用异步任务，禁止客户端导出 |
| 单元格包含特殊字符 | 正确转义（CSV 用引号包裹，JSON 用转义字符） |
| 单元格包含换行符 | CSV 用引号包裹保留换行 |
| NULL 值 | CSV 导出为空字符串，JSON 导出为 null |
| 日期值 | 导出为 ISO 8601 格式，时区为已配置时区 |
| 浏览器不支持下载 | 显示错误提示 |

#### 3.2.4 工具栏集成

**需求描述**：将 TanStack DataGrid 的功能集成到 ResultToolbar，使用 shadcn/ui 组件。

**功能点**：
- [ ] 列可见性控制（DropdownMenu）
- [ ] 导出按钮（DropdownMenu，选择 CSV/JSON）
- [ ] 统计信息显示（行数、列数、选中单元格数）
- [ ] 刷新按钮
- [ ] 全屏按钮

**工具栏布局**（同一行，响应式）：
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ 1,234 / 10,000 行 │ 15 / 20 列 │ 已选 50 个单元格 │ 2.3s    [列 ▼] [刷新] [导出 ▼] [全屏] │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**响应式行为**：
- 默认：统计信息和操作按钮在同一行，左侧统计信息，右侧操作按钮
- 窗口变小时：使用 Tailwind 的 `flex-wrap` 自动换行
- 极小窗口：按钮文字隐藏，只显示图标

**Tailwind 实现**（与现有 ResultToolbar 保持一致）：
```tsx
<div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
  {/* 左侧：统计信息 */}
  <div className="flex items-center gap-4 text-sm text-muted-foreground">
    <span>1,234 / 10,000 行</span>
    <span>15 / 20 列</span>
    <span>已选 50 个单元格</span>
    <span>2.3s</span>
  </div>
  
  {/* 右侧：操作按钮 */}
  <div className="flex items-center gap-1">
    <Button variant="ghost" size="sm">列</Button>
    <Button variant="ghost" size="sm">刷新</Button>
    <Button variant="ghost" size="sm">导出</Button>
    <Button variant="ghost" size="sm">全屏</Button>
  </div>
</div>
```

**响应式处理**：
- 使用 `justify-between` 保持左右两端对齐
- 按钮文字在小屏幕隐藏：`<span className="hidden sm:inline">文字</span>`
- 极小窗口时只显示图标，保持单行布局

### 3.3 性能考虑

| 操作 | 性能要求 | 实现策略 |
|------|----------|----------|
| 列隐藏/显示 | < 50ms | 使用 useMemo 缓存列定义 |
| 导出 1 万行 CSV | < 1s | 使用 Blob + URL.createObjectURL |
| 导出 10 万行 CSV | < 5s | 分批处理，显示进度 |
| 导出 100 万行 | 不支持 | 提示使用异步任务 |

---

## 4️⃣ SQL 格式化增强

### 4.1 背景与现状

**当前状态**：
- 使用自定义 `formatSQLSmart()` 函数进行基础格式化
- 支持关键字大写
- 支持在主要子句前换行
- 正确处理注释和字符串字面量

**问题**：
- 格式化效果不够专业
- 不支持缩进对齐
- 不支持 SELECT 列表每列一行
- 不支持 JOIN 条件对齐

### 4.2 功能需求

#### 4.2.1 DataGrip 风格格式化

**需求描述**：使用成熟的 SQL 格式化库实现类似 DataGrip 的专业格式化效果。

**⚠️ 重要约束**：
- **必须使用成熟开源组件**，禁止自己实现 SQL 解析器
- **推荐使用 `sql-formatter` 库**（GitHub 5k+ stars，成熟稳定）
- 格式化失败时返回原始 SQL，不能丢失用户输入

**格式化前**：
```sql
SELECT bschool_order.id, bschool_order.order_id, bschool_order.showcase_id, bschool_order.type FROM mysql_sorder.bschool_order AS bschool_order LEFT JOIN mysql_sorder.bschool_order_address AS bschool_order_address ON bschool_order.id = bschool_order_address.id LEFT JOIN test1 AS test1 ON bschool_order_address.id = test1.序号 LIMIT 10000
```

**格式化后**（DataGrip 风格）：
```sql
SELECT "bschool_order"."id",
       "bschool_order"."order_id",
       "bschool_order"."showcase_id",
       "bschool_order"."type",
       "bschool_order"."total_fee",
       "bschool_order_address"."receiver_name",
       "bschool_order_address"."receiver_mobile"
FROM "mysql_sorder"."bschool_order" AS "bschool_order"
LEFT JOIN "mysql_sorder"."bschool_order_address" AS "bschool_order_address"
ON "bschool_order"."id" = "bschool_order_address"."id"
LEFT JOIN "test1" AS "test1"
ON "bschool_order_address"."id" = "test1"."序号"
LIMIT 10000
```

#### 4.2.2 技术方案

**推荐方案**：使用 `sql-formatter` 库

**安装**：
```bash
npm install sql-formatter
```

**配置**：
```typescript
import { format } from 'sql-formatter';

const formatSQLDataGrip = (sql: string): string => {
  try {
    return format(sql, {
      language: 'postgresql',  // DuckDB 兼容 PostgreSQL 语法
      tabWidth: 4,
      useTabs: false,
      keywordCase: 'upper',
      identifierCase: 'preserve',  // 保留标识符大小写
      dataTypeCase: 'upper',
      functionCase: 'upper',
      linesBetweenQueries: 2,
      denseOperators: false,
      newlineBeforeSemicolon: false,
    });
  } catch (error) {
    console.error('SQL 格式化失败:', error);
    return sql;  // 格式化失败返回原始 SQL
  }
};
```

#### 4.2.3 DuckDB 方言兼容性与降级策略

**⚠️ 重要说明**：`sql-formatter` 库使用 PostgreSQL 方言，但 DuckDB 有一些特有语法可能无法完美支持。

**DuckDB 特有语法兼容性**：

| 语法 | 支持情况 | 说明 |
|------|----------|------|
| 标准 SELECT/JOIN/WHERE | ✅ 完全支持 | PostgreSQL 兼容 |
| CTE (WITH 子句) | ✅ 完全支持 | PostgreSQL 兼容 |
| 窗口函数 | ✅ 完全支持 | PostgreSQL 兼容 |
| ATTACH DATABASE | ⚠️ 部分支持 | 可能格式化不理想 |
| COPY TO/FROM | ⚠️ 部分支持 | 可能格式化不理想 |
| EXCLUDE/REPLACE 列 | ❌ 不支持 | DuckDB 特有，返回原始 SQL |
| PIVOT/UNPIVOT | ❌ 不支持 | DuckDB 特有，返回原始 SQL |
| QUALIFY 子句 | ❌ 不支持 | DuckDB 特有，返回原始 SQL |
| SAMPLE 子句 | ⚠️ 部分支持 | 可能格式化不理想 |

**降级策略**：
1. **格式化失败时**：返回原始 SQL，不丢失用户输入
2. **格式化结果异常时**：如果格式化后的 SQL 长度比原始 SQL 短超过 50%，认为格式化异常，返回原始 SQL
3. **用户提示**：格式化按钮旁可添加 tooltip 说明"使用 PostgreSQL 方言格式化，部分 DuckDB 特有语法可能不支持"

**实现代码示例**：
```typescript
export function formatSQLDataGrip(sql: string): string {
  if (!sql.trim()) return sql;
  
  try {
    const formatted = format(sql, DATAGRIP_FORMAT_OPTIONS);
    
    // 降级检查：格式化结果异常时返回原始 SQL
    if (formatted.length < sql.length * 0.5) {
      console.warn('SQL 格式化结果异常，返回原始 SQL');
      return sql;
    }
    
    return formatted;
  } catch (error) {
    console.error('SQL 格式化失败:', error);
    return sql;  // 格式化失败返回原始 SQL
  }
}
```

#### 4.2.4 边界情况处理

| 场景 | 处理方式 |
|------|----------|
| SQL 为空 | 返回空字符串 |
| SQL 语法错误 | 返回原始 SQL，不报错 |
| 包含注释 | 保留注释，正确格式化 |
| 包含字符串字面量 | 保留字符串内容，不格式化 |
| 包含中文标识符 | 正确处理，保留双引号 |
| DuckDB 特有语法（ATTACH、COPY） | 尽量支持，不支持时返回原始 SQL |
| 超长 SQL（>10000 字符） | 正常处理，可能较慢 |
| 嵌套子查询 | 正确缩进 |
| CTE（WITH 子句） | 正确格式化 |

#### 4.2.5 性能要求

| SQL 长度 | 格式化时间要求 |
|----------|----------------|
| < 100 行 | < 50ms |
| 100-500 行 | < 200ms |
| 500-1000 行 | < 500ms |
| > 1000 行 | < 1s |

#### 4.2.6 集成方式

修改 `frontend/src/new/Query/SQLQuery/hooks/useSQLEditor.ts`：

```typescript
// 替换现有的 formatSQLSmart 函数
import { formatSQLDataGrip } from '@/new/utils/sqlFormatter';

const formatSQL = useCallback(() => {
  const formatted = formatSQLDataGrip(sql);
  setSQL(formatted);
}, [sql]);
```

#### 4.2.7 选区格式化支持

**需求描述**：用户可能在一个编辑器中写多条 SQL，只想格式化选中的部分。

**功能点**：
- [ ] 检测当前是否有选中文本
- [ ] 如果有选中文本，只格式化选中部分并替换回原位置
- [ ] 如果没有选中文本，格式化全文

**实现逻辑**：
```typescript
const formatSQL = useCallback(() => {
  // 获取编辑器选区
  const selection = editorRef.current?.getSelection();
  const selectedText = editorRef.current?.getSelectedText();
  
  if (selectedText && selectedText.trim()) {
    // 有选中文本：只格式化选中部分
    const formatted = formatSQLDataGrip(selectedText);
    editorRef.current?.replaceSelection(formatted);
  } else {
    // 无选中文本：格式化全文
    const formatted = formatSQLDataGrip(sql);
    setSQL(formatted);
  }
}, [sql]);
```

**用户体验**：
- 快捷键 `Ctrl+Shift+F` 触发格式化
- 有选区时只格式化选区，无选区时格式化全文
- 格式化后保持光标位置（尽可能）

---

## 📊 优先级排序

| 需求 | 优先级 | 工作量 | 依赖 | 风险 |
|------|--------|--------|------|------|
| SQL 格式化增强 | P0 | 小 | 无 | 低 |
| TanStack Table 列隐藏/显示 | P1 | 中 | 无 | 低 |
| TanStack Table 列冻结（Pinning） | P1 | 中 | 无 | 中（CSS sticky 兼容性） |
| TanStack Table 导出功能 | P1 | 中 | 无 | 中（类型序列化） |
| TanStack Table 作为默认 | P1 | 小 | 上述三项 | 中（需充分测试） |
| 异步任务发起增强 | P2 | 中 | 无 | 低 |
| 异步任务面板完善 | P2 | 大 | 无 | 中（功能较多） |

---

## 🔗 相关文件

### 异步任务
- `frontend/src/new/Query/AsyncTasks/AsyncTaskPanel.tsx` - 新布局异步任务面板
- `frontend/src/components/AsyncTasks/AsyncTaskList.jsx` - 旧布局异步任务列表（参考）
- `api/routers/async_tasks.py` - 异步任务 API

### 结果展示
- `frontend/src/new/Query/ResultPanel/ResultPanel.tsx` - 结果面板
- `frontend/src/new/Query/ResultPanel/ResultToolbar.tsx` - 结果工具栏
- `frontend/src/new/Query/DataGrid/DataGrid.tsx` - TanStack DataGrid
- `frontend/src/new/Query/ResultPanel/AGGridWrapper.tsx` - AG Grid 封装

### SQL 编辑器
- `frontend/src/new/Query/SQLQuery/hooks/useSQLEditor.ts` - SQL 编辑器 Hook
- `frontend/src/new/Query/SQLQuery/SQLQueryPanel.tsx` - SQL 面板

---

## ✅ 验收标准

### 异步任务
- [ ] 可以发起异步任务并指定自定义表名
- [ ] 自定义表名校验正确（字母/数字/下划线，不能以数字开头，最大 64 字符）
- [ ] 支持"如果存在则覆盖"选项
- [ ] 任务列表显示自定义表名和显示名
- [ ] 可以下载成功任务的结果文件（CSV/Parquet）
- [ ] 取消/重试功能正常工作
- [ ] 任务成功后自动刷新左侧数据源面板（新表立即可见）
- [ ] 所有对话框使用 shadcn/ui 组件

### TanStack Table
- [ ] 默认使用 TanStack DataGrid 显示结果
- [ ] 可以隐藏/显示列
- [ ] 列可见性为会话级（与 AG Grid 行为一致，不持久化）
- [ ] 可以冻结列到左侧（Pin Left）
- [ ] 冻结列在水平滚动时保持固定
- [ ] 可以导出 CSV/JSON 文件
- [ ] 导出菜单明确显示"仅导出当前预览数据"
- [ ] 导出菜单提供"全量导出 (异步任务)"入口
- [ ] 导出正确处理 BigInt 和复杂类型（LIST/STRUCT）
- [ ] 导出文件格式正确（UTF-8 BOM，特殊字符转义）
- [ ] UI 风格与 AG Grid 一致
- [ ] 深色模式正常
- [ ] 10 万行数据流畅滚动

### SQL 格式化
- [ ] 使用 `sql-formatter` 库实现
- [ ] 格式化后的 SQL 符合 DataGrip 风格
- [ ] SELECT 列表每列一行
- [ ] JOIN 条件正确对齐
- [ ] 不破坏注释和字符串字面量
- [ ] 格式化失败时返回原始 SQL
- [ ] 支持选区格式化（有选中文本时只格式化选中部分）
- [ ] DuckDB 特有语法格式化失败时优雅降级

### 构建验证
- [ ] `npm run build` 通过
- [ ] `npm run lint` 无错误
- [ ] `npx tsc --noEmit` 无错误
- [ ] 无新增 console.error/warn

---

## 🚫 禁止事项

1. **禁止自己实现 SQL 解析器**，必须使用成熟库（sql-formatter）
2. **禁止使用 MUI 组件**，新布局必须使用 shadcn/ui
3. **禁止使用自定义 CSS**，必须使用 Tailwind CSS
4. **禁止硬编码颜色**，使用 Tailwind 语义化类名
5. **禁止破坏现有功能**，所有改动需要向后兼容
6. **禁止忽略错误处理**，所有 API 调用必须有 try-catch
7. **禁止忽略国际化**，所有用户可见文本使用 i18n

---

## 📝 备注

1. TanStack Table 切换为默认后，AG Grid 仍保留作为备选，可通过工具栏按钮切换
2. SQL 格式化使用 `sql-formatter` 库，配置为 PostgreSQL 方言（DuckDB 兼容）
3. 异步任务功能参考旧 UI 实现，但使用 shadcn/ui 组件重写
4. 所有新增组件必须支持深色模式
5. 导出大文件（>10 万行）建议使用异步任务，前端导出有性能限制
