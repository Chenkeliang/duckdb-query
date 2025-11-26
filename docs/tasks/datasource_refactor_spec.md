# 数据源管理 UI 重构详细规格说明书 (Data Source Management UI Refactor Spec)

**文档目标**：确保所有开发人员能够严格按照本规范，使用 `shadcn` + `tailwindcss` + `tokens` 技术栈，完美复刻 `datasource_preview.html` 的视觉效果，并正确迁移现有的数据源管理功能。

**核心原则**：
1.  **视觉还原**：严格遵循 `datasource_preview.html` 的像素级样式 (Pixel-Perfect)。
2.  **逻辑复用**：保留原有业务逻辑（Hook/API），仅重写 UI 层。
3.  **样式隔离**：使用 `dq-` 前缀 Token，严禁污染全局样式。

---

## 1. 全局布局 (Layout & Shell)

### 1.1 Sidebar (侧边栏)
**文件路径**: `frontend/src/new/layout/Sidebar.jsx`

*   **视觉规范**:
    *   宽度: `260px` (桌面端), 响应式隐藏 (移动端)。
    *   背景: `bg-[var(--dq-surface)]`。
    *   边框: 右侧 `border-r border-[var(--dq-border)]`。
*   **Logo 切换逻辑 (关键)**:
    *   **必须保持与旧版一致的行为**。
    *   接收 `logoLight` 和 `logoDark` 两个 Props。
    *   **逻辑**:
        *   如果 `isDarkMode` 为 `true`: 优先显示 `logoDark`，若无则降级显示 `logoLight`。
        *   如果 `isDarkMode` 为 `false`: 优先显示 `logoLight`，若无则降级显示 `logoDark`。
        *   若两者都无，显示文字 "DuckQuery"。
    *   **代码参考**:
        ```jsx
        <img src={isDarkMode ? logoDark || logoLight : logoLight || logoDark} ... />
        ```
*   **交互细节**:
    *   导航项点击要有 `bg-[var(--dq-surface-hover)]` 态。
    *   当前激活项要有高亮边框和特定背景色 (参考 Token `dq-nav-active-*`)。
    *   底部包含：主题切换、语言切换、GitHub 跳转、Legacy 模式切换。

### 1.2 Header (顶部导航)
**文件路径**: `frontend/src/new/layout/Header.jsx`

*   **视觉规范**:
    *   高度: `h-16` (64px)。
    *   背景: `bg-[var(--dq-background)]`。
    *   边框: 底部 `border-b border-[var(--dq-border)]`。
*   **功能**:
    *   左侧: 显示当前页面标题 (如 "数据源管理")。
    *   右侧: 放置页面级操作 (如 Tab 切换器、全局操作按钮)。

---

## 2. 数据源管理功能详解 (Data Source Management)

本模块分为三个核心视图，通过 Header 上的 Tab 进行切换。

### 2.1 视图 A: 智能文件上传 (Smart File Upload)
**目标组件**: `frontend/src/new/features/datasource/UploadPanel.jsx`
**对应 Demo**: `#view-file`

*   **功能细节**:
    1.  **拖拽上传区域**:
        *   样式: 虚线边框 (`border-dashed`), 高度适中, 居中图标。
        *   交互: 支持 Drag & Drop, 点击触发文件选择。
        *   状态: 拖拽进入时高亮 (`border-primary`), 上传中显示进度/Loading。
    2.  **表单项**:
        *   **表别名**: 输入框，上传后自动填充文件名，可修改。
        *   **上传方式**: 下拉选择 (自动/分片)。
    3.  **操作栏**:
        *   "开始上传" (Primary Button): 触发 `uploadFile` API。
        *   "清空表单" (Ghost Button): 重置状态。
*   **右侧辅助卡片**:
    *   **URL 拉取**: 输入 URL -> 解析 -> 导入。
    *   **服务器目录**: 下拉选择挂载目录 -> 选择文件 -> 导入。

### 2.2 视图 B: 数据库管理 (Database Management)
**目标组件**: `frontend/src/new/features/datasource/DatabaseForm.jsx`
**对应 Demo**: `#view-db`

*   **布局**: 左右分栏 (Grid Layout)。
    *   左侧 (2/3): 连接配置表单。
    *   右侧 (1/3): 已保存连接列表。
*   **连接表单**:
    *   **类型切换**: 顶部 Tab (MySQL / PostgreSQL / DuckDB)。
    *   **字段**: Host, Port, User, Password, DB Name, Alias。
    *   **操作**: 测试连接 (调用 `testConnection`), 连接 (调用 `connectDatabase`), 保存配置。
*   **已保存列表**:
    *   展示已保存的连接配置。
    *   状态指示灯: ACTIVE (绿色), IDLE (灰色), ERROR (红色)。
    *   点击列表项可快速填入左侧表单或直接连接。

### 2.3 视图 C: 数据粘贴板 (Paste Board)
**目标组件**: `frontend/src/new/features/datasource/DataPasteCard.jsx`
**对应 Demo**: `#view-paste`

*   **功能细节**:
    *   **大文本区域**: 用于粘贴 CSV/JSON 文本，等宽字体 (`font-mono`)。
    *   **格式设置**:
        *   表别名输入。
        *   格式选择 (CSV/JSON/Auto)。
        *   分隔符选择 (逗号/Tab/分号)。
    *   **智能解析**: 点击按钮调用解析 API，成功后导入 DuckDB。

---

## 3. 技术栈使用规范 (Tech Stack Guidelines)

### 3.1 Token 系统 (CSS Variables)
**新 UI 与旧 UI 的 Token 必须彻底解耦。**

*   旧入口 (`ShadcnApp` + `modern.css`) 继续使用 `frontend/src/styles/tokens.css` 中的变量；
*   新入口 (`DuckQueryApp` + 数据源重构页面) **只使用** `frontend/src/styles/tailwind.css` 中 `.dq-new-theme` / `.dark .dq-new-theme` 作用域下定义的 `--dq-*` 变量；
*   新 UI 不再依赖 `tokens.css` 中的任何语义 Token（颜色 / 圆角 / 阴影等），色表和字体完全由 `.dq-new-theme` 提供；
*   未迁移的旧组件仍可按原有方式消费 `tokens.css`。

在新布局中，所有颜色都必须来自 `.dq-new-theme` 作用域下的 Token，**严禁使用硬编码颜色** (如 `bg-white`, `text-black`)。

*   **背景**: `bg-[var(--dq-background)]` (页面), `bg-[var(--dq-surface)]` (卡片/侧边栏)。
*   **文本**: `text-[var(--dq-text-primary)]` (主标题), `text-[var(--dq-text-secondary)]` (次要信息)。
*   **边框**: `border-[var(--dq-border)]`。
*   **主色**: `bg-[var(--dq-primary)]`, `text-[var(--dq-primary-fg)]`。

### 3.2 Tailwind CSS
*   使用 `cn()` 工具函数合并类名。
*   利用 Tailwind 的 `group` 和 `peer` 修饰符处理复杂交互状态。
*   **暗黑模式**: 依赖 CSS 变量自动切换，**不需要**写 `dark:bg-xxx` (因为 Token 已经在 `:root` 和 `.dark` 中定义好了)。

### 3.3 Shadcn UI (适配版)
*   不要直接复制 Shadcn 的默认组件代码，而是要修改其内部样式以使用我们的 `--dq-*` 变量。
*   例如 `Button` 组件，应修改为使用 `var(--dq-primary)` 而不是 Shadcn 默认的 `hsl(var(--primary))`。

---

## 4. 目录结构规范 (Directory Structure)

### 4.1 推荐结构
为确保代码可维护性和团队协作效率，`frontend/src/new` 必须按以下结构组织：

```text
frontend/src/new/
├── styles/                    # 样式系统（新 UI 专用）
│   └── tailwind.css          # `.dq-new-theme` 下的设计 Token（颜色、圆角、阴影等）
│
├── common/                    # 通用基础组件（原子级）
│   ├── Button.jsx            # 按钮组件
│   ├── Card.jsx              # 卡片容器
│   ├── Input.jsx             # 输入框
│   └── Badge.jsx             # 状态标签
│
├── layout/                    # 布局组件
│   ├── PageShell.jsx         # 页面外壳（Sidebar + Main）
│   ├── Sidebar.jsx           # 全局侧边栏
│   └── Header.jsx            # 页面顶部导航
│
├── pages/                     # 页面级组件（路由入口）
│   ├── DataSourcePage.jsx   # 数据源管理页
│   └── UnifiedQueryPage.jsx # 统一查询页
│
└── features/                  # 业务功能模块（按领域划分）
    ├── datasource/           # 数据源相关
    │   ├── UploadPanel.jsx
    │   ├── DatabaseForm.jsx
    │   ├── DataPasteCard.jsx
    │   ├── ConnectionList.jsx
    │   └── DataSourceTabs.jsx
    └── query/                # 查询相关（未来扩展）
```

### 4.2 命名规范
*   **文件夹**: 小写 + 连字符 (`datasource`, `common`)
*   **组件文件**: PascalCase (`DatabaseForm.jsx`)
*   **样式文件**: 小写 + 连字符 (`tokens.css`)

### 4.3 Import 路径规范
使用相对路径或配置别名 `@/new`：
```javascript
// 推荐：使用别名
import Sidebar from '@/new/layout/Sidebar';
import { Button } from '@/new/common/Button';

// 或相对路径
import Sidebar from '../layout/Sidebar';
```

---

## 5. 国际化规范 (i18n Integration)

### 5.1 核心原则
**所有用户可见文本必须支持中英切换**，严禁硬编码文本。

### 5.2 使用方式
每个组件必须引入 `useTranslation` Hook：

```jsx
import { useTranslation } from 'react-i18next';

const DataSourcePage = () => {
  const { t } = useTranslation('common');
  
  return (
    <div>
      <h1>{t('page.datasource.title')}</h1>
      <p>{t('page.datasource.intro')}</p>
    </div>
  );
};
```

### 5.3 翻译 Key 组织规范
按模块层级组织，格式：`模块.子模块.具体项`

**示例**（`locales/zh/common.json` 和 `locales/en/common.json`）：
```json
{
  "page": {
    "datasource": {
      "title": "数据源管理",
      "tabUpload": "文件上传",
      "tabDb": "数据库管理",
      "tabPaste": "数据粘贴板",
      "upload": {
        "title": "智能文件上传",
        "dragHint": "拖拽或点击上传",
        "maxSize": "最大 500MB · 自动识别分隔符",
        "btnUpload": "开始上传",
        "btnClear": "清空表单"
      },
      "database": {
        "hostLabel": "主机地址",
        "portLabel": "端口",
        "btnTest": "测试连接",
        "btnConnect": "连接数据库"
      },
      "paste": {
        "title": "数据粘贴板",
        "placeholder": "在此粘贴 CSV 或 JSON 数据..."
      }
    }
  }
}
```

### 5.4 语言切换逻辑
在 `Sidebar.jsx` 中已实现语言切换按钮，确保调用正确：

```jsx
const Sidebar = ({ locale, onLocaleChange, ... }) => {
  const { i18n } = useTranslation();
  
  const handleLocaleToggle = () => {
    const newLocale = locale === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(newLocale);
    onLocaleChange?.(newLocale);
  };

  return (
    <button onClick={handleLocaleToggle}>
      <Languages className="h-4 w-4" />
      <span>{locale.toUpperCase()}</span>
    </button>
  );
};
```

### 5.5 翻译文件补充清单
开发新组件时，必须同步更新以下文件：
*   `frontend/src/locales/zh/common.json` (中文)
*   `frontend/src/locales/en/common.json` (英文)

---

## 6. 迁移流程与规则 (Migration Rules)

1.  **零侵入原则**:
    *   **严禁修改** `src/components/` 下的任何旧文件。
    *   **严禁修改** `src/styles/modern.css`。
    *   新代码全部在 `frontend/src/new/` 目录下进行。
2.  **逻辑复用方式**:
    *   从旧组件中提取逻辑为 Hook (例如 `useDataUpload.js`)。
    *   在新组件中引入该 Hook。
    *   如果无法提取，允许复制代码逻辑，但必须清理掉旧的 UI 依赖 (如 MUI)。
3.  **入口切换**:
    *   在 `DuckQueryApp.jsx` 中，通过路由或状态控制渲染 `new/DataSourcePage`。
    *   确保 `Sidebar` 的 "Legacy" 按钮能正确切回旧版界面。

## 7. 验收标准 (Acceptance Criteria)

1.  **视觉一致性**: 打开 `datasource_preview.html` 和新开发的页面，两者在视觉上应**完全重合**。
2.  **Logo 行为**: 切换黑白主题时，Logo 图片变化逻辑正确。
3.  **全屏布局**: 页面应占满浏览器窗口，无多余 Padding。
4.  **功能完备**: 文件上传、数据库连接、粘贴板导入均能正常工作。
5.  **国际化**: 所有文本支持中英切换，无硬编码文本。

---
**注意**: 本文档仅规范"数据源管理"模块的重构。其他模块 (如统一查询) 将在后续文档中定义。
