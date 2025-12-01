# 技术栈优化建议

## 一、当前技术栈审查

### 1.1 已确定使用的库

| 功能 | 当前方案 | 状态 | 评分 |
|-----|---------|------|------|
| UI 组件库 | shadcn/ui + Radix UI | ✅ 最佳选择 | ⭐⭐⭐⭐⭐ |
| 样式系统 | Tailwind CSS | ✅ 最佳选择 | ⭐⭐⭐⭐⭐ |
| 拖拽排序 | @dnd-kit | ✅ 最佳选择 | ⭐⭐⭐⭐⭐ |
| SQL 编辑器 | CodeMirror 6 | ✅ 最佳选择 | ⭐⭐⭐⭐⭐ |
| 数据表格 | AG Grid | ✅ 最佳选择 | ⭐⭐⭐⭐⭐ |
| 国际化 | react-i18next | ✅ 最佳选择 | ⭐⭐⭐⭐⭐ |
| HTTP 客户端 | axios | ✅ 最佳选择 | ⭐⭐⭐⭐⭐ |
| 可调整面板 | react-resizable-panels | ✅ 推荐使用 | ⭐⭐⭐⭐⭐ |

### 1.2 需要优化的部分

| 功能 | 当前方案 | 问题 | 推荐方案 | 优势 |
|-----|---------|------|---------|------|
| 表单管理 | 手动 useState | 代码重复、验证复杂 | **react-hook-form** | 性能好、验证简单 |
| 虚拟滚动 | react-window | 功能有限 | **@tanstack/react-virtual** | 更强大、更灵活 |
| 状态管理 | 自定义 Hooks | 可能不够用 | **Zustand**（可选） | 简单、轻量 |
| 日期选择 | 无 | 需要自己实现 | **date-fns** + shadcn DatePicker | 轻量、功能完善 |
| Toast 通知 | 自定义 ToastContext | 功能有限 | **sonner** | 更美观、更强大 |
| 命令面板 | 无 | 缺少快捷操作 | **cmdk** | 提升用户体验 |
| 数据获取 | axios + 手动管理 | 缓存、重试复杂 | **@tanstack/react-query** | 自动缓存、重试 |

## 二、推荐的技术栈优化

### 2.1 表单管理：react-hook-form

#### 为什么需要

**当前问题**：
```jsx
// ❌ 手动管理表单状态（DatabaseForm.jsx）
const [name, setName] = useState('');
const [host, setHost] = useState('localhost');
const [port, setPort] = useState('3306');
const [database, setDatabase] = useState('');
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
const [error, setError] = useState('');

const validate = () => {
  if (!name.trim()) {
    setError('请输入连接名称');
    return false;
  }
  if (!host.trim()) {
    setError('请输入主机地址');
    return false;
  }
  // ... 更多验证
};
```

**问题**：
- 代码重复（每个字段都要 useState）
- 验证逻辑复杂
- 性能差（每次输入都重渲染）
- 难以维护

#### 推荐方案

```bash
npm install react-hook-form @hookform/resolvers zod
```

```jsx
// ✅ 使用 react-hook-form + zod
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const databaseFormSchema = z.object({
  name: z.string().min(1, '请输入连接名称'),
  host: z.string().min(1, '请输入主机地址'),
  port: z.number().min(1).max(65535),
  database: z.string().min(1, '请输入数据库名'),
  username: z.string().min(1, '请输入用户名'),
  password: z.string()
});

function DatabaseForm({ onSave }) {
  const form = useForm({
    resolver: zodResolver(databaseFormSchema),
    defaultValues: {
      name: '',
      host: 'localhost',
      port: 3306,
      database: '',
      username: '',
      password: ''
    }
  });
  
  const onSubmit = (data) => {
    onSave(data);
  };
  
  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">连接名称</Label>
          <Input
            id="name"
            {...form.register('name')}
            aria-invalid={!!form.formState.errors.name}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-error">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        
        <div>
          <Label htmlFor="host">主机地址</Label>
          <Input
            id="host"
            {...form.register('host')}
          />
          {form.formState.errors.host && (
            <p className="text-sm text-error">
              {form.formState.errors.host.message}
            </p>
          )}
        </div>
        
        {/* 更多字段... */}
        
        <Button type="submit" disabled={form.formState.isSubmitting}>
          保存
        </Button>
      </div>
    </form>
  );
}
```

**优势**：
- ✅ 代码量减少 50%
- ✅ 性能优秀（非受控组件）
- ✅ 验证简单（zod schema）
- ✅ 类型安全
- ✅ 与 shadcn/ui 完美集成

### 2.2 虚拟滚动：@tanstack/react-virtual

#### 为什么需要

**当前问题**：
```jsx
// ❌ react-window 功能有限
import { FixedSizeList } from 'react-window';

// 只支持固定高度
<FixedSizeList
  height={600}
  itemCount={tables.length}
  itemSize={35}  // 必须固定
  width="100%"
>
  {Row}
</FixedSizeList>
```

**问题**：
- 只支持固定高度
- 不支持动态高度
- 不支持水平滚动
- 不支持网格布局

#### 推荐方案

```bash
npm install @tanstack/react-virtual
```

```jsx
// ✅ @tanstack/react-virtual 更强大
import { useVirtualizer } from '@tanstack/react-virtual';

function TableList({ tables }) {
  const parentRef = useRef(null);
  
  const virtualizer = useVirtualizer({
    count: tables.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,  // 估算高度，支持动态
    overscan: 5
  });
  
  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <TableItem table={tables[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

**优势**：
- ✅ 支持动态高度
- ✅ 支持水平/垂直/网格
- ✅ 性能更好
- ✅ API 更灵活
- ✅ TypeScript 支持

### 2.3 Toast 通知：sonner

#### 为什么需要

**当前问题**：
```jsx
// ❌ 自定义 ToastContext 功能有限
const { showSuccess, showError } = useToast();
showSuccess('保存成功');
```

**问题**：
- 功能简单
- 样式不够美观
- 缺少进度条、加载状态
- 缺少操作按钮

#### 推荐方案

```bash
npm install sonner
```

```jsx
// ✅ sonner 更强大
import { toast, Toaster } from 'sonner';

// 在 App 根组件
function App() {
  return (
    <>
      <Toaster position="top-right" />
      {/* 其他内容 */}
    </>
  );
}

// 使用
toast.success('保存成功');
toast.error('保存失败');
toast.loading('保存中...');

// 带操作按钮
toast('数据已删除', {
  action: {
    label: '撤销',
    onClick: () => console.log('撤销删除')
  }
});

// Promise 自动处理
toast.promise(
  saveData(),
  {
    loading: '保存中...',
    success: '保存成功',
    error: '保存失败'
  }
);
```

**优势**：
- ✅ 更美观的设计
- ✅ 支持 Promise
- ✅ 支持操作按钮
- ✅ 支持加载状态
- ✅ 与 shadcn/ui 风格一致

### 2.4 数据获取：@tanstack/react-query

#### 为什么需要

**当前问题**：
```jsx
// ❌ 手动管理数据获取
const [tables, setTables] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);

useEffect(() => {
  const fetchTables = async () => {
    setLoading(true);
    try {
      const data = await getDuckDBTables();
      setTables(data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  
  fetchTables();
}, []);

// 需要手动刷新
const handleRefresh = () => {
  fetchTables();
};
```

**问题**：
- 代码重复
- 无缓存机制
- 无自动重试
- 无后台刷新
- 难以管理多个请求

#### 推荐方案

```bash
npm install @tanstack/react-query
```

```jsx
// ✅ react-query 自动管理
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// 在 App 根组件
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* 其他内容 */}
    </QueryClientProvider>
  );
}

// 使用
function DataSourcePanel() {
  const { data: tables, isLoading, error, refetch } = useQuery({
    queryKey: ['tables'],
    queryFn: getDuckDBTables,
    staleTime: 5 * 60 * 1000,  // 5分钟内不重新请求
    retry: 3  // 失败自动重试3次
  });
  
  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      <Button onClick={() => refetch()}>刷新</Button>
      <TableList tables={tables} />
    </div>
  );
}

// Mutation（修改数据）
function DatabaseForm() {
  const queryClient = useQueryClient();
  
  const mutation = useMutation({
    mutationFn: saveDatabase,
    onSuccess: () => {
      // 自动刷新表列表
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('保存成功');
    }
  });
  
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      mutation.mutate(formData);
    }}>
      {/* 表单内容 */}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  );
}
```

**优势**：
- ✅ 自动缓存
- ✅ 自动重试
- ✅ 后台刷新
- ✅ 乐观更新
- ✅ 代码量减少 70%
- ✅ DevTools 支持

### 2.5 命令面板：cmdk

#### 为什么需要

**用户体验提升**：
- 快速搜索表
- 快速切换查询模式
- 快速执行操作
- 键盘快捷键

#### 推荐方案

```bash
npm install cmdk
```

```jsx
// ✅ 添加命令面板
import { Command } from 'cmdk';

function CommandPalette() {
  const [open, setOpen] = useState(false);
  
  // Cmd+K 打开
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);
  
  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input placeholder="搜索..." />
      <Command.List>
        <Command.Empty>未找到结果</Command.Empty>
        
        <Command.Group heading="查询模式">
          <Command.Item onSelect={() => setQueryMode('visual')}>
            <Eye className="mr-2 h-4 w-4" />
            可视化查询
          </Command.Item>
          <Command.Item onSelect={() => setQueryMode('sql')}>
            <Code className="mr-2 h-4 w-4" />
            SQL 查询
          </Command.Item>
        </Command.Group>
        
        <Command.Group heading="数据表">
          {tables.map(table => (
            <Command.Item
              key={table.id}
              onSelect={() => selectTable(table)}
            >
              <Database className="mr-2 h-4 w-4" />
              {table.name}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

**优势**：
- ✅ 提升用户体验
- ✅ 快速操作
- ✅ 键盘友好
- ✅ 搜索功能

### 2.6 日期处理：date-fns

#### 为什么需要

**场景**：
- 查询历史时间显示
- 数据源创建时间
- 任务执行时间

#### 推荐方案

```bash
npm install date-fns
```

```jsx
// ✅ date-fns 轻量且强大
import { format, formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// 格式化时间
format(new Date(), 'yyyy-MM-dd HH:mm:ss');
// "2024-01-15 14:30:00"

// 相对时间
formatDistanceToNow(new Date(task.createdAt), {
  addSuffix: true,
  locale: zhCN
});
// "3 分钟前"
```

**优势**：
- ✅ 轻量（相比 moment.js）
- ✅ Tree-shakable
- ✅ 不可变
- ✅ 功能完善

### 2.7 状态管理：Zustand（可选）

#### 何时需要

**场景**：
- 跨多层组件共享状态
- 全局配置管理
- 用户偏好设置

#### 推荐方案

```bash
npm install zustand
```

```jsx
// ✅ Zustand 简单轻量
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAppStore = create(
  persist(
    (set) => ({
      // 状态
      queryMode: 'visual',
      selectedTables: [],
      userPreferences: {
        theme: 'light',
        language: 'zh',
        defaultLimit: 100
      },
      
      // 操作
      setQueryMode: (mode) => set({ queryMode: mode }),
      selectTable: (table) => set((state) => ({
        selectedTables: [...state.selectedTables, table]
      })),
      updatePreferences: (prefs) => set((state) => ({
        userPreferences: { ...state.userPreferences, ...prefs }
      }))
    }),
    {
      name: 'app-storage'  // localStorage key
    }
  )
);

// 使用
function QueryWorkbench() {
  const { queryMode, setQueryMode } = useAppStore();
  
  return (
    <QueryModeSelector value={queryMode} onChange={setQueryMode} />
  );
}
```

**优势**：
- ✅ 极简 API
- ✅ 无需 Provider
- ✅ 支持持久化
- ✅ DevTools 支持
- ✅ 包体积小（~1KB）

**何时使用**：
- 状态需要跨 3+ 层组件
- 需要持久化用户偏好
- 自定义 Hooks 不够用

## 三、最终推荐技术栈

### 3.1 核心依赖（必须）

```json
{
  "dependencies": {
    // UI 框架
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    
    // UI 组件
    "@radix-ui/react-*": "latest",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "lucide-react": "^0.554.0",
    
    // 布局
    "react-resizable-panels": "^2.0.0",
    
    // 表单
    "react-hook-form": "^7.49.0",
    "@hookform/resolvers": "^3.3.0",
    "zod": "^3.22.0",
    
    // 拖拽
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    
    // 编辑器
    "codemirror": "^6.0.2",
    "@codemirror/*": "latest",
    
    // 表格
    "ag-grid-react": "^34.3.1",
    
    // 虚拟滚动
    "@tanstack/react-virtual": "^3.0.0",
    
    // 数据获取
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.13.2",
    
    // 通知
    "sonner": "^1.3.0",
    
    // 国际化
    "react-i18next": "^14.1.3",
    "i18next": "^23.16.8",
    
    // 日期
    "date-fns": "^3.0.0"
  }
}
```

### 3.2 可选依赖

```json
{
  "dependencies": {
    // 状态管理（可选）
    "zustand": "^4.4.0",
    
    // 命令面板（可选）
    "cmdk": "^0.2.0",
    
    // 图表（可选）
    "recharts": "^3.4.1"
  }
}
```

### 3.3 开发依赖

```json
{
  "devDependencies": {
    // 构建工具
    "vite": "^7.2.2",
    "@vitejs/plugin-react": "^5.1.1",
    
    // CSS
    "tailwindcss": "^3.4.15",
    "tailwindcss-animate": "^1.0.7",
    "autoprefixer": "^10.4.22",
    "postcss": "^8.5.6",
    
    // 代码质量
    "eslint": "^9.39.1",
    "typescript-eslint": "^8.47.0",
    
    // 测试
    "@testing-library/react": "^14.0.0",
    "@testing-library/jest-dom": "^6.0.0",
    "vitest": "^1.0.0"
  }
}
```

## 四、迁移优先级

### 🔴 高优先级（立即使用）

1. **react-resizable-panels** - 替代自己实现
2. **react-hook-form + zod** - 表单管理
3. **sonner** - 替代自定义 Toast

### 🟡 中优先级（建议使用）

4. **@tanstack/react-query** - 数据获取管理
5. **@tanstack/react-virtual** - 替代 react-window
6. **date-fns** - 日期处理

### 🟢 低优先级（可选）

7. **zustand** - 如果状态管理复杂
8. **cmdk** - 提升用户体验

## 五、总结

### 5.1 核心原则

**"不要重复造轮子"**
- ✅ 使用成熟的库
- ✅ 节省开发时间
- ✅ 降低维护成本
- ✅ 获得社区支持

### 5.2 选择标准

1. **成熟度** - 生产环境验证
2. **维护性** - 活跃维护
3. **包体积** - 合理大小
4. **文档** - 完善文档
5. **社区** - 活跃社区

### 5.3 下一步

1. 更新 `package.json` 添加推荐依赖
2. 更新 `tasks.md` 添加集成任务
3. 更新实现文档使用推荐库
4. 开始实施迁移

需要我帮你更新相关文档吗？
