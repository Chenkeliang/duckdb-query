# shadcn/ui 集成需求文档

## 一、项目概述

### 1.1 背景
当前 `frontend/src/new/` 目录下的组件虽然使用了 Tailwind CSS，但并未真正使用 shadcn/ui 组件库。组件都是手写的 Tailwind 类名，缺乏统一的设计系统和可访问性支持。

### 1.2 目标
将 `frontend/src/new/` 目录下的所有组件迁移到真正的 shadcn/ui + Tailwind CSS 实现，并配置完整的现代化技术栈，确保：
- ✅ 使用官方 shadcn/ui 组件
- ✅ 基于 Radix UI 的可访问性
- ✅ 统一的设计系统
- ✅ **配置 TypeScript 支持（渐进式迁移）**
- ✅ **配置 TanStack Query 数据管理**
- ✅ **集成 CMDK 命令面板**
- ✅ 保持现有功能不变

**核心原则**：先打地基，再建房子 - 在创建任何组件前，先配置好所有基础设施，避免后续返工。

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

### 需求 0：配置 TypeScript（地基）

**用户故事**：作为开发者，我需要在项目开始前配置 TypeScript，以便后续所有组件都能享受类型安全。

**验收标准**：
1. WHEN 安装 TypeScript 依赖 THEN 项目应包含 `typescript`, `@types/react`, `@types/react-dom`, `@types/node`
2. WHEN 创建 `tsconfig.json` THEN 应配置 `allowJs: true` 支持渐进式迁移
3. WHEN 配置 Vite THEN 应支持 `.tsx` 和 `.ts` 文件
4. WHEN 配置路径别名 THEN `@/new/*` 应有完整的类型支持
5. WHEN 创建新组件 THEN 应直接使用 `.tsx` 扩展名

**优先级**：🔴 **最高优先级 - Day 1 必须完成**

### 需求 1：安装和配置 shadcn/ui

**用户故事**：作为开发者，我需要正确安装和配置 shadcn/ui，以便在项目中使用官方组件。

**验收标准**：
1. WHEN 安装 shadcn/ui 依赖 THEN 项目应包含所有必需的包
2. WHEN 创建 `components.json` 配置文件 THEN 配置应指向正确的路径
3. WHEN 创建 `lib/utils.ts` THEN 应包含 `cn()` 工具函数（TypeScript 版本）
4. WHEN 配置路径别名 THEN `@/` 应正确解析到 `src/`

**优先级**：🔴 **最高优先级 - Day 2 必须完成**

### 需求 1.5：配置 TanStack Query（数据层）

**用户故事**：作为开发者，我需要在创建组件前配置 TanStack Query，以便后续所有组件都能使用统一的数据管理模式。

**验收标准**：
1. WHEN 安装 TanStack Query THEN 项目应包含 `@tanstack/react-query` 和 `@tanstack/react-query-devtools`
2. WHEN 创建 `QueryProvider.tsx` THEN 应正确配置 QueryClient
3. WHEN 集成到根组件 THEN 所有子组件应能使用 `useQuery` 和 `useMutation`
4. WHEN 开发环境 THEN 应显示 React Query DevTools
5. WHEN 创建新组件 THEN 应直接使用 `useQuery/useMutation` 而非 `useState + useEffect`

**优先级**：🔴 **最高优先级 - Day 3 必须完成**

### 需求 2：创建 shadcn/ui 基础组件（TypeScript 版本）

**用户故事**：作为开发者，我需要创建基于 Radix UI 的 shadcn/ui 组件（TypeScript 版本），以便在新布局中使用。

**验收标准**：
1. WHEN 创建 Button 组件 THEN 应支持多种变体（default, outline, ghost, destructive）并有完整的 TypeScript 类型
2. WHEN 创建 Card 组件 THEN 应包含 Card, CardHeader, CardTitle, CardContent, CardFooter 并有类型定义
3. WHEN 创建 Input 组件 THEN 应支持 focus 状态和 disabled 状态，并继承 HTML input 类型
4. WHEN 创建 Label 组件 THEN 应与 Input 正确关联，并有类型安全的 htmlFor
5. WHEN 创建 Tabs 组件 THEN 应基于 @radix-ui/react-tabs 并有完整的类型
6. WHEN 创建 Dialog 组件 THEN 应基于 @radix-ui/react-dialog 并有完整的类型
7. WHEN 创建 Select 组件 THEN 应基于 @radix-ui/react-select 并有完整的类型
8. WHEN 创建 Textarea 组件 THEN 应支持自动调整高度并继承 HTML textarea 类型
9. WHEN 所有组件创建完成 THEN 应使用 `.tsx` 扩展名，不需要后续转换

**优先级**：🔴 **高优先级 - Day 4-5 完成**

### 需求 3：迁移 Sidebar 组件（TypeScript + Query）

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的 Sidebar，以便获得更好的交互体验。

**验收标准**：
1. WHEN 重命名组件 THEN 应从 `Sidebar.jsx` 改为 `Sidebar.tsx`
2. WHEN 添加类型定义 THEN 应有完整的 Props 接口定义
3. WHEN 渲染 Sidebar THEN 应使用 shadcn/ui Button 组件
4. WHEN 获取数据 THEN 应使用 `useQuery` 而非 `useState + useEffect`
5. WHEN 点击导航项 THEN 应正确切换激活状态
6. WHEN 切换主题 THEN 应使用 Button 组件的 icon 变体
7. WHEN 切换语言 THEN 应使用 Button 组件显示当前语言
8. WHEN 悬停按钮 THEN 应显示正确的 hover 效果

**优先级**：🟡 **中优先级 - Week 2 完成**

### 需求 4：迁移 DatabaseForm 组件（TypeScript + Mutation）

**用户故事**：作为用户，我需要使用 shadcn/ui 重构的数据库表单，以便更好地输入连接信息。

**验收标准**：
1. WHEN 重命名组件 THEN 应从 `DatabaseForm.jsx` 改为 `DatabaseForm.tsx`
2. WHEN 添加类型定义 THEN 应有完整的表单数据接口定义
3. WHEN 渲染表单 THEN 应使用 Card 组件包裹
4. WHEN 切换数据库类型 THEN 应使用 Tabs 组件
5. WHEN 输入字段 THEN 应使用 Input 和 Label 组件
6. WHEN 点击测试连接 THEN 应使用 `useMutation` 而非手动状态管理
7. WHEN 点击保存 THEN 应使用 `useMutation` 提交数据
8. WHEN 表单验证失败 THEN 应显示错误提示
9. WHEN 选择 SQLite 文件 THEN 应使用 Select 组件
10. WHEN 提交成功 THEN 应自动 invalidate 相关 Query 缓存

**优先级**：🟡 **中优先级 - Week 2 完成**

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

### 需求 13：集成 CMDK 命令面板

**用户故事**：作为用户，我需要使用 Cmd+K / Ctrl+K 快速访问功能，以便提高操作效率。

**验收标准**：
1. WHEN 安装 CMDK THEN 项目应包含 `cmdk` 包
2. WHEN 创建 CommandPalette 组件 THEN 应使用 TypeScript 并基于 shadcn/ui command 组件
3. WHEN 按下 Cmd+K / Ctrl+K THEN 应打开命令面板
4. WHEN 搜索表 THEN 应从 TanStack Query 缓存中获取数据
5. WHEN 执行命令 THEN 应正确触发对应操作
6. WHEN 按下 Esc THEN 应关闭命令面板
7. WHEN 使用方向键 THEN 应正确导航命令列表
8. WHEN 按下 Enter THEN 应执行选中的命令

**优先级**：🟢 **低优先级 - Week 6 完成**

## 三、技术约束

### 3.1 必须使用的技术
- **TypeScript** - 所有新组件必须使用 `.tsx` 扩展名
- **TanStack Query** - 所有数据获取必须使用 `useQuery/useMutation`
- **shadcn/ui** - 官方组件
- **@radix-ui/*** - 作为底层实现
- **Tailwind CSS** - 语义化类名
- **class-variance-authority (cva)** - 用于变体管理
- **clsx + tailwind-merge** - 用于类名合并
- **cmdk** - 命令面板

### 3.2 禁止使用的技术
- ❌ 手写 Radix UI 组件（必须使用 shadcn/ui）
- ❌ 直接使用 CSS 变量（如 `var(--dq-surface)`）
- ❌ 硬编码颜色值（如 `#fff`, `rgb(255,255,255)`）
- ❌ MUI 组件（仅在旧布局中使用）
- ❌ `useState + useEffect` 模式（必须使用 TanStack Query）
- ❌ `.jsx` 扩展名（新组件必须使用 `.tsx`）

### 3.3 兼容性要求
- 支持 React 19.2.0
- 支持 Vite 7.2.2
- 支持 TypeScript 5.x
- 支持现代浏览器（Chrome, Firefox, Safari, Edge）

### 3.4 实施顺序约束（避免返工）
**必须按以下顺序执行**：
1. 🔴 **Day 1**: 配置 TypeScript
2. 🔴 **Day 2**: 配置 shadcn/ui
3. 🔴 **Day 3**: 配置 TanStack Query
4. 🔴 **Day 4-5**: 创建基础组件（TSX + Query）
5. 🟡 **Week 2**: 迁移现有组件（TSX + Query）
6. 🟢 **Week 6**: 集成 CMDK

**禁止跳过或调整顺序**，否则会导致大量返工。

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
- **TypeScript**: JavaScript 的超集，提供静态类型检查
- **TanStack Query**: 强大的异步状态管理库（原 React Query）
- **CMDK**: 命令面板组件库
- **cva**: class-variance-authority，用于管理组件变体
- **cn()**: 类名合并工具函数
- **语义化类名**: 使用含义明确的类名（如 `bg-surface` 而非 `bg-gray-100`）
- **useQuery**: TanStack Query 的数据获取 hook
- **useMutation**: TanStack Query 的数据修改 hook
- **渐进式迁移**: 允许 JS 和 TS 文件共存的迁移策略（`allowJs: true`）
