# Implementation Plan

- [x] 1. 安装和配置 Collapsible 组件
  - 安装 shadcn/ui Collapsible 组件
  - 验证组件文件生成
  - _Requirements: 1.1, 1.2, 1.3_

- [-] 2. 重构 TreeSection 组件
  - 导入 Collapsible 相关组件
  - 替换条件渲染为 Collapsible 组件
  - 实现图标旋转动画（ChevronRight 0° → 90°）
  - 保持 localStorage 持久化逻辑
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 2.1 编写 TreeSection 单元测试
  - 测试默认展开状态
  - 测试点击切换功能
  - 测试 localStorage 持久化
  - 测试状态恢复
  - 测试图标旋转动画
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 3. 实现 ResultPanel 折叠/展开功能
  - 在 QueryWorkspace 中添加 resultPanelRef
  - 添加 isResultPanelCollapsed 和 savedResultPanelSize 状态
  - 实现 toggleResultPanel 函数
  - 配置 ResizablePanel 的 collapsible、onCollapse、onExpand 属性
  - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [x] 4. 添加 ResultPanel 折叠/展开按钮
  - 在 ResizableHandle 上添加按钮
  - 根据状态切换图标（ChevronUp/ChevronDown）
  - 添加 aria-label 提升可访问性
  - 调整按钮位置和样式
  - _Requirements: 2.2, 2.4, 2.6_

- [ ] 4.1 编写 ResultPanel 单元测试
  - 测试折叠功能
  - 测试展开功能
  - 测试大小恢复
  - 测试按钮图标切换
  - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [-] 5. 重构 QueryTabs 组件样式
  - 创建 queryModes 配置数组
  - 导入 lucide-react 图标（Code, GitMerge, Layers, Table2, LayoutGrid）
  - 更新 TabsList 样式：移除 `rounded-none`、`p-0`，添加 `gap-1`、`p-1`、`rounded-lg`
  - 更新 TabsTrigger 样式：移除 `rounded-none`，添加 `gap-2`
  - 为每个标签添加图标
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [ ] 5.1 编写 QueryTabs 单元测试
  - 测试所有标签渲染
  - 测试图标渲染
  - 测试激活状态样式
  - 测试与 DataSourceTabs 样式一致性
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 6. 验证样式一致性
  - 对比 QueryTabs 与 DataSourceTabs 的视觉效果
  - 对比 QueryTabs 与 demo 的视觉效果
  - 验证深色模式下的样式
  - 验证悬停和激活状态
  - _Requirements: 3.5, 3.8_

- [ ] 7. 集成测试
  - 测试 TreeSection 折叠/展开交互
  - 测试 ResultPanel 折叠/展开交互
  - 测试 QueryTabs 切换交互
  - 测试布局状态持久化
  - _Requirements: 1.1-1.6, 2.1-2.6, 3.1-3.8_

- [x] 8. 最终验证和清理
  - 运行所有测试确保通过
  - 检查编译错误和警告
  - 验证可访问性（键盘导航、ARIA 属性）
  - 验证浏览器兼容性
  - 清理未使用的代码和注释
  - _Requirements: All_
