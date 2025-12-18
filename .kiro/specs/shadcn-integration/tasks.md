# shadcn/ui 集成任务清单

## 阶段 1：基础设施搭建（1 天）

### Day 1: TypeScript 配置（地基）🔴

- [x] 1.1. 配置 TypeScript（渐进式）
  - 安装 `typescript @types/react @types/react-dom @types/node`
  - 创建 `tsconfig.json` 配置文件
  - 配置 `allowJs: true` 支持 JS/TS 混用
  - 配置 `strict: true` 启用严格模式
  - 配置 Vite 支持 TypeScript
  - 配置路径别名 `@/new/*` 的类型支持
  - _Requirements: 0.1-0.5_

### Day 2: shadcn/ui 基础设施

- [x] 1. 安装 shadcn/ui 依赖包
  - 安装 `class-variance-authority clsx tailwind-merge`
  - 安装 `@radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-dropdown-menu`
  - 安装 `tailwindcss-animate`
  - 安装 `react-resizable-panels` (用于可调整大小的面板布局)
  - _Requirements: 1.1_

- [x] 2. 创建工具函数（TypeScript 版本）
  - 创建 `frontend/src/lib/utils.ts`（注意是 .ts）
  - 实现 `cn()` 函数（使用 clsx + tailwind-merge）
  - 添加 TypeScript 类型定义
  - _Requirements: 1.4_

- [x] 3. 配置 shadcn/ui
  - 创建 `frontend/components.json`
  - 配置 style, rsc, tsx, tailwind 路径
  - 配置 aliases (`@/components`, `@/lib/utils`)
  - _Requirements: 1.2_

- [x] 4. 配置路径别名
  - 修改 `vite.config.js` 添加 `@` 别名指向 `src/`
  - 测试路径别名是否正常工作
  - _Requirements: 1.4_

- [x] 5. 更新 Tailwind 配置
  - 修改 `tailwind.config.js` 添加 shadcn/ui 颜色系统
  - 添加 `tailwindcss-animate` 插件
  - 配置 `darkMode: ["class"]`
  - _Requirements: 9.1_

- [x] 6. 更新 CSS 变量
  - 修改 `frontend/src/styles/tailwind.css`
  - 添加 shadcn/ui 标准 CSS 变量（`:root` 和 `.dark`）
  - 保持与现有 `--dq-*` 变量的兼容性
  - _Requirements: 9.1, 11.3_

### Day 3: TanStack Query 配置（数据层）🔴

- [x] 1.2. 安装和配置 TanStack Query
  - 安装 `@tanstack/react-query @tanstack/react-query-devtools`
  - 创建 `frontend/src/new/providers/QueryProvider.tsx`
  - 配置 QueryClient（staleTime, cacheTime, retry 等）
  - 添加 React Query DevTools（开发环境）
  - 在新布局的根组件中集成 QueryProvider
  - _Requirements: 1.5.1-1.5.5_

## 阶段 2：创建 shadcn/ui 基础组件（2 天）

### Day 4-5: 创建基础组件（TSX 格式）

- [x] 7. 创建 Button 组件（TypeScript 版本）
  - 创建 `frontend/src/new/components/ui/button.tsx`（注意是 .tsx）
  - 添加完整的 TypeScript 类型定义（ButtonProps 接口）
  - 使用 `cva` 定义变体（default, destructive, outline, secondary, ghost, link）
  - 使用 `cva` 定义尺寸（default, sm, lg, icon）
  - 支持 `asChild` 模式（使用 @radix-ui/react-slot）
  - 支持 disabled 状态
  - _Requirements: 2.1_

- [x] 8. 创建 Card 组件（TypeScript 版本）
  - 创建 `frontend/src/new/components/ui/card.tsx`（注意是 .tsx）
  - 添加完整的 TypeScript 类型定义
  - 创建 `frontend/src/new/components/ui/card.jsx`
  - 实现 Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
  - 使用统一的圆角（rounded-xl）和阴影（shadow-sm）
  - _Requirements: 2.2_

- [x] 9. 创建 Input 组件
  - 创建 `frontend/src/new/components/ui/input.jsx`
  - 实现 Input 组件（支持 type, disabled, error 状态）
  - 实现 Label 组件（支持 htmlFor 关联）
  - 实现 Textarea 组件（支持 resize）
  - _Requirements: 2.3, 2.4_

- [x] 10. 创建 Tabs 组件
  - 创建 `frontend/src/new/components/ui/tabs.jsx`
  - 基于 `@radix-ui/react-tabs` 实现
  - 实现 Tabs, TabsList, TabsTrigger, TabsContent
  - 支持受控和非受控模式
  - 支持键盘导航（Arrow Keys）
  - _Requirements: 2.5_

- [x] 11. 创建 Dialog 组件
  - 创建 `frontend/src/new/components/ui/dialog.jsx`
  - 基于 `@radix-ui/react-dialog` 实现
  - 实现 Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
  - 支持 ESC 关闭
  - 支持焦点管理
  - 使用正确的 z-index（z-modal-backdrop, z-modal）
  - _Requirements: 2.6_

- [x] 12. 创建 Select 组件
  - 创建 `frontend/src/new/components/ui/select.jsx`
  - 基于 `@radix-ui/react-select` 实现
  - 实现 Select, SelectTrigger, SelectValue, SelectContent, SelectItem
  - 支持搜索（可选）
  - _Requirements: 2.7_

- [x] 13. 创建 Progress 组件
  - 创建 `frontend/src/new/components/ui/progress.jsx`
  - 基于 `@radix-ui/react-progress` 实现（或使用简单的 div）
  - 支持百分比显示
  - _Requirements: 2.8_

- [x] 14. 创建 Form 组件（shadcn 官方封装）
  - 创建 `frontend/src/new/components/ui/form.jsx`
  - 基于 `react-hook-form` 封装
  - 实现 Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage
  - 自动处理错误显示和可访问性
  - _Requirements: 2.1_

- [x] 15. 创建 Badge 组件
  - 创建 `frontend/src/new/components/ui/badge.jsx`
  - 支持变体（default, success, warning, error, outline）
  - 用于显示状态标签
  - _Requirements: 2.8_

- [x] 16. 创建 Tooltip 组件
  - 创建 `frontend/src/new/components/ui/tooltip.jsx`
  - 基于 `@radix-ui/react-tooltip` 实现
  - 实现 Tooltip, TooltipTrigger, TooltipContent, TooltipProvider
  - _Requirements: 2.8_

- [x] 17. 创建 Skeleton 组件
  - 创建 `frontend/src/new/components/ui/skeleton.jsx`
  - 实现脉冲动画效果
  - 用于加载占位
  - _Requirements: 2.8_

- [x] 18. 创建 Popover 组件
  - 创建 `frontend/src/new/components/ui/popover.jsx`
  - 基于 `@radix-ui/react-popover` 实现
  - 实现 Popover, PopoverTrigger, PopoverContent
  - _Requirements: 2.8_

- [x] 19. 创建 Separator 组件
  - 创建 `frontend/src/new/components/ui/separator.jsx`
  - 支持水平和垂直方向
  - _Requirements: 2.8_

- [x] 20. 创建 DropdownMenu 组件（可选）
  - 创建 `frontend/src/new/components/ui/dropdown-menu.jsx`
  - 基于 `@radix-ui/react-dropdown-menu` 实现
  - 用于 Sidebar 的更多操作菜单
  - _Requirements: 2.8_

## 阶段 3：迁移 Layout 组件（1 天）

- [x] 21. 迁移 Sidebar 组件
  - 修改 `frontend/src/new/Layout/Sidebar.jsx`
  - 导入：`import { Button } from '@/new/components/ui/button'`
  - 导入：`import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'`
  - 使用 `react-resizable-panels` 实现可折叠的 Sidebar 布局
  - 导航按钮使用 `<Button variant={active ? "default" : "ghost"}>`
  - 底部操作按钮使用 `<Button variant="outline" size="sm">`
  - 移除手写的 Tailwind 类名，使用 Button 组件
  - 保持所有现有功能（导航、主题切换、语言切换）
  - _Requirements: 3.1-3.5_

- [x] 22. 迁移 Header 组件
  - 修改 `frontend/src/new/Layout/Header.jsx`
  - 导入：`import { Button } from '@/new/components/ui/button'`
  - 如果有按钮，使用 `<Button>` 组件
  - 保持现有布局和功能
  - _Requirements: 3.1_

- [x] 23. 测试 Layout 组件
  - 测试 Sidebar 导航功能
  - 测试主题切换功能
  - 测试语言切换功能
  - 测试响应式布局
  - _Requirements: 12.1_

## 阶段 4：迁移 DataSource 组件（2 天）

- [x] 24. 迁移 DatabaseForm 组件
  - 修改 `frontend/src/new/DataSource/DatabaseForm.jsx`
  - 导入：`import { Form, FormField, ... } from '@/new/components/ui/form'`
  - 导入：`import { Card, CardHeader, ... } from '@/new/components/ui/card'`
  - 使用 `<Form>` 和 `<FormField>` 封装表单（react-hook-form）
  - 使用 `<Card>` 包裹整个表单
  - 使用 `<Tabs>` 切换数据库类型（MySQL, PostgreSQL, SQLite）
  - 使用 `<Button>` 替换所有按钮
  - 保持所有现有功能（测试连接、保存连接、服务器浏览）
  - _Requirements: 4.1-4.7_

- [x] 25. 迁移 UploadPanel 组件
  - 修改 `frontend/src/new/DataSource/UploadPanel.jsx`
  - 导入：`import { Card } from '@/new/components/ui/card'`
  - 导入：`import { Button } from '@/new/components/ui/button'`
  - 导入：`import { Progress } from '@/new/components/ui/progress'`
  - 使用 `<Card>` 包裹上传面板
  - 使用 `<Button>` 替换上传按钮
  - 使用 `<Progress>` 显示上传进度
  - 保持拖拽上传功能
  - _Requirements: 5.1-5.5_

- [x] 26. 迁移 DataPasteCard 组件
  - 修改 `frontend/src/new/DataSource/DataPasteCard.jsx`
  - 导入：`import { Card } from '@/new/components/ui/card'`
  - 导入：`import { Textarea } from '@/new/components/ui/input'`
  - 导入：`import { Select } from '@/new/components/ui/select'`
  - 使用 `<Card>` 包裹粘贴卡片
  - 使用 `<Textarea>` 替换文本输入区域
  - 使用 `<Select>` 选择分隔符
  - 使用 `<Button>` 替换解析按钮
  - _Requirements: 6.1-6.5_

- [x] 27. 迁移 SavedConnectionsList 组件
  - 修改 `frontend/src/new/DataSource/SavedConnectionsList.jsx`
  - 导入：`import { Card } from '@/new/components/ui/card'`
  - 导入：`import { Button } from '@/new/components/ui/button'`
  - 导入：`import { Dialog } from '@/new/components/ui/dialog'`
  - 导入：`import { Badge } from '@/new/components/ui/badge'`
  - 使用 `<Card>` 包裹连接列表
  - 使用 `<Button variant="ghost">` 作为连接项
  - 使用 `<Dialog>` 实现删除确认对话框
  - 使用 `<Badge>` 显示连接状态（已连接、断开）
  - 保持所有管理功能（选择、删除、编辑）
  - _Requirements: 7.1-7.4_

- [x] 28. 迁移 DataSourceTabs 组件
  - 修改 `frontend/src/new/DataSource/DataSourceTabs.jsx`
  - 导入：`import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/new/components/ui/tabs'`
  - 使用 `<Tabs>` 组件替换自定义标签页
  - 保持标签页切换功能
  - _Requirements: 8.1-8.3_

- [x] 29. 迁移 DataSourcePage 组件
  - 修改 `frontend/src/new/DataSource/DataSourcePage.jsx`
  - 导入：`import { Card } from '@/new/components/ui/card'`
  - 导入：`import { Skeleton } from '@/new/components/ui/skeleton'`
  - 使用 `<Card>` 包裹页面内容（如果需要）
  - 使用 `<Skeleton>` 显示加载状态
  - 确保所有子组件正确集成
  - _Requirements: 12.1_

## 阶段 5：样式和主题优化（0.5 天）

- [x] 24. 统一颜色系统
  - 检查所有组件，确保使用语义化类名（bg-surface, text-foreground）
  - 移除所有 CSS 变量直接使用（var(--dq-*)）
  - 移除所有硬编码颜色值
  - _Requirements: 9.1, 9.2_

- [x] 25. 统一圆角系统
  - 检查所有组件，确保使用统一圆角（rounded-md, rounded-lg, rounded-xl）
  - _Requirements: 9.3_

- [x] 26. 统一阴影系统
  - 检查所有组件，确保使用统一阴影（shadow-sm, shadow-lg, shadow-2xl）
  - _Requirements: 9.4_

- [x] 27. 统一间距系统
  - 检查所有组件，确保使用统一间距（space-y-4, gap-3, p-6）
  - _Requirements: 9.5_

- [x] 28. 测试深色模式
  - 切换到深色模式，检查所有组件显示
  - 确保所有颜色正确切换
  - 确保对比度符合 WCAG 标准
  - _Requirements: 11.1-11.4_

## 阶段 6：可访问性优化（0.5 天）

- [x] 29. 键盘导航测试
  - 测试 Tab 键导航顺序
  - 测试 Enter/Space 键触发按钮
  - 测试 Esc 键关闭 Dialog
  - 测试 Arrow Keys 导航 Tabs
  - _Requirements: 10.1-10.3_

- [x] 30. 屏幕阅读器测试
  - 使用屏幕阅读器测试所有组件
  - 确保所有元素有正确的 aria-label
  - 确保表单错误正确关联到输入框
  - _Requirements: 10.4-10.5_

- [x] 31. 焦点管理测试
  - 测试 Dialog 打开时焦点移动
  - 测试 Dialog 关闭时焦点返回
  - 测试 focus-visible 样式显示
  - _Requirements: 10.1-10.5_

## 阶段 7：测试和文档（1 天）

- [x] 32. 单元测试
  - 为 Button 组件编写单元测试
  - 为 Card 组件编写单元测试
  - 为 Input 组件编写单元测试
  - 为 Tabs 组件编写单元测试
  - _Requirements: 测试要求_

- [x] 33. 集成测试
  - 为 DatabaseForm 编写集成测试
  - 为 UploadPanel 编写集成测试
  - 为 SavedConnectionsList 编写集成测试
  - _Requirements: 测试要求_

- [x] 34. 可访问性测试
  - 使用 jest-axe 测试所有组件
  - 确保无可访问性违规
  - _Requirements: 10.1-10.5_

- [x] 35. 性能测试
  - 测试组件渲染时间
  - 测试交互响应时间
  - 测试包体积增加
  - _Requirements: 4.1_

- [x] 36. 编写组件文档
  - 为每个 shadcn/ui 组件编写 JSDoc 注释
  - 创建使用示例
  - 创建 Storybook stories（可选）
  - _Requirements: 4.2_

- [x] 37. 更新 README
  - 更新项目 README，说明 shadcn/ui 使用
  - 添加组件使用指南
  - 添加开发指南
  - _Requirements: 4.2_

## 阶段 8：最终验收（0.5 天）

- [x] 38. 功能完整性检查
  - 检查所有 9 个组件已迁移
  - 检查所有现有功能正常工作
  - 检查所有交互正常响应
  - _Requirements: 5.1_

- [x] 39. 设计一致性检查
  - 检查所有组件使用统一设计系统
  - 检查深色/浅色模式正常切换
  - 检查视觉效果与设计稿一致
  - _Requirements: 5.2_

- [x] 40. 可访问性检查
  - 检查键盘导航正常工作
  - 检查屏幕阅读器正常工作
  - 检查 WCAG 2.1 AA 标准通过
  - _Requirements: 5.3_

- [x] 41. 代码质量检查
  - 运行 ESLint，确保无错误
  - 运行 TypeScript 检查（如果使用）
  - 代码审查
  - _Requirements: 5.4_

- [x] 42. 最终测试
  - 在开发环境测试所有功能
  - 在生产构建测试所有功能
  - 在不同浏览器测试（Chrome, Firefox, Safari, Edge）
  - _Requirements: 3.3_

## 阶段 9：CMDK 命令面板集成（0.5 天）⏰ Week 6

**注意**：此阶段在 Week 6 执行，等待 demo-to-new-migration 完成后。

- [x] 43. 安装和配置 CMDK
  - 安装 `cmdk` 包
  - 创建 `frontend/src/new/components/ui/command.tsx` (shadcn/ui command 组件)
  - 基于 `cmdk` 实现 Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator
  - _Requirements: 13.1, 13.2_

- [x] 44. 创建 CommandPalette 组件
  - 创建 `frontend/src/new/CommandPalette.tsx`
  - 添加 TypeScript 类型定义
  - 使用 Dialog 组件包裹 Command 组件
  - 实现基础命令结构
  - _Requirements: 13.2_

- [x] 45. 实现快捷键监听
  - 创建 `frontend/src/new/hooks/useCommandPalette.ts`
  - 监听 Cmd+K / Ctrl+K 快捷键
  - 管理命令面板打开/关闭状态
  - _Requirements: 13.3_

- [x] 46. 实现表搜索命令
  - 从 TanStack Query 缓存获取表列表
  - 实现表名搜索过滤
  - 点击表名导航到查询页面
  - _Requirements: 13.4_

- [x] 47. 实现快捷操作命令
  - 实现切换主题命令
  - 实现切换语言命令
  - 实现快速切换连接命令
  - _Requirements: 13.5_

- [x] 48. 集成到 PageShell
  - 在 `PageShell.tsx` 中集成 CommandPalette
  - 确保命令面板在所有页面可用
  - 测试快捷键触发
  - _Requirements: 13.2_

- [x] 49. 测试命令面板
  - 测试 Cmd+K / Ctrl+K 打开命令面板
  - 测试搜索功能
  - 测试命令执行
  - 测试键盘导航（方向键、Enter、Esc）
  - _Requirements: 13.6, 13.7, 13.8_

## 总结

**预计时间**：7.5 天（Week 1-2）+ 0.5 天（Week 6 CMDK）

**关键里程碑**：
- Day 1: 基础设施搭建完成（包含 TypeScript + TanStack Query）
- Day 3: 所有 shadcn/ui 组件创建完成（TSX 格式）
- Day 4: Layout 组件迁移完成（TSX + Query）
- Day 6: DataSource 组件迁移完成（TSX + Query）
- Day 7: 测试和文档完成
- Week 6: CMDK 命令面板集成完成

**成功标准**：
- ✅ 所有组件使用真正的 shadcn/ui
- ✅ 所有组件使用 TypeScript（.tsx）
- ✅ 所有数据获取使用 TanStack Query
- ✅ CMDK 命令面板正常工作
- ✅ 所有功能保持不变
- ✅ 可访问性测试通过
- ✅ 性能符合要求
- ✅ 代码质量检查通过
