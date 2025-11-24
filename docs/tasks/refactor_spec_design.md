# Duck Query UI/UX 重构设计规范 (Refactoring Spec & Design)

## 1. 项目目标 (Goals)
将 Duck Query 从当前的“Demo级”界面升级为“生产级”数据分析平台。
-   **视觉升级**：采用现代化的侧边栏布局 (Sidebar Layout)，提升专业感。
-   **架构解耦**：拆分 `ShadcnApp.jsx`，引入清晰的布局层。
-   **零回归**：确保现有功能（数据导入、SQL查询）和基础样式（颜色、字体）完全不乱。

## 2. 核心设计原则 (Design Principles)
-   **容器隔离 (Container Isolation)**：新布局作为容器，不侵入现有业务组件内部。
-   **样式复用 (Style Reuse)**：严格使用 `modern.css` 中定义的 CSS 变量（如 `--dq-background`, `--dq-accent-primary`），禁止硬编码颜色。
-   **渐进式迁移 (Progressive Migration)**：先通过布局组件包裹现有逻辑，后续再逐步拆分路由。
-   **主题规范化 (Theming Discipline)**：暗/亮模式和未来主题只通过 CSS 变量切换，不再引入任何硬编码颜色或一次性覆盖。

## 3. 视觉设计规范 (Visual Design System)

### 3.1 布局结构 (Layout Structure)
采用经典的 **Dashboard Layout**：
-   **Sidebar (左侧)**: 宽度固定 (e.g., 240px)，包含 Logo 和一级导航。
-   **Header (顶部)**: 高度固定 (e.g., 64px)，包含全局搜索、主题切换、用户头像。
-   **Main Content (右侧)**: 占据剩余空间，内部滚动。

```mermaid
graph TD
    Root[App Root] --> Layout[MainLayout]
    Layout --> Sidebar[Sidebar (Left, Fixed)]
    Layout --> Main[Main Area (Right, Flex)]
    Main --> Header[Header (Top, Fixed)]
    Main --> Content[Content ScrollArea]
    Content --> Page[Current Page Component]
```

### 3.2 关键样式变量 (Key CSS Variables)
开发时**必须**使用以下变量，确保与现有主题兼容：

| 属性 | 变量名 | 说明 |
| :--- | :--- | :--- |
| **背景色** | `var(--dq-background)` | 页面主背景 |
| **侧边栏背景** | `var(--dq-surface-alt)` | 侧边栏、次级背景 |
| **边框颜色** | `var(--dq-border-subtle)` | 分割线、边框 |
| **主色调** | `var(--dq-accent-primary)` | 激活状态、按钮 |
| **主文本** | `var(--dq-text-primary)` | 标题、正文 |
### 3.3 图标与品牌 (Iconography & Branding)
**细节决定成败**。新布局必须严格遵循以下资源规范：

#### 图标系统 (Icons)
-   **库选择**: 统一使用 `lucide-react` (项目已安装)。
-   **风格**: 线性风格 (Stroke-based)，与 Sidebar 的现代感保持一致。
-   **映射关系**:
    -   **Visual Query**: `LayoutDashboard`
    -   **SQL Editor**: `Terminal` (或 `Database`)
    -   **Data Sources**: `HardDrive` (或 `Files`)
    -   **Task Center**: `ListTodo` (或 `Activity`)
-   **禁止混用**: 在 Sidebar/Header 区域**严禁**使用 `@mui/icons-material`。

#### 品牌标识 (Logo)
-   **资源路径**: 必须使用 `frontend/src/assets/` 下的现有资源。
-   **主题适配**:
    -   Light Mode: 使用 `Duckquerylogo.svg`
    -   Dark Mode: 使用 `duckquery-dark.svg`
-   **实现逻辑**: Sidebar 必须接收 `isDarkMode` 属性，并动态切换 `img src`。禁止使用 CSS `filter: invert()` 这种廉价的变通方案。

### 4.1 `components/Layout/MainLayout.jsx`
**职责**：整个应用的骨架。
**Props**:
-   `children`: 当前页面内容。
-   `sidebar`: 侧边栏组件实例。
-   `header`: 顶部栏组件实例。
**实现细节**:
-   使用 Flex 布局：`display: flex; height: 100vh; overflow: hidden;`
-   背景色设置为 `var(--dq-background)`。

### 4.2 `components/Layout/Sidebar.jsx`
**职责**：导航菜单。
**Props**:
-   `currentTab`: 当前选中的 Tab ID。
-   `onTabChange`: 切换 Tab 的回调函数。
**样式细节**:
-   宽度: `250px`
-   背景: `var(--dq-surface-alt)` (深色模式下会有区分度)
-   边框: 右侧 `1px solid var(--dq-border-subtle)`
-   **菜单项 (MenuItem)**:
    -   高度: `40px`
    -   圆角: `var(--dq-radius-card)` (或 8px)
    -   Hover: `background-color: var(--dq-surface-hover)`
    -   Active: `background-color: var(--dq-surface-active); color: var(--dq-accent-primary);`

### 4.3 `components/Layout/Header.jsx`
**职责**：顶部工具栏。
**内容**:
-   左侧：面包屑 (Breadcrumbs) 或当前页面标题。
-   右侧：GitHub Star, Theme Toggle (复用现有逻辑).
**样式细节**:
-   高度: `60px`
-   背景: `var(--dq-background)` (与内容区融合) 或 `var(--dq-surface)`
-   边框: 底部 `1px solid var(--dq-border-subtle)`



为了确保**样式不乱**且**功能状态不丢失**，我们将采用“逻辑视图分离” + “平行入口”的策略。

### 阶段一：逻辑提取 (Logic Extraction)
**目标**：将 `ShadcnApp.jsx` 中的业务逻辑与 UI 渲染彻底分离。
1.  **创建 Hook**: `frontend/src/hooks/useDuckQuery.js`
    -   将 `useState` (dataSources, queryResults, etc.) 移入。
    -   将 `useEffect` (initial load, theme sync) 移入。
    -   将 `handleResultsReceived` 等回调函数移入。
    -   **输出**: 返回一个对象 `{ state, actions }`，包含所有 UI 需要的数据和方法。
2.  **验证**: 修改原有的 `ShadcnApp.jsx`，让它调用 `useDuckQuery`，确保现有功能 100% 正常。

### 阶段二：平行开发 (Parallel Development)
**目标**：在不破坏现有应用的前提下开发新布局。
1.  **创建新入口**: `frontend/src/DuckQueryApp.jsx`
    -   这是未来的主入口，命名修正为 `DuckQueryApp`。
    -   引入 `useDuckQuery` 获取数据。
    -   引入 `MainLayout`, `Sidebar`, `Header` 组装 UI。
    -   将 `UnifiedQueryInterface` 等业务组件放入内容区，通过 Props 传递 State。
2.  **路由/Tab 处理**:
    -   **一级导航 (Sidebar)**: 对应 `currentTab` 状态 (Visual Query, SQL Editor, Data Sources)。
    -   **二级导航 (In-Page)**: `UnifiedQueryInterface` 内部的 Tabs 保持不变，由组件内部管理。
    -   **UI 技术栈**: 新入口的骨架层使用 Tailwind + shadcn 组合实现，组件样式依然消费 `modern.css` 的 `--dq-*` 变量（通过 Tailwind 主题映射），避免新增自定义 CSS；业务组件保持不变。

### 阶段三：切换与清理 (Switch & Cleanup)
1.  **切换入口**: 修改 `frontend/src/main.jsx`，将渲染组件从 `ShadcnApp` 改为 `DuckQueryApp`。
2.  **灰度测试**: 在本地和测试环境验证 V2 版本。
3.  **清理**: 确认 V2 稳定后，删除 `ShadcnApp.jsx`。

## 5. 技术栈迁移与项目约束 (Tailwind + shadcn 兼容 modern.css)
-   **现代骨架隔离**：旧骨架与 `modern.css` 不改动；新入口 `DuckQueryApp` 使用 Tailwind/shadcn 构建布局骨架（MainLayout/Sidebar/Header），仅在容器层包裹现有业务组件。
-   **主题映射**：在 Tailwind 主题配置中将颜色/圆角/阴影映射到 `--dq-*` 变量，通过 `data-theme="light|dark"` 或类名切换，沿用现有主题切换逻辑；未来新增主题只需要新增同名变量集，无需改组件。
-   **样式约束**：禁止新增零散自定义 CSS；如需局部样式，用 Tailwind 原子类或 shadcn tokens，并保持 `dq-layout-*` 前缀的自定义类名仅作用于新布局容器。
-   **样式源分离**：主题变量抽到 `frontend/src/styles/tokens.css` 作为唯一来源；新入口仅引入 `tokens.css + tailwind.css`；旧入口继续使用 `modern.css`（内部复用同一批 `--dq-*` 变量），避免 legacy 样式污染新布局。
-   **图标一致**：新骨架中的导航/按钮仅使用 `lucide-react`，与旧区域保持资源统一。
-   **国际化**：新入口引入 i18n Provider（复用或新增），Sidebar/Header 文案用文案 key（例如 `nav.visualQuery`），默认语言回退保持现有显示；业务组件逐步接入，不影响旧入口。
-   **状态共享**：`useDuckQuery` 作为唯一状态来源，供旧入口和新入口共用，避免功能差异。

## 6. 风险控制 (Risk Control)
-   **样式冲突**: 新布局组件使用 `dq-layout-*` 前缀，不与 `modern.css` 全局样式冲突。
-   **状态丢失**: 通过 `useDuckQuery` 统一管理状态，确保 V1 和 V2 共享同一套状态逻辑，切换视图不会导致数据逻辑改变。
-   **组件黑盒**: 严禁修改 `UnifiedQueryInterface` 等复杂业务组件的内部代码，只通过 Props 传递数据。
-   **主题一致性**: 确认 Tailwind/shadcn 的 `data-theme` 与现有主题切换一致；补齐残留硬编码颜色（分页/悬浮态等）到 `--dq-*`，避免暗/亮模式分叉。
-   **滚动/溢出**: Sidebar/Header 固定，内容区滚动；校验表格/编辑器内部滚动不被父容器裁剪。
-   **响应式**: 为新骨架定义断点（最小宽度、Sidebar 折叠）以避免小屏冲突。
-   **图标统一**: 新骨架替换任何 MUI 图标为 `lucide-react`，并校验暗色模式线条对比度。
-   **控件态**: 按钮/输入的 hover/active/disabled 态均映射 `--dq-*`，清理内联硬编码颜色。
-   **i18n 兜底**: Header/Sidebar 文案使用翻译 key，设置默认回退，避免缺失 key 出现空白。
-   **品牌资源**: Logo 按 `isDarkMode` 切换，禁止使用 `invert()` 等变通方案。
