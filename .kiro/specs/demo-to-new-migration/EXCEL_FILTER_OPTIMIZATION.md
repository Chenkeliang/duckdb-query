# Excel 风格列筛选优化建议

## 📋 当前实现分析

### 现有功能（ModernDataDisplay.jsx）

**核心常量**：
```javascript
const DISTINCT_SAMPLE_LIMIT = 10000;  // 采样行数
const MAX_DISTINCT_PREVIEW = 1000;    // 显示的最大 distinct values
```

**核心逻辑**：
1. 从数据中采样前 10,000 行
2. 计算每列的 distinct values 和出现次数
3. 按出现次数降序排序
4. 只显示前 1,000 个 distinct values

**功能特性**：
- ✅ Distinct values 列表（带出现次数）
- ✅ 搜索过滤值
- ✅ 全选/反选
- ✅ 重复项/唯一项快捷选择
- ✅ 包含/排除模式
- ✅ 多列过滤（AND 逻辑）
- ✅ 自动类型检测（数值、日期、布尔、字符串）
- ✅ 智能排序

## 🎯 优化建议

### 1. 性能优化

#### 1.1 Web Worker 异步计算

**问题**：
- 当前 distinct values 计算在主线程，大数据集会阻塞 UI

**优化方案**：
```javascript
// 使用 Web Worker 异步计算 distinct values
// frontend/src/workers/distinctValuesWorker.js

self.onmessage = function(e) {
  const { data, columns, sampleLimit, previewLimit } = e.data;
  
  const sample = data.slice(0, sampleLimit);
  const result = {};
  
  columns.forEach((column) => {
    const counts = new Map();
    
    sample.forEach((row) => {
      const rawValue = row[column.field];
      const key = makeValueKey(rawValue);
      if (!counts.has(key)) {
        counts.set(key, {
          key,
          value: rawValue === undefined ? null : rawValue,
          label: formatValueLabel(rawValue === undefined ? null : rawValue),
          count: 0,
        });
      }
      counts.get(key).count += 1;
    });
    
    const options = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, previewLimit);
    
    result[column.field] = {
      options,
      duplicateKeys: options.filter(item => item.count > 1).map(item => item.key),
      uniqueKeys: options.filter(item => item.count === 1).map(item => item.key),
      total: sample.length,
    };
  });
  
  self.postMessage(result);
};
```

**使用方式**：
```javascript
// 在组件中使用
const [distinctValueMap, setDistinctValueMap] = useState({});
const workerRef = useRef(null);

useEffect(() => {
  if (!workerRef.current) {
    workerRef.current = new Worker(new URL('../workers/distinctValuesWorker.js', import.meta.url));
    workerRef.current.onmessage = (e) => {
      setDistinctValueMap(e.data);
    };
  }
  
  return () => {
    workerRef.current?.terminate();
  };
}, []);

useEffect(() => {
  if (columnFilteredData && normalizedColumns.length > 0) {
    workerRef.current?.postMessage({
      data: columnFilteredData,
      columns: normalizedColumns,
      sampleLimit: DISTINCT_SAMPLE_LIMIT,
      previewLimit: MAX_DISTINCT_PREVIEW,
    });
  }
}, [columnFilteredData, normalizedColumns]);
```

**优势**：
- ✅ 不阻塞主线程
- ✅ 大数据集计算更流畅
- ✅ 用户体验更好

#### 1.2 增量计算和缓存

**问题**：
- 每次数据变化都重新计算所有列的 distinct values
- 即使只过滤了一列，也会重新计算所有列

**优化方案**：
```javascript
// 使用增量计算和缓存
const distinctValueCache = useRef(new Map());

const calculateDistinctValuesIncremental = useCallback((data, columns, changedColumn) => {
  const result = {};
  
  columns.forEach((column) => {
    // 如果不是变化的列，且缓存中有，直接使用缓存
    if (column.field !== changedColumn && distinctValueCache.current.has(column.field)) {
      result[column.field] = distinctValueCache.current.get(column.field);
      return;
    }
    
    // 否则重新计算
    const sample = data.slice(0, DISTINCT_SAMPLE_LIMIT);
    const counts = new Map();
    
    sample.forEach((row) => {
      const rawValue = row[column.field];
      const key = makeValueKey(rawValue);
      if (!counts.has(key)) {
        counts.set(key, {
          key,
          value: rawValue === undefined ? null : rawValue,
          label: formatValueLabel(rawValue === undefined ? null : rawValue),
          count: 0,
        });
      }
      counts.get(key).count += 1;
    });
    
    const options = Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_DISTINCT_PREVIEW);
    
    const columnResult = {
      options,
      keyMap: options.reduce((acc, curr) => {
        acc[curr.key] = curr;
        return acc;
      }, {}),
      duplicateKeys: options.filter(item => item.count > 1).map(item => item.key),
      uniqueKeys: options.filter(item => item.count === 1).map(item => item.key),
      total: sample.length,
    };
    
    // 更新缓存
    distinctValueCache.current.set(column.field, columnResult);
    result[column.field] = columnResult;
  });
  
  return result;
}, []);
```

**优势**：
- ✅ 减少重复计算
- ✅ 提升过滤性能
- ✅ 降低 CPU 使用率

#### 1.3 虚拟滚动优化

**问题**：
- 当 distinct values 超过 1,000 个时，只显示前 1,000 个
- 用户无法看到所有值

**优化方案**：
```javascript
// 使用虚拟滚动显示所有 distinct values
import { FixedSizeList } from 'react-window';

const DistinctValueList = ({ options, selectedKeys, onToggle }) => {
  const Row = ({ index, style }) => {
    const item = options[index];
    const isSelected = selectedKeys.includes(item.key);
    
    return (
      <div style={style}>
        <FormControlLabel
          control={
            <Checkbox
              checked={isSelected}
              onChange={() => onToggle(item.key)}
              size="small"
            />
          }
          label={
            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <span>{item.label}</span>
              <Chip label={item.count} size="small" />
            </Box>
          }
        />
      </div>
    );
  };
  
  return (
    <FixedSizeList
      height={400}
      itemCount={options.length}
      itemSize={40}
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
};
```

**优势**：
- ✅ 可以显示所有 distinct values（不限制 1,000 个）
- ✅ 性能不受 distinct values 数量影响
- ✅ 滚动流畅

### 2. 用户体验优化

#### 2.1 智能搜索增强

**问题**：
- 当前只支持简单的字符串匹配
- 不支持模糊搜索、正则表达式

**优化方案**：
```javascript
// 添加搜索模式选择
const [searchMode, setSearchMode] = useState('contains'); // contains | startsWith | endsWith | regex

const filterOptions = useMemo(() => {
  if (!columnFilterSearch) return options;
  
  const searchLower = columnFilterSearch.toLowerCase();
  
  return options.filter((item) => {
    const labelLower = item.label.toLowerCase();
    
    switch (searchMode) {
      case 'contains':
        return labelLower.includes(searchLower);
      case 'startsWith':
        return labelLower.startsWith(searchLower);
      case 'endsWith':
        return labelLower.endsWith(searchLower);
      case 'regex':
        try {
          const regex = new RegExp(columnFilterSearch, 'i');
          return regex.test(item.label);
        } catch {
          return false;
        }
      default:
        return true;
    }
  });
}, [options, columnFilterSearch, searchMode]);
```

**UI 增强**：
```jsx
<Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
  <TextField
    placeholder="搜索值..."
    value={columnFilterSearch}
    onChange={(e) => setColumnFilterSearch(e.target.value)}
    fullWidth
    size="small"
  />
  <Select
    value={searchMode}
    onChange={(e) => setSearchMode(e.target.value)}
    size="small"
  >
    <MenuItem value="contains">包含</MenuItem>
    <MenuItem value="startsWith">开头</MenuItem>
    <MenuItem value="endsWith">结尾</MenuItem>
    <MenuItem value="regex">正则</MenuItem>
  </Select>
</Box>
```

**优势**：
- ✅ 更灵活的搜索方式
- ✅ 支持高级用户需求
- ✅ 提升查找效率

#### 2.2 数值范围筛选

**问题**：
- 对于数值列，只能逐个选择值
- 不支持范围筛选（如 100-200）

**优化方案**：
```javascript
// 为数值列添加范围筛选
const NumericRangeFilter = ({ column, onApply }) => {
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  
  const handleApply = () => {
    onApply({
      type: 'range',
      min: min ? Number(min) : -Infinity,
      max: max ? Number(max) : Infinity,
    });
  };
  
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
      <TextField
        label="最小值"
        type="number"
        value={min}
        onChange={(e) => setMin(e.target.value)}
        size="small"
      />
      <span>-</span>
      <TextField
        label="最大值"
        type="number"
        value={max}
        onChange={(e) => setMax(e.target.value)}
        size="small"
      />
      <Button onClick={handleApply} variant="contained" size="small">
        应用
      </Button>
    </Box>
  );
};
```

**优势**：
- ✅ 更适合数值列的筛选场景
- ✅ 减少点击次数
- ✅ 提升效率

#### 2.3 日期范围筛选

**问题**：
- 对于日期列，只能逐个选择日期
- 不支持日期范围筛选

**优化方案**：
```javascript
// 为日期列添加日期范围选择器
import { DatePicker } from '@mui/x-date-pickers';

const DateRangeFilter = ({ column, onApply }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  
  const handleApply = () => {
    onApply({
      type: 'dateRange',
      start: startDate,
      end: endDate,
    });
  };
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <DatePicker
        label="开始日期"
        value={startDate}
        onChange={setStartDate}
        slotProps={{ textField: { size: 'small' } }}
      />
      <DatePicker
        label="结束日期"
        value={endDate}
        onChange={setEndDate}
        slotProps={{ textField: { size: 'small' } }}
      />
      <Button onClick={handleApply} variant="contained" size="small">
        应用
      </Button>
    </Box>
  );
};
```

**优势**：
- ✅ 更适合日期列的筛选场景
- ✅ 直观的日期选择
- ✅ 提升用户体验

#### 2.4 过滤器预设和保存

**问题**：
- 用户每次都要重新配置过滤器
- 不支持保存常用过滤器

**优化方案**：
```javascript
// 添加过滤器预设功能
const [savedFilters, setSavedFilters] = useState([]);

const saveCurrentFilter = () => {
  const filterName = prompt('请输入过滤器名称：');
  if (!filterName) return;
  
  const newFilter = {
    id: Date.now(),
    name: filterName,
    filters: { ...columnValueFilters },
    createdAt: new Date().toISOString(),
  };
  
  setSavedFilters([...savedFilters, newFilter]);
  localStorage.setItem('savedFilters', JSON.stringify([...savedFilters, newFilter]));
};

const loadFilter = (filter) => {
  setColumnValueFilters(filter.filters);
};

const deleteFilter = (filterId) => {
  const updated = savedFilters.filter(f => f.id !== filterId);
  setSavedFilters(updated);
  localStorage.setItem('savedFilters', JSON.stringify(updated));
};
```

**UI 增强**：
```jsx
<Box sx={{ mb: 2 }}>
  <Typography variant="subtitle2" gutterBottom>
    保存的过滤器
  </Typography>
  <Stack spacing={1}>
    {savedFilters.map((filter) => (
      <Box key={filter.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          size="small"
          onClick={() => loadFilter(filter)}
          startIcon={<Filter size={14} />}
        >
          {filter.name}
        </Button>
        <IconButton size="small" onClick={() => deleteFilter(filter.id)}>
          <Trash2 size={14} />
        </IconButton>
      </Box>
    ))}
  </Stack>
  <Button
    size="small"
    onClick={saveCurrentFilter}
    startIcon={<Save size={14} />}
    sx={{ mt: 1 }}
  >
    保存当前过滤器
  </Button>
</Box>
```

**优势**：
- ✅ 提升重复操作效率
- ✅ 支持团队共享过滤器
- ✅ 减少配置时间

### 3. 功能增强

#### 3.1 多列联合筛选（OR 逻辑）

**问题**：
- 当前只支持 AND 逻辑（所有列的过滤条件都要满足）
- 不支持 OR 逻辑（任一列的过滤条件满足即可）

**优化方案**：
```javascript
// 添加过滤逻辑选择
const [filterLogic, setFilterLogic] = useState('AND'); // AND | OR

const applyColumnFilters = useCallback((data) => {
  if (Object.keys(columnValueFilters).length === 0) {
    return data;
  }
  
  return data.filter((row) => {
    const results = Object.entries(columnValueFilters).map(([field, config]) => {
      const value = row[field];
      const key = makeValueKey(value);
      const isSelected = config.selectedKeys.includes(key);
      return config.includeMode === 'include' ? isSelected : !isSelected;
    });
    
    // 根据逻辑模式返回结果
    return filterLogic === 'AND' 
      ? results.every(Boolean) 
      : results.some(Boolean);
  });
}, [columnValueFilters, filterLogic]);
```

**UI 增强**：
```jsx
<ToggleButtonGroup
  value={filterLogic}
  exclusive
  onChange={(e, value) => value && setFilterLogic(value)}
  size="small"
>
  <ToggleButton value="AND">AND（且）</ToggleButton>
  <ToggleButton value="OR">OR（或）</ToggleButton>
</ToggleButtonGroup>
```

**优势**：
- ✅ 更灵活的过滤逻辑
- ✅ 支持复杂查询场景
- ✅ 提升数据分析能力

#### 3.2 过滤历史记录

**问题**：
- 用户无法回退到之前的过滤状态
- 不支持撤销/重做

**优化方案**：
```javascript
// 添加过滤历史记录
const [filterHistory, setFilterHistory] = useState([]);
const [historyIndex, setHistoryIndex] = useState(-1);

const addToHistory = (filters) => {
  const newHistory = filterHistory.slice(0, historyIndex + 1);
  newHistory.push(filters);
  setFilterHistory(newHistory);
  setHistoryIndex(newHistory.length - 1);
};

const undo = () => {
  if (historyIndex > 0) {
    setHistoryIndex(historyIndex - 1);
    setColumnValueFilters(filterHistory[historyIndex - 1]);
  }
};

const redo = () => {
  if (historyIndex < filterHistory.length - 1) {
    setHistoryIndex(historyIndex + 1);
    setColumnValueFilters(filterHistory[historyIndex + 1]);
  }
};
```

**UI 增强**：
```jsx
<Box sx={{ display: 'flex', gap: 1 }}>
  <Tooltip title="撤销 (Ctrl+Z)">
    <IconButton
      size="small"
      onClick={undo}
      disabled={historyIndex <= 0}
    >
      <ArrowLeft size={16} />
    </IconButton>
  </Tooltip>
  <Tooltip title="重做 (Ctrl+Y)">
    <IconButton
      size="small"
      onClick={redo}
      disabled={historyIndex >= filterHistory.length - 1}
    >
      <ArrowRight size={16} />
    </IconButton>
  </Tooltip>
</Box>
```

**优势**：
- ✅ 支持撤销/重做
- ✅ 提升用户体验
- ✅ 减少误操作

#### 3.3 过滤器可视化

**问题**：
- 用户不清楚当前应用了哪些过滤器
- 不方便快速移除某个过滤器

**优化方案**：
```jsx
// 在表格上方显示当前过滤器
<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
  {Object.entries(columnValueFilters).map(([field, config]) => {
    const column = normalizedColumns.find(c => c.field === field);
    const count = config.selectedKeys.length;
    
    return (
      <Chip
        key={field}
        label={`${column?.headerName || field}: ${count} 个值 (${config.includeMode === 'include' ? '包含' : '排除'})`}
        onDelete={() => removeColumnFilter(field)}
        color="primary"
        variant="outlined"
        size="small"
      />
    );
  })}
  {Object.keys(columnValueFilters).length > 0 && (
    <Button
      size="small"
      onClick={clearAllFilters}
      startIcon={<X size={14} />}
    >
      清除所有过滤器
    </Button>
  )}
</Box>
```

**优势**：
- ✅ 过滤器状态一目了然
- ✅ 快速移除单个过滤器
- ✅ 提升可用性

## 📊 优化优先级

### 🔴 高优先级（立即实施）

1. **Web Worker 异步计算** - 解决性能瓶颈
2. **虚拟滚动** - 支持显示所有 distinct values
3. **过滤器可视化** - 提升用户体验

### 🟡 中优先级（后续迭代）

4. **增量计算和缓存** - 进一步优化性能
5. **数值/日期范围筛选** - 增强功能
6. **智能搜索增强** - 提升查找效率

### 🟢 低优先级（可选）

7. **过滤器预设和保存** - 提升重复操作效率
8. **多列联合筛选（OR 逻辑）** - 支持复杂场景
9. **过滤历史记录** - 支持撤销/重做

## 🎯 实施建议

### Phase 1: 性能优化（Week 1）
- 实现 Web Worker 异步计算
- 实现虚拟滚动
- 实现过滤器可视化

### Phase 2: 功能增强（Week 2）
- 实现数值/日期范围筛选
- 实现智能搜索增强
- 实现增量计算和缓存

### Phase 3: 高级功能（Week 3）
- 实现过滤器预设和保存
- 实现多列联合筛选（OR 逻辑）
- 实现过滤历史记录

## ✅ 预期效果

实施这些优化后，Excel 风格列筛选将：

1. **性能提升 3-5 倍**
   - Web Worker 避免 UI 阻塞
   - 虚拟滚动支持无限 distinct values
   - 增量计算减少重复计算

2. **用户体验显著改善**
   - 过滤器状态可视化
   - 数值/日期范围筛选更直观
   - 智能搜索更高效

3. **功能更强大**
   - 支持 OR 逻辑
   - 支持过滤器预设
   - 支持撤销/重做

---

**文档创建时间**: 2024-12-04  
**适用版本**: demo-to-new-migration  
**状态**: 📝 待评审
