# 组件使用场景详解

## 🎯 DuckQuery 项目中的具体应用场景

### 1. Form 组件 - 表单封装

#### 📍 使用位置

**DatabaseForm.jsx** - 数据库连接表单
```jsx
// ✅ 使用 shadcn Form 组件
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    {/* MySQL 连接配置 */}
    <FormField
      control={form.control}
      name="host"
      render={({ field }) => (
        <FormItem>
          <FormLabel>主机地址</FormLabel>
          <FormControl>
            <Input placeholder="localhost" {...field} />
          </FormControl>
          <FormDescription>数据库服务器的 IP 或域名</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
    
    <FormField
      control={form.control}
      name="port"
      render={({ field }) => (
        <FormItem>
          <FormLabel>端口</FormLabel>
          <FormControl>
            <Input type="number" placeholder="3306" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    
    {/* 更多字段... */}
  </form>
</Form>
```

**优势**：
- ✅ 自动处理错误显示（不需要手动写 `{error && <p>{error}</p>}`）
- ✅ 自动处理 Label 关联（不需要手动写 `htmlFor`）
- ✅ 自动处理可访问性（aria-* 属性）
- ✅ 代码量减少 60%

**其他使用位置**：
- 查询构建器的筛选条件表单
- 用户设置表单
- 导出配置表单

---

### 2. Badge 组件 - 状态标签

#### 📍 使用位置

**SavedConnectionsList.jsx** - 显示数据库类型
```jsx
<div className="flex items-center gap-2">
  <Database className="h-4 w-4" />
  <span>生产环境数据库</span>
  <Badge variant="default">MySQL</Badge>
  <Badge variant="success">已连接</Badge>
</div>
```

**DataSourcePage.jsx** - 显示数据源状态
```jsx
<div className="flex items-center gap-2">
  <span>users.csv</span>
  <Badge variant="secondary">CSV</Badge>
  <Badge variant="outline">1.2 MB</Badge>
</div>
```

**AsyncTaskList.jsx** - 显示任务状态
```jsx
<div className="flex items-center gap-2">
  <span>查询任务 #123</span>
  {status === 'running' && <Badge variant="warning">运行中</Badge>}
  {status === 'completed' && <Badge variant="success">已完成</Badge>}
  {status === 'failed' && <Badge variant="destructive">失败</Badge>}
</div>
```

**QueryBuilder.jsx** - 显示表信息
```jsx
<div className="flex items-center gap-2">
  <span>orders</span>
  <Badge variant="outline">1.2M 行</Badge>
  <Badge variant="secondary">已索引</Badge>
</div>
```

**使用场景总结**：
- ✅ 数据库类型标识（MySQL、PostgreSQL、SQLite）
- ✅ 连接状态（已连接、断开、连接中）
- ✅ 任务状态（运行中、完成、失败）
- ✅ 文件类型（CSV、JSON、Parquet）
- ✅ 数据量标识（行数、文件大小）

---

### 3. Tooltip 组件 - 提示框

#### 📍 使用位置

**Sidebar.jsx** - 图标按钮提示
```jsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Home className="h-5 w-5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="right">
      <p>首页 (Cmd+H)</p>
    </TooltipContent>
  </Tooltip>
  
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Database className="h-5 w-5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="right">
      <p>数据源 (Cmd+D)</p>
    </TooltipContent>
  </Tooltip>
  
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon">
        <Settings className="h-5 w-5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="right">
      <p>设置 (Cmd+,)</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

**QueryBuilder.jsx** - 操作按钮提示
```jsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon">
      <Play className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>执行查询 (Cmd+Enter)</p>
  </TooltipContent>
</Tooltip>

<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon">
      <Save className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>保存查询 (Cmd+S)</p>
  </TooltipContent>
</Tooltip>
```

**DataTable.jsx** - 列操作提示
```jsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost" size="icon">
      <Filter className="h-4 w-4" />
    </Button>
  </TooltipTrigger>
  <TooltipContent>
    <p>筛选此列</p>
  </TooltipContent>
</Tooltip>
```

**使用场景总结**：
- ✅ Sidebar 图标按钮（显示功能名称 + 快捷键）
- ✅ 工具栏按钮（执行、保存、导出等）
- ✅ 表格操作按钮（筛选、排序、删除等）
- ✅ 状态指示器（解释图标含义）

---

### 4. Skeleton 组件 - 加载占位

#### 📍 使用位置

**DataSourcePage.jsx** - 数据源列表加载
```jsx
function DataSourcePage() {
  const { data: tables, isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: getDuckDBTables
  });
  
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  
  return <TableList tables={tables} />;
}
```

**SavedConnectionsList.jsx** - 连接列表加载
```jsx
if (isLoading) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}
```

**QueryResults.jsx** - 查询结果加载
```jsx
if (isLoading) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-full" /> {/* 表头 */}
      <Skeleton className="h-64 w-full" /> {/* 表格内容 */}
      <Skeleton className="h-8 w-32" /> {/* 分页 */}
    </div>
  );
}
```

**使用场景总结**：
- ✅ 数据源列表加载
- ✅ 连接列表加载
- ✅ 查询结果加载
- ✅ 表格数据加载
- ✅ 避免布局跳动，提升用户体验

---

### 5. Popover 组件 - 弹出面板

#### 📍 使用位置

**QueryBuilder.jsx** - 列筛选器
```jsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">
      <Filter className="mr-2 h-4 w-4" />
      筛选
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-80">
    <div className="space-y-4">
      <h4 className="font-medium">筛选条件</h4>
      <div className="space-y-2">
        <Label>列名</Label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="选择列" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">姓名</SelectItem>
            <SelectItem value="age">年龄</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>条件</Label>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="选择条件" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="eq">等于</SelectItem>
            <SelectItem value="gt">大于</SelectItem>
            <SelectItem value="lt">小于</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>值</Label>
        <Input placeholder="输入值" />
      </div>
      <Button className="w-full">应用筛选</Button>
    </div>
  </PopoverContent>
</Popover>
```

**DataTable.jsx** - 列设置
```jsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" size="sm">
      <Settings className="mr-2 h-4 w-4" />
      列设置
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-64">
    <div className="space-y-2">
      <h4 className="font-medium">显示列</h4>
      {columns.map(col => (
        <div key={col.id} className="flex items-center space-x-2">
          <Checkbox
            id={col.id}
            checked={col.visible}
            onCheckedChange={() => toggleColumn(col.id)}
          />
          <Label htmlFor={col.id}>{col.name}</Label>
        </div>
      ))}
    </div>
  </PopoverContent>
</Popover>
```

**Sidebar.jsx** - 用户菜单
```jsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="ghost" size="icon">
      <User className="h-5 w-5" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-56">
    <div className="space-y-2">
      <div className="px-2 py-1.5">
        <p className="text-sm font-medium">用户名</p>
        <p className="text-xs text-muted-foreground">user@example.com</p>
      </div>
      <Separator />
      <Button variant="ghost" className="w-full justify-start">
        <Settings className="mr-2 h-4 w-4" />
        设置
      </Button>
      <Button variant="ghost" className="w-full justify-start">
        <LogOut className="mr-2 h-4 w-4" />
        退出
      </Button>
    </div>
  </PopoverContent>
</Popover>
```

**使用场景总结**：
- ✅ 列筛选器（比 Dialog 更轻量）
- ✅ 列设置面板
- ✅ 用户菜单
- ✅ 快速操作面板
- ✅ 日期选择器（配合 date-fns）

---

### 6. Separator 组件 - 分隔线

#### 📍 使用位置

**Sidebar.jsx** - 导航分组
```jsx
<div className="space-y-2">
  <Button variant="ghost">首页</Button>
  <Button variant="ghost">数据源</Button>
  <Button variant="ghost">查询</Button>
  
  <Separator className="my-4" />
  
  <Button variant="ghost">设置</Button>
  <Button variant="ghost">帮助</Button>
</div>
```

**DatabaseForm.jsx** - 表单分组
```jsx
<Card>
  <CardHeader>
    <CardTitle>数据库连接</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    {/* 基本信息 */}
    <div className="space-y-2">
      <Label>连接名称</Label>
      <Input />
    </div>
    
    <Separator />
    
    {/* 连接配置 */}
    <div className="space-y-2">
      <Label>主机地址</Label>
      <Input />
    </div>
    
    <Separator />
    
    {/* 高级选项 */}
    <div className="space-y-2">
      <Label>连接池大小</Label>
      <Input />
    </div>
  </CardContent>
</Card>
```

**DropdownMenu** - 菜单分组
```jsx
<DropdownMenu>
  <DropdownMenuContent>
    <DropdownMenuItem>复制</DropdownMenuItem>
    <DropdownMenuItem>粘贴</DropdownMenuItem>
    
    <Separator />
    
    <DropdownMenuItem>删除</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

**使用场景总结**：
- ✅ Sidebar 导航分组
- ✅ 表单字段分组
- ✅ 菜单项分组
- ✅ 内容区域分隔

---

### 7. @tanstack/react-query - 数据获取管理

#### 📍 使用位置

**DataSourcePage.jsx** - 获取数据源列表
```jsx
function DataSourcePage() {
  // ✅ 自动缓存、自动重试、自动刷新
  const { data: tables, isLoading, error, refetch } = useQuery({
    queryKey: ['tables'],
    queryFn: getDuckDBTables,
    staleTime: 5 * 60 * 1000,  // 5分钟内不重新请求
    retry: 3  // 失败自动重试3次
  });
  
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      <Button onClick={() => refetch()}>刷新</Button>
      <TableList tables={tables} />
    </div>
  );
}
```

**SavedConnectionsList.jsx** - 获取已保存连接
```jsx
const { data: connections } = useQuery({
  queryKey: ['connections'],
  queryFn: getSavedConnections,
  staleTime: 10 * 60 * 1000
});
```

**DatabaseForm.jsx** - 保存连接（Mutation）
```jsx
function DatabaseForm() {
  const queryClient = useQueryClient();
  
  const mutation = useMutation({
    mutationFn: saveConnection,
    onSuccess: () => {
      // 自动刷新连接列表
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      // 自动刷新数据源列表
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('保存成功');
    },
    onError: (error) => {
      toast.error(`保存失败: ${error.message}`);
    }
  });
  
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      mutation.mutate(formData);
    }}>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? '保存中...' : '保存'}
      </Button>
    </form>
  );
}
```

**QueryBuilder.jsx** - 执行查询
```jsx
const queryMutation = useMutation({
  mutationFn: executeQuery,
  onSuccess: (data) => {
    setResults(data);
    toast.success('查询成功');
  }
});
```

**使用场景总结**：
- ✅ 获取数据源列表（自动缓存）
- ✅ 获取已保存连接（自动缓存）
- ✅ 保存连接（自动刷新相关数据）
- ✅ 执行查询（自动处理加载状态）
- ✅ 删除数据源（乐观更新）
- ✅ 上传文件（进度跟踪）

**优势**：
- ✅ 代码量减少 70%
- ✅ 自动缓存（不需要手动管理 `requestManager`）
- ✅ 自动重试（网络错误自动重试）
- ✅ 自动刷新（数据变更自动同步）

---

### 8. @tanstack/react-virtual - 虚拟滚动

#### 📍 使用位置

**DataSourcePage.jsx** - 大量数据源列表
```jsx
function DataSourceList({ tables }) {
  const parentRef = useRef(null);
  
  const virtualizer = useVirtualizer({
    count: tables.length,  // 假设有 10,000 个表
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,  // 每行高度
    overscan: 5
  });
  
  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
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

**QueryResults.jsx** - 大量查询结果
```jsx
// 假设查询返回 100,000 行数据
const virtualizer = useVirtualizer({
  count: results.length,
  getScrollElement: () => tableRef.current,
  estimateSize: () => 35,
  overscan: 10
});
```

**SavedConnectionsList.jsx** - 大量已保存连接
```jsx
// 假设有 1,000+ 个已保存连接
const virtualizer = useVirtualizer({
  count: connections.length,
  getScrollElement: () => listRef.current,
  estimateSize: () => 64
});
```

**使用场景总结**：
- ✅ 数据源列表（10,000+ 个表）
- ✅ 查询结果（100,000+ 行数据）
- ✅ 已保存连接列表（1,000+ 个连接）
- ✅ 历史查询列表（大量历史记录）

**优势**：
- ✅ 支持动态高度（react-window 不支持）
- ✅ 性能更好（只渲染可见行）
- ✅ 内存占用低（不渲染所有数据）

---

### 9. cmdk - 命令面板

#### 📍 使用位置

**全局命令面板** - Cmd+K 快捷操作
```jsx
function CommandPalette() {
  const [open, setOpen] = useState(false);
  
  // Cmd+K 打开
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
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
        
        {/* 快速导航 */}
        <Command.Group heading="导航">
          <Command.Item onSelect={() => navigate('/')}>
            <Home className="mr-2 h-4 w-4" />
            首页
          </Command.Item>
          <Command.Item onSelect={() => navigate('/datasource')}>
            <Database className="mr-2 h-4 w-4" />
            数据源
          </Command.Item>
          <Command.Item onSelect={() => navigate('/query')}>
            <Search className="mr-2 h-4 w-4" />
            查询
          </Command.Item>
        </Command.Group>
        
        {/* 快速搜索数据表 */}
        <Command.Group heading="数据表">
          {tables.map(table => (
            <Command.Item
              key={table.id}
              onSelect={() => selectTable(table)}
            >
              <Table className="mr-2 h-4 w-4" />
              {table.name}
              <Badge variant="outline" className="ml-auto">
                {table.rowCount} 行
              </Badge>
            </Command.Item>
          ))}
        </Command.Group>
        
        {/* 快速切换查询模式 */}
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
        
        {/* 快速操作 */}
        <Command.Group heading="操作">
          <Command.Item onSelect={() => executeQuery()}>
            <Play className="mr-2 h-4 w-4" />
            执行查询
            <kbd className="ml-auto">Cmd+Enter</kbd>
          </Command.Item>
          <Command.Item onSelect={() => saveQuery()}>
            <Save className="mr-2 h-4 w-4" />
            保存查询
            <kbd className="ml-auto">Cmd+S</kbd>
          </Command.Item>
          <Command.Item onSelect={() => exportResults()}>
            <Download className="mr-2 h-4 w-4" />
            导出结果
            <kbd className="ml-auto">Cmd+E</kbd>
          </Command.Item>
        </Command.Group>
        
        {/* 快速切换主题 */}
        <Command.Group heading="设置">
          <Command.Item onSelect={() => setTheme('light')}>
            <Sun className="mr-2 h-4 w-4" />
            浅色模式
          </Command.Item>
          <Command.Item onSelect={() => setTheme('dark')}>
            <Moon className="mr-2 h-4 w-4" />
            深色模式
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
```

**使用场景总结**：
- ✅ 快速导航（跳转到任意页面）
- ✅ 快速搜索数据表（从 10,000+ 个表中搜索）
- ✅ 快速切换查询模式
- ✅ 快速执行操作（执行查询、保存、导出）
- ✅ 快速切换主题/语言
- ✅ 显示快捷键提示

**优势**：
- ✅ 极大提升用户体验
- ✅ 键盘友好（不需要鼠标）
- ✅ 快速搜索（模糊匹配）
- ✅ 与 shadcn/ui 风格一致

---

## 📊 使用频率总结

### 🔴 高频使用（每个页面都会用到）

1. **Form 组件** - 所有表单（DatabaseForm、筛选器、设置）
2. **Badge 组件** - 所有列表（数据源、连接、任务）
3. **Tooltip 组件** - 所有图标按钮（Sidebar、工具栏、表格）
4. **Skeleton 组件** - 所有加载状态（列表、表格、卡片）

### 🟡 中频使用（部分页面会用到）

5. **Popover 组件** - 筛选器、设置面板、用户菜单
6. **Separator 组件** - 导航分组、表单分组、菜单分组

### 🟢 低频使用（特定场景）

7. **@tanstack/react-query** - 所有数据获取（但配置一次，全局使用）
8. **@tanstack/react-virtual** - 大数据量列表（10,000+ 行）
9. **cmdk** - 全局命令面板（配置一次，全局使用）

---

## 🎯 投资回报率（ROI）

### 最高 ROI
1. **Form 组件** - 减少 60% 表单代码，每个表单节省 2 小时
2. **@tanstack/react-query** - 减少 70% 数据获取代码，节省 5+ 小时
3. **Badge 组件** - 统一状态显示，提升用户体验

### 高 ROI
4. **Tooltip 组件** - 提升可用性，减少用户困惑
5. **Skeleton 组件** - 提升加载体验，避免布局跳动
6. **cmdk** - 极大提升用户体验，专业感

### 中 ROI
7. **Popover 组件** - 替代部分 Dialog，更轻量
8. **Separator 组件** - 统一分隔线样式
9. **@tanstack/react-virtual** - 仅在大数据量时有明显优势

---

## 💡 建议

基于使用频率和 ROI，建议优先级：

### 第一批（必须）
1. ✅ Form 组件
2. ✅ Badge 组件
3. ✅ Tooltip 组件
4. ✅ Skeleton 组件
5. ✅ @tanstack/react-query

### 第二批（强烈建议）
6. ✅ Popover 组件
7. ✅ Separator 组件
8. ✅ cmdk

### 第三批（按需）
9. 🟡 @tanstack/react-virtual（如果数据量 > 1000 行）

需要我更新 tasks.md 添加这些组件的创建任务吗？
