# Task 2 UI · 视觉统一方案

## 1. Spec

- 背景
  - Query Builder 可视化分析模块已经形成统一的卡片视觉：圆角 16px、浅灰描边、亮蓝色强调元素、按钮圆角 18–20px，且在暗色模式下通过 `modern.css` 变量兼容。
  - Excel 多 Sheet 选择弹窗及数据源管理界面仍沿用默认 MUI 皮肤，缺少统一的圆角/配色/间距，导致 UI 风格割裂。
  - `modern.css` 当前仅提供暗色主题颜色变量，对浅色环境和通用组件没有可复用 token，无法安全地在页面级统一样式。

- 目标
  1. 提炼可视化分析内复用的视觉要素为设计 token，适配浅色/暗色双模式。
  2. 通过轻量封装将 token 应用到新的 UI（例如 Excel Sheet 弹窗），避免手写重复 `sx`。
  3. 保持现有页面结构和逻辑不变，不破坏其它模块布局。

- 非目标
  - 不重写或替换现有组件树结构；以样式和封装调整为主。
  - 不引入新 CSS 框架或大规模主题切换，仅在现有 MUI + `modern.css` 体系内演进。

- 成功标准
  - 视觉审查时，可视化分析与多 Sheet 弹窗在卡片/标题/按钮等元素上呈现一致的圆角、描边和强调色。
  - 暗色模式下视觉保持协调，无文字/边框对比度问题。
  - 其它现有页面未出现敲断、重排或显著样式回退。
  - 样式 token 可复用于后续新模块，减少手写 `sx`。

## 2. Design

- Token 提炼
  - 在 `modern.css` 中新增一组 CSS 变量，覆盖浅色/暗色：
    - `--dq-surface-card`, `--dq-surface-card-active`
    - `--dq-border-card`, `--dq-border-subtle`
    - `--dq-radius-card` (默认 16px)，`--dq-radius-cta` (默认 20px)
    - `--dq-accent-primary`；与现有 `--dq-accent-*` 兼容
  - 默认（浅色）值写在 `:root`，`dark` 环境继续覆盖。

- 封装组件
  - 在 `frontend/src/components/common` 新增：
    - `CardSurface`：返回 `Paper`/`Box`，统一应用卡片变量、阴影、间距。
    - `SectionHeader`：带蓝色圆点、主标题/副标题排版。
    - `RoundedButton`：MUI `Button` 封装，默认 `variant="contained"` + 圆角 20px。
    - `AccentToggle`、`RoundedTextField`（可选）封装常用输入控件。
  - 组件内部仅使用 MUI + token，避免写死颜色。

- MUI Theme 细化
  - 在顶层 `ThemeProvider` 添加局部 `components` override：
    - `MuiButton`: 默认 `disableElevation`, `borderRadius: var(--dq-radius-cta)`。
    - `MuiDialog`, `MuiDialogActions`、`MuiTextField`：设定 padding、圆角与边框颜色，引用 token。
  - override 作用范围限制在数据源管理/可视化区域，避免影响其它页面；可通过创建子主题并包裹对应模块实现。

- 适配流程
  - 先更新 Excel Sheet 弹窗：改用新封装组件和 theme overrides；确认视觉对齐。 
  - 随后逐步将数据源管理其它卡片、未来新增模块切换到封装组件。 
  - 可视化分析模块可在不影响功能的情况下逐步替换硬编码颜色为变量，确保 token 一致。

## 3. Tasks

1. **Token & modern.css 更新**
   - 在 `frontend/src/styles/modern.css` 添加浅色默认 `:root` 变量并同步 `.dark` 覆盖。
   - 确保变量命名规范，并为未使用的 legacy 颜色预留兼容处理。

2. **公共组件封装**
   - 新建 `frontend/src/components/common/` 目录及对应 `index.js` 导出。
   - 实现 `CardSurface`, `SectionHeader`, `RoundedButton`,（可选）`RoundedTextField`。
   - 为封装组件编写简易 Storybook 或 Jest snapshot（可选，若时间不足可手动验证）。

3. **主题 overrides**
   - 在 `DataUploadSection` 所在模块引入子主题或 `ThemeProvider`，扩展 `components` 配置。
   - 验证 overrides 不影响其它页面（需逐个功能点手动检查）。

4. **Excel 弹窗改造**
   - 将 `ExcelSheetSelector` 中的 `Accordion` 外层、按钮、输入替换为封装组件。
   - 使用 `SectionHeader` 统一标题区域；预览表格可沿用 MUI Table，仅调整头部颜色。
   - 手动比对可视化分析 UI，确保圆角、阴影、CTA 视觉一致。

5. **兼容性验证**
   - 测试浅色 / `.dark` 模式下的上传流程、可视化分析、其它数据源页面；
   - 排查是否存在 `!important` 冲突，需要时在局部 `sx` 中引用变量代替写死颜色。

6. **文档与后续**
   - 在 `docs/tasks/task-02-excel-multi-sheet.md` 或新的 UI 指南里记录 token、组件使用规范。
   - 提出后续迁移建议（例如逐步替换 QueryBuilder 内的 `sx` 为封装组件）。

