# 新 UI 架构设计原则

## 一、旧 UI 的问题分析

### 1.1 旧 UI 存在的核心问题

**问题 1：组件职责混乱**
```jsx
// ❌ 旧 UI 问题：一个组件做太多事情
<UnifiedQueryInterface>
  {/* 包含了可视化查询、SQL查询、JOIN查询、集合操作等所有逻辑 */}
  {/* 单文件超过 2000 行代码 */}
  {/* 难以维护、难以测试、难以扩展 */}
</UnifiedQueryInterface>
```

**问题 2：状态管理混乱**
```jsx
// ❌ 旧 UI 问题：状态散落在各个组件
const [visualQueryState, setVisualQueryState] = useState({});
const [sqlQueryState, setSqlQueryState] = useState({});
const [joinQueryState, setJoinQueryState] = useState({});
// 状态同步困难，容易出现不一致
```

**问题 3：样式系统不统一**
```jsx
// ❌ 旧 UI 问题：混用多种样式方案
<div className="dq-shell">  {/* modern.css */}
  <Button sx={{ ... }}>    {/* MUI inline styles */}
    <span style={{ color: 'var(--dq-primary)' }}>  {/* CSS 变量 */}
```

**问题 4：业务逻辑与 UI 耦合**
```jsx
// ❌ 旧 UI 问题：SQL 生成逻辑写在组件内部
const handleExecute = () => {
  let sql = 'SELECT ';
  if (selectedFields.length > 0) {
    sql += selectedFields.join(', ');
  }
  // ... 大量 SQL 拼接逻辑
};
```

**问题 5：缺乏类型定义**
```jsx
// ❌ 旧 UI 问题：Props 类型不明确
function QueryBuilder({ data, config, options }) {
  // data 是什么结构？
  // config 有哪些字段？
  // options 是可选的吗？
}
```

## 二、新 UI 架构原则

### 2.1 核心原则

#### 原则 1：单一职责原则（SRP）
**每个组件只做一件事**

```jsx
// ✅ 新 UI 设计：职责清晰
<QueryWorkbench>
  <QueryModeSelector />  {/* 只负责模式选择 */}
  <VisualQuery />        {/* 只负责可视化查询 */}
  <SQLQuery />           {/* 只负责 SQL 查询 */}
  <ResultPanel />        {/* 只负责结果展示 */}
</QueryWorkbench>
```

#### 原则 2：关注点分离（SoC）
**UI、业务逻辑、数据管理分离**

```
UI 层（组件）
  ↓ 调用
Hook 层（业务逻辑）
  ↓ 调用
Service 层（API 调用）
  ↓ 调用
Utils 层（工具函数）
```

#### 原则 3：依赖倒置原则（DIP）
**依赖抽象而非具体实现**

```jsx
// ✅ 新 UI 设计：通过 Props 注入依赖
function VisualQuery({ 
  table,           // 数据依赖
  onExecute,       // 行为依赖
  sqlGenerator     // 工具依赖
}) {
  // 组件不关心具体实现
}
```

#### 原则 4：开闭原则（OCP）
**对扩展开放，对修改关闭**

```jsx
// ✅ 新 UI 设计：通过插件机制扩展
const queryModes = [
  { id: 'visual', component: VisualQuery },
  { id: 'sql', component: SQLQuery },
  { id: 'join', component: JoinQuery },
  // 新增查询模式无需修改核心代码
];
```

### 2.2 架构分层

```
┌─────────────────────────────────────┐
│  Presentation Layer (UI Components) │  ← shadcn/ui + Tailwind
├─────────────────────────────────────┤
│  Business Logic Layer (Hooks)       │  ← 自定义 Hooks
├─────────────────────────────────────┤
│  Service Layer (API Clients)        │  ← axios + apiClient
├─────────────────────────────────────┤
│  Utility Layer (Pure Functions)     │  ← SQL 生成器、工具函数
└─────────────────────────────────────┘
```



## 三、具体设计决策

### 3.1 状态管理架构

#### 决策：使用分层状态管理

```jsx
// ✅ 全局状态（useDuckQuery）
const globalState = {
  dataSources: [],      // 数据源列表
  currentTab: 'query',  // 当前页面
  isDarkMode: false     // 主题
};

// ✅ 功能状态（useQueryWorkbench）
const workbenchState = {
  queryMode: 'visual',  // 查询模式
  selectedTables: [],   // 选中的表
  panels: {}            // 面板状态
};

// ✅ 组件状态（useState）
const [localState, setLocalState] = useState({
  // 仅影响当前组件的状态
});
```

**优势**：
- ✅ 状态职责清晰
- ✅ 避免过度全局化
- ✅ 便于测试和调试

#### 决策：避免使用 Redux/Zustand

**原因**：
- 项目规模适中，不需要复杂的状态管理
- 自定义 Hooks 足够满足需求
- 减少学习成本和依赖

**何时考虑引入**：
- 状态共享超过 3 层组件
- 需要时间旅行调试
- 需要状态持久化

### 3.2 组件设计模式

#### 模式 1：容器/展示组件分离

```jsx
// ✅ 容器组件（负责逻辑）
function VisualQueryContainer() {
  const { state, actions } = useVisualQuery();
  
  return (
    <VisualQueryView
      config={state.config}
      onFieldSelect={actions.selectField}
      onFilterAdd={actions.addFilter}
    />
  );
}

// ✅ 展示组件（负责 UI）
function VisualQueryView({ config, onFieldSelect, onFilterAdd }) {
  return (
    <Card>
      <FieldSelector fields={config.fields} onSelect={onFieldSelect} />
      <FilterBuilder filters={config.filters} onAdd={onFilterAdd} />
    </Card>
  );
}
```

#### 模式 2：组合优于继承

```jsx
// ✅ 使用组合
function QueryBuilder({ children, toolbar, footer }) {
  return (
    <div className="query-builder">
      {toolbar}
      <div className="query-builder-content">{children}</div>
      {footer}
    </div>
  );
}

// 使用
<QueryBuilder
  toolbar={<QueryToolbar />}
  footer={<QueryActions />}
>
  <VisualQuery />
</QueryBuilder>
```

#### 模式 3：Render Props 用于复杂交互

```jsx
// ✅ 使用 Render Props
function DataSourcePanel({ children }) {
  const { tables, loading, error } = useTables();
  
  return children({ tables, loading, error });
}

// 使用
<DataSourcePanel>
  {({ tables, loading, error }) => (
    loading ? <Spinner /> :
    error ? <ErrorMessage error={error} /> :
    <TableList tables={tables} />
  )}
</DataSourcePanel>
```

### 3.3 业务逻辑提取

#### 决策：所有业务逻辑放在 Hooks 中

```jsx
// ✅ hooks/useVisualQuery.js
export function useVisualQuery(table) {
  const [config, setConfig] = useState(initialConfig);
  
  const selectField = useCallback((field) => {
    setConfig(prev => ({
      ...prev,
      selectedFields: [...prev.selectedFields, field]
    }));
  }, []);
  
  const generateSQL = useMemo(() => {
    return sqlGenerator.generateVisualQuery(table, config);
  }, [table, config]);
  
  return {
    config,
    actions: { selectField, addFilter, addGroupBy },
    generatedSQL
  };
}
```

**优势**：
- ✅ 组件只关注 UI
- ✅ 业务逻辑可独立测试
- ✅ 便于复用

### 3.4 SQL 生成器架构

#### 决策：使用策略模式

```jsx
// ✅ utils/sqlGenerator.js
export const sqlGenerator = {
  generateVisualQuery(table, config) {
    const builder = new SQLBuilder();
    return builder
      .select(config.selectedFields)
      .from(table.name)
      .where(config.filters)
      .groupBy(config.groupBy)
      .orderBy(config.orderBy)
      .limit(config.limit)
      .build();
  },
  
  generateJoinQuery(tables, joins) {
    const builder = new SQLBuilder();
    return builder
      .select('*')
      .from(tables[0].name)
      .joins(joins)
      .build();
  },
  
  generateSetOperation(tables, operation) {
    return tables
      .map(t => `SELECT * FROM ${t.name}`)
      .join(` ${operation} `);
  }
};
```

**优势**：
- ✅ SQL 生成逻辑集中管理
- ✅ 易于测试和维护
- ✅ 支持复杂查询构建

### 3.5 类型系统设计

#### 决策：使用 JSDoc 提供类型提示

```jsx
/**
 * @typedef {Object} QueryConfig
 * @property {string[]} selectedFields - 选中的字段
 * @property {Filter[]} filters - 筛选条件
 * @property {string[]} groupBy - 分组字段
 * @property {OrderBy[]} orderBy - 排序规则
 * @property {Limit} limit - 限制条件
 */

/**
 * @typedef {Object} Filter
 * @property {string} field - 字段名
 * @property {'=' | '>' | '<' | 'LIKE'} operator - 操作符
 * @property {string} value - 值
 */

/**
 * 可视化查询 Hook
 * @param {Table} table - 数据表
 * @returns {{ config: QueryConfig, actions: Object, generatedSQL: string }}
 */
export function useVisualQuery(table) {
  // ...
}
```

**优势**：
- ✅ 无需 TypeScript 配置
- ✅ IDE 自动补全
- ✅ 类型文档化

**何时考虑 TypeScript**：
- 团队规模 > 5 人
- 项目代码 > 50k 行
- 需要严格类型检查

### 3.6 样式系统架构

#### 决策：三层样式架构

```
1. CSS 变量层（tailwind.css）
   ↓ 定义设计 tokens
   
2. Tailwind 配置层（tailwind.config.js）
   ↓ 映射为语义化类名
   
3. 组件层（*.jsx）
   ↓ 使用语义化类名
```

**示例**：
```css
/* 1. CSS 变量层 */
:root {
  --primary: 24 100% 50%;
  --surface: 0 0% 100%;
}

.dark {
  --primary: 24 100% 50%;
  --surface: 222.2 84% 4.9%;
}
```

```javascript
// 2. Tailwind 配置层
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: 'hsl(var(--primary))',
        surface: 'hsl(var(--surface))'
      }
    }
  }
};
```

```jsx
// 3. 组件层
<Card className="bg-surface border-border">
  <Button className="bg-primary text-primary-foreground">
    保存
  </Button>
</Card>
```

**禁止**：
```jsx
// ❌ 直接使用 CSS 变量
<div style={{ backgroundColor: 'var(--dq-surface)' }}>

// ❌ 硬编码颜色
<div className="bg-gray-100">

// ❌ 内联样式
<div style={{ padding: '16px' }}>
```

### 3.7 性能优化策略

#### 策略 1：组件懒加载

```jsx
// ✅ 按需加载
const VisualQuery = lazy(() => import('./VisualQuery'));
const SQLQuery = lazy(() => import('./SQLQuery'));
const JoinQuery = lazy(() => import('./JoinQuery'));

function QueryWorkbench() {
  return (
    <Suspense fallback={<Spinner />}>
      {queryMode === 'visual' && <VisualQuery />}
      {queryMode === 'sql' && <SQLQuery />}
      {queryMode === 'join' && <JoinQuery />}
    </Suspense>
  );
}
```

#### 策略 2：记忆化

```jsx
// ✅ 使用 React.memo
const TableItem = React.memo(({ table, onSelect }) => {
  return <div onClick={() => onSelect(table.id)}>{table.name}</div>;
});

// ✅ 使用 useMemo
const filteredTables = useMemo(() => {
  return tables.filter(t => t.name.includes(searchQuery));
}, [tables, searchQuery]);

// ✅ 使用 useCallback
const handleSelect = useCallback((tableId) => {
  setSelectedTables(prev => [...prev, tableId]);
}, []);
```

#### 策略 3：虚拟滚动

```jsx
// ✅ 大数据量使用虚拟滚动
import { FixedSizeList } from 'react-window';

function TableList({ tables }) {
  const Row = ({ index, style }) => (
    <div style={style}>{tables[index].name}</div>
  );
  
  return (
    <FixedSizeList
      height={600}
      itemCount={tables.length}
      itemSize={35}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

### 3.8 错误处理架构

#### 策略：分层错误处理

```jsx
// ✅ 1. 全局错误边界
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    logErrorToService(error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}

// ✅ 2. 功能级错误处理
function QueryWorkbench() {
  const [error, setError] = useState(null);
  
  const handleExecute = async () => {
    try {
      const result = await executeQuery(sql);
      setResult(result);
    } catch (err) {
      setError(err);
      showToast(err.message, 'error');
    }
  };
  
  if (error) {
    return <QueryError error={error} onRetry={handleExecute} />;
  }
  
  return <QueryBuilder />;
}

// ✅ 3. 组件级错误处理
function DataSourcePanel() {
  const { tables, loading, error } = useTables();
  
  if (error) {
    return <ErrorMessage error={error} />;
  }
  
  if (loading) {
    return <Spinner />;
  }
  
  return <TableList tables={tables} />;
}
```

### 3.9 测试策略

#### 策略：测试金字塔

```
        E2E Tests (10%)
       /              \
      /                \
     /  Integration     \
    /    Tests (30%)     \
   /                      \
  /   Unit Tests (60%)     \
 /__________________________\
```

**单元测试**：
```jsx
// ✅ 测试 Hook
import { renderHook, act } from '@testing-library/react';
import { useVisualQuery } from './useVisualQuery';

test('should add field to selection', () => {
  const { result } = renderHook(() => useVisualQuery(mockTable));
  
  act(() => {
    result.current.actions.selectField('id');
  });
  
  expect(result.current.config.selectedFields).toContain('id');
});
```

**集成测试**：
```jsx
// ✅ 测试组件交互
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryWorkbench } from './QueryWorkbench';

test('should switch query mode', () => {
  render(<QueryWorkbench />);
  
  fireEvent.click(screen.getByText('SQL 查询'));
  
  expect(screen.getByPlaceholderText('输入 SQL')).toBeInTheDocument();
});
```

**E2E 测试**：
```javascript
// ✅ 测试完整流程
test('complete query workflow', async () => {
  await page.goto('http://localhost:3000');
  await page.click('[data-testid="datasource-tab"]');
  await page.click('[data-testid="table-sales"]');
  await page.click('[data-testid="execute-button"]');
  await expect(page.locator('[data-testid="result-table"]')).toBeVisible();
});
```

### 3.10 可扩展性设计

#### 设计 1：插件化架构

```jsx
// ✅ 查询模式插件
const queryModePlugins = [
  {
    id: 'visual',
    name: '可视化查询',
    icon: Eye,
    component: VisualQuery,
    sqlGenerator: generateVisualQuerySQL
  },
  {
    id: 'sql',
    name: 'SQL 查询',
    icon: Code,
    component: SQLQuery,
    sqlGenerator: (config) => config.rawSQL
  }
];

// 新增查询模式只需添加插件
queryModePlugins.push({
  id: 'ai',
  name: 'AI 查询',
  icon: Sparkles,
  component: AIQuery,
  sqlGenerator: generateAIQuerySQL
});
```

#### 设计 2：配置驱动

```jsx
// ✅ 通过配置控制功能
const featureFlags = {
  enableAIQuery: false,
  enablePivotTable: true,
  enableExport: true,
  maxQueryResults: 10000
};

function QueryWorkbench() {
  const availableModes = queryModes.filter(mode => 
    featureFlags[`enable${mode.id}`] !== false
  );
  
  return <QueryModeSelector modes={availableModes} />;
}
```

#### 设计 3：事件驱动

```jsx
// ✅ 使用事件总线解耦
const eventBus = new EventEmitter();

// 发布事件
eventBus.emit('query:executed', { sql, results });

// 订阅事件
eventBus.on('query:executed', ({ sql, results }) => {
  logQuery(sql);
  updateHistory(sql);
  showNotification('查询成功');
});
```



## 四、关键决策清单

### 4.1 必须遵守的原则

#### ✅ DO（必须做）

1. **组件职责单一**
   - 每个组件文件 < 300 行
   - 每个组件只做一件事
   - 复杂组件拆分为多个子组件

2. **业务逻辑提取到 Hooks**
   - 组件只负责 UI 渲染
   - 所有状态管理在 Hooks 中
   - 所有副作用在 Hooks 中

3. **使用 shadcn/ui 组件**
   - 不自己实现基础组件
   - 使用 Radix UI 确保可访问性
   - 使用 Tailwind 语义化类名

4. **类型定义完整**
   - 所有 Props 有 JSDoc 注释
   - 所有 Hook 有返回值类型定义
   - 所有工具函数有参数类型定义

5. **错误处理完善**
   - 所有异步操作有 try-catch
   - 所有组件有错误边界
   - 所有错误有用户友好提示

6. **性能优化**
   - 大列表使用虚拟滚动
   - 复杂计算使用 useMemo
   - 回调函数使用 useCallback
   - 组件使用 React.memo

7. **测试覆盖**
   - 所有 Hook 有单元测试
   - 关键组件有集成测试
   - 核心流程有 E2E 测试

#### ❌ DON'T（禁止做）

1. **禁止组件职责混乱**
   - ❌ 一个组件包含多个查询模式
   - ❌ 组件内部直接调用 API
   - ❌ 组件内部拼接 SQL

2. **禁止状态管理混乱**
   - ❌ 状态散落在各个组件
   - ❌ 使用全局变量
   - ❌ 直接修改 state（不使用 setState）

3. **禁止样式不统一**
   - ❌ 直接使用 CSS 变量（var(--dq-*)）
   - ❌ 硬编码颜色值
   - ❌ 混用多种样式方案
   - ❌ 使用内联样式

4. **禁止类型不明确**
   - ❌ Props 没有类型定义
   - ❌ 函数参数类型不明确
   - ❌ 返回值类型不明确

5. **禁止错误处理缺失**
   - ❌ 异步操作没有错误处理
   - ❌ 错误信息不友好
   - ❌ 错误没有日志记录

6. **禁止性能问题**
   - ❌ 大列表不使用虚拟滚动
   - ❌ 不必要的重渲染
   - ❌ 内存泄漏（未清理副作用）

7. **禁止缺少测试**
   - ❌ 核心功能没有测试
   - ❌ 修改代码不运行测试
   - ❌ 测试覆盖率 < 60%

### 4.2 代码审查清单

#### 提交代码前必须检查

- [ ] 组件文件 < 300 行
- [ ] 业务逻辑在 Hooks 中
- [ ] 使用 shadcn/ui 组件
- [ ] Props 有 JSDoc 注释
- [ ] 错误处理完善
- [ ] 性能优化（memo, useMemo, useCallback）
- [ ] 测试通过
- [ ] ESLint 无错误
- [ ] 无 console.log
- [ ] 无硬编码值

### 4.3 重构触发条件

**何时需要重构**：

1. **组件过大**
   - 文件 > 300 行
   - 函数 > 50 行
   - 嵌套层级 > 3 层

2. **职责不清**
   - 组件做多件事
   - 状态管理混乱
   - 业务逻辑在组件中

3. **重复代码**
   - 相同逻辑出现 3 次以上
   - 相同 UI 出现 2 次以上

4. **性能问题**
   - 渲染时间 > 100ms
   - 交互响应 > 50ms
   - 内存占用持续增长

5. **测试困难**
   - 无法单独测试
   - 需要大量 mock
   - 测试代码 > 实现代码

## 五、迁移检查清单

### 5.1 shadcn/ui 集成检查

- [ ] 安装所有必需依赖
- [ ] 创建 `lib/utils.js`
- [ ] 配置 `components.json`
- [ ] 配置路径别名
- [ ] 创建所有 shadcn/ui 组件
- [ ] 迁移所有 `new/` 目录组件
- [ ] 测试深色模式
- [ ] 测试可访问性
- [ ] 测试中英切换

### 5.2 查询工作台实现检查

- [ ] 创建目录结构
- [ ] 实现可视化查询
- [ ] 实现 SQL 查询
- [ ] 实现关联查询
- [ ] 实现集合操作
- [ ] 实现透视表
- [ ] 实现数据源面板
- [ ] 实现结果面板
- [ ] 实现拖拽调整
- [ ] 提取业务逻辑到 Hooks
- [ ] 提取 SQL 生成器
- [ ] 编写单元测试
- [ ] 编写集成测试

### 5.3 架构质量检查

- [ ] 组件职责单一
- [ ] 业务逻辑在 Hooks
- [ ] 样式系统统一
- [ ] 类型定义完整
- [ ] 错误处理完善
- [ ] 性能优化到位
- [ ] 测试覆盖充分
- [ ] 代码可维护
- [ ] 代码可扩展
- [ ] 代码可测试

## 六、未来扩展规划

### 6.1 短期扩展（3-6 个月）

1. **AI 查询模式**
   - 自然语言转 SQL
   - 智能字段推荐
   - 查询优化建议

2. **高级可视化**
   - 图表生成
   - 数据透视
   - 交互式探索

3. **协作功能**
   - 查询分享
   - 查询评论
   - 查询版本控制

### 6.2 中期扩展（6-12 个月）

1. **数据治理**
   - 数据血缘
   - 数据质量
   - 数据安全

2. **性能优化**
   - 查询缓存
   - 增量加载
   - 智能索引建议

3. **企业功能**
   - 权限管理
   - 审计日志
   - SSO 集成

### 6.3 长期扩展（12+ 个月）

1. **多数据源支持**
   - 更多数据库类型
   - 数据湖集成
   - 实时数据流

2. **智能分析**
   - 异常检测
   - 趋势预测
   - 自动报告

3. **平台化**
   - 插件市场
   - 自定义组件
   - API 开放

## 七、总结

### 7.1 核心要点

1. **单一职责** - 每个组件只做一件事
2. **关注点分离** - UI、逻辑、数据分离
3. **依赖倒置** - 依赖抽象而非具体
4. **开闭原则** - 对扩展开放，对修改关闭
5. **性能优先** - 虚拟滚动、记忆化、懒加载
6. **测试驱动** - 单元测试、集成测试、E2E 测试
7. **类型安全** - JSDoc 注释、类型定义
8. **错误处理** - 分层错误处理、用户友好提示

### 7.2 避免的陷阱

1. ❌ 组件过大（> 300 行）
2. ❌ 职责混乱（一个组件做多件事）
3. ❌ 状态混乱（状态散落各处）
4. ❌ 样式不统一（混用多种方案）
5. ❌ 业务逻辑在组件中
6. ❌ 缺少类型定义
7. ❌ 缺少错误处理
8. ❌ 缺少测试

### 7.3 成功标准

- ✅ 代码可读性强（新人 1 天上手）
- ✅ 代码可维护性强（修改不影响其他功能）
- ✅ 代码可扩展性强（新增功能无需大改）
- ✅ 代码可测试性强（测试覆盖率 > 80%）
- ✅ 性能优秀（首屏 < 2s，交互 < 50ms）
- ✅ 用户体验好（无卡顿、无闪烁、无错误）
- ✅ 可访问性好（键盘导航、屏幕阅读器）
- ✅ 国际化支持（中英文切换）

---

**这份架构设计文档应该在开始编码前与团队达成共识，作为开发的指导原则。**
