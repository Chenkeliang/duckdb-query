# 项目专用 AGENT 规则

## 目录与模块
- 后端 FastAPI 在 `api/`（核心/路由/模型），前端 SPA 在 `frontend/src`，配置在 `config/`，临时/导出数据在 `temp_files/` 与 `exports/`，文档在 `docs/`，Docker 由根目录 `docker-compose.yml` 驱动。
- DuckDB 辅助函数需无状态，接收可选连接参数并调用 `_use_connection()` / `with_duckdb_connection()`，避免模块级长连接。
- 新布局代码集中在 `frontend/src/new/`（Layout/DataSource/Common/Theme 等），仅用于 `DuckQueryApp`；旧入口 `ShadcnApp` 与 `modern.css` 不改动。

## 运行与测试
- `python -m uvicorn main:app --reload`（`api/` 内）启动后端；`python -m pytest api/tests -q` 跑后端测试。
- 前端：`npm install && npm run dev` 开发，`npm run lint` 检查，`npm run build` 产出 `frontend/dist`。
- 不做全局安装，避免触碰非项目文件。

## 编码风格
- Python 遵循 PEP 8，新增公共 API 写 docstring 和类型标注；路由/响应模型命名对齐现有模式（如 `visual-query`、`data_sources`）。
- 前端使用 ES modules，组件 PascalCase，hooks/utils camelCase；新增文案遵循既有排版等级。
- 写回 DuckDB 前时间统一为 UTC（naive），参考 `TaskManager._normalize_datetime`。

## UI / CSS / 主题 / 设计系统

### 核心原则
- **统一设计系统**: 所有新代码必须使用 `frontend/src/styles/tailwind.css` 中定义的 CSS 变量和语义化 Tailwind 类。
- **作用域隔离**: 新布局代码必须在 `.dq-new-theme` 作用域内（已在 `PageShell` 中应用）。
- **语义化优先**: 使用语义化类名（如 `bg-surface`），严禁直接使用 CSS 变量（如 `var(--dq-surface)`）。
- **深色模式**: 所有样式必须自动支持深色模式，通过 `html.dark` 或 `.dark` 类切换。

### 三层架构（强制执行）
1. **定义层** (`tailwind.css`): 定义所有 CSS 变量（`--dq-*`），包含浅色和深色模式变体
2. **映射层** (`tailwind.config.js`): 将 CSS 变量映射为 Tailwind 语义化类名
3. **使用层** (组件): **严禁**直接使用 `var(--dq-*)`，**必须**使用 Tailwind 类名

### 可用的语义化类名

#### 背景色
- `bg-background` - 页面背景
- `bg-surface` - 卡片/面板背景
- `bg-muted` - 次要背景（标签页背景）
- `bg-primary` - 主色调背景
- `bg-input` - 输入框背景
- `bg-surface-hover` - 悬停状态背景
- `bg-muted/30` - 半透明次要背景（列表项）

#### 文本颜色
- `text-foreground` - 主要文本
- `text-muted-foreground` - 次要文本（说明、标签）
- `text-primary` - 主色调文本
- `text-primary-foreground` - 主色调背景上的文本

#### 边框
- `border-border` - 标准边框
- `border-primary` - 主色调边框
- `border-foreground` - 前景色边框（激活状态）
- `hover:border-primary/50` - 悬停时半透明主色调边框

#### 圆角与阴影
- `rounded-xl` - 卡片圆角 (0.75rem)
- `rounded-md` - 输入框/按钮圆角
- `shadow-sm` - 卡片阴影

### 标准组件模式（必须遵循）

#### 卡片容器
```jsx
<div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
  {/* 内容 */}
</div>
```

#### 输入框
```jsx
<input className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
```

#### 主按钮
```jsx
<button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-60">
  确认
</button>
```

#### 次要按钮
```jsx
<button className="px-4 py-2 rounded-md border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-hover disabled:opacity-60">
  取消
</button>
```

#### 标签页导航
```jsx
<div className="flex bg-muted p-1 rounded-lg h-9 gap-1">
  <button className={`px-3 text-xs font-medium rounded-[6px] flex items-center gap-2 transition-all ${
    active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
  }`}>
    标签名
  </button>
</div>
```

#### 列表项（可悬停）
```jsx
<div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 hover:border-primary/50 cursor-pointer transition-colors px-3 py-2">
  {/* 内容 */}
</div>
```

### 字体系统
- **主字体**: Inter（已在 `main.jsx` 中导入，权重 300-700）
- **等宽字体**: JetBrains Mono（已在 `index.html` 中导入，用于代码块）
- **字体平滑**: 已在 scoped preflight 中启用 `-webkit-font-smoothing: antialiased`

### 样式约束清单
- ✅ 使用语义化 Tailwind 类（`bg-surface`, `text-foreground`）
- ❌ 禁止直接使用 CSS 变量（`style={{ color: 'var(--dq-foreground)' }}`）
- ❌ 禁止硬编码颜色值（`#fff`, `rgb(255,255,255)`）
- ❌ 禁止使用 `!important`
- ✅ 过渡动画使用 `transition-colors` 或 `transition-all`
- ✅ 间距使用 Tailwind 标准（`space-y-4`, `gap-3`, `p-6`）
- ✅ 响应式使用 Tailwind 前缀（`md:grid-cols-2`, `xl:col-span-3`）

### 参考组件
新组件开发前必须参考以下已重构组件的样式模式：
- `frontend/src/new/DatabaseForm.jsx` - 表单布局、标签页、输入框
- `frontend/src/new/UploadPanel.jsx` - 卡片容器、按钮组
- `frontend/src/new/DataPasteCard.jsx` - 文本区域、选择框
- `frontend/src/new/SavedConnectionsList.jsx` - 列表项、状态徽章
- `frontend/src/new/Layout/Sidebar.jsx` - 导航样式、Logo

### 图标与资源
- 新布局/导航统一用 `lucide-react`，Sidebar/Header 避免 MUI
- Logo 随主题切换 `Duckquerylogo.svg` / `duckquery-dark.svg`，禁止 `invert()`
- 活动状态指示器使用 `bg-green-400`（如数据库标签页的绿色圆点）

### 新入口隔离
- 新入口仅用 `tailwind.css`，不引用 `modern.css`，不复用旧类名
- 缺失的 token 先加到 `tailwind.css` 再用，保持变量系统完整性

### 状态颜色系统（必须使用）
#### Success（成功）
- `bg-success` / `text-success` - 成功状态主色
- `bg-success-bg` / `border-success-border` - 成功状态背景和边框
- 用途：操作成功提示、已保存连接、绿色指示器

#### Warning（警告）
- `bg-warning` / `text-warning` - 警告状态主色
- `bg-warning-bg` / `border-warning-border` - 警告状态背景和边框
- 用途：需要注意的提示、非关键错误

#### Error（错误）
- `bg-error` / `text-error` - 错误状态主色
- `bg-error-bg` / `border-error-border` - 错误状态背景和边框
- 用途：操作失败、验证错误、删除确认

#### Info（信息）
- `bg-info` / `text-info` - 信息状态主色
- `bg-info-bg` / `border-info-border` - 信息状态背景和边框
- 用途：提示信息、帮助文本

**禁止**: 硬编码状态色（如 `bg-green-500`, `text-red-600`），必须使用语义化类名

### 对话框/弹窗模式（Dialog/Modal）
```jsx
{/* 标准对话框结构 */}
<div className="fixed inset-0 z-[1040] bg-[var(--dq-backdrop-bg)] backdrop-blur-sm">
  <div className="fixed inset-0 z-[1050] flex items-center justify-center p-4">
    <div className="bg-surface-elevated border border-border rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">标题</h2>
        <button className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>
      {/* Content */}
      <div className="text-sm text-muted-foreground">内容</div>
      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button className="px-4 py-2 rounded-md border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-hover">
          取消
        </button>
        <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
          确认
        </button>
      </div>
    </div>
  </div>
</div>
```

### 通知/Toast 模式（Notification）
```jsx
{/* Success Toast */}
<div className="flex items-start gap-3 bg-success-bg border border-success-border rounded-lg p-4 shadow-lg">
  <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
  <div className="flex-1">
    <div className="text-sm font-medium text-foreground">操作成功</div>
    <div className="text-xs text-muted-foreground mt-1">数据已保存</div>
  </div>
  <button className="text-muted-foreground hover:text-foreground">
    <X className="w-4 h-4" />
  </button>
</div>

{/* Error Toast */}
<div className="flex items-start gap-3 bg-error-bg border border-error-border rounded-lg p-4 shadow-lg">
  <AlertCircle className="w-5 h-5 text-error flex-shrink-0" />
  <div className="flex-1">
    <div className="text-sm font-medium text-foreground">操作失败</div>
    <div className="text-xs text-muted-foreground mt-1">请稍后重试</div>
  </div>
</div>
```

### Tooltip 模式
```jsx
<div className="absolute z-[1070] bg-[hsl(240,10%,10%)] text-white text-xs rounded-md px-2 py-1 shadow-lg">
  提示文本
  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-[hsl(240,10%,10%)] rotate-45"></div>
</div>
```

### Z-Index 层级（严格遵守）
- `z-0` - 基础层
- `z-[1000]` - 下拉菜单
- `z-[1020]` - 粘性元素
- `z-[1030]` - 固定元素
- `z-[1040]` - 模态背景
- `z-[1050]` - 模态内容
- `z-[1060]` - Popover
- `z-[1070]` - Tooltip
- `z-[1080]` - 通知

**禁止**: 随意使用 `z-50`, `z-[9999]` 等值，必须使用标准层级

### 字体大小系统
- `text-xs` (12px) - 小标签、辅助文本
- `text-sm` (14px) - 次要文本、表单标签
- `text-base` (16px) - 正文
- `text-lg` (18px) - 小标题
- `text-xl` (20px) - 卡片标题
- `text-2xl` (24px) - 页面标题

### 圆角系统
- `rounded-sm` (4px) - 小元素
- `rounded-md` (6px) - 输入框/按钮
- `rounded-lg` (8px) - 标签页
- `rounded-xl` (12px) - 卡片
- `rounded-2xl` (16px) - 大卡片
- `rounded-full` - 圆形（头像、指示器）

### 阴影系统
- `shadow-xs` - 极小阴影
- `shadow-sm` - 卡片阴影（标准）
- `shadow-md` - 中等阴影
- `shadow-lg` - 大阴影（Toast）
- `shadow-xl` - 超大阴影
- `shadow-2xl` - 对话框阴影

### Focus/Disabled/Loading 状态
```jsx
{/* Focus 状态 */}
className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"

{/* Disabled 状态 */}
className="disabled:opacity-50 disabled:cursor-not-allowed"

{/* Loading Spinner */}
<div className="animate-spin rounded-full h-8 w-8 border-2 border-muted border-t-primary"></div>

{/* Skeleton */}
<div className="animate-pulse bg-muted rounded h-4 w-full"></div>
```

### 动画时长
- `duration-150` - 快速过渡（悬停）
- `duration-200` - 标准过渡（默认）
- `duration-300` - 慢速过渡（展开/收起）
- `duration-500` - 超慢过渡（页面切换）
- 使用 `transition-colors` 或 `transition-all` 配合时长

## 布局与主题切换
- 新入口可用 Tailwind + shadcn，但必须映射到 `--dq-*` CSS 变量，通过 `data-theme="light|dark"` 或类名切换；不新增零散 CSS。
- Sidebar/Header 固定，内容区滚动；确保表格/编辑器内部滚动不被裁剪。为小屏定义最小宽度与 Sidebar 折叠策略。
- Sidebar 与主区域需有 1px 分隔线（token 颜色），保持暗/亮模式对比。

## 状态与入口
- 状态集中在 `useDuckQuery`，返回 `{state, actions}`，供旧 `ShadcnApp` 与新 `DuckQueryApp` 共用；不要改 `UnifiedQueryInterface` 内部，只传 props。
- 如后续采用状态机，先在 `useDuckQuery` 内用明确的 action/事件演进，避免一次性重写。
- 新组件按 props 契约消费数据/回调，由 `useDuckQuery` 适配；后续若切全局状态，仅改 `useDuckQuery` 内部，不动 `frontend/src/new/`。

## 多语言
- 新布局引入/复用 i18n provider，新文案用翻译 key，设置默认回退，避免缺 key 空白。

## 文档与提交
- 行为变更必须更新 `docs/CHANGELOG.md`；仅在范围变更时改 `README.md` / 入门 / 集成指南。
- 配置示例保持脱敏（`config/*.example`），提交前清理敏感的 `temp_files/`。
- 提交信息用小写前缀（`feat:`、`fix:` 等）+ 现在时简述，保持变更范围清晰，不回滚用户已有或无关改动。

## 兼容性检查清单
- 明/暗模式对比度、残留硬编码颜色（分页/悬浮态等）需归一到 `--dq-*`。
- 导航图标与线条在暗色下可见；按钮/输入 hover/active/disabled 态均映射到 tokens。
- 响应式断点与滚动表现符合预期；Logo 按主题切换。

## 代理约束
- 未经指示不修改代码；仅分析则不动代码。
- 避免新增 `!important`，优先复用 tokens/组件；必要的新样式先问清需求。

## 目录整理与清理
- 布局组件集中在 `frontend/src/components/Layout/`；DataSource 相关子视图集中到 `frontend/src/components/DataSource/`（List/Upload/Paste/Database/Dialogs/common）。
- 资源（含小号 logo）放 `frontend/src/assets/`；tokens 统一在 `styles/tokens.css` 供 Tailwind & 组件引用。
- 清理未用样式/组件前先用 `rg` 查引用，确认无用再删，避免影响业务逻辑。
