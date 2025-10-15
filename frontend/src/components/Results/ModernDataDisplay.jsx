import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Pagination,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { Eye, EyeOff, Filter, List, RefreshCw, Save, Scroll, Search, Table, TrendingUp, X, SlidersHorizontal, Plus, Trash2, ChevronDown } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import QuickCharts from '../DataVisualization/QuickCharts';
import StableTable from '../StableTable';
import VirtualTable from '../VirtualTable/VirtualTable';

const DISTINCT_SAMPLE_LIMIT = 10000;
const MAX_DISTINCT_PREVIEW = 1000;

const NULL_KEY = '__NULL__';

const makeValueKey = (value) => {
  if (value === null || value === undefined) {
    return NULL_KEY;
  }
  if (value instanceof Date) {
    return `date:${value.toISOString()}`;
  }
  const valueType = typeof value;
  if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
    return `${valueType}:${value}`;
  }
  if (valueType === 'object') {
    try {
      return `obj:${JSON.stringify(value)}`;
    } catch (error) {
      return `obj:${String(value)}`;
    }
  }
  return `str:${String(value)}`;
};

const formatValueLabel = (value) => {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (err) {
      return String(value);
    }
  }
  return String(value);
};

const ModernDataDisplay = ({
  data = [],
  columns = [],
  loading = false,
  onExport,
  onRefresh,
  title = '查询结果',
  sqlQuery = '',
  originalDatasource = null,
  onDataSourceSaved,
  onApplyFilters = null,
  activeFilters = [],
  // Visual query specific props
  isVisualQuery = false,
  visualConfig = null,
  generatedSQL = '',
  // Set operation specific props
  isSetOperation = false,
  setOperationConfig = null,
}) => {

  const theme = useTheme();
  const { showSuccess, showError } = useToast();
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(new Set());
  const [renderMode, setRenderMode] = useState('agGrid'); // 'agGrid' 或 'virtual'
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState([]);
  const [visualExpanded, setVisualExpanded] = useState(false);
  const [valueSearchMap, setValueSearchMap] = useState({});

  // 保存到表相关状态
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [datasourceName, setDatasourceName] = useState('');
  const [tableAlias, setTableAlias] = useState('');
  const [saveMode, setSaveMode] = useState('duckdb'); // 只支持 'duckdb' 模式
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const filterOperators = useMemo(() => ([
    { value: 'equals', label: '等于' },
    { value: 'notEquals', label: '不等于' },
    { value: 'contains', label: '包含' },
    { value: 'notContains', label: '不包含' },
    { value: 'startsWith', label: '以...开头' },
    { value: 'endsWith', label: '以...结尾' },
    { value: 'greaterThan', label: '大于' },
    { value: 'greaterOrEqual', label: '大于等于' },
    { value: 'lessThan', label: '小于' },
    { value: 'lessOrEqual', label: '小于等于' },
    { value: 'isNull', label: '为空' },
    { value: 'isNotNull', label: '不为空' }
  ]), []);

  const operatorLabelMap = useMemo(() => {
    const map = filterOperators.reduce((acc, cur) => {
      acc[cur.value] = cur.label;
      return acc;
    }, {});
    map.in = '包含';
    map.notIn = '排除';
    return map;
  }, [filterOperators]);

  const hasFilterSupport = Boolean(onApplyFilters && (sqlQuery || generatedSQL));

  // 标准化columns格式 - 支持字符串数组和对象数组
  const normalizedColumns = useMemo(() => {
    if (!columns || columns.length === 0) return [];

    // 如果是字符串数组，转换为对象数组
    if (typeof columns[0] === 'string') {
      return columns.map(col => ({
        field: String(col),
        headerName: String(col),
        sortable: true,
        filter: true,
        resizable: true,
      }));
    }

    // 如果已经是对象数组，安全地处理field字段
    return columns.map((col, index) => {
      // 安全地获取field值
      let fieldValue = '';
      if (typeof col === 'string') {
        fieldValue = col;
      } else if (col && typeof col === 'object') {
        fieldValue = col.field || col.name || '';
      }

      // 确保field是有效的字符串
      const safeField = fieldValue ? String(fieldValue) : `column_${index}`;

      return {
        ...col,
        field: safeField,
        headerName: col.headerName || col.name || safeField,
      };
    });
  }, [columns]);

  // 调试 normalizedColumns
  if (process.env.NODE_ENV === 'development') {
  }

  // 当columns变化时，更新visibleColumns
  React.useEffect(() => {
    if (normalizedColumns.length > 0) {
      setVisibleColumns(new Set(normalizedColumns.map(col => col.field)));
    }
  }, [normalizedColumns]);

  React.useEffect(() => {
    if (filterDialogOpen) {
      return;
    }

    if (!Array.isArray(activeFilters) || activeFilters.length === 0) {
      setDraftFilters([]);
      return;
    }

    const mapped = activeFilters.map(filter => {
      if (filter.operator === 'in' || filter.operator === 'notIn') {
        const valuesArray = Array.isArray(filter.value) ? filter.value : [];
        return {
          field: filter.field,
          mode: 'values',
          includeMode: filter.operator === 'notIn' ? 'exclude' : 'include',
          selectedValueKeys: valuesArray.map(makeValueKey),
          operator: filter.operator,
        };
      }

      return {
        field: filter.field,
        mode: 'condition',
        operator: filter.operator,
        value: filter.value,
      };
    });

    setDraftFilters(mapped);
  }, [activeFilters, filterDialogOpen]);

  React.useEffect(() => {
    if (filterDialogOpen && draftFilters.length === 0) {
      setDraftFilters([{
        field: '',
        mode: 'values',
        includeMode: 'include',
        selectedValueKeys: null,
        operator: 'in',
        value: ''
      }]);
    }
  }, [filterDialogOpen, draftFilters.length]);

  // 过滤和搜索数据
  const filteredData = useMemo(() => {
    if (!searchText) return data;

    return data.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(searchText.toLowerCase())
      )
    );
  }, [data, searchText]);

  const distinctValueMap = useMemo(() => {
    if (!filteredData || filteredData.length === 0 || normalizedColumns.length === 0) {
      return {};
    }

    const sample = filteredData.slice(0, DISTINCT_SAMPLE_LIMIT);
    const result = {};

    normalizedColumns.forEach((column) => {
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
        const entry = counts.get(key);
        entry.count += 1;
      });

      const options = Array.from(counts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_DISTINCT_PREVIEW);

      result[column.field] = {
        options,
        keyMap: options.reduce((acc, curr) => {
          acc[curr.key] = curr;
          return acc;
        }, {}),
        duplicateKeys: options.filter(item => item.count > 1).map(item => item.key),
        uniqueKeys: options.filter(item => item.count === 1).map(item => item.key),
        total: sample.length,
      };
    });

    return result;
  }, [filteredData, normalizedColumns]);

  // 分页数据
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // 关联结果列的单元格渲染器
  const JoinResultCellRenderer = (params) => {
    const value = params.value;
    if (!value) return '';

    const getDisplayInfo = (joinResult) => {
      switch (joinResult) {
        case 'both':
          return {
            label: '匹配',
            backgroundColor: '#4caf50',
            color: 'white'
          };
        case 'left':
          return {
            label: '仅左表',
            backgroundColor: '#ff9800',
            color: 'white'
          };
        case 'right':
          return {
            label: '仅右表',
            backgroundColor: '#2196f3',
            color: 'white'
          };
        default:
          return {
            label: value,
            backgroundColor: '#e0e0e0',
            color: '#333'
          };
      }
    };

    const displayInfo = getDisplayInfo(value);

    // 创建DOM元素并返回
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; justify-content: center; align-items: center; height: 100%; width: 100%;';

    const chip = document.createElement('span');
    chip.style.cssText = `
      background-color: ${displayInfo.backgroundColor};
      color: ${displayInfo.color};
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      text-align: center;
      min-width: 60px;
      display: inline-block;
      white-space: nowrap;
    `;
    chip.textContent = displayInfo.label;

    // 移除事件防护，避免React错误

    container.appendChild(chip);
    return container;
  };

  // AG-Grid列定义
  const columnDefs = useMemo(() => {
    return normalizedColumns
      .filter(col => visibleColumns.has(col.field))
      .map(col => {
        // 检查是否是关联结果列
        const isJoinResultColumn = col.field && typeof col.field === 'string' && col.field.startsWith('join_result_');

        const baseConfig = {
          ...col,
          sortable: true,
          filter: true,
          resizable: true,
          width: isJoinResultColumn ? 120 : 150, // 关联结果列稍窄
          minWidth: isJoinResultColumn ? 100 : 80,
          headerClass: isJoinResultColumn ? 'join-result-header' : 'modern-header',
        };

        if (isJoinResultColumn) {
          return {
            ...baseConfig,
            cellRenderer: JoinResultCellRenderer,
            cellStyle: {
              fontSize: '0.875rem',
              padding: '4px 8px',
              textAlign: 'center',
              backgroundColor: 'rgba(33, 150, 243, 0.02)',
            },
            headerName: col.headerName || col.field.replace('join_result_', '关联结果_'),
          };
        } else {
          return {
            ...baseConfig,
            cellStyle: {
              fontSize: '0.875rem',
              padding: '8px 12px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          };
        }
      });
  }, [normalizedColumns, visibleColumns]);

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: data.length,
      filtered: filteredData.length,
      columns: normalizedColumns.length,
      visibleColumns: visibleColumns.size,
    };
  }, [data, filteredData, normalizedColumns, visibleColumns]);


  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };

  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };


  const handleColumnToggle = (columnField) => {
    const newVisibleColumns = new Set(visibleColumns);
    if (newVisibleColumns.has(columnField)) {
      newVisibleColumns.delete(columnField);
    } else {
      newVisibleColumns.add(columnField);
    }
    setVisibleColumns(newVisibleColumns);
  };

  const handleClearSearch = () => {
    setSearchText('');
    setCurrentPage(1);
  };


  // 保存到表相关函数
  const handleSaveAsDataSource = () => {
    setSaveDialogOpen(true);
    const timestamp = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/[\/\s:]/g, '');
    setDatasourceName(`查询结果_${timestamp}`);
    setTableAlias(`query_result_${timestamp}`);
  };

  const handleSaveDialogClose = () => {
    setSaveDialogOpen(false);
    setDatasourceName('');
    setTableAlias('');
    setSaveError('');
  };

  const handleSaveConfirm = async () => {
    // 新架构：保存到DuckDB
    if (!tableAlias.trim()) {
      setSaveError('请输入DuckDB表别名');
      return;
    }

    if (!sqlQuery.trim()) {
      setSaveError('没有可保存的查询结果');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      let result;

      // 统一使用异步任务保存到表

      // 构建异步任务请求
      const asyncRequest = {
        sql: sqlQuery,
        format: 'parquet', // 保存到表不需要文件格式，但异步任务需要
        custom_table_name: tableAlias.trim(),
        task_type: 'save_to_table'
      };

      if (originalDatasource && typeof originalDatasource === 'object') {
        asyncRequest.datasource = { ...originalDatasource };
      }

      // 提交异步任务（设置超时，避免长时间等待）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      try {
        const response = await fetch('/api/async_query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asyncRequest),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || '提交异步任务失败');
        }

        result = await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('提交异步任务超时，请稍后查看异步任务列表');
        }
        throw error;
      }

      if (result.success) {
        setSaveDialogOpen(false);
        setTableAlias('');
        setDatasourceName('');

        const taskId = result.task_id;
        const tableName = tableAlias.trim();
        showSuccess(`异步任务已提交！任务ID: ${taskId}，表名: ${tableName}。系统将自动根据查询结果生成新表，请到异步任务列表查看进度。`);

        // 通知父组件数据源已保存（异步任务完成后会更新）
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: taskId,
            type: 'async_task',
            name: `异步任务: ${tableName}`,
            status: 'pending',
            task_id: taskId
          });
        }
      } else {
        const errorMsg = result.message || '提交异步任务失败';
        setSaveError(errorMsg);
        showError(errorMsg);
      }
    } catch (error) {
      const errorMsg = error.message || '保存失败，请重试';
      setSaveError(errorMsg);
      showError(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(filteredData.length / pageSize);

  const getAllDistinctKeys = React.useCallback((field) => {
    const info = distinctValueMap[field];
    if (!info || !info.options) {
      return [];
    }
    return info.options.map(option => option.key);
  }, [distinctValueMap]);

  const getDistinctEntriesByKeys = React.useCallback((field, keys = []) => {
    const info = distinctValueMap[field];
    if (!info) {
      return [];
    }
    return keys
      .map(key => info.keyMap?.[key])
      .filter(Boolean);
  }, [distinctValueMap]);

  const handleValueSearchChange = (index, value) => {
    setValueSearchMap(prev => ({ ...prev, [index]: value }));
  };

  const getSelectionState = (filter, field) => {
    const allKeys = getAllDistinctKeys(field);
    const includeMode = filter.includeMode || 'include';
    const definedKeys = Array.isArray(filter.selectedValueKeys) ? filter.selectedValueKeys : null;
    const shouldUseDefined = definedKeys && definedKeys.length > 0;
    const keySet = new Set(
      shouldUseDefined
        ? definedKeys
        : (includeMode === 'exclude' ? [] : allKeys)
    );
    return { keySet, allKeys };
  };

  const updateSelectedKeys = (index, updater) => {
    setDraftFilters(prev => {
      const next = [...prev];
      const target = { ...next[index] };
      if (!target.field) {
        return prev;
      }
      const { keySet, allKeys } = getSelectionState(target, target.field);
      const updatedKeys = updater(keySet, allKeys, target.includeMode || 'include');
      target.selectedValueKeys = Array.from(updatedKeys);
      target.mode = 'values';
      if (!target.includeMode) {
        target.includeMode = 'include';
      }
      target.operator = target.includeMode === 'exclude' ? 'notIn' : 'in';
      next[index] = target;
      return next;
    });
  };

  const handleToggleValueKey = (index, key, checked) => {
    updateSelectedKeys(index, (keySet) => {
      if (checked) {
        keySet.add(key);
      } else {
        keySet.delete(key);
      }
      return keySet;
    });
  };

  const handleSelectAllValues = (index) => {
    updateSelectedKeys(index, (_, allKeys) => new Set(allKeys));
  };

  const handleClearAllValues = (index) => {
    updateSelectedKeys(index, () => new Set());
  };

  const handleInvertValues = (index) => {
    updateSelectedKeys(index, (keySet, allKeys) => {
      const inverted = new Set();
      allKeys.forEach((key) => {
        if (!keySet.has(key)) {
          inverted.add(key);
        }
      });
      return inverted;
    });
  };

  const handleSelectDuplicates = (index, field) => {
    const duplicates = distinctValueMap[field]?.duplicateKeys || [];
    updateSelectedKeys(index, () => new Set(duplicates));
  };

  const handleSelectUnique = (index, field) => {
    const unique = distinctValueMap[field]?.uniqueKeys || [];
    updateSelectedKeys(index, () => new Set(unique));
  };

  const handleIncludeModeChange = (index, mode) => {
    setDraftFilters(prev => {
      const next = [...prev];
      const target = { ...next[index] };
      target.includeMode = mode;
      target.operator = mode === 'exclude' ? 'notIn' : 'in';
      target.selectedValueKeys = mode === 'exclude' ? (Array.isArray(target.selectedValueKeys) ? target.selectedValueKeys : []) : target.selectedValueKeys;
      next[index] = target;
      return next;
    });
  };

  const handleFilterModeChange = (index, mode) => {
    setDraftFilters(prev => {
      const next = [...prev];
      const target = { ...next[index] };
      target.mode = mode;
      if (mode === 'condition' && !target.operator) {
        target.operator = 'equals';
      }
      if (mode === 'values' && !target.includeMode) {
        target.includeMode = 'include';
        target.operator = 'in';
      }
      next[index] = target;
      return next;
    });
  };

  const updateDraftFilter = (index, key, value) => {
    setDraftFilters(prev => {
      const next = [...prev];
      const current = { ...next[index] };

      if (key === 'field') {
        current.field = value;
        current.selectedValueKeys = null;
        current.mode = current.mode || 'values';
        current.includeMode = current.includeMode || 'include';
        current.operator = current.mode === 'condition' ? (current.operator || 'equals') : 'in';
        setValueSearchMap(prevSearch => {
          const updated = { ...prevSearch };
          delete updated[index];
          return updated;
        });
      } else if (key === 'operator') {
        current.operator = value;
      } else {
        current[key] = value;
      }

      next[index] = current;
      return next;
    });
  };

  const handleAddFilterRow = () => {
    setDraftFilters(prev => [...prev, {
      field: '',
      mode: 'values',
      includeMode: 'include',
      operator: 'in',
      selectedValueKeys: null,
      value: ''
    }]);
  };

  const handleRemoveFilterRow = (index) => {
    setDraftFilters(prev => prev.filter((_, i) => i !== index));
    setValueSearchMap({});
  };

  const handleApplyFilterSubmit = () => {
    if (!onApplyFilters) {
      setFilterDialogOpen(false);
      return;
    }

    const normalized = [];

    draftFilters.forEach((filter) => {
      if (!filter || !filter.field) {
        return;
      }

      if (filter.mode === 'values') {
        const info = distinctValueMap[filter.field];
        if (!info) {
          return;
        }

        const includeMode = filter.includeMode || 'include';
        const allKeys = info.options.map(option => option.key);
        const hasDefinedSelection = Array.isArray(filter.selectedValueKeys) && filter.selectedValueKeys.length > 0;
        const selectedKeysArray = hasDefinedSelection
          ? filter.selectedValueKeys
          : (includeMode === 'exclude' ? [] : allKeys);

        const uniqueSelectedKeys = Array.from(new Set(selectedKeysArray));

        if (includeMode === 'include' && uniqueSelectedKeys.length === allKeys.length) {
          return;
        }

        if (includeMode === 'exclude' && uniqueSelectedKeys.length === 0) {
          return;
        }

        const entries = getDistinctEntriesByKeys(filter.field, uniqueSelectedKeys);
        const values = entries.map(entry => (entry.value === undefined ? null : entry.value));

        normalized.push({
          field: filter.field,
          operator: includeMode === 'exclude' ? 'notIn' : 'in',
          value: values,
        });
        return;
      }

      const operator = filter.operator || 'equals';
      if (operator === 'isNull' || operator === 'isNotNull') {
        normalized.push({
          field: filter.field,
          operator,
          value: null,
        });
        return;
      }

      if (filter.value !== undefined && filter.value !== null && String(filter.value).trim() !== '') {
        normalized.push({
          field: filter.field,
          operator,
          value: filter.value,
        });
      }
    });

    onApplyFilters(normalized);
    setFilterDialogOpen(false);
  };

  const handleClearFilters = () => {
    if (onApplyFilters) {
      onApplyFilters([]);
    }
    setValueSearchMap({});
    setFilterDialogOpen(false);
  };

  const handleRemoveActiveFilter = (index) => {
    if (!onApplyFilters) return;
    const next = (activeFilters || []).filter((_, i) => i !== index);
    onApplyFilters(next);
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部工具栏 */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TrendingUp size={24} color="#1976d2" />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {title}
                  {isVisualQuery && (
                    <Chip
                      label="可视化查询"
                      size="small"
                      color="primary"
                      sx={{ ml: 1, fontSize: '0.75rem' }}
                    />
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stats.filtered} / {stats.total} 行 • {stats.visibleColumns} / {stats.columns} 列
                  {isVisualQuery && visualConfig && (
                    <>
                      {visualConfig.aggregations && visualConfig.aggregations.length > 0 && (
                        <> • {visualConfig.aggregations.length} 个聚合函数</>
                      )}
                      {visualConfig.filters && visualConfig.filters.length > 0 && (
                        <> • {visualConfig.filters.length} 个筛选条件</>
                      )}
                    </>
                  )}
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={1}>
              <Tooltip title={renderMode === 'agGrid' ? '切换到虚拟滚动模式（适合大数据量）' : '切换到标准表格模式（适合小数据量）'}>
                <IconButton
                  onClick={() => setRenderMode(renderMode === 'agGrid' ? 'virtual' : 'agGrid')}
                  color={renderMode === 'virtual' ? 'primary' : 'default'}
                >
                  {renderMode === 'agGrid' ? <Scroll size={20} /> : <List size={20} />}
                </IconButton>
              </Tooltip>

              <Tooltip title="列筛选（生成条件查询）">
                <span>
                  <IconButton
                    onClick={() => setFilterDialogOpen(true)}
                    color={activeFilters && activeFilters.length > 0 ? 'primary' : 'default'}
                    disabled={!hasFilterSupport || loading}
                  >
                    <Filter size={20} />
                  </IconButton>
                </span>
              </Tooltip>

              <Tooltip title="列显示/隐藏">
                <IconButton onClick={handleColumnMenuOpen}>
                  <SlidersHorizontal size={20} />
                </IconButton>
              </Tooltip>

              <Tooltip title="刷新数据">
                <IconButton onClick={onRefresh} disabled={loading}>
                  <RefreshCw size={20} />
                </IconButton>
              </Tooltip>

              <Button
                startIcon={<Save size={20} />}
                variant="outlined"
                onClick={handleSaveAsDataSource}
                disabled={data.length === 0 || !sqlQuery || loading}
                size="small"
                color="primary"
                sx={{
                  '&.Mui-disabled': {
                    backgroundColor: 'action.disabledBackground',
                    color: 'action.disabled',
                  },
                }}
                title={`调试信息: data.length=${data.length}, sqlQuery="${sqlQuery}", loading=${loading}, 禁用条件: ${data.length === 0 ? '数据为空' : !sqlQuery ? 'SQL查询为空' : loading ? '正在加载' : '无'}`}
              >
                提交异步任务
                {/* 临时调试信息 */}
                {process.env.NODE_ENV === 'development' && (
                  <Typography variant="caption" sx={{ ml: 1, fontSize: '10px', opacity: 0.7 }}>
                    [D:{data.length} S:{sqlQuery ? '✓' : '✗'} L:{loading ? '✓' : '✗'}]
                  </Typography>
                )}
              </Button>

            </Stack>
          </Box>

          {/* 导出提示信息 */}
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>数据导出提示：</strong> 界面查询默认限制10,000行。如需完整结果，请使用异步任务功能，系统会自动根据结果生成新表。导出可在异步任务页面下载。
            </Typography>
          </Alert>

          {/* 搜索和筛选工具 */}
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              placeholder="搜索数据..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              sx={{ minWidth: 300 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={20} color="#666" />
                  </InputAdornment>
                ),
                endAdornment: searchText && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleClearSearch}>
                      <X size={16} />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>每页显示</InputLabel>
              <Select
                value={pageSize}
                label="每页显示"
                onChange={(e) => {
                  setPageSize(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <MenuItem value={25}>25 行</MenuItem>
                <MenuItem value={50}>50 行</MenuItem>
                <MenuItem value={100}>100 行</MenuItem>
                <MenuItem value={200}>200 行</MenuItem>
              </Select>
            </FormControl>

            {searchText && (
              <Chip
                label={`搜索: "${searchText}"`}
                onDelete={handleClearSearch}
                color="primary"
                variant="outlined"
                size="small"
              />
            )}
          </Stack>

          {activeFilters && activeFilters.length > 0 && (
            <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {activeFilters.map((filter, index) => {
                const fieldLabel =
                  normalizedColumns.find(col => col.field === filter.field)?.headerName || filter.field;
                const operatorLabel = operatorLabelMap[filter.operator] || filter.operator;
                let valueLabel = '';

                if (filter.operator === 'isNull' || filter.operator === 'isNotNull') {
                  valueLabel = '';
                } else if (Array.isArray(filter.value)) {
                  const labels = filter.value.map((item) => formatValueLabel(item === undefined ? null : item));
                  const preview = labels.slice(0, 3).join(', ');
                  valueLabel = labels.length > 3 ? `${preview} 等${labels.length}项` : preview;
                } else if (filter.value !== undefined && filter.value !== null) {
                  valueLabel = String(filter.value);
                }

                const chipLabel = [fieldLabel, operatorLabel, valueLabel].filter(part => part && part.trim()).join(' ');

                return (
                  <Chip
                    key={`${filter.field}-${index}`}
                    label={chipLabel}
                    onDelete={() => handleRemoveActiveFilter(index)}
                    color="primary"
                    size="small"
                  />
                );
              })}
              <Button
                size="small"
                variant="text"
                onClick={handleClearFilters}
                sx={{ textTransform: 'none' }}
              >
                清除所有筛选
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      {isVisualQuery && (
        <Card sx={{ mb: 2 }}>
          <CardContent sx={{ pb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Table size={24} color="#3b82f6" />
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    可视化分析
                    <Chip label="单表分析" size="small" color="primary" variant="outlined" />
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    基于图形化查询的结果，可快速选择字段生成可视图表（预览最多 {DISTINCT_SAMPLE_LIMIT.toLocaleString()} 行数据）
                  </Typography>
                </Box>
              </Box>

              <IconButton onClick={() => setVisualExpanded(expanded => !expanded)}>
                <ChevronDown
                  size={20}
                  style={{
                    transform: visualExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </IconButton>
            </Box>

            <Collapse in={visualExpanded} timeout="auto" unmountOnExit>
              <Box sx={{ mt: 2 }}>
                <QuickCharts data={filteredData} columns={normalizedColumns} />
              </Box>
            </Collapse>
          </CardContent>
        </Card>
      )}

      {/* 数据表格 */}
      <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading && <LinearProgress />}

        <Box sx={{ flex: 1, position: 'relative' }}>
          {data.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary',
              }}
            >
              <Table size={64} color="#999" style={{ marginBottom: '16px', opacity: 0.5 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                暂无数据
              </Typography>
              <Typography variant="body2">
                执行查询以查看结果
              </Typography>
            </Box>
          ) : renderMode === 'virtual' ? (
            <VirtualTable
              data={filteredData}
              columns={normalizedColumns}
              height={600}
              loading={loading}
              autoRowHeight={true}
            />
          ) : (
            <StableTable
              data={paginatedData}
              columns={columnDefs}
              pageSize={pageSize}
              height={600}
              originalDatasource={originalDatasource}
            />
          )}
        </Box>

        {/* 底部分页 - 仅在AG-Grid模式下显示 */}
        {data.length > 0 && renderMode === 'agGrid' && (
          <>
            <Divider />
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                显示第 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredData.length)} 条，
                共 {filteredData.length} 条记录
              </Typography>

              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={(event, page) => setCurrentPage(page)}
                color="primary"
                size="small"
                showFirstButton
                showLastButton
              />
            </Box>
          </>
        )}
      </Card>


      {/* 列设置菜单 */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={handleColumnMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: { maxHeight: 400, width: 250 },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            显示列
          </Typography>
          <Stack spacing={1}>
            {normalizedColumns.map((column) => (
              <Box
                key={column.field}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  p: 1,
                  borderRadius: 1,
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
                onClick={() => handleColumnToggle(column.field)}
              >
                <Typography variant="body2">
                  {column.headerName || column.field}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {visibleColumns.has(column.field) ? (
                    <Eye size={16} color="#1976d2" />
                  ) : (
                    <EyeOff size={16} color="#666" />
                  )}
                  <Chip
                    size="small"
                    label={visibleColumns.has(column.field) ? '显示' : '隐藏'}
                    color={visibleColumns.has(column.field) ? 'primary' : 'default'}
                    variant="outlined"
                  />
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </Menu>

      {/* 列筛选对话框 */}
      <Dialog
        open={filterDialogOpen}
        onClose={() => setFilterDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>列筛选条件</DialogTitle>
        <DialogContent dividers>
          {normalizedColumns.length === 0 ? (
            <Alert severity="info">暂无列信息，无法添加筛选条件</Alert>
          ) : (
            <Stack spacing={2}>
              {draftFilters.map((filter, index) => {
                const mode = filter.mode || 'values';
                const includeMode = filter.includeMode || 'include';
                const currentOperator = filter.operator || (mode === 'values' ? 'in' : 'equals');
                const requiresValue = currentOperator !== 'isNull' && currentOperator !== 'isNotNull';
                const valueSearch = valueSearchMap[index] || '';
                const distinctInfo = filter.field ? distinctValueMap[filter.field] : null;
                const options = distinctInfo ? distinctInfo.options : [];
                const filteredOptions = valueSearch
                  ? options.filter(option => option.label.toLowerCase().includes(valueSearch.toLowerCase()))
                  : options;
                const selectionState = filter.field
                  ? getSelectionState(filter, filter.field)
                  : { keySet: new Set(), allKeys: [] };

                return (
                  <Box
                    key={`draft-filter-${index}`}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      p: 2,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5
                    }}
                  >
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>列名</InputLabel>
                        <Select
                          label="列名"
                          value={filter.field || ''}
                          onChange={(e) => updateDraftFilter(index, 'field', e.target.value)}
                        >
                          {normalizedColumns.map((column) => (
                            <MenuItem key={column.field} value={column.field}>
                              {column.headerName || column.field}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <ToggleButtonGroup
                        value={mode}
                        exclusive
                        size="small"
                        onChange={(_, value) => value && handleFilterModeChange(index, value)}
                      >
                        <ToggleButton value="values">列表筛选</ToggleButton>
                        <ToggleButton value="condition">条件筛选</ToggleButton>
                      </ToggleButtonGroup>

                      <IconButton
                        color="error"
                        onClick={() => handleRemoveFilterRow(index)}
                        disabled={draftFilters.length === 1}
                        sx={{ alignSelf: 'flex-start' }}
                      >
                        <Trash2 size={18} />
                      </IconButton>
                    </Stack>

                    {mode === 'values' ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                          <ToggleButtonGroup
                            value={includeMode}
                            exclusive
                            size="small"
                            onChange={(_, value) => value && handleIncludeModeChange(index, value)}
                          >
                            <ToggleButton value="include">包含</ToggleButton>
                            <ToggleButton value="exclude">排除</ToggleButton>
                          </ToggleButtonGroup>

                          <TextField
                            size="small"
                            placeholder="搜索值..."
                            value={valueSearch}
                            onChange={(e) => handleValueSearchChange(index, e.target.value)}
                            sx={{ flex: 1 }}
                            InputProps={{
                              startAdornment: (
                                <InputAdornment position="start">
                                  <Search size={16} />
                                </InputAdornment>
                              ),
                            }}
                          />

                          <Stack direction="row" spacing={1}>
                            <Button size="small" variant="outlined" onClick={() => handleSelectAllValues(index)}>全选</Button>
                            <Button size="small" variant="outlined" onClick={() => handleClearAllValues(index)}>清空</Button>
                            <Button size="small" variant="outlined" onClick={() => handleInvertValues(index)}>反选</Button>
                          </Stack>

                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => handleSelectDuplicates(index, filter.field)}
                              disabled={!distinctInfo || distinctInfo.duplicateKeys.length === 0}
                            >
                              重复项
                            </Button>
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => handleSelectUnique(index, filter.field)}
                              disabled={!distinctInfo || distinctInfo.uniqueKeys.length === 0}
                            >
                              唯一项
                            </Button>
                          </Stack>
                        </Stack>

                        <Box
                          sx={{
                            maxHeight: 220,
                            overflowY: 'auto',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1.5,
                            p: 1,
                            backgroundColor: '#fafbff'
                          }}
                        >
                          {(!distinctInfo || distinctInfo.options.length === 0) && (
                            <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 0.5 }}>
                              {filter.field ? '该列暂无可用值' : '请选择列后再进行筛选'}
                            </Typography>
                          )}

                          {filteredOptions.map(option => {
                            const checked = selectionState.keySet.has(option.key);
                            return (
                              <FormControlLabel
                                key={option.key}
                                control={(
                                  <Checkbox
                                    size="small"
                                    checked={checked}
                                    onChange={(e) => handleToggleValueKey(index, option.key, e.target.checked)}
                                  />
                                )}
                                label={
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                                    <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {option.label}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {option.count}
                                    </Typography>
                                  </Box>
                                }
                              />
                            );
                          })}
                        </Box>

                        {distinctInfo && (
                          <Typography variant="caption" color="text.secondary">
                            预览 {distinctInfo.options.length} 项（共 {distinctInfo.total} 条记录）
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                        <FormControl fullWidth size="small">
                          <InputLabel>条件</InputLabel>
                          <Select
                            label="条件"
                            value={currentOperator}
                            onChange={(e) => updateDraftFilter(index, 'operator', e.target.value)}
                          >
                            {filterOperators.map(option => (
                              <MenuItem key={option.value} value={option.value}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        {requiresValue && (
                          <TextField
                            fullWidth
                            size="small"
                            label="值"
                            value={filter.value || ''}
                            onChange={(e) => updateDraftFilter(index, 'value', e.target.value)}
                          />
                        )}
                      </Stack>
                    )}
                  </Box>
                );
              })}

              <Button
                variant="outlined"
                startIcon={<Plus size={16} />}
                onClick={handleAddFilterRow}
                sx={{ alignSelf: 'flex-start' }}
              >
                添加筛选条件
              </Button>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFilterDialogOpen(false)}>取消</Button>
          <Button onClick={handleClearFilters} disabled={!hasFilterSupport || (activeFilters?.length ?? 0) === 0}>
            清除筛选
          </Button>
          <Button variant="contained" onClick={handleApplyFilterSubmit} disabled={!hasFilterSupport}>
            应用筛选
          </Button>
        </DialogActions>
      </Dialog>

      {/* 保存到表对话框 */}
      <Dialog open={saveDialogOpen} onClose={handleSaveDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>提交异步保存任务</DialogTitle>
        <DialogContent>
          <FormControl component="fieldset" sx={{ mt: 2, mb: 2 }}>
            <FormLabel component="legend">保存方式</FormLabel>
            <RadioGroup
              value={saveMode}
              onChange={(e) => setSaveMode(e.target.value)}
              row
            >
              <FormControlLabel
                value="duckdb"
                control={<Radio />}
                label="保存到DuckDB (推荐)"
              />
            </RadioGroup>
          </FormControl>

          {saveMode === 'duckdb' ? (
            <TextField
              autoFocus
              margin="dense"
              label="表名"
              fullWidth
              variant="outlined"
              value={tableAlias}
              onChange={(e) => setTableAlias(e.target.value)}
              placeholder="请输入自定义表名，如: finished_orders"
              helperText="此表将作为异步任务创建，系统会自动根据查询结果生成新表，完成后可在异步任务列表中查看和下载"
              required
            />
          ) : (
            <TextField
              autoFocus
              margin="dense"
              label="数据源名称"
              fullWidth
              variant="outlined"
              value={datasourceName}
              onChange={(e) => setDatasourceName(e.target.value)}
              placeholder="请输入数据源名称"
            />
          )}

          {saveError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {saveError}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            将查询结果保存为DuckDB表，支持高效的关联查询和数据分析。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveDialogClose} disabled={saving}>
            取消
          </Button>
          <Button
            onClick={handleSaveConfirm}
            variant="contained"
            disabled={saving || !tableAlias.trim()}
          >
            {saving ? '提交中...' : '提交异步任务'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ModernDataDisplay;
