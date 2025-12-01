# shadcn/ui 集成需求文档

## 一、项目概述

### 1.1 背景
当前 `frontend/src/new/` 目录下的组件虽然使用了 Tailwind CSS，但并未真正使用 shadcn/ui 组件库。组件都是手写的 Tailwind 类名，缺乏统一的设计系统和可访问性支持。

### 1.2 目标
将 `frontend/src/new/` 目录下的所有组件迁移到真正的 shadcn/ui + Tailwind CSS 实现，确保：
- ✅ 使用官方 shadcn/ui 组件
- ✅ 基于 Radix UI 的可访问性
- ✅ 统一的设计系统
- ✅ 保持现有功能不变

### 1.3 范围
**需要迁移的组件**：
- `new/Layout/Sidebar.jsx`
- `new/Layout/Header.jsx`
- `new/Layout/PageShell.jsx`
- `new/DataSource/DatabaseForm.jsx`
- `new/DataSource/UploadPanel.jsx`
- `new/DataSource/DataPasteCard.jsx`
- `new/DataSource/SavedConnectionsList.jsx`
- `new/DataSource/DataSourcePage.jsx`
- `new/DataSource/DataSourceTabs.jsx`

**不在范围内**：
- `components/` 目录（旧布局，保持不变）
- `ShadcnApp.jsx`（旧入口，保持不变）

## 二、需求列表

### 需求 1：安装和配置 shadcn/ui

**用户故事**：作为开发者，我需要正确安装和配置 shadcn/ui，以便在项目中使用官方组件。

**验收标准**：
1. WHEN 安装 shadcn/ui 依赖 THEN 项目应包含所有必需的包
2. WHEN 创建 `components.json` 配置文件 THEN 配置应指向正确的路径
3. WHEN 创建 `lib/utils.js` THEN 应包含 `cn()` 工具函数
4. WHEN 配置路径别名 THEN `@/` 应正确解析到 `src/`

### 需求 2：创建 shadcn/ui 基础组件

**用户故事**：作为开发者，我需要创建基于 Radix UI 的 shadcn/ui 组件，以便在新布局中使用。

**验收标准**：
1. WHEN 创建 Button 组件 THEN 应支持多种变体（default, outline, ghost, destructive）
2. WHEN 创建 Card 组件 THEN 应包含 Card, CardHeader, CardTitle, CardContent, CardFooter
3. WHEN 创建 Input 组件 THEN 应支持 focus 状态和 disabled 状态
4. WHEN 创建 Label 组件 THEN 应与 Input 正确关联
5. WHEN 创建 Tabs 组件 THEN 应基于 @radix-ui/react-tabs
6. WHEN 创建 Dialog 组件 THEN 应基于 @radix-ui/react-dialog
7. WHEN 创建 Select 组件 THEN 应基于 @radix-ui/react-select
8. WHEN 创建 Textarea 组件 THEN 应支持自动调整高度

### 需求 3：迁移 Sidebar 组件

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的 Sidebar，以便获得更好的交互体验。

**验收标准**：
1. WHEN 渲染 Sidebar THEN 应使用 shadcn/ui Button 组件
2. WHEN 点击导航项 THEN 应正确切换激活状态
3. WHEN 切换主题 THEN 应使用 Button 组件的 icon 变体
4. WHEN 切换语言 THEN 应使用 Button 组件显示当前语言
5. WHEN 悬停按钮 THEN 应显示正确的 hover 效果

### 需求 4：迁移 DatabaseForm 组件

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的数据库表单，以便更好地输入连接信息。

**验收标准**：
1. WHEN 渲染表单 THEN 应使用 Card 组件包裹
2. WHEN 切换数据库类型 THEN 应使用 Tabs 组件
3. WHEN 输入字段 THEN 应使用 Input 和 Label 组件
4. WHEN 点击测试连接 THEN 应使用 Button 组件的 outline 变体
5. WHEN 点击保存 THEN 应使用 Button 组件的 default 变体
6. WHEN 表单验证失败 THEN 应显示错误提示
7. WHEN 选择 SQLite 文件 THEN 应使用 Select 组件

### 需求 5：迁移 UploadPanel 组件

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的上传面板，以便上传文件。

**验收标准**：
1. WHEN 渲染上传面板 THEN 应使用 Card 组件
2. WHEN 拖拽文件 THEN 应显示拖拽区域高亮
3. WHEN 点击上传按钮 THEN 应使用 Button 组件
4. WHEN 上传进度 THEN 应显示进度条
5. WHEN 上传成功 THEN 应显示成功提示

### 需求 6：迁移 DataPasteCard 组件

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的粘贴卡片，以便粘贴数据。

**验收标准**：
1. WHEN 渲染粘贴卡片 THEN 应使用 Card 组件
2. WHEN 输入数据 THEN 应使用 Textarea 组件
3. WHEN 选择分隔符 THEN 应使用 Select 组件
4. WHEN 点击解析 THEN 应使用 Button 组件
5. WHEN 解析成功 THEN 应显示预览表格

### 需求 7：迁移 SavedConnectionsList 组件

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的已保存连接列表，以便管理连接。

**验收标准**：
1. WHEN 渲染连接列表 THEN 应使用 Card 组件
2. WHEN 点击连接项 THEN 应使用 Button 组件的 ghost 变体
3. WHEN 删除连接 THEN 应显示 Dialog 确认对话框
4. WHEN 编辑连接 THEN 应加载到表单中

### 需求 8：迁移 DataSourceTabs 组件

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的数据源标签页，以便切换不同的数据源类型。

**验收标准**：
1. WHEN 渲染标签页 THEN 应使用 Tabs 组件
2. WHEN 切换标签 THEN 应正确显示对应内容
3. WHEN 标签激活 THEN 应显示激活状态样式

### 需求 9：保持设计系统一致性

**用户故事**：作为开发者，我需要确保所有组件使用统一的设计系统，以便保持视觉一致性。

**验收标准**：
1. WHEN 使用颜色 THEN 应使用 Tailwind 语义化类名（bg-surface, text-foreground）
2. WHEN 使用圆角 THEN 应使用统一的圆角值（rounded-md, rounded-lg, rounded-xl）
3. WHEN 使用阴影 THEN 应使用统一的阴影值（shadow-sm, shadow-lg）
4. WHEN 使用间距 THEN 应使用统一的间距值（space-y-4, gap-3, p-6）
5. WHEN 使用字体 THEN 应使用统一的字体大小（text-sm, text-base, text-lg）

### 需求 10：确保可访问性

**用户故事**：作为用户，我需要使用键盘和屏幕阅读器访问所有功能，以便无障碍使用。

**验收标准**：
1. WHEN 使用 Tab 键 THEN 应正确聚焦到可交互元素
2. WHEN 使用 Enter/Space 键 THEN 应触发按钮点击
3. WHEN 使用 Esc 键 THEN 应关闭 Dialog
4. WHEN 使用屏幕阅读器 THEN 应正确朗读元素标签
5. WHEN 表单验证失败 THEN 应正确关联错误信息到输入框

### 需求 11：保持深色模式支持

**用户故事**：作为用户，我需要在深色模式下正常使用所有功能，以便在不同环境下使用。

**验收标准**：
1. WHEN 切换到深色模式 THEN 所有组件应正确显示深色主题
2. WHEN 切换到浅色模式 THEN 所有组件应正确显示浅色主题
3. WHEN 使用 CSS 变量 THEN 应正确映射到 Tailwind 类名
4. WHEN 组件渲染 THEN 应自动适配当前主题

### 需求 12：保持现有功能不变

**用户故事**：作为用户，我需要迁移后的组件保持所有现有功能，以便无缝使用。

**验收标准**：
1. WHEN 使用 Sidebar THEN 所有导航功能应正常工作
2. WHEN 使用 DatabaseForm THEN 所有连接功能应正常工作
3. WHEN 使用 UploadPanel THEN 所有上传功能应正常工作
4. WHEN 使用 DataPasteCard THEN 所有粘贴功能应正常工作
5. WHEN 使用 SavedConnectionsList THEN 所有管理功能应正常工作

## 三、技术约束

### 3.1 必须使用的技术
- shadcn/ui 官方组件
- @radix-ui/* 作为底层实现
- Tailwind CSS 语义化类名
- class-variance-authority (cva) 用于变体管理
- clsx + tailwind-merge 用于类名合并

### 3.2 禁止使用的技术
- ❌ 手写 Radix UI 组件（必须使用 shadcn/ui）
- ❌ 直接使用 CSS 变量（如 `var(--dq-surface)`）
- ❌ 硬编码颜色值（如 `#fff`, `rgb(255,255,255)`）
- ❌ MUI 组件（仅在旧布局中使用）

### 3.3 兼容性要求
- 支持 React 19.2.0
- 支持 Vite 7.2.2
- 支持现代浏览器（Chrome, Firefox, Safari, Edge）

## 四、非功能性需求

### 4.1 性能要求
- 组件首次渲染时间 < 100ms
- 交互响应时间 < 50ms
- 包体积增加 < 50KB（gzip）

### 4.2 可维护性要求
- 所有组件使用 TypeScript JSDoc 注释
- 所有组件有清晰的 Props 定义
- 所有组件有使用示例

### 4.3 测试要求
- 所有组件有单元测试
- 关键交互有集成测试
- 可访问性测试通过

## 五、验收标准总结

### 5.1 功能完整性
- [ ] 所有 9 个组件已迁移到 shadcn/ui
- [ ] 所有现有功能正常工作
- [ ] 所有交互正常响应

### 5.2 设计一致性
- [ ] 所有组件使用统一的设计系统
- [ ] 深色/浅色模式正常切换
- [ ] 视觉效果与设计稿一致

### 5.3 可访问性
- [ ] 键盘导航正常工作
- [ ] 屏幕阅读器正常工作
- [ ] WCAG 2.1 AA 标准通过

### 5.4 代码质量
- [ ] 无 ESLint 错误
- [ ] 无 TypeScript 类型错误
- [ ] 代码审查通过

## 六、术语表

- **shadcn/ui**: 基于 Radix UI 和 Tailwind CSS 的组件库
- **Radix UI**: 无样式的可访问性组件库
- **Tailwind CSS**: 实用优先的 CSS 框架
- **cva**: class-variance-authority，用于管理组件变体
- **cn()**: 类名合并工具函数
- **语义化类名**: 使用含义明确的类名（如 `bg-surface` 而非 `bg-gray-100`）
