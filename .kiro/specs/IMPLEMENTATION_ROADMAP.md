# DuckQuery 实施路线图（优化版 - 避免返工）

## 🔥 核心原则：先打地基，再建房子

**避免返工的关键**：在创建任何组件前，先配置好 TypeScript + TanStack Query + shadcn/ui 基础设施。

---

## 📊 当前 Specs 状态

### 1. architecture-principles/ - 架构原则（参考文档）
**状态**：✅ 完成，仅供参考
**用途**：技术选型和架构决策的参考文档

**建议**：📖 **不需要实施，仅作为参考**

---

### 2. demo-double-click-fix/ - Demo 双击修复
**状态**：✅ 已完成

**建议**：✅ **已完成，无需再做**

---

### 3. shadcn-integration/ - shadcn/ui 集成（包含 TypeScript + TanStack Query）
**状态**：⚠️ 待实施
**用途**：一次性配置完整技术栈，避免后续返工
**文档**：
- `requirements.md` - 需求文档 ✅
- `design.md` - 设计文档 ✅
- `tasks.md` - 任务清单 ✅（已更新包含 TypeScript + TanStack Query + CMDK）
- `TECH_STACK_INTEGRATION.md` - 技术栈集成说明 ✅

**优先级**：🔴 **最高优先级**
**依赖**：无依赖，可以立即开始

**关键更新**：
- ✅ 已添加 TypeScript 配置（Day 1）
- ✅ 已添加 TanStack Query 配置（Day 3）
- ✅ 已添加 CMDK 集成（阶段 9）
- ✅ 所有新组件直接用 `.tsx` + `useQuery/useMutation`

---

### 4. demo-to-new-migration/ - Demo 迁移到新布局
**状态**：⚠️ 待实施
**用途**：将 demo 的功能迁移到 React 新布局
**文档**：
- `requirements.md` - 需求文档
- `IMPLEMENTATION_GUIDE.md` - 实施指南
- `MIGRATION_DETAILS.md` - 迁移细节

**优先级**：🟡 **中等优先级**
**依赖**：需要先完成 `shadcn-integration`

---

## 🎯 优化后的实施顺序（避免返工）

### Week 1: TypeScript 配置 + shadcn 基础设施 + TanStack Query (5天)

```
┌────────────────────────────────────────┐
│ Day 1: TypeScript + Vite 配置         │ ← 地基
├────────────────────────────────────────┤
│ - 安装 TypeScript 依赖                 │
│ - 配置 tsconfig.json (allowJs: true)  │
│ - 配置 Vite 支持 TypeScript            │
│ - 配置路径别名类型支持                  │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Day 2: shadcn 基础设施（用 TSX）       │
├────────────────────────────────────────┤
│ - 安装 shadcn/ui 依赖                  │
│ - 配置 Tailwind                        │
│ - 创建 cn() 工具函数                   │
│ - 配置 components.json                 │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Day 3: TanStack Query 配置             │ ← 在创建组件前配置
├────────────────────────────────────────┤
│ - 安装 @tanstack/react-query           │
│ - 创建 QueryProvider.tsx               │
│ - 配置 QueryClient                     │
│ - 添加 React Query DevTools            │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│ Day 4-5: shadcn 基础组件（TSX + Query）│
├────────────────────────────────────────┤
│ - 创建 Button, Card, Input, Select     │
│ - 创建 Tabs, Dialog, Progress          │
│ - 直接用 .tsx，不需要后续转换          │
└────────────────────────────────────────┘
```

**关键成果**：
- ✅ TypeScript 配置完成，支持 JS/TS 混用
- ✅ TanStack Query 配置完成，可以直接使用
- ✅ shadcn/ui 基础组件创建完成（TSX 格式）
- ✅ 后续所有组件都用 TSX + Query，不需要返工

---

### Week 2: shadcn 组件迁移（全部用 TSX + Query，不返工）(5天)

```
┌────────────────────────────────────────┐
│ DatabaseForm（用 Query 调用 API）      │
│ SavedConnectionsList（用 Query）       │
│ UploadPanel（用 Query）                │
└────────────────────────────────────────┘
```

**关键特点**：
- ✅ 直接创建 `.tsx` 文件
- ✅ 直接使用 `useMutation` 提交表单
- ✅ 直接使用 `useQuery` 获取数据
- ✅ 不需要后续转换，一次到位

---

### Week 3-5: demo-to-new-migration（全部用 TSX + Query）(15天)

```
┌────────────────────────────────────────┐
│ 查询构建器（用 Query）                  │
│ 结果面板（用 Query）                    │
│ 表管理（用 Query）                      │
└────────────────────────────────────────┘
```

**关键特点**：
- ✅ 所有新组件都是 TypeScript
- ✅ 所有数据获取都用 TanStack Query
- ✅ 统一的代码模式和最佳实践

---

### Week 6: CMDK 集成（此时数据已完整）(2天)

```
┌────────────────────────────────────────┐
│ Cmd+K 搜索表                           │
│ 快速切换连接                            │
│ 快捷操作                               │
└────────────────────────────────────────┘
```

**关键特点**：
- ✅ 数据来自 TanStack Query 缓存
- ✅ 完整的数据源支持
- ✅ 统一的命令模式

---

### Week 7+: 持续优化（不影响主线）

```
┌────────────────────────────────────────┐
│ 旧代码渐进式 TypeScript 迁移            │
│ （allowJs: true 允许共存）              │
└────────────────────────────────────────┘
```

---

## ⚠️ 为什么这个顺序避免返工？

### 问题 1: TypeScript 配置太晚 ❌

**旧顺序**：
```
Week 1: 创建 .jsx 组件
Week 2: 配置 TypeScript
Week 2: 转换所有 .jsx 为 .tsx  ← 返工 2-3 天
```

**新顺序**：
```
Day 1: 配置 TypeScript
Day 4+: 直接创建 .tsx 组件  ← 不需要返工
```

---

### 问题 2: TanStack Query 配置太晚 ❌

**旧顺序**：
```
Week 1-2: 用 useState + useEffect
Week 3: 配置 TanStack Query
Week 3: 重写所有数据获取逻辑  ← 返工 3-4 天
```

**新顺序**：
```
Day 3: 配置 TanStack Query
Day 4+: 直接用 useQuery/useMutation  ← 不需要返工
```

---

### 问题 3: CMDK 时机不对 ❌

**旧顺序**：
```
Week 6: 添加 CMDK
Week 6: 数据层可能不完整  ← 需要重构 1-2 天
```

**新顺序**：
```
Week 6: 添加 CMDK
Week 6: 数据来自 TanStack Query 缓存  ← 直接可用
```

---

## 📋 详细实施计划

### 🔴 Week 1: 基础设施一次性配置（立即开始）

#### Day 1: TypeScript + Vite 配置
```bash
# 任务清单
- [ ] 1.1. 配置 TypeScript (渐进式)
  - 安装 typescript @types/react @types/react-dom @types/node
  - 创建 tsconfig.json (allowJs: true)
  - 配置 Vite 支持 TypeScript
  - 配置路径别名 @/new/* 的类型支持
```

#### Day 2: shadcn 基础设施
```bash
# 任务清单
- [ ] 1. 安装依赖包
- [ ] 2. 创建 cn() 工具函数
- [ ] 3-6. 配置 shadcn/ui
```

#### Day 3: TanStack Query 配置
```bash
# 任务清单
- [ ] 1.2. 安装和配置 TanStack Query
  - 安装 @tanstack/react-query @tanstack/react-query-devtools
  - 创建 QueryProvider.tsx
  - 配置 QueryClient
  - 添加 React Query DevTools
  - 在新布局根组件中集成
```

#### Day 4-5: shadcn 基础组件（TSX + Query）
```bash
# 任务清单
- [ ] 7-20. 创建所有 shadcn/ui 组件
  - 直接用 .tsx 格式
  - 不需要后续转换
```

**预计时间**：5 个工作日
**关键里程碑**：
- ✅ Day 1: TypeScript 配置完成
- ✅ Day 3: TanStack Query 配置完成
- ✅ Day 5: 所有基础组件创建完成（TSX 格式）

---

### 🔴 Week 2: shadcn 组件迁移（全部用 TSX + Query）

#### Day 1-2: 布局组件迁移
```bash
- [ ] 21. 迁移 Sidebar 组件
  - 重命名为 Sidebar.tsx
  - 添加 TypeScript 类型定义
  - 使用 useQuery 获取数据
  
- [ ] 22. 迁移 Header 组件
  - 重命名为 Header.tsx
  - 添加 TypeScript 类型定义
```

#### Day 3-4: 数据源组件迁移
```bash
- [ ] 23. 迁移 DatabaseForm 组件
  - 重命名为 DatabaseForm.tsx
  - 添加 TypeScript 类型定义
  - 使用 useMutation 替换手动状态管理
  
- [ ] 24-28. 迁移其他组件
  - 全部用 .tsx 格式
  - 全部用 TanStack Query
```

#### Day 5: 测试和验证
```bash
- [ ] 30-35. 测试所有组件
  - 验证 TypeScript 类型
  - 验证 TanStack Query 缓存
  - 验证功能完整性
```

**预计时间**：5 个工作日

---

### 🟡 Week 3-5: demo-to-new-migration（全部用 TSX + Query）

#### Week 3: 查询构建器迁移（5天）
```typescript
// 示例：直接用 TypeScript + TanStack Query
interface QueryBuilderProps {
  tables: Table[];
  onQueryChange: (query: Query) => void;
}

export const QueryBuilder: React.FC<QueryBuilderProps> = ({ tables, onQueryChange }) => {
  const { data: columns } = useQuery({
    queryKey: ['columns', selectedTable],
    queryFn: () => getTableColumns(selectedTable)
  });
  
  // ...
};
```

#### Week 4: 结果面板迁移（5天）
```typescript
// 示例：直接用 TypeScript + TanStack Query
export const ResultPanel: React.FC<ResultPanelProps> = ({ query }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['queryResult', query],
    queryFn: () => executeQuery(query)
  });
  
  const exportMutation = useMutation({
    mutationFn: exportData,
    onSuccess: () => toast.success('导出成功')
  });
  
  // ...
};
```

#### Week 5: 表管理迁移（5天）
```typescript
// 示例：直接用 TypeScript + TanStack Query
export const TableManager: React.FC = () => {
  const { data: tables } = useQuery({
    queryKey: ['tables'],
    queryFn: getDuckDBTablesEnhanced
  });
  
  const deleteMutation = useMutation({
    mutationFn: deleteDuckDBTableEnhanced,
    onSuccess: () => queryClient.invalidateQueries(['tables'])
  });
  
  // ...
};
```

**预计时间**：15 个工作日

---

### 🟢 Week 6: CMDK 集成（2天）

#### Day 1: 安装和配置
```bash
- [ ] 33. 安装和配置 CMDK
  - 安装 cmdk
  - 创建 CommandPalette.tsx
  - 添加 Cmd+K / Ctrl+K 快捷键
```

#### Day 2: 实现命令功能
```typescript
// 示例：命令面板直接使用 TanStack Query 缓存
export const CommandPalette: React.FC = () => {
  const queryClient = useQueryClient();
  
  // 直接从缓存获取数据
  const tables = queryClient.getQueryData<Table[]>(['tables']) || [];
  
  const commands = [
    {
      id: 'search-table',
      label: '搜索表',
      action: (query: string) => {
        return tables.filter(t => t.name.includes(query));
      }
    },
    // ...
  ];
  
  // ...
};
```

**预计时间**：2 个工作日

---

## 🚀 立即开始的步骤

### 1. 打开 shadcn-integration 的 tasks.md

```bash
.kiro/specs/shadcn-integration/tasks.md
```

### 2. 从第一个任务开始

**任务 1.1：配置 TypeScript**
```bash
cd frontend
npm install -D typescript @types/react @types/react-dom @types/node
```

### 3. 按顺序完成所有任务

- 每完成一个任务，在 tasks.md 中标记为完成 `[x]`
- 遇到问题时，参考 `TECH_STACK_INTEGRATION.md`
- 保持新旧布局隔离

---

## 📊 进度跟踪

### shadcn-integration 进度（包含 TypeScript + TanStack Query）
- [ ] Week 1 Day 1: TypeScript 配置
- [ ] Week 1 Day 2: shadcn 基础设施
- [ ] Week 1 Day 3: TanStack Query 配置
- [ ] Week 1 Day 4-5: shadcn 基础组件（TSX）
- [ ] Week 2: 组件迁移（TSX + Query）
- [ ] Week 2 Day 5: 测试和验证

### demo-to-new-migration 进度
- [ ] 等待 shadcn-integration 完成
- [ ] Week 3: 查询构建器（TSX + Query）
- [ ] Week 4: 结果面板（TSX + Query）
- [ ] Week 5: 表管理（TSX + Query）

### CMDK 集成进度
- [ ] 等待 demo-to-new-migration 完成
- [ ] Week 6: CMDK 集成

---

## ⚠️ 注意事项

### 1. 架构隔离
- ✅ 新组件放在 `frontend/src/new/`
- ✅ 新组件使用 `.tsx` 扩展名
- ✅ 新组件使用 TanStack Query
- ❌ 不要混用新旧布局的组件

### 2. 导入路径
```typescript
// ✅ 正确
import { Button } from '@/new/components/ui/button';
import { useQuery } from '@tanstack/react-query';

// ❌ 错误
import { Button } from '@mui/material';  // 在新布局中
```

### 3. 代码模式
```typescript
// ✅ 正确：统一的 TypeScript + TanStack Query 模式
const Component: React.FC<Props> = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['key'],
    queryFn: fetchData
  });
  
  const mutation = useMutation({
    mutationFn: updateData,
    onSuccess: () => queryClient.invalidateQueries(['key'])
  });
  
  return <Card>...</Card>;
};

// ❌ 错误：旧的 useState + useEffect 模式
const Component = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    setLoading(true);
    fetchData().then(setData).finally(() => setLoading(false));
  }, []);
  
  return <div>...</div>;
};
```

---

## 🎯 成功标准

### shadcn-integration 完成标准
- [x] TypeScript 配置完成，支持 JS/TS 混用
- [x] TanStack Query 配置完成
- [x] 所有 shadcn/ui 组件已创建（TSX 格式）
- [x] 所有新布局组件已迁移（TSX + Query）
- [x] 所有功能正常工作
- [x] 可访问性测试通过

### demo-to-new-migration 完成标准
- [x] 所有 demo 功能已迁移（TSX + Query）
- [x] 所有交互正常工作
- [x] 性能符合要求
- [x] 用户体验良好

---

## 💡 关键优势总结

### 时间对比

| 方面 | 旧顺序（分离执行） | 新顺序（一起执行） | 节省时间 |
|-----|------------------|------------------|---------|
| TypeScript 配置 | Week 2 | Day 1 | - |
| 组件转换 | 2-3 天返工 | 0 天 | **2-3 天** |
| TanStack Query 配置 | Week 3 | Day 3 | - |
| 数据层重构 | 3-4 天返工 | 0 天 | **3-4 天** |
| CMDK 集成 | 1-2 天返工 | 0 天 | **1-2 天** |
| **总计** | **14-19 天** | **8-10 天** | **6-9 天** |

### 质量对比

| 方面 | 旧顺序 | 新顺序 |
|-----|-------|-------|
| 代码一致性 | 多次重构，不一致 | 一次到位，统一 |
| 类型安全 | 后期添加，不完整 | 从头开始，完整 |
| 数据管理 | 混用多种模式 | 统一 TanStack Query |
| 测试成本 | 每次重构都要测 | 一次性测试 |
| 技术债务 | 累积 | 无 |

---

## 📝 总结

### 当前状态
- ✅ `architecture-principles/` - 参考文档
- ✅ `demo-double-click-fix/` - 已完成
- ⚠️ `shadcn-integration/` - **待实施，最高优先级**（已更新包含 TypeScript + TanStack Query + CMDK）
- ⚠️ `demo-to-new-migration/` - 待实施，依赖 shadcn-integration

### 推荐顺序（优化后）
1. 🔴 **Week 1**：TypeScript + shadcn + TanStack Query 基础设施（5 天）
2. 🔴 **Week 2**：shadcn 组件迁移（TSX + Query）（5 天）
3. 🟡 **Week 3-5**：demo-to-new-migration（TSX + Query）（15 天）
4. 🟢 **Week 6**：CMDK 集成（2 天）
5. 🟢 **Week 7+**：持续优化（不影响主线）

### 下一步
📋 **打开 `.kiro/specs/shadcn-integration/tasks.md` 开始任务 1.1：配置 TypeScript！**

---

## 🔗 相关文档

- 📋 [shadcn-integration/tasks.md](.kiro/specs/shadcn-integration/tasks.md) - 详细任务清单
- 📖 [shadcn-integration/TECH_STACK_INTEGRATION.md](.kiro/specs/shadcn-integration/TECH_STACK_INTEGRATION.md) - 技术栈集成说明
- 📖 [shadcn-integration/design.md](.kiro/specs/shadcn-integration/design.md) - 设计文档
- 📖 [shadcn-integration/architecture-isolation.md](.kiro/specs/shadcn-integration/architecture-isolation.md) - 架构隔离说明
