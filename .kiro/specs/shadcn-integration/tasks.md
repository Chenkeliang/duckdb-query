# shadcn/ui 集成任务清单

## 阶段 1：基础设施搭建（1 天）

- [ ] 1. 安装依赖包
  - 安装 `class-variance-authority clsx tailwind-merge`
  - 安装 `@radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-dropdown-menu`
  - 安装 `tailwindcss-animate`
  - _Requirements: 1.1_

- [ ] 2. 创建工具函数
  - 创建 `frontend/src/lib/utils.js`
  - 实现 `cn()` 函数（使用 clsx + tailwind-merge）
  - _Requirements: 1.4_

- [ ] 3. 配置 shadcn/ui
  - 创建 `frontend/components.json`
  - 配置 style, rsc, tsx, tailwind 路径
  - 配置 aliases (`@/components`, `@/lib/utils`)
  - _Requirements: 1.2_

- [ ] 4. 配置路径别名
  - 修改 `vite.config.js` 添加 `@` 别名指向 `src/`
  - 测试路径别名是否正常工作
  - _Requirements: 1.4_

- [ ] 5. 更新 Tailwind 配置
  - 修改 `tailwind.config.js` 添加 shadcn/ui 颜色系统
  - 添加 `tailwindcss-animate` 插件
  - 配置 `darkMode: ["class"]`
  - _Requirements: 9.1_

- [ ] 6. 更新 CSS 变量
  - 修改 `frontend/src/styles/tailwind.css`
  - 添加 shadcn/ui 标准 CSS 变量（`:root` 和 `.dark`）
  - 保持与现有 `--dq-*` 变量的兼容性
  - _Requirements: 9.1, 11.3_

## 阶段 2：创建 shadcn/ui 基础组件（2 天）

- [ ] 7. 创建 Button 组件
  - 创建 `frontend/src/components/ui/button.jsx`
  - 使用 `cva` 定义变体（default, destructive, outline, secondary, ghost, link）
  - 使用 `cva` 定义尺寸（default, sm, lg, icon）
  - 支持 `asChild` 模式（使用 @radix-ui/react-slot）
  - 支持 disabled 状态
  - _Requirements: 2.1_

- [ ] 8. 创建 Card 组件
  - 创建 `frontend/src/components/ui/card.jsx`
  - 实现 Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
  - 使用统一的圆角（rounded-xl）和阴影（shadow-sm）
  - _Requirements: 2.2_

- [ ] 9. 创建 Input 组件
  - 创建 `frontend/src/components/ui/input.jsx`
  - 实现 Input 组件（支持 type, disabled, error 状态）
  - 实现 Label 组件（支持 htmlFor 关联）
  - 实现 Textarea 组件（支持 resize）
  - _Requirements: 2.3, 2.4_

- [ ] 10. 创建 Tabs 组件
  - 创建 `frontend/src/components/ui/tabs.jsx`
  - 基于 `@radix-ui/react-tabs` 实现
  - 实现 Tabs, TabsList, TabsTrigger, TabsContent
  - 支持受控和非受控模式
  - 支持键盘导航（Arrow Keys）
  - _Requirements: 2.5_

- [ ] 11. 创建 Dialog 组件
  - 创建 `frontend/src/components/ui/dialog.jsx`
  - 基于 `@radix-ui/react-dialog` 实现
  - 实现 Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
  - 支持 ESC 关闭
  - 支持焦点管理
  - 使用正确的 z-index（z-modal-backdrop, z-modal）
  - _Requirements: 2.6_

- [ ] 12. 创建 Select 组件
  - 创建 `frontend/src/components/ui/select.jsx`
  - 基于 `@radix-ui/react-select` 实现
  - 实现 Select, SelectTrigger, SelectValue, SelectContent, SelectItem
  - 支持搜索（可选）
  - _Requirements: 2.7_

- [ ] 13. 创建 Progress 组件
  - 创建 `frontend/src/components/ui/progress.jsx`
  - 基于 `@radix-ui/react-progress` 实现（或使用简单的 div）
  - 支持百分比显示
  - _Requirements: 2.8_

- [ ] 14. 创建 DropdownMenu 组件（可选）
  - 创建 `frontend/src/components/ui/dropdown-menu.jsx`
  - 基于 `@radix-ui/react-dropdown-menu` 实现
  - 用于 Sidebar 的更多操作菜单
  - _Requirements: 2.8_

## 阶段 3：迁移 Layout 组件（1 天）

- [ ] 15. 迁移 Sidebar 组件
  - 修改 `frontend/src/new/Layout/Sidebar.jsx`
  - 导航按钮使用 `<Button variant={active ? "default" : "ghost"}>`
  - 底部操作按钮使用 `<Button variant="outline" size="sm">`
  - 移除手写的 Tailwind 类名，使用 Button 组件
  - 保持所有现有功能（导航、主题切换、语言切换）
  - _Requirements: 3.1-3.5_

- [ ] 16. 迁移 Header 组件
  - 修改 `frontend/src/new/Layout/Header.jsx`
  - 如果有按钮，使用 `<Button>` 组件
  - 保持现有布局和功能
  - _Requirements: 3.1_

- [ ] 17. 测试 Layout 组件
  - 测试 Sidebar 导航功能
  - 测试主题切换功能
  - 测试语言切换功能
  - 测试响应式布局
  - _Requirements: 12.1_

## 阶段 4：迁移 DataSource 组件（2 天）

- [ ] 18. 迁移 DatabaseForm 组件
  - 修改 `frontend/src/new/DataSource/DatabaseForm.jsx`
  - 使用 `<Card>` 包裹整个表单
  - 使用 `<Tabs>` 切换数据库类型（MySQL, PostgreSQL, SQLite）
  - 使用 `<Label>` 和 `<Input>` 替换所有输入框
  - 使用 `<Select>` 替换下拉选择（如果有）
  - 使用 `<Button>` 替换所有按钮
  - 保持所有现有功能（测试连接、保存连接、服务器浏览）
  - _Requirements: 4.1-4.7_

- [ ] 19. 迁移 UploadPanel 组件
  - 修改 `frontend/src/new/DataSource/UploadPanel.jsx`
  - 使用 `<Card>` 包裹上传面板
  - 使用 `<Button>` 替换上传按钮
  - 使用 `<Progress>` 显示上传进度
  - 保持拖拽上传功能
  - _Requirements: 5.1-5.5_

- [ ] 20. 迁移 DataPasteCard 组件
  - 修改 `frontend/src/new/DataSource/DataPasteCard.jsx`
  - 使用 `<Card>` 包裹粘贴卡片
  - 使用 `<Textarea>` 替换文本输入区域
  - 使用 `<Select>` 选择分隔符
  - 使用 `<Button>` 替换解析按钮
  - _Requirements: 6.1-6.5_

- [ ] 21. 迁移 SavedConnectionsList 组件
  - 修改 `frontend/src/new/DataSource/SavedConnectionsList.jsx`
  - 使用 `<Card>` 包裹连接列表
  - 使用 `<Button variant="ghost">` 作为连接项
  - 使用 `<Dialog>` 实现删除确认对话框
  - 保持所有管理功能（选择、删除、编辑）
  - _Requirements: 7.1-7.4_

- [ ] 22. 迁移 DataSourceTabs 组件
  - 修改 `frontend/src/new/DataSource/DataSourceTabs.jsx`
  - 使用 `<Tabs>` 组件替换自定义标签页
  - 保持标签页切换功能
  - _Requirements: 8.1-8.3_

- [ ] 23. 迁移 DataSourcePage 组件
  - 修改 `frontend/src/new/DataSource/DataSourcePage.jsx`
  - 使用 `<Card>` 包裹页面内容（如果需要）
  - 确保所有子组件正确集成
  - _Requirements: 12.1_

## 阶段 5：样式和主题优化（0.5 天）

- [ ] 24. 统一颜色系统
  - 检查所有组件，确保使用语义化类名（bg-surface, text-foreground）
  - 移除所有 CSS 变量直接使用（var(--dq-*)）
  - 移除所有硬编码颜色值
  - _Requirements: 9.1, 9.2_

- [ ] 25. 统一圆角系统
  - 检查所有组件，确保使用统一圆角（rounded-md, rounded-lg, rounded-xl）
  - _Requirements: 9.3_

- [ ] 26. 统一阴影系统
  - 检查所有组件，确保使用统一阴影（shadow-sm, shadow-lg, shadow-2xl）
  - _Requirements: 9.4_

- [ ] 27. 统一间距系统
  - 检查所有组件，确保使用统一间距（space-y-4, gap-3, p-6）
  - _Requirements: 9.5_

- [ ] 28. 测试深色模式
  - 切换到深色模式，检查所有组件显示
  - 确保所有颜色正确切换
  - 确保对比度符合 WCAG 标准
  - _Requirements: 11.1-11.4_

## 阶段 6：可访问性优化（0.5 天）

- [ ] 29. 键盘导航测试
  - 测试 Tab 键导航顺序
  - 测试 Enter/Space 键触发按钮
  - 测试 Esc 键关闭 Dialog
  - 测试 Arrow Keys 导航 Tabs
  - _Requirements: 10.1-10.3_

- [ ] 30. 屏幕阅读器测试
  - 使用屏幕阅读器测试所有组件
  - 确保所有元素有正确的 aria-label
  - 确保表单错误正确关联到输入框
  - _Requirements: 10.4-10.5_

- [ ] 31. 焦点管理测试
  - 测试 Dialog 打开时焦点移动
  - 测试 Dialog 关闭时焦点返回
  - 测试 focus-visible 样式显示
  - _Requirements: 10.1-10.5_

## 阶段 7：测试和文档（1 天）

- [ ] 32. 单元测试
  - 为 Button 组件编写单元测试
  - 为 Card 组件编写单元测试
  - 为 Input 组件编写单元测试
  - 为 Tabs 组件编写单元测试
  - _Requirements: 测试要求_

- [ ] 33. 集成测试
  - 为 DatabaseForm 编写集成测试
  - 为 UploadPanel 编写集成测试
  - 为 SavedConnectionsList 编写集成测试
  - _Requirements: 测试要求_

- [ ] 34. 可访问性测试
  - 使用 jest-axe 测试所有组件
  - 确保无可访问性违规
  - _Requirements: 10.1-10.5_

- [ ] 35. 性能测试
  - 测试组件渲染时间
  - 测试交互响应时间
  - 测试包体积增加
  - _Requirements: 4.1_

- [ ] 36. 编写组件文档
  - 为每个 shadcn/ui 组件编写 JSDoc 注释
  - 创建使用示例
  - 创建 Storybook stories（可选）
  - _Requirements: 4.2_

- [ ] 37. 更新 README
  - 更新项目 README，说明 shadcn/ui 使用
  - 添加组件使用指南
  - 添加开发指南
  - _Requirements: 4.2_

## 阶段 8：最终验收（0.5 天）

- [ ] 38. 功能完整性检查
  - 检查所有 9 个组件已迁移
  - 检查所有现有功能正常工作
  - 检查所有交互正常响应
  - _Requirements: 5.1_

- [ ] 39. 设计一致性检查
  - 检查所有组件使用统一设计系统
  - 检查深色/浅色模式正常切换
  - 检查视觉效果与设计稿一致
  - _Requirements: 5.2_

- [ ] 40. 可访问性检查
  - 检查键盘导航正常工作
  - 检查屏幕阅读器正常工作
  - 检查 WCAG 2.1 AA 标准通过
  - _Requirements: 5.3_

- [ ] 41. 代码质量检查
  - 运行 ESLint，确保无错误
  - 运行 TypeScript 检查（如果使用）
  - 代码审查
  - _Requirements: 5.4_

- [ ] 42. 最终测试
  - 在开发环境测试所有功能
  - 在生产构建测试所有功能
  - 在不同浏览器测试（Chrome, Firefox, Safari, Edge）
  - _Requirements: 3.3_

## 总结

**预计时间**：7 天

**关键里程碑**：
- Day 1: 基础设施搭建完成
- Day 3: 所有 shadcn/ui 组件创建完成
- Day 4: Layout 组件迁移完成
- Day 6: DataSource 组件迁移完成
- Day 7: 测试和文档完成

**成功标准**：
- ✅ 所有组件使用真正的 shadcn/ui
- ✅ 所有功能保持不变
- ✅ 可访问性测试通过
- ✅ 性能符合要求
- ✅ 代码质量检查通过
