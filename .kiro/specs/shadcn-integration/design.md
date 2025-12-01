# shadcn/ui 集成设计文档

## 一、架构设计

### 1.1 整体架构

```
frontend/src/
├── lib/
│   └── utils.js                    # cn() 工具函数
│
├── components/ui/                  # shadcn/ui 组件库
│   ├── button.jsx                  # Button 组件
│   ├── card.jsx                    # Card 组件
│   ├── input.jsx                   # Input, Label, Textarea
│   ├── tabs.jsx                    # Tabs 组件（Radix UI）
│   ├── dialog.jsx                  # Dialog 组件（Radix UI）
│   ├── select.jsx                  # Select 组件（Radix UI）
│   ├── dropdown-menu.jsx           # DropdownMenu 组件（Radix UI）
│   └── progress.jsx                # Progress 组件
│
├── new/                            # 新布局（使用 shadcn/ui）
│   ├── Layout/
│   │   ├── Sidebar.jsx             # ✅ 使用 Button
│   │   ├── Header.jsx              # ✅ 使用 Button
│   │   └── PageShell.jsx           # ✅ 保持不变
│   │
│   └── DataSource/
│       ├── DatabaseForm.jsx        # ✅ 使用 Card, Input, Label, Tabs, Button, Select
│       ├── UploadPanel.jsx         # ✅ 使用 Card, Button, Progress
│       ├── DataPasteCard.jsx       # ✅ 使用 Card, Textarea, Select, Button
│       ├── SavedConnectionsList.jsx # ✅ 使用 Card, Button, Dialog
│       ├── DataSourcePage.jsx      # ✅ 使用 Card
│       └── DataSourceTabs.jsx      # ✅ 使用 Tabs
│
└── components/                     # 旧布局（保持不变）
    └── ...
```

### 1.2 依赖关系

```mermaid
graph TD
    A[new/Layout/Sidebar.jsx] --> B[components/ui/button.jsx]
    C[new/DataSource/DatabaseForm.jsx] --> B
    C --> D[components/ui/card.jsx]
    C --> E[components/ui/input.jsx]
    C --> F[components/ui/tabs.jsx]
    C --> G[components/ui/select.jsx]
    
    B --> H[lib/utils.js]
    D --> H
    E --> H
    F --> H
    F --> I[@radix-ui/react-tabs]
    G --> J[@radix-ui/react-select]
```

## 二、组件设计

### 2.1 Button 组件

**设计原则**：
- 基于 `class-variance-authority` 管理变体
- 支持 `asChild` 模式（使用 Radix Slot）
- 支持 loading 状态
- 支持 icon 变体

**变体定义**：
```typescript
variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
size: 'default' | 'sm' | 'lg' | 'icon'
```

**使用示例**：
```jsx
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

## 三、迁移策略

### 3.1 迁移顺序

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
1. Sidebar.jsx
2. Header.jsx

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
// ✅ 推荐
import { Button } from '@/components/ui/button';

// ❌ 不推荐
import * as UI from '@/components/ui';
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
import { Button } from '@/components/ui/button';

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
