---
inclusion: fileMatch
fileMatchPattern: ['frontend/src/new/**/*.tsx', 'frontend/src/new/**/*.jsx']
---

# Shadcn/UI 组件使用标准

## 🎯 核心原则

### 1. 架构隔离原则
- **完全隔离**: 新旧布局完全分离，避免混淆和冲突
- **目录隔离**: shadcn/ui 组件仅在 `frontend/src/new/components/ui/` 目录下
- **导入隔离**: 新布局组件只能导入 `@/new/components/ui/*`，禁止导入 MUI 组件
- **样式隔离**: 新布局使用 Tailwind CSS + shadcn/ui，旧布局使用 MUI + modern.css

## 📁 目录结构规范

### ✅ 正确的结构
```
frontend/src/
├── new/                            # 新布局（shadcn/ui）
│   ├── components/
│   │   └── ui/                     # shadcn/ui 组件（仅新布局使用）
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       ├── form.tsx
│   │       ├── command.tsx
│   │       └── ...
│   ├── Layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── PageShell.tsx
│   └── DataSource/
│       ├── DatabaseForm.tsx
│       └── UploadPanel.tsx
│
└── components/                     # 旧布局（MUI）
    ├── QueryBuilder/
    └── Results/
```

### ❌ 禁止的结构
```
frontend/src/
├── components/
│   ├── ui/                         # ❌ shadcn/ui 在全局目录
│   │   └── button.tsx
│   ├── QueryBuilder/               # ❌ 新旧混淆
│   └── Results/
```

## 🔒 导入规范

### 新布局组件导入（必须遵守）
```tsx
// ✅ 正确：使用 shadcn/ui 组件
import { Button } from '@/new/components/ui/button';
import { Card } from '@/new/components/ui/card';
import { Input } from '@/new/components/ui/input';
import { Form } from '@/new/components/ui/form';

// ✅ 正确：使用 lucide-react 图标
import { Home, Database, Settings } from 'lucide-react';

// ✅ 正确：使用全局工具
import { cn } from '@/lib/utils';

// ❌ 错误：不要在新布局中使用 MUI
import { Button } from '@mui/material';  // ❌ 禁止
```

### 旧布局组件导入（保持不变）
```jsx
// ✅ 正确：继续使用 MUI
import { Button, TextField } from '@mui/material';

// ❌ 错误：不要在旧布局中使用 shadcn/ui
import { Button } from '@/new/components/ui/button';  // ❌ 禁止
```

## 🎨 Shadcn/UI 组件使用规范

### 1. Button 组件
```tsx
import { Button } from '@/new/components/ui/button';

// 主按钮
<Button variant="default">确认</Button>

// 次要按钮
<Button variant="outline">取消</Button>

// 危险按钮
<Button variant="destructive">删除</Button>

// 幽灵按钮
<Button variant="ghost">更多</Button>

// 尺寸变体
<Button size="sm">小按钮</Button>
<Button size="default">默认</Button>
<Button size="lg">大按钮</Button>
<Button size="icon"><Settings /></Button>
```

### 2. Card 组件
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/new/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
    <CardDescription>描述文本</CardDescription>
  </CardHeader>
  <CardContent>
    {/* 内容 */}
  </CardContent>
  <CardFooter>
    {/* 底部操作 */}
  </CardFooter>
</Card>
```

### 3. Form 组件（配合 react-hook-form）
```tsx
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/new/components/ui/form';
import { Input } from '@/new/components/ui/input';
import { useForm } from 'react-hook-form';

const form = useForm();

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="username"
      render={({ field }) => (
        <FormItem>
          <FormLabel>用户名</FormLabel>
          <FormControl>
            <Input placeholder="请输入用户名" {...field} />
          </FormControl>
          <FormDescription>这是你的公开显示名称</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

### 4. Command 组件（命令面板）
```tsx
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/new/components/ui/command';

<Command>
  <CommandInput placeholder="搜索..." />
  <CommandList>
    <CommandEmpty>未找到结果</CommandEmpty>
    <CommandGroup heading="建议">
      <CommandItem>选项 1</CommandItem>
      <CommandItem>选项 2</CommandItem>
    </CommandGroup>
  </CommandList>
</Command>
```

### 5. Dialog 组件
```tsx
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/new/components/ui/dialog';

<Dialog>
  <DialogTrigger asChild>
    <Button>打开对话框</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>标题</DialogTitle>
      <DialogDescription>描述文本</DialogDescription>
    </DialogHeader>
    {/* 内容 */}
  </DialogContent>
</Dialog>
```

### 6. Select 组件
```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/new/components/ui/select';

<Select>
  <SelectTrigger>
    <SelectValue placeholder="请选择" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">选项 1</SelectItem>
    <SelectItem value="option2">选项 2</SelectItem>
  </SelectContent>
</Select>
```

### 7. Tooltip 组件
```tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/new/components/ui/tooltip';

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Settings />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>设置</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

## 🔧 TypeScript 使用规范

### 1. 组件 Props 类型定义
```tsx
interface DatabaseFormProps {
  onSubmit: (data: DatabaseConfig) => void;
  initialData?: DatabaseConfig;
  isLoading?: boolean;
}

export function DatabaseForm({ onSubmit, initialData, isLoading = false }: DatabaseFormProps) {
  // 组件实现
}
```

### 2. 表单数据类型定义
```tsx
import { z } from 'zod';

const formSchema = z.object({
  host: z.string().min(1, '主机地址不能为空'),
  port: z.number().min(1).max(65535),
  database: z.string().min(1, '数据库名不能为空'),
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;
```

### 3. API 响应类型定义
```tsx
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface Table {
  name: string;
  type: string;
  row_count: number;
}

const response: ApiResponse<Table[]> = await fetchTables();
```

## 🎯 可访问性规范

### 1. 键盘导航
- 所有交互元素必须支持键盘操作
- 使用 `Tab` 键导航
- 使用 `Enter` / `Space` 激活
- 使用 `Esc` 关闭对话框/下拉菜单

### 2. ARIA 属性
```tsx
// ✅ 正确：使用 aria-label
<Button variant="ghost" size="icon" aria-label="设置">
  <Settings />
</Button>

// ✅ 正确：使用 aria-describedby
<Input
  id="username"
  aria-describedby="username-description"
/>
<p id="username-description">请输入你的用户名</p>
```

### 3. Focus 管理
```tsx
// ✅ 正确：对话框打开时自动聚焦
<DialogContent>
  <Input autoFocus />
</DialogContent>

// ✅ 正确：使用 asChild 保持 focus
<TooltipTrigger asChild>
  <Button>悬停查看</Button>
</TooltipTrigger>
```

## 🚫 禁止的做法

### 1. 禁止混用组件库
```tsx
// ❌ 错误：在新布局中混用 MUI
import { Button } from '@/new/components/ui/button';
import { TextField } from '@mui/material';  // ❌ 禁止

// ✅ 正确：统一使用 shadcn/ui
import { Button } from '@/new/components/ui/button';
import { Input } from '@/new/components/ui/input';
```

### 2. 禁止直接修改 shadcn/ui 组件
```tsx
// ❌ 错误：直接修改 button.tsx
// 如需自定义，应该创建新的变体或包装组件

// ✅ 正确：创建包装组件
export function PrimaryButton(props: ButtonProps) {
  return <Button variant="default" {...props} />;
}
```

### 3. 禁止硬编码样式
```tsx
// ❌ 错误：硬编码颜色
<Button style={{ backgroundColor: '#3b82f6' }}>按钮</Button>

// ✅ 正确：使用 Tailwind 类名
<Button className="bg-primary">按钮</Button>
```

### 4. 禁止忽略可访问性
```tsx
// ❌ 错误：图标按钮没有 aria-label
<Button variant="ghost" size="icon">
  <Settings />
</Button>

// ✅ 正确：添加 aria-label
<Button variant="ghost" size="icon" aria-label="设置">
  <Settings />
</Button>
```

## 📋 代码审查检查清单

### 组件使用
- [ ] 是否使用了正确的 shadcn/ui 组件？
- [ ] 是否避免了混用 MUI 组件？
- [ ] 是否使用了正确的导入路径（`@/new/components/ui/*`）？

### TypeScript
- [ ] 是否定义了 Props 类型？
- [ ] 是否使用了 zod 进行表单验证？
- [ ] 是否定义了 API 响应类型？

### 可访问性
- [ ] 图标按钮是否有 aria-label？
- [ ] 表单字段是否有 label？
- [ ] 对话框是否支持 Esc 关闭？
- [ ] 是否支持键盘导航？

### 样式
- [ ] 是否使用了 Tailwind 类名而非硬编码样式？
- [ ] 是否使用了语义化类名（`bg-surface`、`text-foreground`）？
- [ ] 是否支持深色模式？

## 🎉 最佳实践

### 1. 组件组合
```tsx
// ✅ 好的做法：组合使用 shadcn/ui 组件
<Card>
  <CardHeader>
    <CardTitle>数据库连接</CardTitle>
  </CardHeader>
  <CardContent>
    <Form {...form}>
      <FormField
        name="host"
        render={({ field }) => (
          <FormItem>
            <FormLabel>主机地址</FormLabel>
            <FormControl>
              <Input {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </Form>
  </CardContent>
  <CardFooter>
    <Button type="submit">连接</Button>
  </CardFooter>
</Card>
```

### 2. 状态管理
```tsx
// ✅ 好的做法：使用 TanStack Query 管理服务端状态
import { useQuery } from '@tanstack/react-query';

const { data: tables, isLoading } = useQuery({
  queryKey: ['tables'],
  queryFn: fetchTables,
});
```

### 3. 错误处理
```tsx
// ✅ 好的做法：使用 toast 显示错误
import { toast } from 'sonner';

try {
  await submitForm(data);
  toast.success('保存成功');
} catch (error) {
  toast.error('保存失败：' + error.message);
}
```

## 📚 参考资源

- [Shadcn/UI 官方文档](https://ui.shadcn.com/)
- [Radix UI 文档](https://www.radix-ui.com/)
- [Tailwind CSS 文档](https://tailwindcss.com/)
- [React Hook Form 文档](https://react-hook-form.com/)
- [Zod 文档](https://zod.dev/)

---

**版本**: 1.0  
**创建时间**: 2024-12-02  
**适用范围**: `frontend/src/new/` 目录下所有组件  
**状态**: ✅ 标准规范
