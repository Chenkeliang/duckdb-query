# 使用 react-resizable-panels 实现可调整面板

## 一、为什么选择 react-resizable-panels

### 1.1 对比分析

| 方案 | 优势 | 劣势 | 推荐度 |
|-----|------|------|--------|
| **自己实现 useResizer** | 完全控制、无依赖 | 需要处理边界情况、测试成本高、维护成本高 | ⭐⭐ |
| **react-resizable-panels** | 成熟稳定、功能完善、社区支持 | 增加 ~10KB 依赖 | ⭐⭐⭐⭐⭐ |
| **react-split-pane** | 老牌库 | 不再维护、React 18 兼容性问题 | ⭐ |

### 1.2 react-resizable-panels 优势

✅ **成熟稳定**
- 由 React DevTools 作者 Brian Vaughn 开发
- 在 React DevTools 中实际使用
- 经过大量生产环境验证

✅ **功能完善**
- 支持水平/垂直布局
- 支持嵌套面板
- 支持最小/最大尺寸
- 支持面板折叠
- 支持键盘导航
- 支持触摸屏
- 支持持久化（localStorage）

✅ **性能优秀**
- 使用 CSS transforms 而非 width/height
- 避免不必要的重渲染
- 支持虚拟化

✅ **可访问性**
- 内置 ARIA 属性
- 键盘导航支持
- 屏幕阅读器友好

✅ **TypeScript 支持**
- 完整的类型定义
- 良好的 IDE 支持

## 二、安装和配置

### 2.1 安装

```bash
npm install react-resizable-panels
```

### 2.2 基本使用

```jsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

function QueryWorkbench() {
  return (
    <PanelGroup direction="horizontal">
      {/* 数据源面板 */}
      <Panel defaultSize={20} minSize={15} maxSize={40}>
        <DataSourcePanel />
      </Panel>
      
      {/* 调整器 */}
      <PanelResizeHandle />
      
      {/* 主工作区 */}
      <Panel defaultSize={80}>
        <PanelGroup direction="vertical">
          {/* 查询构建器 */}
          <Panel defaultSize={60} minSize={30}>
            <QueryBuilder />
          </Panel>
          
          {/* 调整器 */}
          <PanelResizeHandle />
          
          {/* 结果面板 */}
          <Panel defaultSize={40} minSize={20}>
            <ResultPanel />
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
```

## 三、查询工作台完整实现

### 3.1 主布局结构

```jsx
// frontend/src/new/QueryWorkbench/index.jsx
import React, { useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { GripVertical, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

import DataSourcePanel from './DataSourcePanel';
import QueryModeSelector from './QueryModeSelector';
import VisualQuery from './VisualQuery';
import SQLQuery from './SQLQuery';
import JoinQuery from './JoinQuery';
import SetOperation from './SetOperation';
import PivotTable from './PivotTable';
import ResultPanel from './ResultPanel';

function QueryWorkbench() {
  const [queryMode, setQueryMode] = useState('visual');
  const [queryResults, setQueryResults] = useState(null);
  
  // 渲染查询构建器
  const renderQueryBuilder = () => {
    switch (queryMode) {
      case 'visual':
        return <VisualQuery onExecute={setQueryResults} />;
      case 'sql':
        return <SQLQuery onExecute={setQueryResults} />;
      case 'join':
        return <JoinQuery onExecute={setQueryResults} />;
      case 'set':
        return <SetOperation onExecute={setQueryResults} />;
      case 'pivot':
        return <PivotTable onExecute={setQueryResults} />;
      default:
        return null;
    }
  };
  
  return (
    <div className="h-screen flex flex-col">
      {/* 查询模式选择器 */}
      <div className="border-b border-border">
        <QueryModeSelector value={queryMode} onChange={setQueryMode} />
      </div>
      
      {/* 主工作区 */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          {/* 数据源面板 */}
          <Panel
            defaultSize={20}
            minSize={15}
            maxSize={40}
            collapsible={true}
            collapsedSize={0}
          >
            <DataSourcePanel />
          </Panel>
          
          {/* 水平调整器 */}
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors relative group">
            <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
              <div className="w-1 h-8 rounded-full bg-border group-hover:bg-primary transition-colors" />
            </div>
          </PanelResizeHandle>
          
          {/* 主内容区 */}
          <Panel defaultSize={80} minSize={50}>
            <PanelGroup direction="vertical">
              {/* 查询构建器 */}
              <Panel defaultSize={60} minSize={30}>
                <div className="h-full overflow-auto p-6">
                  {renderQueryBuilder()}
                </div>
              </Panel>
              
              {/* 垂直调整器 */}
              <PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors relative group">
                <div className="absolute inset-x-0 -top-1 -bottom-1 flex items-center justify-center">
                  <GripHorizontal className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </PanelResizeHandle>
              
              {/* 结果面板 */}
              <Panel
                defaultSize={40}
                minSize={20}
                collapsible={true}
                collapsedSize={0}
              >
                {queryResults && (
                  <ResultPanel data={queryResults} />
                )}
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

export default QueryWorkbench;
```

### 3.2 自定义调整器样式

```jsx
// frontend/src/new/QueryWorkbench/ResizeHandle.jsx
import React from 'react';
import { PanelResizeHandle } from 'react-resizable-panels';
import { GripVertical, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HorizontalResizeHandle({ className }) {
  return (
    <PanelResizeHandle
      className={cn(
        "w-1 bg-transparent hover:bg-primary/50 transition-colors relative group",
        "data-[resize-handle-active]:bg-primary",
        className
      )}
    >
      <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
        <GripVertical className="w-3 h-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </PanelResizeHandle>
  );
}

export function VerticalResizeHandle({ className }) {
  return (
    <PanelResizeHandle
      className={cn(
        "h-1 bg-transparent hover:bg-primary/50 transition-colors relative group",
        "data-[resize-handle-active]:bg-primary",
        className
      )}
    >
      <div className="absolute inset-x-0 -top-1 -bottom-1 flex items-center justify-center">
        <GripHorizontal className="h-3 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </PanelResizeHandle>
  );
}
```

### 3.3 持久化面板尺寸

```jsx
// frontend/src/new/QueryWorkbench/index.jsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

function QueryWorkbench() {
  return (
    <PanelGroup
      direction="horizontal"
      // 自动保存到 localStorage
      autoSaveId="query-workbench-layout"
    >
      <Panel id="datasource" defaultSize={20}>
        <DataSourcePanel />
      </Panel>
      
      <PanelResizeHandle />
      
      <Panel id="main" defaultSize={80}>
        <PanelGroup
          direction="vertical"
          autoSaveId="query-workbench-vertical"
        >
          <Panel id="builder" defaultSize={60}>
            <QueryBuilder />
          </Panel>
          
          <PanelResizeHandle />
          
          <Panel id="result" defaultSize={40}>
            <ResultPanel />
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
```

### 3.4 编程式控制面板

```jsx
import { useRef } from 'react';
import { ImperativePanelHandle } from 'react-resizable-panels';

function QueryWorkbench() {
  const dataSourcePanelRef = useRef<ImperativePanelHandle>(null);
  const resultPanelRef = useRef<ImperativePanelHandle>(null);
  
  const toggleDataSourcePanel = () => {
    const panel = dataSourcePanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };
  
  const toggleResultPanel = () => {
    const panel = resultPanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };
  
  return (
    <>
      {/* 工具栏 */}
      <div className="flex gap-2 p-2 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          onClick={toggleDataSourcePanel}
        >
          切换数据源面板
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleResultPanel}
        >
          切换结果面板
        </Button>
      </div>
      
      {/* 面板组 */}
      <PanelGroup direction="horizontal">
        <Panel
          ref={dataSourcePanelRef}
          defaultSize={20}
          collapsible={true}
        >
          <DataSourcePanel />
        </Panel>
        
        <PanelResizeHandle />
        
        <Panel defaultSize={80}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={60}>
              <QueryBuilder />
            </Panel>
            
            <PanelResizeHandle />
            
            <Panel
              ref={resultPanelRef}
              defaultSize={40}
              collapsible={true}
            >
              <ResultPanel />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </>
  );
}
```

## 四、高级功能

### 4.1 条件面板（根据状态显示/隐藏）

```jsx
function QueryWorkbench() {
  const [showDataSource, setShowDataSource] = useState(true);
  const [showResult, setShowResult] = useState(true);
  
  return (
    <PanelGroup direction="horizontal">
      {showDataSource && (
        <>
          <Panel defaultSize={20}>
            <DataSourcePanel />
          </Panel>
          <PanelResizeHandle />
        </>
      )}
      
      <Panel>
        <QueryBuilder />
      </Panel>
      
      {showResult && (
        <>
          <PanelResizeHandle />
          <Panel defaultSize={40}>
            <ResultPanel />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
```

### 4.2 响应式布局

```jsx
import { useMediaQuery } from '@/hooks/useMediaQuery';

function QueryWorkbench() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  return (
    <PanelGroup direction={isMobile ? 'vertical' : 'horizontal'}>
      <Panel defaultSize={isMobile ? 30 : 20}>
        <DataSourcePanel />
      </Panel>
      
      <PanelResizeHandle />
      
      <Panel defaultSize={isMobile ? 70 : 80}>
        <QueryBuilder />
      </Panel>
    </PanelGroup>
  );
}
```

### 4.3 监听尺寸变化

```jsx
function QueryWorkbench() {
  const handleResize = (sizes) => {
    console.log('Panel sizes:', sizes);
    // sizes: [20, 80] (百分比)
  };
  
  return (
    <PanelGroup
      direction="horizontal"
      onLayout={handleResize}
    >
      <Panel defaultSize={20}>
        <DataSourcePanel />
      </Panel>
      
      <PanelResizeHandle />
      
      <Panel defaultSize={80}>
        <QueryBuilder />
      </Panel>
    </PanelGroup>
  );
}
```

## 五、样式定制

### 5.1 Tailwind CSS 样式

```css
/* frontend/src/styles/query-workbench.css */

/* 调整器基础样式 */
[data-panel-resize-handle-id] {
  @apply transition-colors;
}

/* 调整器悬停样式 */
[data-panel-resize-handle-id]:hover {
  @apply bg-primary/20;
}

/* 调整器激活样式 */
[data-panel-resize-handle-id][data-resize-handle-active] {
  @apply bg-primary;
}

/* 水平调整器 */
[data-panel-resize-handle-id][data-panel-resize-handle-direction="horizontal"] {
  @apply w-1 cursor-ew-resize;
}

/* 垂直调整器 */
[data-panel-resize-handle-id][data-panel-resize-handle-direction="vertical"] {
  @apply h-1 cursor-ns-resize;
}

/* 面板折叠动画 */
[data-panel-id] {
  @apply transition-all duration-200;
}
```

### 5.2 自定义调整器图标

```jsx
function CustomResizeHandle() {
  return (
    <PanelResizeHandle className="relative group">
      {/* 背景 */}
      <div className="absolute inset-0 bg-border group-hover:bg-primary/50 transition-colors" />
      
      {/* 图标 */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-1 h-8 rounded-full bg-muted-foreground/50 group-hover:bg-primary transition-colors" />
      </div>
      
      {/* 悬停提示 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          拖拽调整大小
        </span>
      </div>
    </PanelResizeHandle>
  );
}
```

## 六、对比总结

### 6.1 自己实现 vs react-resizable-panels

| 特性 | 自己实现 | react-resizable-panels |
|-----|---------|----------------------|
| 开发时间 | 2-3 天 | 1-2 小时 |
| 代码量 | ~500 行 | ~50 行 |
| 功能完整性 | 基础功能 | 完整功能 |
| 边界情况处理 | 需要自己处理 | 已处理 |
| 可访问性 | 需要自己实现 | 内置支持 |
| 触摸屏支持 | 需要自己实现 | 内置支持 |
| 持久化 | 需要自己实现 | 内置支持 |
| 维护成本 | 高 | 低 |
| 包体积 | 0 | ~10KB |

### 6.2 推荐决策

✅ **推荐使用 react-resizable-panels**

**理由**：
1. 节省开发时间（2-3 天 → 1-2 小时）
2. 功能更完善（持久化、可访问性、触摸屏）
3. 维护成本低（社区维护）
4. 包体积可接受（~10KB）
5. 生产环境验证（React DevTools 使用）

**何时考虑自己实现**：
- 需要极致的包体积优化（< 5KB）
- 需要非常特殊的交互逻辑
- 团队有充足的开发和测试资源

## 七、迁移建议

### 7.1 更新依赖

```bash
# 安装 react-resizable-panels
npm install react-resizable-panels
```

### 7.2 更新文档

将 `IMPLEMENTATION_GUIDE.md` 中的 `useResizer` Hook 替换为 `react-resizable-panels` 使用示例。

### 7.3 更新任务清单

在 `tasks.md` 中：
- ❌ 删除：创建 `useResizer` Hook
- ✅ 添加：集成 `react-resizable-panels`

## 八、总结

**最终推荐**：使用 `react-resizable-panels` 实现查询工作台的可调整面板功能。

**优势**：
- ✅ 节省开发时间
- ✅ 功能完善
- ✅ 维护成本低
- ✅ 用户体验好

**下一步**：
1. 安装 `react-resizable-panels`
2. 按照本文档实现查询工作台布局
3. 自定义调整器样式
4. 测试各种场景（折叠、持久化、响应式）
