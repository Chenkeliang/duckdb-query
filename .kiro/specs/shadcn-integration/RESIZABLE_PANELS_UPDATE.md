# react-resizable-panels 集成说明

## 📋 更新摘要

根据用户反馈，我们明确指定使用 `react-resizable-panels` 库来实现可调整大小的面板布局，而非手写拖拽逻辑。

## 🎯 为什么使用 react-resizable-panels

### 1. shadcn/ui 生态推荐
- shadcn/ui 官方文档推荐的面板布局解决方案
- 与 shadcn/ui 设计系统完美契合
- 社区广泛使用，文档完善

### 2. 技术优势
| 特性 | 手写拖拽 | react-resizable-panels |
|-----|---------|----------------------|
| 代码量 | 30+ 行 | 3-5 行 |
| 可访问性 | 需手动实现 | ✅ 内置 |
| 键盘导航 | 需手动实现 | ✅ 内置 |
| 性能优化 | 需手动优化 | ✅ 自动优化 |
| 持久化 | 需手动实现 | ✅ 一行配置 |
| 嵌套布局 | 复杂 | ✅ 简单 |

### 3. 开发体验
```jsx
// ❌ 手写拖拽（30+ 行代码）
const [isDragging, setIsDragging] = useState(false);
const handleMouseDown = (e) => { /* ... */ };
const handleMouseMove = (e) => { /* ... */ };
const handleMouseUp = () => { /* ... */ };
// ... 更多代码

// ✅ react-resizable-panels（3 行代码）
<Panel defaultSize={20} minSize={15} maxSize={40} collapsible>
  <DataSourcePanel />
</Panel>
```

## 📝 更新内容

### 1. shadcn-integration/tasks.md

**阶段 1：基础设施搭建**
- ✅ 添加：安装 `react-resizable-panels` 依赖

**阶段 3：迁移 Layout 组件**
- ✅ 添加：使用 `react-resizable-panels` 实现可折叠的 Sidebar 布局
- ✅ 添加：导入 `Panel, PanelGroup, PanelResizeHandle`

### 2. shadcn-integration/design.md

**新增章节：可调整大小面板系统**
- ✅ 说明为什么选择 react-resizable-panels
- ✅ 提供安装和基本用法示例
- ✅ 列出应用场景

### 3. demo-to-new-migration/requirements.md

**新增章节：可调整大小面板的实现**
- ✅ 说明使用 react-resizable-panels 而非手写拖拽
- ✅ 列出技术优势
- ✅ 说明应用场景

### 4. demo-to-new-migration/IMPLEMENTATION_GUIDE.md

**更新阶段 1：基础框架**
- ✅ 添加：安装 react-resizable-panels 依赖
- ✅ 添加：使用 react-resizable-panels 实现可调整大小的面板

**更新 8.1 节：拖拽调整大小**
- ✅ 替换：从手写 useResizer Hook 改为使用 react-resizable-panels
- ✅ 添加：基本用法示例
- ✅ 添加：高级用法（折叠面板、持久化、样式定制）

**更新 12.1 节：核心技术选型对照表**
- ✅ 添加：可调整面板的技术选型对比

**新增 12.2 节：可调整大小面板实现对比**
- ✅ 对比：Demo 原生实现 vs react-resizable-panels
- ✅ 列出：手写拖拽的问题
- ✅ 列出：react-resizable-panels 的优势

## 🚀 实施指南

### 安装依赖
```bash
npm install react-resizable-panels
```

### 基本用法
```jsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const QueryWorkbench = () => {
  return (
    <PanelGroup direction="horizontal">
      {/* 数据源面板 */}
      <Panel 
        defaultSize={20}      // 默认占 20%
        minSize={15}          // 最小 15%
        maxSize={40}          // 最大 40%
        collapsible={true}    // 可折叠
      >
        <DataSourcePanel />
      </Panel>
      
      {/* 调整手柄 */}
      <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
      
      {/* 主工作区 */}
      <Panel minSize={30}>
        <PanelGroup direction="vertical">
          {/* 查询构建区 */}
          <Panel defaultSize={60} minSize={30}>
            <QueryBuilder />
          </Panel>
          
          {/* 调整手柄 */}
          <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />
          
          {/* 结果面板 */}
          <Panel defaultSize={40} minSize={20} collapsible>
            <ResultPanel />
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
};
```

### 高级功能

#### 1. 折叠/展开控制
```jsx
const [isCollapsed, setIsCollapsed] = useState(false);
const panelRef = useRef(null);

const togglePanel = () => {
  const panel = panelRef.current;
  if (panel) {
    if (isCollapsed) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }
};

<Panel 
  ref={panelRef}
  collapsible
  onCollapse={() => setIsCollapsed(true)}
  onExpand={() => setIsCollapsed(false)}
>
  <DataSourcePanel />
</Panel>
```

#### 2. 持久化面板大小
```jsx
<PanelGroup 
  direction="horizontal"
  autoSaveId="query-workbench-layout"  // 自动保存到 localStorage
>
  {/* ... */}
</PanelGroup>
```

#### 3. 样式定制
```css
/* 在 tailwind.css 中添加 */
.resize-handle-horizontal {
  @apply w-1 bg-border hover:bg-primary transition-colors cursor-col-resize;
}

.resize-handle-horizontal:active {
  @apply bg-primary;
}

.resize-handle-vertical {
  @apply h-1 bg-border hover:bg-primary transition-colors cursor-row-resize;
}
```

## ✅ 验收标准

### 功能验收
- [ ] 数据源面板可以通过拖拽调整宽度
- [ ] 数据源面板可以折叠到最小宽度
- [ ] 数据源面板可以通过按钮展开
- [ ] 结果面板可以通过拖拽调整高度
- [ ] 结果面板可以折叠到最小高度
- [ ] 面板大小在刷新后保持不变（持久化）

### 可访问性验收
- [ ] 可以使用 Tab 键聚焦到调整手柄
- [ ] 可以使用 Arrow 键调整面板大小
- [ ] 可以使用 Enter 键折叠/展开面板
- [ ] 屏幕阅读器可以正确朗读面板状态

### 性能验收
- [ ] 拖拽调整大小时无明显卡顿
- [ ] 面板折叠/展开动画流畅
- [ ] 不影响其他组件的渲染性能

## 📚 参考资源

- [react-resizable-panels 官方文档](https://github.com/bvaughn/react-resizable-panels)
- [shadcn/ui 推荐的布局方案](https://ui.shadcn.com/docs/components/resizable)
- [组件选择原则](.kiro/steering/component-selection-principle.md)

## 🎯 总结

通过明确指定使用 `react-resizable-panels`，我们：

1. ✅ **避免重复造轮子** - 不需要手写复杂的拖拽逻辑
2. ✅ **提高开发效率** - 3 行代码实现完整功能
3. ✅ **保证可访问性** - 自动支持键盘导航和屏幕阅读器
4. ✅ **优化性能** - 使用 ResizeObserver，避免频繁重绘
5. ✅ **降低维护成本** - 使用成熟的社区方案，bug 少、文档全

这完全符合我们的[组件选择原则](.kiro/steering/component-selection-principle.md)：**优先使用成熟的开源组件，避免重复造轮子**。
