# Design Document

## Overview

本设计文档描述了如何修复查询工作台（Query Workbench）中的三个交互问题，确保与 `docs/demo` 的视觉效果和交互行为保持一致，同时使用 shadcn/ui + React 技术栈实现。

## Architecture

### 技术栈
- **UI 组件库**: shadcn/ui (基于 Radix UI)
- **样式系统**: Tailwind CSS
- **布局管理**: react-resizable-panels
- **状态管理**: React hooks (useState, useRef)
- **持久化**: localStorage

### 组件层级
```
QueryWorkbenchPage
└── QueryWorkspace (react-resizable-panels)
    ├── ResizablePanel (数据源面板)
    │   └── DataSourcePanel
    │       └── TreeSection (修复 1)
    │           └── Collapsible (shadcn/ui)
    ├── ResizablePanel (查询构建器)
    │   └── QueryTabs (修复 3)
    │       └── Tabs (shadcn/ui)
    └── ResizablePanel (结果面板 - 修复 2)
        └── ResultPanel
```

## Components and Interfaces

### 1. TreeSection 组件重构

**当前实现**：
```tsx
// 使用简单的条件渲染
{isExpanded && (
  <div className="space-y-1 pl-1">
    {children}
  </div>
)}
```

**新实现**：使用 shadcn/ui Collapsible
```tsx
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/new/components/ui/collapsible';

interface TreeSectionProps {
  id: string;
  title: string;
  count: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export const TreeSection: React.FC<TreeSectionProps> = ({
  id,
  title,
  count,
  defaultExpanded = true,
  children,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(() => {
    const saved = localStorage.getItem(`treeSection-${id}`);
    return saved !== null ? saved === 'true' : defaultExpanded;
  });

  const handleToggle = (open: boolean) => {
    setIsExpanded(open);
    localStorage.setItem(`treeSection-${id}`, String(open));
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={handleToggle}>
      <CollapsibleTrigger className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-surface-hover hover:text-foreground transition-colors duration-fast">
        <div className="flex items-center gap-1.5">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-fast", isExpanded && "rotate-90")} />
          <span>{title}</span>
          <span className="text-muted-foreground">({count})</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1 pl-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
};
```

**关键改进**：
- 使用 Collapsible 组件提供平滑动画
- 图标旋转动画（0° → 90°）
- 保持 localStorage 持久化
- 更好的可访问性（ARIA 属性）

### 2. QueryWorkspace 结果面板折叠/展开

**当前实现**：
```tsx
<ResizablePanel defaultSize={30} minSize={20}>
  <ResultPanel {...props} />
</ResizablePanel>
```

**新实现**：添加折叠/展开控制
```tsx
import { ImperativePanelHandle } from 'react-resizable-panels';

const resultPanelRef = useRef<ImperativePanelHandle>(null);
const [isResultPanelCollapsed, setIsResultPanelCollapsed] = useState(false);
const [savedResultPanelSize, setSavedResultPanelSize] = useState(30);

const toggleResultPanel = () => {
  if (isResultPanelCollapsed) {
    // 展开：恢复到保存的大小
    resultPanelRef.current?.expand();
    resultPanelRef.current?.resize(savedResultPanelSize);
    setIsResultPanelCollapsed(false);
  } else {
    // 折叠：保存当前大小
    const currentSize = resultPanelRef.current?.getSize();
    if (currentSize) {
      setSavedResultPanelSize(currentSize);
    }
    resultPanelRef.current?.collapse();
    setIsResultPanelCollapsed(true);
  }
};

<ResizablePanel 
  ref={resultPanelRef}
  defaultSize={30} 
  minSize={20}
  collapsible={true}
  onCollapse={() => setIsResultPanelCollapsed(true)}
  onExpand={() => setIsResultPanelCollapsed(false)}
>
  <ResultPanel {...props} />
</ResizablePanel>

<ResizableHandle>
  <Button
    variant="ghost"
    size="icon"
    onClick={toggleResultPanel}
    className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
  >
    {isResultPanelCollapsed ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    )}
  </Button>
</ResizableHandle>
```

**关键改进**：
- 使用 `ImperativePanelHandle` ref 控制面板
- 保存折叠前的大小，展开时恢复
- 添加折叠/展开按钮（在 ResizableHandle 上）
- 图标根据状态切换（ChevronUp/ChevronDown）

### 3. QueryTabs 组件重构

**当前实现**：
```tsx
<TabsList className="w-full justify-start border-b border-border rounded-none bg-muted/30 p-0">
  <TabsTrigger value="sql" className="rounded-none">
    SQL 查询
  </TabsTrigger>
</TabsList>
```

**新实现**：与数据源管理页面一致
```tsx
import { Code, GitMerge, Layers, Table2, LayoutGrid } from 'lucide-react';

const queryModes = [
  { id: 'sql', label: 'SQL 查询', icon: Code },
  { id: 'join', label: 'JOIN 查询', icon: GitMerge },
  { id: 'set', label: '集合操作', icon: Layers },
  { id: 'pivot', label: '透视表', icon: Table2 },
  { id: 'visual', label: '可视化查询', icon: LayoutGrid },
];

<div className="h-12 border-b border-border flex items-center px-4 bg-muted/30 shrink-0">
  <Tabs value={activeTab} onValueChange={onTabChange}>
    <TabsList className="flex gap-1 bg-muted p-1 rounded-lg h-9">
      {queryModes.map(mode => (
        <TabsTrigger key={mode.id} value={mode.id} className="gap-2">
          <mode.icon className="w-3.5 h-3.5" />
          <span>{mode.label}</span>
        </TabsTrigger>
      ))}
    </TabsList>
  </Tabs>
</div>
```

**关键改进**：
- 移除 `rounded-none`，使用默认圆角
- 移除 `p-0`，使用 `p-1` 内边距
- 添加 `gap-1` 标签间距
- 添加图标（与数据源管理页面一致）
- 激活时自动有 `shadow-sm` 阴影

## Data Models

### TreeSection 状态
```typescript
interface TreeSectionState {
  id: string;
  isExpanded: boolean;
}

// localStorage key: `treeSection-${id}`
// localStorage value: 'true' | 'false'
```

### ResultPanel 状态
```typescript
interface ResultPanelState {
  isCollapsed: boolean;
  savedSize: number; // 折叠前的大小（百分比）
}
```

### QueryTabs 配置
```typescript
interface QueryMode {
  id: string;
  label: string;
  icon: LucideIcon;
}

const queryModes: QueryMode[] = [
  { id: 'sql', label: 'SQL 查询', icon: Code },
  { id: 'join', label: 'JOIN 查询', icon: GitMerge },
  { id: 'set', label: '集合操作', icon: Layers },
  { id: 'pivot', label: '透视表', icon: Table2 },
  { id: 'visual', label: '可视化查询', icon: LayoutGrid },
];
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: TreeSection 折叠状态持久化
*For any* TreeSection 组件，当用户切换展开/折叠状态后刷新页面，系统应该从 localStorage 恢复上次的状态
**Validates: Requirements 1.4, 1.5**

### Property 2: TreeSection 动画流畅性
*For any* TreeSection 组件，当用户点击折叠/展开时，内容应该使用平滑的动画过渡，而不是瞬间显示/隐藏
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 3: ResultPanel 折叠后可展开
*For any* 结果面板状态，当用户折叠面板后点击展开按钮，面板应该恢复到折叠前的高度
**Validates: Requirements 2.1, 2.2, 2.3, 2.5**

### Property 4: ResultPanel 动画平滑
*For any* 结果面板折叠/展开操作，应该使用平滑的动画过渡，与 demo 的视觉效果一致
**Validates: Requirements 2.4, 2.6**

### Property 5: QueryTabs 样式一致性
*For any* 查询模式标签页，其样式（圆角、阴影、间距、图标）应该与数据源管理页面的标签页保持一致
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

### Property 6: QueryTabs 激活状态视觉反馈
*For any* 查询模式标签页，当用户切换标签时，激活的标签应该显示明显的视觉反馈（背景色、阴影）
**Validates: Requirements 3.2, 3.3**

## Error Handling

### TreeSection 错误处理
- localStorage 读取失败：使用 `defaultExpanded` 作为回退
- 无效的 id：使用组件的 key 作为回退

### ResultPanel 错误处理
- ref 未初始化：禁用折叠/展开按钮
- resize 失败：显示错误提示，保持当前状态

### QueryTabs 错误处理
- 无效的 activeTab：回退到第一个标签（'sql'）
- 图标加载失败：只显示文字标签

## Testing Strategy

### Unit Tests

#### TreeSection 测试
```typescript
describe('TreeSection', () => {
  it('should render with default expanded state', () => {
    // 测试默认展开状态
  });

  it('should toggle collapse/expand on click', () => {
    // 测试点击切换
  });

  it('should persist state to localStorage', () => {
    // 测试持久化
  });

  it('should restore state from localStorage', () => {
    // 测试恢复状态
  });

  it('should rotate icon on toggle', () => {
    // 测试图标旋转
  });
});
```

#### QueryWorkspace 测试
```typescript
describe('QueryWorkspace - ResultPanel', () => {
  it('should collapse result panel on button click', () => {
    // 测试折叠
  });

  it('should expand result panel and restore size', () => {
    // 测试展开并恢复大小
  });

  it('should save size before collapse', () => {
    // 测试保存大小
  });

  it('should toggle button icon based on state', () => {
    // 测试按钮图标切换
  });
});
```

#### QueryTabs 测试
```typescript
describe('QueryTabs', () => {
  it('should render all query mode tabs', () => {
    // 测试渲染所有标签
  });

  it('should render icons for each tab', () => {
    // 测试图标渲染
  });

  it('should apply correct styles to active tab', () => {
    // 测试激活状态样式
  });

  it('should match DataSourceTabs styles', () => {
    // 测试与数据源管理页面样式一致
  });
});
```

### Integration Tests

#### 端到端测试
```typescript
describe('Query Workbench Interactions', () => {
  it('should collapse/expand data source groups', () => {
    // 测试数据源分组折叠/展开
  });

  it('should collapse/expand result panel', () => {
    // 测试结果面板折叠/展开
  });

  it('should switch query mode tabs', () => {
    // 测试查询模式切换
  });

  it('should persist layout state across page refresh', () => {
    // 测试布局状态持久化
  });
});
```

### Visual Regression Tests

使用 Playwright 或 Chromatic 进行视觉回归测试：
- TreeSection 折叠/展开动画
- ResultPanel 折叠/展开动画
- QueryTabs 样式与 demo 对比
- QueryTabs 样式与数据源管理页面对比

## Implementation Notes

### Collapsible 组件安装

如果 shadcn/ui Collapsible 组件未安装，需要先安装：

```bash
npx shadcn-ui@latest add collapsible
```

这将创建 `frontend/src/new/components/ui/collapsible.tsx`

### ResizablePanel API

使用 react-resizable-panels 的 API：
- `ref`: 获取面板的 imperative handle
- `collapse()`: 折叠面板
- `expand()`: 展开面板
- `resize(size)`: 调整面板大小
- `getSize()`: 获取当前大小
- `onCollapse`: 折叠时的回调
- `onExpand`: 展开时的回调

### 样式覆盖策略

对于 shadcn/ui 组件，使用 `className` prop 覆盖默认样式：
- 保留默认的功能性类名（如 `data-[state=active]`）
- 只覆盖视觉相关的类名（如 `rounded-*`、`p-*`）
- 使用 `cn()` 工具函数合并类名

### 动画性能优化

- 使用 CSS `transition` 而非 JavaScript 动画
- 使用 `transform` 和 `opacity` 属性（GPU 加速）
- 避免动画期间的 layout thrashing
- 使用 `will-change` 提示浏览器优化

## Migration Path

### Phase 1: TreeSection 重构
1. 安装 Collapsible 组件
2. 重构 TreeSection 组件
3. 测试折叠/展开功能
4. 测试 localStorage 持久化
5. 验证动画效果

### Phase 2: ResultPanel 折叠/展开
1. 添加 ref 到 ResizablePanel
2. 实现 toggleResultPanel 函数
3. 添加折叠/展开按钮
4. 测试折叠/展开功能
5. 测试大小恢复

### Phase 3: QueryTabs 样式统一
1. 添加图标导入
2. 创建 queryModes 配置
3. 重构 TabsList 和 TabsTrigger 样式
4. 测试样式一致性
5. 验证与 demo 和数据源管理页面的一致性

### Phase 4: 集成测试
1. 端到端测试所有交互
2. 视觉回归测试
3. 性能测试
4. 可访问性测试

## Performance Considerations

### TreeSection
- 使用 `React.memo` 避免不必要的重渲染
- localStorage 操作使用 debounce（如果频繁切换）
- 动画使用 CSS transition（GPU 加速）

### ResultPanel
- ref 操作是同步的，性能影响小
- 保存大小状态使用 useState（不需要持久化到 localStorage）
- 动画由 react-resizable-panels 内部优化

### QueryTabs
- 图标使用 lucide-react（tree-shaking 友好）
- 标签数量固定（5 个），性能影响小
- 使用 shadcn/ui 默认优化

## Accessibility

### TreeSection
- 使用 Collapsible 组件自动提供 ARIA 属性
- `aria-expanded`: 指示展开/折叠状态
- `aria-controls`: 关联触发器和内容
- 键盘支持：Enter/Space 切换

### ResultPanel
- 折叠/展开按钮有 `aria-label`
- 按钮状态通过图标和 aria-label 传达
- 键盘支持：Tab 导航，Enter/Space 激活

### QueryTabs
- 使用 Tabs 组件自动提供 ARIA 属性
- `role="tablist"`, `role="tab"`, `role="tabpanel"`
- `aria-selected`: 指示激活状态
- 键盘支持：Arrow keys 导航，Enter/Space 激活

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

所有现代浏览器都支持：
- CSS transitions
- CSS transforms
- localStorage
- Radix UI primitives
- React 18

## References

- [shadcn/ui Collapsible](https://ui.shadcn.com/docs/components/collapsible)
- [shadcn/ui Tabs](https://ui.shadcn.com/docs/components/tabs)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [Radix UI Collapsible](https://www.radix-ui.com/primitives/docs/components/collapsible)
- [Radix UI Tabs](https://www.radix-ui.com/primitives/docs/components/tabs)
- [docs/demo/index.html](../../docs/demo/index.html) - 视觉参考标准
