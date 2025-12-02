# shadcn/ui 集成验证指南

## 🎯 现在可以验证的功能

### 前提条件
```bash
# 1. 启动后端服务
cd api
python -m uvicorn main:app --reload

# 2. 启动前端服务（新终端）
cd frontend
npm run dev
```

---

## 📋 验证清单

### 1️⃣ 基础 UI 组件验证

#### 访问新布局入口
```
浏览器访问: http://localhost:5173/new
```

#### 可验证的组件：

**✅ Button 组件**
- 位置：Sidebar 导航按钮、所有操作按钮
- 验证点：
  - [ ] 悬停效果（hover）
  - [ ] 点击效果（active）
  - [ ] 禁用状态（disabled）
  - [ ] 不同变体（default, ghost, outline）
  - [ ] 不同尺寸（sm, default, lg）

**✅ Card 组件**
- 位置：DatabaseForm、UploadPanel、DataPasteCard、SavedConnectionsList
- 验证点：
  - [ ] 卡片阴影（shadow-sm）
  - [ ] 圆角（rounded-xl）
  - [ ] 边框（border-border）
  - [ ] 深色模式下的背景色

**✅ Input 组件**
- 位置：DatabaseForm 的所有输入框
- 验证点：
  - [ ] 输入框聚焦样式（focus ring）
  - [ ] 占位符文本
  - [ ] 禁用状态
  - [ ] 错误状态（如果有）

**✅ Tabs 组件**
- 位置：DatabaseForm（MySQL/PostgreSQL/SQLite 切换）、DataSourceTabs
- 验证点：
  - [ ] 标签页切换
  - [ ] 激活状态样式
  - [ ] 键盘导航（Arrow Keys）
  - [ ] 内容区域切换

**✅ Select 组件**
- 位置：DataPasteCard（分隔符选择）
- 验证点：
  - [ ] 下拉菜单打开/关闭
  - [ ] 选项选择
  - [ ] 键盘导航
  - [ ] 选中状态显示

**✅ Dialog 组件**
- 位置：SavedConnectionsList（删除确认对话框）
- 验证点：
  - [ ] 对话框打开动画
  - [ ] ESC 键关闭
  - [ ] 点击背景关闭
  - [ ] 焦点管理（打开时焦点移入，关闭时焦点返回）
  - [ ] z-index 层级正确

**✅ Badge 组件**
- 位置：SavedConnectionsList（连接类型标签）
- 验证点：
  - [ ] 不同变体（MySQL/PostgreSQL）
  - [ ] 颜色正确
  - [ ] 圆角和间距

**✅ Progress 组件**
- 位置：UploadPanel（文件上传进度）
- 验证点：
  - [ ] 进度条动画
  - [ ] 百分比显示
  - [ ] 完成状态

**✅ Skeleton 组件**
- 位置：DataSourcePage（加载状态）
- 验证点：
  - [ ] 脉冲动画
  - [ ] 占位符形状
  - [ ] 加载完成后消失

---

### 2️⃣ 命令面板验证（新功能！）

#### 打开命令面板
```
快捷键: Cmd+K (Mac) 或 Ctrl+K (Windows/Linux)
```

#### 可验证的功能：

**✅ 基础交互**
- [ ] 快捷键打开命令面板
- [ ] ESC 键关闭
- [ ] 点击背景关闭
- [ ] 搜索框自动聚焦

**✅ 导航命令**
- [ ] 搜索 "Data Source" 或 "数据源"
- [ ] 搜索 "Query" 或 "查询"
- [ ] 搜索 "Results" 或 "结果"
- [ ] 点击命令导航到对应页面

**✅ 数据操作命令**
- [ ] 搜索 "Upload" 或 "上传"
- [ ] 搜索 "Export" 或 "导出"
- [ ] 搜索 "Refresh" 或 "刷新"
- [ ] 点击命令执行对应操作

**✅ 表搜索功能**
- [ ] 如果有数据表，应该显示在 "Tables" 分组
- [ ] 搜索表名
- [ ] 显示行数
- [ ] 点击表名导航到查询页面

**✅ 系统命令**
- [ ] 搜索 "Settings" 或 "设置"
- [ ] 搜索 "Help" 或 "帮助"
- [ ] 快捷键提示显示正确

**✅ 键盘导航**
- [ ] ↑↓ 方向键选择命令
- [ ] Enter 键执行命令
- [ ] Tab 键在分组间切换

---

### 3️⃣ 迁移组件验证

#### DatabaseForm（数据库表单）
**路径**: 数据源页面 → 数据库连接标签

**验证点**：
- [ ] 标签页切换（MySQL/PostgreSQL/SQLite）
- [ ] 所有输入框使用 shadcn/ui Input
- [ ] 所有按钮使用 shadcn/ui Button
- [ ] 卡片容器使用 shadcn/ui Card
- [ ] 测试连接功能正常
- [ ] 保存连接功能正常
- [ ] 服务器浏览功能正常

#### UploadPanel（文件上传）
**路径**: 数据源页面 → 文件上传标签

**验证点**：
- [ ] 拖拽上传区域
- [ ] 点击上传按钮
- [ ] 进度条显示
- [ ] URL 拉取功能
- [ ] 服务器目录导入
- [ ] 所有按钮使用 shadcn/ui Button
- [ ] 卡片容器使用 shadcn/ui Card

#### DataPasteCard（数据粘贴）
**路径**: 数据源页面 → 粘贴数据标签

**验证点**：
- [ ] 文本输入区域
- [ ] 分隔符选择器（Select 组件）
- [ ] 格式选择器
- [ ] 解析按钮
- [ ] 预览区域
- [ ] 智能分隔符检测
- [ ] 类型检测

#### SavedConnectionsList（已保存连接）
**路径**: 数据源页面 → 已保存连接标签

**验证点**：
- [ ] 连接列表显示
- [ ] 连接类型徽章（Badge）
- [ ] 选择连接功能
- [ ] 删除连接对话框（Dialog）
- [ ] 编辑连接功能
- [ ] 悬停效果

#### Sidebar（侧边栏）
**路径**: 所有页面左侧

**验证点**：
- [ ] 导航按钮使用 shadcn/ui Button
- [ ] 激活状态样式（variant="default"）
- [ ] 非激活状态样式（variant="ghost"）
- [ ] 主题切换按钮
- [ ] 语言切换按钮
- [ ] Logo 显示
- [ ] 深色模式切换

---

### 4️⃣ 样式系统验证

#### 颜色系统
**验证点**：
- [ ] 所有组件使用语义化类名（bg-surface, text-foreground）
- [ ] 无硬编码颜色值
- [ ] 无直接使用 CSS 变量（var(--dq-*)）

#### 深色模式
**操作**: 点击 Sidebar 底部的主题切换按钮

**验证点**：
- [ ] 所有组件颜色正确切换
- [ ] 背景色切换（bg-background, bg-surface）
- [ ] 文本颜色切换（text-foreground, text-muted-foreground）
- [ ] 边框颜色切换（border-border）
- [ ] 对比度符合 WCAG 标准

#### 圆角系统
**验证点**：
- [ ] 按钮：rounded-md
- [ ] 输入框：rounded-md
- [ ] 卡片：rounded-xl
- [ ] 标签页：rounded-lg
- [ ] 对话框：rounded-xl

#### 阴影系统
**验证点**：
- [ ] 卡片：shadow-sm
- [ ] 对话框：shadow-2xl
- [ ] 下拉菜单：shadow-lg

---

### 5️⃣ 可访问性验证

#### 键盘导航
**验证点**：
- [ ] Tab 键导航顺序正确
- [ ] Enter/Space 键触发按钮
- [ ] ESC 键关闭对话框
- [ ] Arrow Keys 导航标签页
- [ ] Arrow Keys 导航下拉菜单
- [ ] 焦点可见（focus-visible）

#### 屏幕阅读器（可选）
**工具**: macOS VoiceOver / Windows Narrator

**验证点**：
- [ ] 所有按钮有正确的标签
- [ ] 所有输入框有关联的 label
- [ ] 对话框有正确的 aria-label
- [ ] 状态变化可被感知

#### 焦点管理
**验证点**：
- [ ] 打开对话框时焦点移入
- [ ] 关闭对话框时焦点返回
- [ ] 焦点陷阱工作正常（在对话框内循环）

---

### 6️⃣ 性能验证

#### 构建验证
```bash
cd frontend
npm run build
```

**验证点**：
- [ ] 构建成功（无错误）
- [ ] 构建时间 < 30s
- [ ] 包大小合理（< 3MB）
- [ ] Gzip 后 < 1MB

#### 运行时性能
**验证点**：
- [ ] 页面加载速度快
- [ ] 组件交互流畅
- [ ] 无明显卡顿
- [ ] 动画流畅（60fps）

---

## 🐛 常见问题排查

### 问题 1: 命令面板无法打开
**解决方案**：
1. 检查是否在新布局页面（/new）
2. 确认快捷键是否被其他应用占用
3. 检查浏览器控制台是否有错误

### 问题 2: 组件样式不正确
**解决方案**：
1. 清除浏览器缓存
2. 重新构建：`npm run build`
3. 检查是否在深色模式下

### 问题 3: TypeScript 错误
**解决方案**：
1. 运行：`npm run type-check`（如果有）
2. 检查 tsconfig.json 配置
3. 重启 VS Code

---

## 📊 验证报告模板

完成验证后，可以使用以下模板记录结果：

```markdown
# shadcn/ui 集成验证报告

**验证日期**: YYYY-MM-DD
**验证人**: [你的名字]
**环境**: [浏览器版本 / 操作系统]

## 验证结果

### 基础组件
- [ ] Button: ✅ 通过 / ❌ 失败
- [ ] Card: ✅ 通过 / ❌ 失败
- [ ] Input: ✅ 通过 / ❌ 失败
- [ ] Tabs: ✅ 通过 / ❌ 失败
- [ ] Select: ✅ 通过 / ❌ 失败
- [ ] Dialog: ✅ 通过 / ❌ 失败
- [ ] Badge: ✅ 通过 / ❌ 失败
- [ ] Progress: ✅ 通过 / ❌ 失败
- [ ] Skeleton: ✅ 通过 / ❌ 失败

### 命令面板
- [ ] 快捷键打开: ✅ 通过 / ❌ 失败
- [ ] 导航命令: ✅ 通过 / ❌ 失败
- [ ] 数据操作: ✅ 通过 / ❌ 失败
- [ ] 表搜索: ✅ 通过 / ❌ 失败
- [ ] 键盘导航: ✅ 通过 / ❌ 失败

### 迁移组件
- [ ] DatabaseForm: ✅ 通过 / ❌ 失败
- [ ] UploadPanel: ✅ 通过 / ❌ 失败
- [ ] DataPasteCard: ✅ 通过 / ❌ 失败
- [ ] SavedConnectionsList: ✅ 通过 / ❌ 失败
- [ ] Sidebar: ✅ 通过 / ❌ 失败

### 样式系统
- [ ] 深色模式: ✅ 通过 / ❌ 失败
- [ ] 颜色系统: ✅ 通过 / ❌ 失败
- [ ] 圆角系统: ✅ 通过 / ❌ 失败
- [ ] 阴影系统: ✅ 通过 / ❌ 失败

### 可访问性
- [ ] 键盘导航: ✅ 通过 / ❌ 失败
- [ ] 焦点管理: ✅ 通过 / ❌ 失败
- [ ] 屏幕阅读器: ✅ 通过 / ❌ 失败

### 性能
- [ ] 构建成功: ✅ 通过 / ❌ 失败
- [ ] 运行流畅: ✅ 通过 / ❌ 失败

## 发现的问题
1. [问题描述]
2. [问题描述]

## 建议
1. [改进建议]
2. [改进建议]
```

---

## 🎯 快速验证路径

如果时间有限，建议按以下优先级验证：

### 高优先级（必须验证）
1. ✅ 命令面板（Cmd+K）
2. ✅ DatabaseForm 表单
3. ✅ Sidebar 导航
4. ✅ 深色模式切换
5. ✅ 构建成功

### 中优先级（建议验证）
1. ✅ UploadPanel 上传
2. ✅ SavedConnectionsList 连接管理
3. ✅ 键盘导航
4. ✅ 对话框交互

### 低优先级（可选验证）
1. ✅ DataPasteCard 粘贴
2. ✅ 屏幕阅读器
3. ✅ 性能测试

---

**祝验证顺利！** 🎉

如有问题，请参考：
- COMPLETION_REPORT.md（完成报告）
- ACCESSIBILITY_REPORT.md（可访问性报告）
- FINAL_SUMMARY.md（最终总结）
