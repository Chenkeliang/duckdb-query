# 统一查询迁移详细流程

## 一、整体架构

### 1.1 页面层级结构

```
查询工作台 (QueryWorkbench)
├── 侧边栏 (Sidebar) - 一级导航
├── 数据源面板 (DataSourcePanel) - 左侧可折叠
├── 主查询区域
│   ├── Header 二级 TAB
│   │   ├── 查询模式 (默认激活)
│   │   └── 异步任务
│   └── 查询模式内容区
│       ├── 三级 TAB 栏
│       │   ├── 可视化查询
│       │   ├── SQL 查询
│       │   ├── 关联查询
│       │   ├── 集合操作
│       │   └── 透视表
│       ├── 查询构建区 (根据三级 TAB 切换)
│       └── 统一结果面板 (底部可调整大小)
```

### 1.2 状态管理架构

```javascript
// 扩展 useDuckQuery Hook
const useQueryWorkbench = () => {
  const { state, actions } = useDuckQuery();
  
  return {
    // 二级 TAB 状态
    secondaryTab: 'query' | 'tasks',
    
    // 三级 TAB 状态
    queryMode: 'visual' | 'sql' | 'join' | 'set' | 'pivot',
    
    // 每个模式的选中表
    selectedTables: {
      visual: [],  // 单选
      sql: [],     // 单选
      join: [],    // 多选
      set: [],     // 多选
      pivot: []    // 单选
    },
    
    // 面板状态
    panels: {
      datasource: { width: 256, collapsed: false },
      result: { height: 400, collapsed: false }
    }
  };
};
```

## 二、二级 TAB 实现

### 2.1 查询模式 TAB

**组件**: `QueryModeTab.jsx`

**位置**: Header 区域，紧邻页面标题

**样式**:
```jsx
<div className="flex bg-muted/50 p-1 rounded-lg h-9 border border-border gap-1">
  <button className={`tab-btn ${active ? 'active' : ''} text-xs`}>
    <Search className="w-3 h-3" />
    查询模式
  </button>
</div>
```

**交互**:
- 点击切换到查询模式
- 显示三级 TAB 和查询构建区
- 隐藏异步任务列表

**状态管理**:
```javascript
const [secondaryTab, setSecondaryTab] = useState('query');

const handleSecondaryTabChange = (tab) => {
  setSecondaryTab(tab);
  // 切换内容区显示
};
```

### 2.2 异步任务 TAB

**组件**: `AsyncTasksTab.jsx`

**位置**: Header 区域，查询模式 TAB 右侧

**样式**:
```jsx
<button className={`tab-btn ${active ? 'active' : ''} text-xs`}>
  <Clock className="w-3 h-3" />
  异步任务
</button>
```

**交互**:
- 点击切换到异步任务列表
- 隐藏三级 TAB 和查询构建区
- 显示异步任务列表组件

**功能实现**:
```jsx
{secondaryTab === 'tasks' && (
  <AsyncTaskList
    onPreviewResult={(taskId) => {
      // 切换到查询模式并预览结果
      setSecondaryTab('query');
      setQueryMode('sql');
      // 加载任务结果
    }}
    onTaskCompleted={triggerRefresh}
  />
)}
```

## 三、三级 TAB 实现详解

### 3.1 可视化查询 TAB

**组件**: `VisualQueryTab.jsx`

**入口组件**: `VisualQueryBuilder/index.jsx`

**布局结构**:
```
┌─────────────────────────────────────────────────────────┐
│ 数据源: sales_data  [双击左侧切换]    [执行] [保存]    │
├──────────────┬──────────────────────────────────────────┤
│ 查询构建模式  │  配置内容区                               │
│              │                                          │
│ ✓ 字段选择   │  ☑ id (INTEGER)                         │
│   SELECT     │  ☑ name (VARCHAR)                       │
│   [启用]     │  ☑ amount (DOUBLE)                      │
│              │  ☐ date (DATE)                          │
│ ○ 筛选条件   │                                          │
│   WHERE      │                                          │
│              │                                          │
│ ○ 分组聚合   │                                          │
│   GROUP BY   │                                          │
│              │                                          │
│ ○ 排序       │                                          │
│   ORDER BY   │                                          │
│              │                                          │
│ ✓ 限制结果   │                                          │
│   LIMIT      │                                          │
│   [启用]     │                                          │
│              │                                          │
│              │  生成的 SQL:                             │
│              │  SELECT * FROM sales_data LIMIT 100     │
└──────────────┴──────────────────────────────────────────┘
```

**功能模块**:

#### 3.1.1 字段选择 (SELECT)
**组件**: `FieldSelector.jsx`

**实现**:
```jsx
const FieldSelector = ({ columns, selectedFields, onChange }) => {
  return (
    <div className="space-y-2">
      {columns.map(col => (
        <label className="flex items-center gap-2 px-3 py-2 rounded hover:bg-surface-hover cursor-pointer">
          <input 
            type="checkbox" 
            checked={selectedFields.includes(col.name)}
            onChange={() => onChange(col.name)}
            className="accent-primary" 
          />
          <span className="text-sm">{col.name}</span>
          <span className="text-xs text-muted-foreground ml-auto">{col.type}</span>
        </label>
      ))}
    </div>
  );
};
```

**交互**:
- 勾选/取消勾选字段
- 实时更新生成的 SQL
- 至少选择一个字段才能执行

#### 3.1.2 筛选条件 (WHERE)
**组件**: `FilterBuilder.jsx`

**实现**:
```jsx
const FilterBuilder = ({ filters, onChange }) => {
  const addFilter = () => {
    onChange([...filters, { field: '', operator: '=', value: '' }]);
  };
  
  return (
    <div className="space-y-3">
      {filters.map((filter, index) => (
        <div className="flex gap-2 items-center">
          <select className="duck-input flex-1">
            {/* 字段选择 */}
          </select>
          <select className="duck-input w-24">
            <option value="=">=</option>
            <option value=">">></option>
            <option value="<">&lt;</option>
          </select>
          <input type="text" className="duck-input flex-1" />
          <button onClick={() => removeFilter(index)}>
            <X className="w-4 h-4 text-error" />
          </button>
        </div>
      ))}
      <button onClick={addFilter} className="w-full py-2 border border-dashed border-primary/50">
        <Plus className="w-4 h-4 inline mr-1" />
        添加条件
      </button>
    </div>
  );
};
```

**交互**:
- 添加/删除筛选条件
- 选择字段、操作符、输入值
- 多个条件用 AND 连接

#### 3.1.3 分组聚合 (GROUP BY)
**组件**: `GroupByBuilder.jsx`

**实现**:
```jsx
const GroupByBuilder = ({ groupFields, aggregations, onChange }) => {
  return (
    <div className="space-y-4">
      {/* 分组字段 */}
      <div>
        <label className="text-sm font-medium mb-2 block">分组字段 (GROUP BY)</label>
        {groupFields.map(field => (
          <div className="flex items-center gap-2 p-2 bg-muted/30 rounded border">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm flex-1">{field}</span>
            <button onClick={() => removeGroupField(field)}>
              <X className="w-3 h-3 text-error" />
            </button>
          </div>
        ))}
      </div>
      
      {/* 聚合函数 */}
      <div>
        <label className="text-sm font-medium mb-2 block">聚合函数</label>
        {aggregations.map((agg, index) => (
          <div className="p-3 bg-muted/30 rounded border">
            <div className="flex gap-2 mb-2">
              <select className="duck-input flex-1">
                <option>SUM</option>
                <option>AVG</option>
                <option>COUNT</option>
                <option>MIN</option>
                <option>MAX</option>
              </select>
              <select className="duck-input flex-1">
                {/* 字段选择 */}
              </select>
            </div>
            <input 
              type="text" 
              className="duck-input text-sm" 
              placeholder="别名 (可选)" 
            />
          </div>
        ))}
      </div>
    </div>
  );
};
```

**交互**:
- 添加/删除分组字段
- 配置聚合函数（SUM、AVG、COUNT、MIN、MAX）
- 设置聚合结果别名

#### 3.1.4 排序 (ORDER BY)
**组件**: `SortBuilder.jsx`

**实现**:
```jsx
const SortBuilder = ({ sortFields, onChange }) => {
  return (
    <div className="space-y-2">
      {sortFields.map((sort, index) => (
        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded border">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          <select className="duck-input flex-1">
            {/* 字段选择 */}
          </select>
          <select className="duck-input w-24">
            <option value="DESC">DESC</option>
            <option value="ASC">ASC</option>
          </select>
          <button onClick={() => removeSort(index)}>
            <X className="w-3 h-3 text-error" />
          </button>
        </div>
      ))}
      <button onClick={addSort} className="w-full py-2 border border-dashed">
        <Plus className="w-4 h-4 inline mr-1" />
        添加排序字段
      </button>
    </div>
  );
};
```

**交互**:
- 添加/删除排序字段
- 选择升序/降序
- 支持拖拽调整排序优先级

#### 3.1.5 限制结果 (LIMIT)
**组件**: `LimitConfig.jsx`

**实现**:
```jsx
const LimitConfig = ({ limit, enabled, onChange }) => {
  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <label className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="accent-primary" 
          />
          <span className="text-sm font-medium">启用 LIMIT</span>
        </label>
        <input 
          type="number" 
          className="duck-input w-32" 
          value={limit}
          onChange={(e) => onChange({ limit: e.target.value })}
          min="1" 
        />
        <span className="text-xs text-muted-foreground">行</span>
      </div>
      
      {/* 常用值快捷按钮 */}
      <div className="p-3 bg-muted/30 rounded-lg border">
        <div className="text-xs text-muted-foreground mb-2">常用值</div>
        <div className="flex gap-2">
          {[10, 50, 100, 500, 1000].map(val => (
            <button 
              onClick={() => onChange({ limit: val })}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                limit === val ? 'bg-primary/10 border-primary text-primary' : 'border-border'
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
```

**交互**:
- 启用/禁用 LIMIT
- 输入自定义数值
- 点击快捷按钮设置常用值

### 3.2 SQL 查询 TAB

**组件**: `SQLQueryTab.jsx`

**入口组件**: `SQLQueryBuilder/index.jsx`

**布局结构**:
```
┌─────────────────────────────────────────────────────────┐
│ SQL 查询  [双击左侧插入表名]  [模板] [格式化] [执行]    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐ │
│  │ SELECT name, amount, date                         │ │
│  │ FROM sales_data                                   │ │
│  │ WHERE amount > 1000                               │ │
│  │   AND date >= '2024-01-01'                        │ │
│  │ ORDER BY amount DESC                              │ │
│  │ LIMIT 100;                                        │ │
│  └───────────────────────────────────────────────────┘ │
│                                                         │
│  [保存查询]  [查询计划]          ℹ 支持 DuckDB SQL 语法 │
│                                                         │
│  查询历史:                                              │
│  ┌───────────────────────────────────────────────────┐ │
│  │ SELECT * FROM sales_data WHERE...    2 分钟前     │ │
│  │ ✓ 成功  100 行  0.3s                              │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**功能模块**:

#### 3.2.1 SQL 编辑器
**组件**: `SQLEditor.jsx`

**实现**:
```jsx
const SQLEditor = ({ value, onChange, onExecute }) => {
  const editorRef = useRef(null);
  
  const handleKeyDown = (e) => {
    // Ctrl/Cmd + Enter 执行查询
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      onExecute();
    }
  };
  
  return (
    <textarea
      ref={editorRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      className="duck-input font-mono text-sm resize-none"
      placeholder="-- 输入 SQL 查询语句
SELECT * FROM sales_data
WHERE amount > 1000
ORDER BY date DESC
LIMIT 100;"
      style={{ minHeight: '300px' }}
    />
  );
};
```

**交互**:
- 输入 SQL 代码
- 语法高亮（可选，使用 CodeMirror 或 Monaco Editor）
- Ctrl/Cmd + Enter 快捷键执行
- 双击数据源面板的表名自动插入

#### 3.2.2 工具栏按钮
**组件**: `SQLToolbar.jsx`

**实现**:
```jsx
const SQLToolbar = ({ onFormat, onTemplate, onExecute }) => {
  return (
    <div className="flex items-center gap-2">
      <button 
        onClick={onTemplate}
        className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover"
      >
        <FileText className="w-3 h-3 inline mr-1" />
        模板
      </button>
      <button 
        onClick={onFormat}
        className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover"
      >
        <Wand2 className="w-3 h-3 inline mr-1" />
        格式化
      </button>
      <button 
        onClick={onExecute}
        className="px-4 py-1.5 bg-primary text-white rounded-md text-sm font-medium hover:opacity-90"
      >
        <Play className="w-3.5 h-3.5 inline mr-1" />
        执行
      </button>
    </div>
  );
};
```

**交互**:
- 模板按钮：弹出常用 SQL 模板选择
- 格式化按钮：格式化 SQL 代码
- 执行按钮：提交查询

#### 3.2.3 查询历史
**组件**: `QueryHistory.jsx`

**实现**:
```jsx
const QueryHistory = ({ history, onSelect }) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold mb-2 block">查询历史</label>
      {history.map(item => (
        <div 
          onClick={() => onSelect(item.sql)}
          className="p-3 rounded-lg border border-border bg-muted/30 hover:border-primary/50 cursor-pointer transition-colors"
        >
          <div className="flex items-start justify-between mb-1">
            <code className="text-xs font-mono text-foreground line-clamp-1">
              {item.sql}
            </code>
            <span className="text-xs text-muted-foreground">{item.time}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{item.success ? '✓ 成功' : '✗ 失败'}</span>
            <span>{item.rowCount} 行</span>
            <span>{item.execTime}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
```

**交互**:
- 显示最近 10 条查询记录
- 点击历史记录自动填充到编辑器
- 显示执行状态、行数、耗时

### 3.3 关联查询 TAB

**组件**: `JoinQueryTab.jsx`

**入口组件**: `JoinQueryBuilder/index.jsx`

**布局结构**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 关联查询  [双击左侧添加表]                        [执行] [保存]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐      ┌──────────┐      ┌──────────────┐         │
│  │ sales_data   │      │ LEFT JOIN│      │ customer_info│         │
│  │ [主表]       │──────│    ON    │──────│              │         │
│  │              │      │ id = id  │      │              │         │
│  │ ☑ id         │      └──────────┘      │ ☑ id         │         │
│  │ ☑ amount     │                        │ ☑ name       │         │
│  │ ☑ date       │                        │ ☑ city       │         │
│  │ +3 更多字段   │                        │ +2 更多字段   │         │
│  │              │                        │              │         │
│  │ [×]          │                        │ [×]          │         │
│  └──────────────┘                        └──────────────┘         │
│                                                                     │
│  [+ 添加表]                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

**功能模块**:

#### 3.3.1 表卡片
**组件**: `TableCard.jsx`

**实现**:
```jsx
const TableCard = ({ table, isPrimary, onRemove, onColumnToggle }) => {
  const schema = tableSchemas[table.name];
  
  return (
    <div className="datasource-card shrink-0" style={{ minWidth: '260px', maxWidth: '280px' }}>
      {/* 头部 */}
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table className={`w-4 h-4 ${isPrimary ? 'text-primary' : 'text-muted-foreground'}`} />
          <span className="font-medium text-sm">{table.name}</span>
          {isPrimary && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary rounded">
              主表
            </span>
          )}
        </div>
        <button onClick={onRemove} className="text-muted-foreground hover:text-error p-1 rounded hover:bg-error/10">
          <X className="w-4 h-4" />
        </button>
      </div>
      
      {/* 字段列表 */}
      <div className="p-3">
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Database className="w-3 h-3" />
          {schema.source}
        </div>
        <div className="space-y-0.5 max-h-40 overflow-auto">
          {schema.columns.slice(0, 6).map(col => (
            <label className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-muted/50 cursor-pointer">
              <input 
                type="checkbox" 
                checked={table.selectedColumns.includes(col.name)}
                onChange={() => onColumnToggle(col.name)}
                className="accent-primary w-3 h-3" 
              />
              <span className="flex-1 truncate">{col.name}</span>
              <span className="text-muted-foreground text-[10px]">{col.type}</span>
            </label>
          ))}
          {schema.columns.length > 6 && (
            <div className="text-xs text-muted-foreground text-center py-1">
              +{schema.columns.length - 6} 更多字段
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

**交互**:
- 显示表名和来源
- 勾选/取消勾选字段
- 点击 × 按钮移除表
- 主表显示特殊标记

#### 3.3.2 JOIN 连接器
**组件**: `JoinConnector.jsx`

**实现**:
```jsx
const JoinConnector = ({ leftTable, rightTable, config, onChange }) => {
  return (
    <div className="join-connector shrink-0">
      <div className="flex flex-col items-center gap-2 px-2">
        {/* JOIN 类型选择 */}
        <select 
          value={config.type}
          onChange={(e) => onChange({ ...config, type: e.target.value })}
          className="duck-input text-xs w-28 text-center"
        >
          <option value="INNER JOIN">INNER JOIN</option>
          <option value="LEFT JOIN">LEFT JOIN</option>
          <option value="RIGHT JOIN">RIGHT JOIN</option>
          <option value="FULL JOIN">FULL JOIN</option>
        </select>
        
        {/* 连接线 */}
        <div className="w-16 h-0.5 bg-primary/50"></div>
        
        {/* ON 条件 */}
        <div className="text-[10px] text-muted-foreground">ON</div>
        <div className="flex items-center gap-1 text-xs">
          <select className="duck-input text-xs py-1 px-2" style={{ width: '80px' }}>
            {leftTable.columns.map(col => (
              <option value={col.name}>{col.name}</option>
            ))}
          </select>
          <span>=</span>
          <select className="duck-input text-xs py-1 px-2" style={{ width: '80px' }}>
            {rightTable.columns.map(col => (
              <option value={col.name}>{col.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};
```

**交互**:
- 选择 JOIN 类型（INNER、LEFT、RIGHT、FULL）
- 选择左表字段
- 选择右表字段
- 自动生成 ON 条件

#### 3.3.3 类型冲突处理
**组件**: `JoinTypeConflictDialog.jsx`

**实现**:
```jsx
const JoinTypeConflictDialog = ({ conflicts, onResolve, onClose }) => {
  const [selections, setSelections] = useState({});
  
  return (
    <div className="fixed inset-0 z-modal-backdrop bg-[var(--dq-backdrop-bg)] backdrop-blur-sm">
      <div className="fixed inset-0 z-modal flex items-center justify-center p-4">
        <div className="bg-surface-elevated border border-border rounded-xl shadow-2xl max-w-2xl w-full p-6">
          <h2 className="text-lg font-semibold mb-4">JOIN 字段类型不匹配</h2>
          
          {conflicts.map(conflict => (
            <div key={conflict.key} className="mb-4 p-4 bg-warning-bg border border-warning-border rounded-lg">
              <div className="flex items-center gap-4 mb-3">
                <div className="flex-1">
                  <div className="text-sm font-medium">{conflict.left.sourceLabel}.{conflict.left.column}</div>
                  <div className="text-xs text-muted-foreground">{conflict.left.displayType}</div>
                </div>
                <AlertCircle className="w-5 h-5 text-warning" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{conflict.right.sourceLabel}.{conflict.right.column}</div>
                  <div className="text-xs text-muted-foreground">{conflict.right.displayType}</div>
                </div>
              </div>
              
              <label className="text-sm font-medium mb-2 block">选择转换类型:</label>
              <select 
                className="duck-input"
                value={selections[conflict.key] || conflict.defaultType}
                onChange={(e) => setSelections({ ...selections, [conflict.key]: e.target.value })}
              >
                {conflict.recommendedTypes.map(type => (
                  <option value={type}>{type}</option>
                ))}
              </select>
            </div>
          ))}
          
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 rounded-md border border-border">
              取消
            </button>
            <button onClick={() => onResolve(selections)} className="px-4 py-2 rounded-md bg-primary text-primary-foreground">
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

**交互**:
- 检测 JOIN 字段类型不匹配
- 显示冲突详情
- 提供推荐的转换类型
- 用户选择后自动添加 CAST

### 3.4 集合操作 TAB

**组件**: `SetOperationsTab.jsx`

**入口组件**: `SetOperationsBuilder/index.jsx`

**布局结构**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 集合操作  [双击左侧添加表]                        [执行] [保存]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐      ┌────────┐      ┌──────────────┐           │
│  │ sales_2023   │      │ UNION  │      │ sales_2024   │           │
│  │              │──────│        │──────│              │           │
│  │              │      └────────┘      │              │           │
│  │ ☑ id         │                      │ ☑ id         │           │
│  │ ☑ amount     │                      │ ☑ amount     │           │
│  │ ☑ date       │                      │ ☑ date       │           │
│  │              │                      │              │           │
│  │ [×]          │                      │ [×]          │           │
│  └──────────────┘                      └──────────────┘           │
│                                                                     │
│  操作类型: ○ UNION  ○ INTERSECT  ○ EXCEPT                         │
│  ☐ 使用列名匹配 (BY NAME)                                          │
│                                                                     │
│  [+ 添加表]                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

**功能模块**:

#### 3.4.1 集合操作连接器
**组件**: `SetConnector.jsx`

**实现**:
```jsx
const SetConnector = ({ operationType }) => {
  return (
    <div className="set-connector shrink-0 flex items-center justify-center px-4">
      <div className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-full">
        {operationType}
      </div>
    </div>
  );
};
```

**交互**:
- 显示当前集合操作类型
- 所有连接器显示相同的操作类型

#### 3.4.2 操作类型选择
**组件**: `SetOperationTypeSelector.jsx`

**实现**:
```jsx
const SetOperationTypeSelector = ({ value, onChange, useByName, onByNameChange }) => {
  return (
    <div className="p-4 bg-muted/20 rounded-lg border border-border">
      <label className="text-sm font-medium mb-3 block">操作类型:</label>
      <div className="flex gap-3 mb-4">
        {['UNION', 'INTERSECT', 'EXCEPT'].map(type => (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="setOperation"
              value={type}
              checked={value === type}
              onChange={(e) => onChange(e.target.value)}
              className="accent-primary"
            />
            <span className="text-sm font-medium">{type}</span>
          </label>
        ))}
      </div>
      
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={useByName}
          onChange={(e) => onByNameChange(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-sm">使用列名匹配 (BY NAME)</span>
      </label>
      
      <div className="mt-3 p-3 bg-info-bg border border-info-border rounded-lg text-xs">
        <strong>说明:</strong>
        <ul className="mt-1 ml-4 list-disc space-y-1">
          <li>UNION: 合并两个结果集，去除重复行</li>
          <li>INTERSECT: 返回两个结果集的交集</li>
          <li>EXCEPT: 返回第一个结果集中不在第二个结果集的行</li>
          <li>BY NAME: 按列名匹配，而非按位置匹配</li>
        </ul>
      </div>
    </div>
  );
};
```

**交互**:
- 单选操作类型（UNION、INTERSECT、EXCEPT）
- 勾选是否使用 BY NAME
- 显示操作说明

#### 3.4.3 列映射配置
**组件**: `ColumnMappingConfig.jsx`

**实现**:
```jsx
const ColumnMappingConfig = ({ tables, mappings, onChange }) => {
  return (
    <div className="p-4 bg-muted/20 rounded-lg border border-border">
      <label className="text-sm font-medium mb-3 block">列映射配置:</label>
      
      <div className="space-y-2">
        {/* 表头 */}
        <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
          <div>表 1</div>
          <div className="text-center">→</div>
          <div>表 2</div>
        </div>
        
        {/* 映射行 */}
        {mappings.map((mapping, index) => (
          <div className="grid grid-cols-3 gap-2">
            <select className="duck-input text-sm">
              {tables[0].columns.map(col => (
                <option value={col.name}>{col.name}</option>
              ))}
            </select>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <select className="duck-input text-sm">
              {tables[1].columns.map(col => (
                <option value={col.name}>{col.name}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      
      <button className="mt-3 w-full py-2 border border-dashed border-primary/50 text-primary rounded text-sm">
        <Plus className="w-4 h-4 inline mr-1" />
        添加映射
      </button>
    </div>
  );
};
```

**交互**:
- 配置列之间的映射关系
- 添加/删除映射
- 自动检测同名列

### 3.5 透视表 TAB

**组件**: `PivotTableTab.jsx`

**入口组件**: `PivotTableBuilder/index.jsx`

**布局结构**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ 透视表  数据源: sales_data                        [执行] [保存]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  行维度 (拖拽字段到此处)                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ⋮⋮ category                                          [×]    │   │
│  │ ⋮⋮ region                                            [×]    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  列维度 (拖拽字段到此处)                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ ⋮⋮ year                                              [×]    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  值聚合                                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [SUM ▼] [amount ▼]  别名: total_amount              [×]    │   │
│  │ [AVG ▼] [price ▼]   别名: avg_price                 [×]    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  [+ 添加聚合]                                                       │
│                                                                     │
│  可用字段:                                                          │
│  [category] [region] [year] [amount] [price] [quantity]           │
└─────────────────────────────────────────────────────────────────────┘
```

**功能模块**:

#### 3.5.1 维度拖放区
**组件**: `DimensionDropZone.jsx`

**实现**:
```jsx
const DimensionDropZone = ({ type, dimensions, onAdd, onRemove, onReorder }) => {
  const [{ isOver }, drop] = useDrop({
    accept: 'FIELD',
    drop: (item) => onAdd(item.field),
    collect: (monitor) => ({
      isOver: monitor.isOver()
    })
  });
  
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">
        {type === 'row' ? '行维度' : '列维度'} (拖拽字段到此处)
      </label>
      <div 
        ref={drop}
        className={`min-h-[100px] p-3 border-2 border-dashed rounded-lg ${
          isOver ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        {dimensions.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            拖拽字段到此处
          </div>
        ) : (
          <div className="space-y-2">
            {dimensions.map((dim, index) => (
              <DimensionItem
                key={dim}
                dimension={dim}
                index={index}
                onRemove={() => onRemove(index)}
                onMove={onReorder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
```

**交互**:
- 拖拽字段到行/列维度区
- 拖拽调整维度顺序
- 点击 × 移除维度
- 高亮显示拖拽目标区域

#### 3.5.2 维度项
**组件**: `DimensionItem.jsx`

**实现**:
```jsx
const DimensionItem = ({ dimension, index, onRemove, onMove }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'DIMENSION',
    item: { dimension, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });
  
  const [, drop] = useDrop({
    accept: 'DIMENSION',
    hover: (item) => {
      if (item.index !== index) {
        onMove(item.index, index);
        item.index = index;
      }
    }
  });
  
  return (
    <div 
      ref={(node) => drag(drop(node))}
      className={`flex items-center gap-2 p-2 bg-muted/30 rounded border border-border cursor-move ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm flex-1">{dimension}</span>
      <button onClick={onRemove} className="text-error hover:bg-error/10 p-1 rounded">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};
```

**交互**:
- 显示拖拽手柄
- 拖拽时半透明
- 悬停时显示插入位置

#### 3.5.3 值聚合配置
**组件**: `ValueAggregationConfig.jsx`

**实现**:
```jsx
const ValueAggregationConfig = ({ aggregations, onAdd, onRemove, onChange }) => {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">值聚合</label>
      <div className="space-y-2">
        {aggregations.map((agg, index) => (
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded border border-border">
            <select 
              value={agg.function}
              onChange={(e) => onChange(index, 'function', e.target.value)}
              className="duck-input text-sm w-24"
            >
              <option value="SUM">SUM</option>
              <option value="AVG">AVG</option>
              <option value="COUNT">COUNT</option>
              <option value="MIN">MIN</option>
              <option value="MAX">MAX</option>
            </select>
            
            <select 
              value={agg.field}
              onChange={(e) => onChange(index, 'field', e.target.value)}
              className="duck-input text-sm flex-1"
            >
              {availableFields.map(field => (
                <option value={field.name}>{field.name}</option>
              ))}
            </select>
            
            <input
              type="text"
              value={agg.alias}
              onChange={(e) => onChange(index, 'alias', e.target.value)}
              placeholder="别名"
              className="duck-input text-sm w-32"
            />
            
            <button onClick={() => onRemove(index)} className="text-error hover:bg-error/10 p-1 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        
        <button onClick={onAdd} className="w-full py-2 border border-dashed border-primary/50 text-primary rounded text-sm">
          <Plus className="w-4 h-4 inline mr-1" />
          添加聚合
        </button>
      </div>
    </div>
  );
};
```

**交互**:
- 选择聚合函数
- 选择聚合字段
- 输入别名
- 添加/删除聚合

#### 3.5.4 可用字段列表
**组件**: `AvailableFieldsList.jsx`

**实现**:
```jsx
const AvailableFieldsList = ({ fields, usedFields }) => {
  return (
    <div>
      <label className="text-sm font-medium mb-2 block">可用字段:</label>
      <div className="flex flex-wrap gap-2">
        {fields.map(field => {
          const isUsed = usedFields.includes(field.name);
          const [{ isDragging }, drag] = useDrag({
            type: 'FIELD',
            item: { field: field.name },
            canDrag: !isUsed,
            collect: (monitor) => ({
              isDragging: monitor.isDragging()
            })
          });
          
          return (
            <div
              ref={drag}
              className={`px-3 py-1.5 text-sm rounded-md border ${
                isUsed 
                  ? 'border-border bg-muted text-muted-foreground cursor-not-allowed' 
                  : 'border-primary bg-primary/10 text-primary cursor-move hover:bg-primary/20'
              } ${isDragging ? 'opacity-50' : ''}`}
            >
              {field.name}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

**交互**:
- 显示所有可用字段
- 已使用的字段置灰
- 拖拽字段到维度区

## 四、统一结果面板

**组件**: `ResultPanel/index.jsx`

**布局结构**:
```
┌─────────────────────────────────────────────────────────────────────┐
│ ═══ [折叠/展开] ═══════════════════════════════════════════════════ │ ← 拖拽调整高度
├─────────────────────────────────────────────────────────────────────┤
│ 100 行 | 5 列 | 执行时间: 0.8s    [导出] [保存为表] [刷新]         │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────┬──────────┬─────────┬──────────┬──────────┐              │
│ │ id ▼  │ name ▼   │ amount ▼│ date ▼   │ city ▼   │              │
│ ├───────┼──────────┼─────────┼──────────┼──────────┤              │
│ │ 1     │ Alice    │ 1500.00 │ 2024-01  │ Beijing  │              │
│ │ 2     │ Bob      │ 2300.00 │ 2024-01  │ Shanghai │              │
│ │ 3     │ Charlie  │ 1800.00 │ 2024-02  │ Beijing  │              │
│ │ ...   │ ...      │ ...     │ ...      │ ...      │              │
│ └───────┴──────────┴─────────┴──────────┴──────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.1 结果工具栏
**组件**: `ResultToolbar.jsx`

**实现**:
```jsx
const ResultToolbar = ({ rowCount, colCount, execTime, onExport, onSaveAsTable, onRefresh }) => {
  return (
    <div className="result-toolbar">
      <div className="flex items-center gap-4 flex-1">
        <span className="font-medium">{rowCount} 行</span>
        <span className="text-muted-foreground">|</span>
        <span className="font-medium">{colCount} 列</span>
        <span className="text-muted-foreground">|</span>
        <span>执行时间: {execTime}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <button onClick={onExport} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">
          <Download className="w-3 h-3 inline mr-1" />
          导出
        </button>
        <button onClick={onSaveAsTable} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">
          <Save className="w-3 h-3 inline mr-1" />
          保存为表
        </button>
        <button onClick={onRefresh} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-surface-hover">
          <RefreshCw className="w-3 h-3 inline mr-1" />
          刷新
        </button>
      </div>
    </div>
  );
};
```

**交互**:
- 显示查询统计信息
- 导出按钮：导出为 CSV/Excel
- 保存为表按钮：保存查询结果为新表
- 刷新按钮：重新执行查询

### 4.2 数据表格
**组件**: `DataTable.jsx`

**实现方案 A - 使用 AG-Grid**:
```jsx
const DataTable = ({ data, columns }) => {
  const gridRef = useRef(null);
  
  const columnDefs = columns.map(col => ({
    field: col.field,
    headerName: col.headerName,
    sortable: true,
    filter: true,
    resizable: true
  }));
  
  return (
    <div className="ag-theme-duckquery h-full">
      <AgGridReact
        ref={gridRef}
        rowData={data}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: true,
          filter: true,
          resizable: true
        }}
        pagination={true}
        paginationPageSize={100}
      />
    </div>
  );
};
```

**实现方案 B - 使用 IDE Table 样式**:
```jsx
const DataTable = ({ data, columns }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [data, sortConfig]);
  
  return (
    <div className="overflow-auto h-full">
      <table className="ide-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th 
                key={col.field}
                onClick={() => handleSort(col.field)}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {col.headerName}
                  {sortConfig.key === col.field && (
                    sortConfig.direction === 'asc' 
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, index) => (
            <tr key={index}>
              {columns.map(col => (
                <td key={col.field}>{row[col.field]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

**交互**:
- 点击列头排序
- 拖拽调整列宽
- 滚动查看更多数据
- 支持分页（大数据量）

### 4.3 垂直调整器
**组件**: `VerticalResizer.jsx`

**实现**:
```jsx
const VerticalResizer = ({ onResize, onToggleCollapse, collapsed }) => {
  const [isDragging, setIsDragging] = useState(false);
  
  const handleMouseDown = (e) => {
    if (e.target.closest('.collapse-btn')) return;
    setIsDragging(true);
    
    const startY = e.clientY;
    const startHeight = resultPanelRef.current.offsetHeight;
    
    const handleMouseMove = (e) => {
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(100, Math.min(800, startHeight + deltaY));
      onResize(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  return (
    <div 
      className="resizer"
      onMouseDown={handleMouseDown}
    >
      <button 
        className="collapse-btn"
        onClick={onToggleCollapse}
      >
        {collapsed ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>
    </div>
  );
};
```

**交互**:
- 鼠标悬停高亮
- 拖拽调整结果面板高度
- 点击折叠/展开按钮
- 限制最小/最大高度

## 五、数据源面板

**组件**: `DataSourcePanel/index.jsx`

**布局结构**:
```
┌─────────────────────────────┐
│ 数据源              [折叠] │
├─────────────────────────────┤
│ 🔍 [搜索表名或字段...]      │
├─────────────────────────────┤
│ ▼ DuckDB 表                 │
│   📊 sales_data    ← 选中   │
│   📊 customer_info          │
│   📊 product_catalog        │
│                             │
│ ▼ 外部数据库                │
│   ▼ 🗄️ MySQL - 生产库 ●    │
│     📊 orders               │
│     📊 users                │
│     📊 products             │
│   ▶ 🗄️ PostgreSQL - 分析库 ○│
│                             │
├─────────────────────────────┤
│ [刷新]  [添加]              │
└─────────────────────────────┘
```

### 5.1 搜索输入
**组件**: `SearchInput.jsx`

**实现**:
```jsx
const SearchInput = ({ value, onChange }) => {
  return (
    <div className="relative w-full">
      <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索表名或字段..."
        className="duck-input pl-9 text-sm h-9 w-full"
      />
    </div>
  );
};
```

**交互**:
- 输入搜索关键词
- 实时过滤表列表
- 支持表名和字段名搜索

### 5.2 表树
**组件**: `TableTree.jsx`

**实现**:
```jsx
const TableTree = ({ tables, selectedTables, onTableSelect, searchQuery }) => {
  const filteredTables = useMemo(() => {
    if (!searchQuery) return tables;
    return tables.filter(table => 
      table.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      table.columns.some(col => col.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [tables, searchQuery]);
  
  return (
    <div className="flex-1 overflow-auto px-6 py-2">
      {/* DuckDB 表 */}
      <div className="mb-4">
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          <ChevronDown className="w-3 h-3" />
          <span>DuckDB 表</span>
        </div>
        <div className="mt-1 space-y-0.5">
          {filteredTables.filter(t => t.type === 'duckdb').map(table => (
            <TableItem
              key={table.id}
              table={table}
              selected={selectedTables.includes(table.id)}
              onSelect={onTableSelect}
            />
          ))}
        </div>
      </div>
      
      {/* 外部数据库 */}
      <ExternalDatabaseSection
        databases={externalDatabases}
        selectedTables={selectedTables}
        onTableSelect={onTableSelect}
      />
    </div>
  );
};
```

**交互**:
- 显示分组的表列表
- 展开/折叠分组
- 双击选择表

### 5.3 表项
**组件**: `TableItem.jsx`

**实现**:
```jsx
const TableItem = ({ table, selected, onSelect }) => {
  const handleDoubleClick = (e) => {
    e.stopPropagation();
    onSelect(table);
  };
  
  return (
    <div
      className={`tree-item ${selected ? 'selected' : ''}`}
      onDoubleClick={handleDoubleClick}
    >
      <Table className={`w-4 h-4 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
      <span className="item-name">{table.name}</span>
      {table.rowCount && (
        <span className="item-count">{formatNumber(table.rowCount)}</span>
      )}
    </div>
  );
};
```

**交互**:
- 单击高亮
- 双击选择
- 选中状态显示主色调图标
- 显示行数统计

### 5.4 水平调整器
**组件**: `HorizontalResizer.jsx`

**实现**:
```jsx
const HorizontalResizer = ({ onResize, onCollapse }) => {
  const [isDragging, setIsDragging] = useState(false);
  
  const handleMouseDown = (e) => {
    setIsDragging(true);
    
    const startX = e.clientX;
    const startWidth = panelRef.current.offsetWidth;
    
    const handleMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const newWidth = startWidth + deltaX;
      
      // 小于 50px 时自动折叠
      if (newWidth < 50) {
        onCollapse();
        handleMouseUp();
        return;
      }
      
      // 限制宽度范围
      const clampedWidth = Math.max(180, Math.min(600, newWidth));
      onResize(clampedWidth);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  return (
    <div 
      className="horizontal-resizer"
      onMouseDown={handleMouseDown}
    />
  );
};
```

**交互**:
- 鼠标悬停高亮
- 拖拽调整面板宽度
- 拖拽到 50px 以下自动折叠
- 限制最小 180px，最大 600px

## 六、业务逻辑迁移

### 6.1 可视化查询逻辑复用

**老组件**: `QueryBuilder.jsx` (1229 行)

**复用策略**: 提取核心逻辑到自定义 Hook

**实现**:
```jsx
// hooks/useVisualQuery.js
const useVisualQuery = (selectedTable) => {
  const [config, setConfig] = useState({
    selectedFields: [],
    filters: [],
    groupBy: [],
    aggregations: [],
    orderBy: [],
    limit: { enabled: true, value: 100 }
  });
  
  const [generatedSQL, setGeneratedSQL] = useState('');
  
  // 从老 QueryBuilder 提取的 SQL 生成逻辑
  useEffect(() => {
    const sql = generateSQL(config, selectedTable);
    setGeneratedSQL(sql);
  }, [config, selectedTable]);
  
  const executeQuery = async () => {
    const { displaySql, originalSql } = applyDisplayLimit(generatedSQL, 10000);
    const results = await executeDuckDBSQL(displaySql, null, true);
    return results;
  };
  
  return {
    config,
    setConfig,
    generatedSQL,
    executeQuery
  };
};
```

**新组件使用**:
```jsx
// VisualQueryBuilder/index.jsx
const VisualQueryBuilder = ({ selectedTable, onResultsReceived }) => {
  const { config, setConfig, generatedSQL, executeQuery } = useVisualQuery(selectedTable);
  
  return (
    <div className="flex h-full">
      {/* 左侧模式卡片 */}
      <ModeCards activeMode={activeMode} onModeChange={setActiveMode} />
      
      {/* 右侧配置区 */}
      <div className="flex-1 overflow-auto p-6">
        {activeMode === 'fields' && (
          <FieldSelector 
            columns={selectedTable.columns}
            selectedFields={config.selectedFields}
            onChange={(fields) => setConfig({ ...config, selectedFields: fields })}
          />
        )}
        {/* ... 其他模式 */}
        
        {/* SQL 预览 */}
        <div className="mt-4 pt-4 border-t border-border">
          <label className="block text-sm font-medium mb-2">生成的 SQL</label>
          <div className="code-block">{generatedSQL}</div>
        </div>
      </div>
    </div>
  );
};
```

### 6.2 JOIN 查询逻辑复用

**老组件**: `JoinCondition.jsx`

**复用策略**: 提取到自定义 Hook

**实现**:
```jsx
// hooks/useJoinQuery.js
const useJoinQuery = (selectedTables) => {
  const [joins, setJoins] = useState([]);
  const [joinTypeConflicts, setJoinTypeConflicts] = useState([]);
  const [resolvedCasts, setResolvedCasts] = useState({});
  
  // 从老 QueryBuilder 提取的类型检测逻辑
  useEffect(() => {
    const conflicts = detectTypeConflicts(joins, selectedTables);
    setJoinTypeConflicts(conflicts);
  }, [joins, selectedTables]);
  
  const executeJoinQuery = async () => {
    // 检查未解决的冲突
    const unresolved = joinTypeConflicts.filter(c => !resolvedCasts[c.key]);
    if (unresolved.length > 0) {
      throw new Error('存在未解决的类型冲突');
    }
    
    // 转换为后端格式
    const queryRequest = {
      sources: convertSources(selectedTables),
      joins: convertJoins(joins, resolvedCasts)
    };
    
    const results = await performQuery(queryRequest);
    return results;
  };
  
  return {
    joins,
    setJoins,
    joinTypeConflicts,
    resolvedCasts,
    setResolvedCasts,
    executeJoinQuery
  };
};
```

**新组件使用**:
```jsx
// JoinQueryBuilder/index.jsx
const JoinQueryBuilder = ({ selectedTables, onResultsReceived }) => {
  const { 
    joins, 
    setJoins, 
    joinTypeConflicts, 
    resolvedCasts,
    setResolvedCasts,
    executeJoinQuery 
  } = useJoinQuery(selectedTables);
  
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  
  const handleExecute = async () => {
    try {
      const results = await executeJoinQuery();
      onResultsReceived(results);
    } catch (error) {
      if (error.message.includes('类型冲突')) {
        setShowConflictDialog(true);
      }
    }
  };
  
  return (
    <div className="flex-1 overflow-auto p-6">
      {/* 表卡片和连接器 */}
      <div className="flex items-start gap-4 overflow-x-auto">
        {selectedTables.map((table, index) => (
          <React.Fragment key={table.id}>
            <TableCard table={table} isPrimary={index === 0} />
            {index < selectedTables.length - 1 && (
              <JoinConnector
                leftTable={selectedTables[index]}
                rightTable={selectedTables[index + 1]}
                config={joins[index]}
                onChange={(config) => updateJoin(index, config)}
              />
            )}
          </React.Fragment>
        ))}
      </div>
      
      {/* 类型冲突对话框 */}
      {showConflictDialog && (
        <JoinTypeConflictDialog
          conflicts={joinTypeConflicts}
          onResolve={(casts) => {
            setResolvedCasts(casts);
            setShowConflictDialog(false);
            handleExecute();
          }}
          onClose={() => setShowConflictDialog(false)}
        />
      )}
    </div>
  );
};
```

### 6.3 集合操作逻辑复用

**老组件**: `SetOperationBuilder.jsx`

**复用策略**: 提取到自定义 Hook

**实现**:
```jsx
// hooks/useSetOperation.js
const useSetOperation = (selectedTables) => {
  const [config, setConfig] = useState({
    operation_type: 'UNION',
    use_by_name: false,
    column_mappings: []
  });
  
  const executeSetOperation = async () => {
    const response = await fetch('/api/set-operations/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config: {
          ...config,
          tables: selectedTables.map(t => ({
            table_name: t.id,
            selected_columns: t.selectedColumns || [],
            alias: null
          }))
        },
        preview: false
      })
    });
    
    const results = await response.json();
    return results;
  };
  
  return {
    config,
    setConfig,
    executeSetOperation
  };
};
```

**新组件使用**:
```jsx
// SetOperationsBuilder/index.jsx
const SetOperationsBuilder = ({ selectedTables, onResultsReceived }) => {
  const { config, setConfig, executeSetOperation } = useSetOperation(selectedTables);
  
  return (
    <div className="flex-1 overflow-auto p-6">
      {/* 表卡片和连接器 */}
      <div className="flex items-start gap-4 overflow-x-auto">
        {selectedTables.map((table, index) => (
          <React.Fragment key={table.id}>
            <TableCard table={table} />
            {index < selectedTables.length - 1 && (
              <SetConnector operationType={config.operation_type} />
            )}
          </React.Fragment>
        ))}
      </div>
      
      {/* 操作类型选择 */}
      <SetOperationTypeSelector
        value={config.operation_type}
        onChange={(type) => setConfig({ ...config, operation_type: type })}
        useByName={config.use_by_name}
        onByNameChange={(val) => setConfig({ ...config, use_by_name: val })}
      />
      
      {/* 列映射配置 */}
      {!config.use_by_name && (
        <ColumnMappingConfig
          tables={selectedTables}
          mappings={config.column_mappings}
          onChange={(mappings) => setConfig({ ...config, column_mappings: mappings })}
        />
      )}
    </div>
  );
};
```

### 6.4 透视表逻辑复用

**老组件**: `VisualAnalysisPanel.jsx` (pivot 模式)

**复用策略**: 提取到自定义 Hook

**实现**:
```jsx
// hooks/usePivotTable.js
const usePivotTable = (selectedTable) => {
  const [config, setConfig] = useState({
    rowDimensions: [],
    colDimensions: [],
    valueAggregations: []
  });
  
  const executePivotQuery = async () => {
    const configPayload = transformVisualConfigForApi(regularConfig, selectedTable.name);
    const pivotPayload = transformPivotConfigForApi(config);
    
    const resp = await previewVisualQuery({
      config: configPayload,
      mode: 'pivot',
      pivotConfig: pivotPayload,
      includeMetadata: true
    }, 10000);
    
    return resp;
  };
  
  return {
    config,
    setConfig,
    executePivotQuery
  };
};
```

**新组件使用**:
```jsx
// PivotTableBuilder/index.jsx
const PivotTableBuilder = ({ selectedTable, onResultsReceived }) => {
  const { config, setConfig, executePivotQuery } = usePivotTable(selectedTable);
  
  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* 行维度 */}
      <DimensionDropZone
        type="row"
        dimensions={config.rowDimensions}
        onAdd={(field) => setConfig({ ...config, rowDimensions: [...config.rowDimensions, field] })}
        onRemove={(index) => setConfig({ ...config, rowDimensions: config.rowDimensions.filter((_, i) => i !== index) })}
        onReorder={(from, to) => reorderDimensions('row', from, to)}
      />
      
      {/* 列维度 */}
      <DimensionDropZone
        type="col"
        dimensions={config.colDimensions}
        onAdd={(field) => setConfig({ ...config, colDimensions: [...config.colDimensions, field] })}
        onRemove={(index) => setConfig({ ...config, colDimensions: config.colDimensions.filter((_, i) => i !== index) })}
        onReorder={(from, to) => reorderDimensions('col', from, to)}
      />
      
      {/* 值聚合 */}
      <ValueAggregationConfig
        aggregations={config.valueAggregations}
        onAdd={addAggregation}
        onRemove={removeAggregation}
        onChange={updateAggregation}
      />
      
      {/* 可用字段 */}
      <AvailableFieldsList
        fields={selectedTable.columns}
        usedFields={[...config.rowDimensions, ...config.colDimensions]}
      />
    </div>
  );
};
```
