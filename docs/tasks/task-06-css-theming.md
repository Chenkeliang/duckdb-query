# Task 06 · 全局暗色样式整顿与组件级皮肤化

## 1. Spec

- 背景  
  - `frontend/src/styles/modern.css` 中大量选择器使用 `.dark .MuiBox-root`, `.dark .MuiCard-root` 等全局匹配并带 `!important`，导致多处组件（特别是新增指标卡、Sheet 选择弹窗）无法自定义样式。  
  - 某些样式通过 `[style*="color:#000"]` 等 attribute selector 强行覆盖，易误伤第三方组件。  
  - 当前暗色模式体验依赖这些强覆盖，缺少体系化 token，后续扩展功能风险大。

- 目标  
  1. 梳理全局 CSS，缩小强制性覆盖范围，引入局部 class 名称管理；保证核心 UI 在暗色模式下表现一致。  
  2. 为常用组件（Card、Chip、Tooltip、Dialog、表格）定义可复用的主题变量或 CSS 变量，避免散落的 `!important`。  
  3. 为关键模块（数据指标卡、Sheet 选择器、任务列表）提供局部 class，并验证不会被全局样式破坏。  
  4. 保持 `ShadcnApp` 切换暗色模式时的整体观感。

- 非目标  
  - 不替换 MUI 主题系统，仅在现有基础上整理 CSS。  
  - 不实现完整的双主题定制器。

- 成功标准  
  - 移除或改写 80% 以上基于粗粒度选择器的 `!important` 规则，保留仅对暗色必要的 token。  
  - 新增组件（指标卡/Sheet 选择）在暗色下表现正常，无颜色丢失。  
  - Lint 或手动检查中，无大范围 `[style*="..."]` 形式的强匹配。

## 2. Design

- 样式策略  
  - 引入 `frontend/src/styles/tokens.css` 定义暗色模式变量（如 `--dq-surface`, `--dq-text-primary`），`modern.css` 主要用于变量声明。  
  - 全局元素覆盖改为使用 `.dark .dq-surface` 自定义类，而非 `.dark .MuiBox-root`。  
  - 常用组件封装：在 `frontend/src/styles/components/` 下创建 `card.css`, `chip.css`, `tooltip.css`，通过类名 `dq-card`, `dq-chip` 等绑定。React 组件中添加 `className="dq-card"` 以获得统一样式。

- 具体步骤  
  1. 拆分 `modern.css`：  
     - 保留变量定义、CodeMirror 样式、ag-grid 定制。  
     - 将 `.dark .Mui*` 大部分样式移动到新建的 `components/*.css`，并移除 `!important`，改用更高优先级的类名。  
  2. 为敏感组件添加类名：  
     - `ModernDataDisplay` 外层卡片 → `className="dq-card dq-card--panel"`。  
     - 指标卡组件（Task 03）→ `className="dq-metric-card"`.  
     - Excel Sheet 选择弹窗 → `className="dq-dialog"`。  
  3. 使用 CSS 模块或 `styled` offset：适当引入 `clsx` 控制 class。  
  4. 若 MUI 主题允许，在 `theme` 定制中覆盖暗色 palette，减少手写 CSS。

- 回归验证  
  - 手动检查主导航、数据表格、弹窗、表单在暗色模式下的表现。  
  - 检查 `modern.css` 中是否仍存在广泛的 `[style*="..."]` 选择器，必要时改为 JS 逻辑（如在组件中直接设置 class）。  
  - 建议添加视觉回归截图或文档。

- 风险  
  - 调整过多样式可能短期破坏现有页面，需要分阶段处理并配合 QA 预览。  
  - 若组件忘记加新 class，可能在暗色模式下退回默认外观；需要文档说明并进行代码搜索保障。
