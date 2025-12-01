# shadcn/ui 集成设计文档（包含 TypeScript + TanStack Query + CMDK）

## 🎯 核心设计原则

**先打地基，再建房子**：在创建任何组件前，先配置好所有基础设施，避免后续返工。

### 实施顺序（严格遵守）
1. **Day 1**: 配置 TypeScript（地基）
2. **Day 2**: 配置 shadcn/ui（框架）
3. **Day 3**: 配置 TanStack Query（数据层）
4. **Day 4-5**: 创建基础组件（TSX + Query）
5. **Week 2**: 迁移现有组件（TSX + Query）
6. **Week 6**: 集成 CMDK（命令面板）

## 一、架构设计

### 1.1 整体架构（优化后）

```
frontend/src/
├── lib/
│   └── utils.ts                    # cn() 工具函数（TypeScript 版本）
│
├── new/                            # 新布局（TypeScript + shadcn/ui + TanStack Query）
│   ├── providers/
│   │   └── QueryProvider.tsx       # TanStack Query 配置
│   │
│   ├── components/
│   │   └── ui/                     # shadcn/ui 组件库（TypeScript 版本）
│   │       ├── button.tsx          # Button 组件（TSX）
│   │       ├── card.tsx            # Card 组件（TSX）
│   │       ├── input.tsx           # Input, Label, Textarea（TSX）
│   │       ├── tabs.tsx            # Tabs 组件（Radix UI + TSX）
│   │       ├── dialog.tsx          # Dialog 组件（Radix UI + TSX）
│   │       ├── select.tsx          # Select 组件（Radix UI + TSX）
│   │       ├── dropdown-menu.tsx   # DropdownMenu 组件（Radix UI + TSX）
│   │       ├── form.tsx            # Form 组件（react-hook-form 封装 + TSX）
│   │       ├── badge.tsx           # Badge 组件（TSX）
│   │       ├── tooltip.tsx         # Tooltip 组件（TSX）
│   │       ├── skeleton.tsx        # Skeleton 组件（TSX）
│   │       ├── popover.tsx         # Popover 组件（TSX）
│   │       ├── separator.tsx       # Separator 组件（TSX）
│   │       ├── progress.tsx        # Progress 组件（TSX）
│   │       └── command.tsx         # Command 组件（CMDK + TSX）
│   │
│   ├── Layout/
│   │   ├── Sidebar.tsx             # ✅ TypeScript + useQuery
│   │   ├── Header.tsx              # ✅ TypeScript + useQuery
│   │   └── PageShell.tsx           # ✅ 包含 QueryProvider
│   │
│   ├── DataSource/
│   │   ├── DatabaseForm.tsx        # ✅ TypeScript + useMutation
│   │   ├── UploadPanel.tsx         # ✅ TypeScript + useMutation
│   │   ├── DataPasteCard.tsx       # ✅ TypeScript + useMutation
│   │   ├── SavedConnectionsList.tsx # ✅ TypeScript + useQuery
│   │   ├── DataSourcePage.tsx      # ✅ TypeScript + useQuery
│   │   └── DataSourceTabs.tsx      # ✅ TypeScript
│   │
│   └── CommandPalette.tsx          # ✅ CMDK 命令面板（Week 6）
│
└── components/                     # 旧布局（保持不变，使用 MUI + JS）
    ├── QueryBuilder/
    ├── Results/
    └── ...
```

**关键改进**：
1. ✅ 所有新组件使用 `.tsx` 扩展名（TypeScript）
2. ✅ 所有数据获取使用 TanStack Query（`useQuery/useMutation`）
3. ✅ shadcn/ui 组件放在 `new/components/ui/` 下，**仅新布局使用**
4. ✅ 旧布局 `components/` 保持不变，继续使用 MUI + JS
5. ✅ `lib/utils.ts` 全局共享（TypeScript 版本）
6. ✅ 新旧布局完全隔离，不会混淆
7. ✅ 添加 `QueryProvider.tsx` 统一管理数据层
8. ✅ 添加 `CommandPalette.tsx` 命令面板

**关键改进**：
1. ✅ shadcn/ui 组件放在 `new/components/ui/` 下，**仅新布局使用**
2. ✅ 旧布局 `components/` 保持不变，继续使用 MUI
3. ✅ `lib/utils.js` 全局共享（新旧布局都可以用）
4. ✅ 新旧布局完全隔离，不会混淆

### 1.2 依赖关系（优化后）

```mermaid
graph TD
    subgraph "基础设施层（Day 1-3）"
        TS[TypeScript 配置]
        TQ[TanStack Query]
        SC[shadcn/ui 配置]
    end
    
    subgraph "新布局（TypeScript + Query）"
        A[Sidebar.tsx] --> B[button.tsx]
        A --> TQ
        C[DatabaseForm.tsx] --> B
        C --> D[card.tsx]
        C --> E[input.tsx]
        C --> F[tabs.tsx]
        C --> G[select.tsx]
        C --> TQ
        
        B --> H[lib/utils.ts]
        D --> H
        E --> H
        F --> H
        F --> I[@radix-ui/react-tabs]
        G --> J[@radix-ui/react-select]
        
        CMD[CommandPalette.tsx] --> K[command.tsx]
        CMD --> TQ
    end
    
    subgraph "旧布局（JavaScript + MUI）"
        L[QueryBuilder.jsx] -.不依赖.-> B
        L -.使用 MUI.-> M[@mui/material]
    end
    
    TS --> A
    TS --> C
    TS --> CMD
    SC --> B
    SC --> D
```

**说明**：
- **基础设施层**：TypeScript + TanStack Query + shadcn/ui（Day 1-3 配置）
- **新布局组件**：`.tsx` + `useQuery/useMutation` + `new/components/ui/*`
- **旧布局组件**：`.jsx` + `@mui/material`（不依赖 shadcn/ui）
- **完全隔离**：新旧布局互不影响

### 1.3 TypeScript 配置设计

**tsconfig.json 配置**：
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    
    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    
    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    
    /* 渐进式迁移 */
    "allowJs": true,  // ← 允许 JS 和 TS 共存
    "checkJs": false, // ← 不检查 JS 文件
    
    /* Path mapping */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/new/*": ["./src/new/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**关键配置**：
- `allowJs: true` - 允许 JS 和 TS 文件共存（渐进式迁移）
- `checkJs: false` - 不检查旧的 JS 文件
- `strict: true` - 新的 TS 文件使用严格模式
- `paths` - 路径别名支持

### 1.4 TanStack Query 配置设计

**QueryProvider.tsx**：
```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 分钟
      cacheTime: 1000 * 60 * 30, // 30 分钟
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
});

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

**集成到 PageShell.tsx**：
```typescript
import { QueryProvider } from '@/new/providers/QueryProvider';

export function PageShell({ children }: PageShellProps) {
  return (
    <QueryProvider>
      <div className="dq-new-theme">
        {/* ... */}
      </div>
    </QueryProvider>
  );
}
```

## 二、组件设计（TypeScript 版本）

### 2.0 统一的组件模式

**所有新组件必须遵循以下模式**：

```typescript
// ✅ 正确：TypeScript + TanStack Query 模式
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';

interface ComponentProps {
  id: string;
  onSuccess?: () => void;
}

export const Component: React.FC<ComponentProps> = ({ id, onSuccess }) => {
  const queryClient = useQueryClient();
  
  // 数据获取
  const { data, isLoading, error } = useQuery({
    queryKey: ['resource', id],
    queryFn: () => fetchResource(id),
  });
  
  // 数据修改
  const mutation = useMutation({
    mutationFn: updateResource,
    onSuccess: () => {
      queryClient.invalidateQueries(['resource']);
      onSuccess?.();
    },
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <Card>
      <Button onClick={() => mutation.mutate(data)}>
        {mutation.isLoading ? 'Saving...' : 'Save'}
      </Button>
    </Card>
  );
};
```

```typescript
// ❌ 错误：旧的 useState + useEffect 模式
const Component = ({ id }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    setLoading(true);
    fetchResource(id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);
  
  // ...
};
```

### 2.1 Button 组件（TypeScript 版本）

**设计原则**：
- 基于 `class-variance-authority` 管理变体
- 支持 `asChild` 模式（使用 Radix Slot）
- 支持 loading 状态
- 支持 icon 变体
- **完整的 TypeScript 类型定义**

**类型定义**：
```typescript
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90",
        destructive: "bg-error text-primary-foreground hover:opacity-90",
        outline: "border border-border bg-surface hover:bg-surface-hover",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
        ghost: "hover:bg-surface-hover",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
```

**使用示例**：
```typescript
// 主按钮
<Button>保存</Button>

// 次要按钮
<Button variant="outline">取消</Button>

// 图标按钮
<Button variant="ghost" size="icon">
  <Settings className="h-4 w-4" />
</Button>

// 加载状态
<Button disabled={loading}>
  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  保存中...
</Button>
```

### 2.2 Card 组件

**设计原则**：
- 提供完整的卡片结构（Header, Title, Description, Content, Footer）
- 支持自定义样式
- 统一圆角和阴影

**组件结构**：
```jsx
<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
    <CardDescription>描述</CardDescription>
  </CardHeader>
  <CardContent>
    内容
  </CardContent>
  <CardFooter>
    <Button>操作</Button>
  </CardFooter>
</Card>
```

### 2.3 Input 组件

**设计原则**：
- 支持 Label 关联
- 支持错误状态
- 支持 disabled 状态
- 支持 focus 状态

**使用示例**：
```jsx
<div className="space-y-2">
  <Label htmlFor="email">邮箱</Label>
  <Input
    id="email"
    type="email"
    placeholder="your@email.com"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
  />
  {error && <p className="text-sm text-error">{error}</p>}
</div>
```

### 2.4 Tabs 组件

**设计原则**：
- 基于 @radix-ui/react-tabs
- 支持键盘导航
- 支持受控和非受控模式

**使用示例**：
```jsx
<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="mysql">MySQL</TabsTrigger>
    <TabsTrigger value="postgresql">PostgreSQL</TabsTrigger>
    <TabsTrigger value="sqlite">SQLite</TabsTrigger>
  </TabsList>
  <TabsContent value="mysql">
    MySQL 配置表单
  </TabsContent>
  <TabsContent value="postgresql">
    PostgreSQL 配置表单
  </TabsContent>
  <TabsContent value="sqlite">
    SQLite 配置表单
  </TabsContent>
</Tabs>
```

### 2.5 Dialog 组件

**设计原则**：
- 基于 @radix-ui/react-dialog
- 支持焦点管理
- 支持 ESC 关闭
- 支持背景点击关闭

**使用示例**：
```jsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogTrigger asChild>
    <Button variant="outline">删除</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>确认删除</DialogTitle>
      <DialogDescription>
        此操作无法撤销，确定要删除吗？
      </DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsOpen(false)}>
        取消
      </Button>
      <Button variant="destructive" onClick={handleDelete}>
        删除
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 2.6 Select 组件

**设计原则**：
- 基于 @radix-ui/react-select
- 支持搜索
- 支持分组
- 支持虚拟滚动（大数据量）

**使用示例**：
```jsx
<Select value={dbType} onValueChange={setDbType}>
  <SelectTrigger>
    <SelectValue placeholder="选择数据库类型" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="mysql">MySQL</SelectItem>
    <SelectItem value="postgresql">PostgreSQL</SelectItem>
    <SelectItem value="sqlite">SQLite</SelectItem>
  </SelectContent>
</Select>
```

## 三、可调整大小面板系统

### 3.1 使用 react-resizable-panels

**为什么选择 react-resizable-panels**：

1. **shadcn/ui 生态推荐** - shadcn/ui 官方推荐的面板布局库
2. **声明式 API** - 简洁的 React 组件 API，无需手写拖拽逻辑
3. **性能优化** - 使用 ResizeObserver，避免频繁重绘
4. **可访问性** - 内置键盘导航和 ARIA 属性
5. **功能完整** - 支持折叠、展开、持久化、嵌套布局

**安装**：
```bash
npm install react-resizable-panels
```

**基本用法**：
```jsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

const Layout = () => {
  return (
    <PanelGroup direction="horizontal">
      {/* 侧边栏 */}
      <Panel defaultSize={20} minSize={15} maxSize={30} collapsible>
        <Sidebar />
      </Panel>
      
      {/* 调整手柄 */}
      <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
      
      {/* 主内容区 */}
      <Panel minSize={50}>
        <MainContent />
      </Panel>
    </PanelGroup>
  );
};
```

**应用场景**：
- 数据源面板的水平调整和折叠
- 结果面板的垂直调整和折叠
- 查询工作台的三栏布局
- 任何需要可调整大小的面板布局

## 四、迁移策略

### 4.1 迁移顺序

**阶段 1：基础设施（1 天）**
1. 安装依赖
2. 创建 `lib/utils.js`
3. 配置 `components.json`
4. 配置路径别名

**阶段 2：创建 shadcn/ui 组件（2 天）**
1. Button 组件
2. Card 组件
3. Input, Label, Textarea 组件
4. Tabs 组件
5. Dialog 组件
6. Select 组件
7. Progress 组件

**阶段 3：迁移 Layout 组件（1 天）**
1. 安装 react-resizable-panels
2. Sidebar.jsx（使用 react-resizable-panels 实现可折叠布局）
3. Header.jsx

**阶段 4：迁移 DataSource 组件（2 天）**
1. DatabaseForm.jsx
2. UploadPanel.jsx
3. DataPasteCard.jsx
4. SavedConnectionsList.jsx
5. DataSourceTabs.jsx

**阶段 5：测试和优化（1 天）**
1. 功能测试
2. 可访问性测试
3. 性能优化
4. 代码审查

### 3.2 迁移模式

#### 模式 1：直接替换

**适用场景**：简单的按钮、输入框

**示例**：
```jsx
// 迁移前
<button className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
  保存
</button>

// 迁移后
<Button>保存</Button>
```

#### 模式 2：结构重组

**适用场景**：复杂的卡片、表单

**示例**：
```jsx
// 迁移前
<div className="bg-surface border border-border rounded-xl p-6">
  <h3 className="text-lg font-semibold mb-4">数据库连接</h3>
  <div className="space-y-4">
    {/* 表单内容 */}
  </div>
</div>

// 迁移后
<Card>
  <CardHeader>
    <CardTitle>数据库连接</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* 表单内容 */}
  </CardContent>
</Card>
```

#### 模式 3：功能增强

**适用场景**：需要增加交互的组件

**示例**：
```jsx
// 迁移前
<div className="flex gap-2">
  <button onClick={() => setTab('mysql')}>MySQL</button>
  <button onClick={() => setTab('postgresql')}>PostgreSQL</button>
</div>

// 迁移后
<Tabs value={tab} onValueChange={setTab}>
  <TabsList>
    <TabsTrigger value="mysql">MySQL</TabsTrigger>
    <TabsTrigger value="postgresql">PostgreSQL</TabsTrigger>
  </TabsList>
</Tabs>
```

### 3.3 兼容性处理

**保持 CSS 变量映射**：
```css
/* tailwind.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 24 100% 50%;
    --primary-foreground: 0 0% 100%;
    /* ... */
  }
  
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 24 100% 50%;
    --primary-foreground: 0 0% 100%;
    /* ... */
  }
}
```

**Tailwind 配置**：
```javascript
// tailwind.config.js
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        // ... 更多颜色
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};
```

## 四、样式系统

### 4.1 颜色系统

**语义化颜色**：
```jsx
// ✅ 推荐：使用语义化类名
<div className="bg-surface text-foreground border-border">

// ❌ 不推荐：使用 CSS 变量
<div style={{ backgroundColor: 'var(--dq-surface)' }}>

// ❌ 不推荐：硬编码颜色
<div className="bg-gray-100 text-gray-900">
```

**颜色映射表**：
| 旧 CSS 变量 | 新 Tailwind 类名 | 用途 |
|------------|-----------------|------|
| `var(--dq-surface)` | `bg-surface` | 卡片背景 |
| `var(--dq-text-primary)` | `text-foreground` | 主要文本 |
| `var(--dq-text-secondary)` | `text-muted-foreground` | 次要文本 |
| `var(--dq-accent-primary)` | `bg-primary` | 主色调 |
| `var(--dq-border-subtle)` | `border-border` | 边框 |

### 4.2 间距系统

**统一间距**：
```jsx
// 卡片内边距
<Card className="p-6">

// 元素间距
<div className="space-y-4">

// Flex 间距
<div className="flex gap-3">

// Grid 间距
<div className="grid grid-cols-2 gap-4">
```

### 4.3 圆角系统

**统一圆角**：
```jsx
// 小圆角（按钮、输入框）
<Button className="rounded-md">

// 中圆角（标签页）
<div className="rounded-lg">

// 大圆角（卡片）
<Card className="rounded-xl">

// 超大圆角（大卡片）
<div className="rounded-2xl">
```

### 4.4 阴影系统

**统一阴影**：
```jsx
// 小阴影（卡片）
<Card className="shadow-sm">

// 中阴影（悬浮卡片）
<div className="shadow-md">

// 大阴影（对话框）
<Dialog className="shadow-2xl">
```

## 五、可访问性设计

### 5.1 键盘导航

**Tab 顺序**：
1. 所有可交互元素可通过 Tab 键访问
2. 使用 `tabIndex` 控制顺序
3. 使用 `aria-label` 提供标签

**快捷键**：
- `Enter/Space`: 触发按钮
- `Esc`: 关闭对话框
- `Arrow Keys`: 导航 Tabs

### 5.2 屏幕阅读器

**ARIA 属性**：
```jsx
// 按钮
<Button aria-label="保存数据库连接">
  保存
</Button>

// 输入框
<Label htmlFor="host">主机地址</Label>
<Input
  id="host"
  aria-describedby="host-error"
  aria-invalid={!!error}
/>
{error && <p id="host-error" className="text-sm text-error">{error}</p>}

// 对话框
<Dialog>
  <DialogContent aria-describedby="dialog-description">
    <DialogTitle>确认删除</DialogTitle>
    <DialogDescription id="dialog-description">
      此操作无法撤销
    </DialogDescription>
  </DialogContent>
</Dialog>
```

### 5.3 焦点管理

**焦点陷阱**：
- Dialog 打开时焦点移到第一个可交互元素
- Dialog 关闭时焦点返回触发元素
- 使用 `focus-visible` 显示焦点环

**焦点样式**：
```jsx
<Button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
  按钮
</Button>
```

## 六、性能优化

### 6.1 代码分割

**懒加载组件**：
```jsx
// 懒加载 Dialog
const DeleteDialog = lazy(() => import('./DeleteDialog'));

// 使用
<Suspense fallback={<div>Loading...</div>}>
  <DeleteDialog />
</Suspense>
```

### 6.2 记忆化

**使用 React.memo**：
```jsx
const Button = React.memo(
  React.forwardRef(({ className, variant, size, ...props }, ref) => {
    // ...
  })
);
```

**使用 useMemo**：
```jsx
const buttonClasses = useMemo(
  () => cn(buttonVariants({ variant, size, className })),
  [variant, size, className]
);
```

### 6.3 包体积优化

**Tree Shaking**：
- 只导入使用的组件
- 使用 ES modules
- 避免导入整个库

**示例**：
```jsx
// ✅ 推荐（新布局）
import { Button } from '@/new/components/ui/button';

// ❌ 不推荐
import * as UI from '@/new/components/ui';
```

## 七、测试策略

### 7.1 单元测试

**测试 Button 组件**：
```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  test('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
  
  test('handles click events', () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
  
  test('applies variant classes', () => {
    const { container } = render(<Button variant="outline">Click me</Button>);
    expect(container.firstChild).toHaveClass('border');
  });
});
```

### 7.2 集成测试

**测试 DatabaseForm**：
```jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DatabaseForm from './DatabaseForm';

describe('DatabaseForm', () => {
  test('switches database types', async () => {
    render(<DatabaseForm />);
    
    // 点击 PostgreSQL 标签
    fireEvent.click(screen.getByText('PostgreSQL'));
    
    // 验证端口默认值变为 5432
    await waitFor(() => {
      expect(screen.getByPlaceholderText('5432')).toBeInTheDocument();
    });
  });
  
  test('validates required fields', async () => {
    const onSave = jest.fn();
    render(<DatabaseForm onSave={onSave} />);
    
    // 点击保存按钮
    fireEvent.click(screen.getByText('保存'));
    
    // 验证显示错误提示
    await waitFor(() => {
      expect(screen.getByText(/请填写/)).toBeInTheDocument();
    });
    
    // 验证未调用 onSave
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

### 7.3 可访问性测试

**使用 jest-axe**：
```jsx
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Button } from './button';

expect.extend(toHaveNoViolations);

describe('Button accessibility', () => {
  test('should not have accessibility violations', async () => {
    const { container } = render(<Button>Click me</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

## 八、文档和示例

### 8.1 组件文档

**Storybook 示例**：
```jsx
// Button.stories.jsx
export default {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link']
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon']
    }
  }
};

export const Default = {
  args: {
    children: 'Button'
  }
};

export const Outline = {
  args: {
    variant: 'outline',
    children: 'Outline Button'
  }
};

export const WithIcon = {
  args: {
    children: (
      <>
        <Settings className="mr-2 h-4 w-4" />
        Settings
      </>
    )
  }
};
```

### 8.2 使用指南

**README.md**：
```markdown
# shadcn/ui 组件使用指南

## 安装

\`\`\`bash
npm install class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-dialog
\`\`\`

## 使用

\`\`\`jsx
import { Button } from '@/new/components/ui/button';

function App() {
  return <Button>Click me</Button>;
}
\`\`\`

## 变体

- `default`: 主按钮
- `outline`: 次要按钮
- `ghost`: 幽灵按钮
- `destructive`: 危险操作按钮

## 示例

查看 Storybook 获取更多示例。
```

## 九、总结

### 9.1 关键决策

1. **使用 shadcn/ui 而非自建组件库** - 减少维护成本，获得社区支持
2. **基于 Radix UI** - 确保可访问性和键盘导航
3. **使用 Tailwind 语义化类名** - 保持设计系统一致性
4. **渐进式迁移** - 先迁移基础组件，再迁移复杂组件

### 9.2 预期收益

- ✅ 统一的设计系统
- ✅ 更好的可访问性
- ✅ 更少的自定义代码
- ✅ 更好的开发体验
- ✅ 社区支持和文档

### 9.3 风险和缓解

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 包体积增加 | 中 | Tree shaking, 代码分割 |
| 学习曲线 | 低 | 提供文档和示例 |
| 迁移成本 | 中 | 渐进式迁移，保持功能不变 |
| 兼容性问题 | 低 | 充分测试，保持 CSS 变量映射 |
