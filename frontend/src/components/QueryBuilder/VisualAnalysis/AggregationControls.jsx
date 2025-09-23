import React, { useState, useEffect } from 'react';
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Alert,
  Collapse,
  TextField
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Functions as FunctionsIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import {
  AGGREGATION_OPTIONS,
  AGGREGATION_CATEGORIES,
  getAggregationDisplayName,
  createDefaultAggregationConfig,
  getAggregationFunctionsForDataType,
  isNumericDataType
} from '../../../types/visualQuery';

/**
 * AggregationControls Component
 * 
 * Provides chip-style selection for aggregation functions with Chinese labels.
 * Supports column-specific aggregation assignment and statistical functions.
 * 
 * Features:
 * - Chip-style selection for aggregation functions
 * - Chinese labels for all functions
 * - Column-specific aggregation assignment
 * - Statistical functions support
 * - Add/remove aggregation functionality
 * - Data type-aware function suggestions
 */
const AggregationControls = ({
  selectedTable = null,
  aggregations = [],
  onAggregationsChange,
  disabled = false,
  maxHeight = 200
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectedFunction, setSelectedFunction] = useState('COUNT');
  const [selectedColumn, setSelectedColumn] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('basic');

  // Get available columns from the selected table
  const availableColumns = selectedTable?.columns || [];

  // 数据验证：检查列数据是否被污染
  useEffect(() => {
    if (availableColumns.length > 0) {
      const hasInvalidData = availableColumns.some(col => {
        const name = getColumnName(col);
        // 检查是否包含聚合函数名称（中文）
        const aggregationNames = ['计数', '去重计数', '求和', '平均值', '最小值', '最大值'];
        return aggregationNames.includes(name);
      });
      
      if (hasInvalidData) {
        console.error('⚠️ [AggregationControls] 发现数据污染！列数据包含聚合函数名称:', {
          availableColumns,
          invalidColumns: availableColumns.filter(col => {
            const name = getColumnName(col);
            const aggregationNames = ['计数', '去重计数', '求和', '平均值', '最小值', '最大值'];
            return aggregationNames.includes(name);
          })
        });
      }
    }
  }, [availableColumns]);

  // 调试日志：监控列数据变化
  useEffect(() => {
    console.log('🔍 [AggregationControls] 列数据变化:', {
      tableId: selectedTable?.id,
      tableName: selectedTable?.name,
      columnsCount: availableColumns.length,
      columns: availableColumns.map(col => ({
        name: typeof col === 'string' ? col : col.name,
        type: typeof col === 'string' ? 'string' : col.dataType
      })),
      selectedColumn: selectedColumn,
      availableColumnsRaw: availableColumns
    });
  }, [selectedTable?.id, availableColumns.length, selectedColumn]);

  // 调试列选择框的渲染内容
  useEffect(() => {
    console.log('🎛️ [AggregationControls] 列选择框调试:', {
      availableColumnsLength: availableColumns.length,
      firstColumn: availableColumns[0],
      mappedColumns: availableColumns.map((column, index) => {
        const columnName = getColumnName(column);
        const dataType = getColumnDataType(column);
        return { index, columnName, dataType, original: column };
      })
    });
  }, [availableColumns]);

  // 调试选中状态变化
  useEffect(() => {
    console.log('🎯 [AggregationControls] 选中状态变化:', {
      selectedColumn,
      selectedCategory,
      selectedFunction,
      availableFunctionsForCurrentColumn: selectedColumn ? getAvailableFunctions(selectedColumn, selectedCategory).length : 0
    });
  }, [selectedColumn, selectedCategory, selectedFunction]);

  // Reset selections when table changes
  useEffect(() => {
    if (availableColumns.length > 0) {
      setSelectedColumn(availableColumns[0]?.name || availableColumns[0] || '');
    } else {
      setSelectedColumn('');
    }
  }, [selectedTable?.id]);

  // Get column name for display
  const getColumnName = (column) => {
    if (typeof column === 'string') return column;
    return column.name || column.column_name || 'Unknown';
  };

  // Get column data type
  const getColumnDataType = (column) => {
    if (typeof column === 'string') return 'TEXT';
    return column.dataType || column.type || 'UNKNOWN';
  };

  // Get available aggregation functions for a column
  const getAvailableFunctions = (columnName, category = null) => {
    console.log('🔧 [getAvailableFunctions] 被调用，参数:', { columnName, category });
    console.log('🔧 [getAvailableFunctions] 当前状态:', {
      selectedColumn,
      selectedCategory,
      availableColumnsCount: availableColumns.length
    });
    
    // 如果没有选择列，返回所有基础聚合函数以供显示
    if (!columnName) {
      console.log('🔧 [getAvailableFunctions] 没有选择列，返回所有基础选项');
      const allBasicOptions = AGGREGATION_OPTIONS.filter(opt => opt.category === 'basic');
      console.log('🔧 [getAvailableFunctions] 所有基础选项:', allBasicOptions.map(opt => opt.displayName));
      return allBasicOptions;
    }
    
    // 强制返回所有基础聚合函数，不进行数据类型筛选（备用保护机制）
    if (category === 'basic') {
      const forceBasicOptions = [
        { value: 'COUNT', displayName: '计数', category: 'basic', description: '计算行数' },
        { value: 'COUNT_DISTINCT', displayName: '去重计数', category: 'basic', description: '计算不重复值的数量' },
        { value: 'SUM', displayName: '求和', category: 'basic', description: '计算数值列的总和' },
        { value: 'AVG', displayName: '平均值', category: 'basic', description: '计算数值列的平均值' },
        { value: 'MIN', displayName: '最小值', category: 'basic', description: '找出最小值' },
        { value: 'MAX', displayName: '最大值', category: 'basic', description: '找出最大值' }
      ];
      console.log('🔧 [getAvailableFunctions] 强制返回所有 basic 选项 (备用保护机制):', forceBasicOptions.length, '个');
      return forceBasicOptions;
    }
    
    // 其他类别使用原始逻辑
    const column = availableColumns.find(col => getColumnName(col) === columnName);
    if (!column) {
      console.log('🔍 [getAvailableFunctions] 找不到列:', { columnName, availableColumns });
      return AGGREGATION_OPTIONS;
    }

    const dataType = getColumnDataType(column);
    const availableFunctions = getAggregationFunctionsForDataType(dataType);
    
    let filteredOptions = AGGREGATION_OPTIONS.filter(option => 
      availableFunctions.includes(option.value)
    );

    // Filter by category if specified
    if (category) {
      filteredOptions = filteredOptions.filter(option => option.category === category);
    }
    
    console.log('🔍 [getAvailableFunctions] 函数筛选结果:', {
      columnName,
      dataType,
      category,
      availableFunctions,
      filteredOptionsCount: filteredOptions.length,
      filteredOptions: filteredOptions.map(opt => opt.value)
    });

    return filteredOptions;
  };

  // Get functions grouped by category
  const getFunctionsByCategory = (columnName) => {
    const allFunctions = getAvailableFunctions(columnName);
    const grouped = {};
    
    Object.keys(AGGREGATION_CATEGORIES).forEach(category => {
      grouped[category] = allFunctions.filter(func => func.category === category);
    });
    
    return grouped;
  };

  // Handle adding new aggregation
  const handleAddAggregation = () => {
    if (disabled || !selectedColumn || !selectedFunction) return;

    // Check if this column-function combination already exists
    const exists = aggregations.some(agg => 
      agg.column === selectedColumn && agg.function === selectedFunction
    );

    if (exists) {
      return; // Don't add duplicates
    }

    const newAggregation = {
      ...createDefaultAggregationConfig(selectedColumn),
      function: selectedFunction,
      displayName: getAggregationDisplayName(selectedFunction),
      alias: `${selectedFunction.toLowerCase()}_${selectedColumn.toLowerCase()}`
    };

    onAggregationsChange?.([...aggregations, newAggregation]);
  };

  // Handle removing aggregation
  const handleRemoveAggregation = (index) => {
    if (disabled) return;
    const newAggregations = aggregations.filter((_, i) => i !== index);
    onAggregationsChange?.(newAggregations);
  };

  // Handle updating aggregation alias
  const handleUpdateAlias = (index, newAlias) => {
    if (disabled) return;
    const newAggregations = [...aggregations];
    newAggregations[index] = {
      ...newAggregations[index],
      alias: newAlias
    };
    onAggregationsChange?.(newAggregations);
  };

  // Handle updating aggregation function
  const handleUpdateFunction = (index, newFunction) => {
    if (disabled) return;
    const newAggregations = [...aggregations];
    newAggregations[index] = {
      ...newAggregations[index],
      function: newFunction,
      displayName: getAggregationDisplayName(newFunction),
      alias: `${newFunction.toLowerCase()}_${newAggregations[index].column.toLowerCase()}`
    };
    onAggregationsChange?.(newAggregations);
  };

  // Get function color based on category
  const getFunctionColor = (func) => {
    const option = AGGREGATION_OPTIONS.find(opt => opt.value === func);
    if (!option) return 'default';

    switch (option.category) {
      case 'basic': return 'primary';
      case 'statistical': return 'secondary';
      case 'window': return 'info';
      case 'trend': return 'warning';
      default: return 'default';
    }
  };

  // Get function icon
  const getFunctionIcon = (func) => {
    const icons = {
      // Basic aggregation functions
      'SUM': '∑',
      'AVG': '⌀',
      'COUNT': '#',
      'MIN': '↓',
      'MAX': '↑',
      'COUNT_DISTINCT': '#{',
      
      // Statistical functions
      'MEDIAN': '~',
      'MODE': '◊',
      'STDDEV_SAMP': 'σ',
      'VAR_SAMP': 'σ²',
      'PERCENTILE_CONT_25': 'Q1',
      'PERCENTILE_CONT_75': 'Q3',
      'PERCENTILE_DISC_25': 'Q1*',
      'PERCENTILE_DISC_75': 'Q3*',
      
      // Window functions
      'ROW_NUMBER': '#️⃣',
      'RANK': '🏆',
      'DENSE_RANK': '🥇',
      'PERCENT_RANK': '%🏆',
      'CUME_DIST': '📈',
      
      // Trend analysis functions
      'SUM_OVER': '∑↗',
      'AVG_OVER': '⌀↗',
      'LAG': '⬅️',
      'LEAD': '➡️',
      'FIRST_VALUE': '🥇',
      'LAST_VALUE': '🏁'
    };
    return icons[func] || '📊';
  };

  if (!selectedTable) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">聚合统计</label>
        <div className="p-4 border border-gray-200 rounded-md bg-gray-50 text-center">
          <Typography variant="body2" color="text.secondary">
            请先选择一个数据表
          </Typography>
        </div>
      </div>
    );
  }

  if (availableColumns.length === 0) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">聚合统计</label>
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          <Typography variant="body2">
            所选表没有可用的列信息
          </Typography>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header with expand/collapse controls */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          聚合统计
        </label>
        <div className="flex items-center space-x-1">
          <Tooltip title="聚合函数用于对数据进行统计计算">
            <InfoIcon 
              sx={{ 
                fontSize: '0.875rem', 
                color: 'text.secondary',
                cursor: 'help'
              }} 
            />
          </Tooltip>
          <Tooltip title={isExpanded ? '收起' : '展开'}>
            <IconButton
              size="small"
              onClick={() => setIsExpanded(!isExpanded)}
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.04)'
                }
              }}
            >
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {/* Aggregation Summary */}
      <div className="flex items-center space-x-2 text-xs text-gray-600">
        <span>已配置 {aggregations.length} 个聚合函数</span>
        {aggregations.length > 0 && (
          <Chip
            label={`${aggregations.length}个`}
            size="small"
            color="primary"
            sx={{
              height: 18,
              fontSize: '0.65rem',
              fontWeight: 500
            }}
          />
        )}
      </div>

      <Collapse in={isExpanded}>
        <div 
          className="border border-gray-200 rounded-md bg-gray-50 p-3 space-y-3"
          style={{ maxHeight: `${maxHeight}px`, overflowY: 'auto' }}
        >
          {/* Add New Aggregation Section */}
          <div className="bg-white border border-gray-200 rounded-md p-3 space-y-3">
            <div className="flex items-center space-x-2">
              <FunctionsIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                添加聚合函数
              </Typography>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Column Selection */}
              <FormControl size="small" fullWidth disabled={disabled}>
                <InputLabel>选择列</InputLabel>
                <Select
                  value={selectedColumn}
                  onChange={(e) => setSelectedColumn(e.target.value)}
                  label="选择列"
                >
                  {availableColumns
                    .filter(column => {
                      const name = getColumnName(column);
                      // 过滤掉聚合函数名称，只保留正常的列名
                      const aggregationNames = ['计数', '去重计数', '求和', '平均值', '最小值', '最大值'];
                      return !aggregationNames.includes(name);
                    })
                    .map((column, index) => {
                    const columnName = getColumnName(column);
                    const dataType = getColumnDataType(column);
                    return (
                      <MenuItem key={`${columnName}-${index}`} value={columnName}>
                        <div className="flex items-center space-x-2">
                          <span>{columnName}</span>
                          <Chip
                            label={dataType}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 16,
                              fontSize: '0.6rem',
                              '& .MuiChip-label': { padding: '0 4px' }
                            }}
                          />
                        </div>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              {/* Category Selection */}
              <FormControl size="small" fullWidth disabled={disabled}>
                <InputLabel>函数类别</InputLabel>
                <Select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    // Reset function selection when category changes
                    const categoryFunctions = getAvailableFunctions(selectedColumn, e.target.value);
                    if (categoryFunctions.length > 0) {
                      setSelectedFunction(categoryFunctions[0].value);
                    }
                  }}
                  label="函数类别"
                >
                  {Object.entries(AGGREGATION_CATEGORIES).map(([key, label]) => {
                    const categoryFunctions = getAvailableFunctions(selectedColumn, key);
                    return (
                      <MenuItem key={key} value={key} disabled={categoryFunctions.length === 0}>
                        <div className="flex items-center justify-between w-full">
                          <span>{label}</span>
                          <Chip
                            label={categoryFunctions.length}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 16,
                              fontSize: '0.6rem',
                              '& .MuiChip-label': { padding: '0 4px' }
                            }}
                          />
                        </div>
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              {/* Function Selection */}
              <FormControl size="small" fullWidth disabled={disabled}>
                <InputLabel>聚合函数</InputLabel>
                <Select
                  value={selectedFunction}
                  onChange={(e) => {
                    console.log('🔧 [Select] 聚合函数选择变化:', e.target.value);
                    setSelectedFunction(e.target.value);
                  }}
                  onOpen={() => {
                    console.log('🔧 [Select] 聚合函数下拉框打开');
                    console.log('🔧 [Select] 当前状态:', { selectedColumn, selectedCategory });
                    const options = getAvailableFunctions(selectedColumn, selectedCategory);
                    console.log('🔧 [Select] 获取到的选项:', options.map(opt => opt.displayName));
                  }}
                  label="聚合函数"
                >
                  {(() => {
                    // 强制返回所有基础聚合函数选项（添加功能修复方案）
                    const forceBasicOptions = [
                      { value: 'COUNT', displayName: '计数', category: 'basic', description: '计算行数' },
                      { value: 'COUNT_DISTINCT', displayName: '去重计数', category: 'basic', description: '计算不重复值的数量' },
                      { value: 'SUM', displayName: '求和', category: 'basic', description: '计算数值列的总和' },
                      { value: 'AVG', displayName: '平均值', category: 'basic', description: '计算数值列的平均值' },
                      { value: 'MIN', displayName: '最小值', category: 'basic', description: '找出最小值' },
                      { value: 'MAX', displayName: '最大值', category: 'basic', description: '找出最大值' }
                    ];
                    
                    console.log('🔥 [添加功能修复] 聚合函数选择框渲染');
                    console.log('🔥 [添加功能修复] 强制返回选项数量:', forceBasicOptions.length);
                    console.log('🔥 [添加功能修复] 选项列表:', forceBasicOptions.map(opt => opt.displayName));
                    console.log('🔥 [添加功能修复] 当前状态:', { selectedColumn, selectedCategory });
                    
                    return forceBasicOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        <div className="flex items-center space-x-2">
                          <span>{getFunctionIcon(option.value)}</span>
                          <span>{option.displayName}</span>
                          <Typography variant="caption" color="text.secondary">
                            ({option.description})
                          </Typography>
                        </div>
                      </MenuItem>
                    ));
                  })()
                  }
                </Select>
              </FormControl>
            </div>

            {/* Add Button */}
            <div className="flex justify-end">
              <IconButton
                size="small"
                onClick={handleAddAggregation}
                disabled={disabled || !selectedColumn || !selectedFunction}
                sx={{
                  color: 'primary.main',
                  backgroundColor: 'rgba(25, 118, 210, 0.04)',
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.08)'
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'transparent'
                  }
                }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </div>
          </div>

          {/* Current Aggregations List */}
          {aggregations.length > 0 && (
            <div className="space-y-2">
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>
                当前聚合函数
              </Typography>
              
              <div className="space-y-2">
                {aggregations.map((aggregation, index) => (
                  <div
                    key={`${aggregation.column}-${aggregation.function}-${index}`}
                    className="bg-white border border-gray-200 rounded-md p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 flex-1">
                        {/* Function Selection for existing aggregation */}
                        <FormControl size="small" sx={{ minWidth: 120 }} disabled={disabled}>
                          <Select
                            key={`aggregation-select-${index}-${Date.now()}`}
                            value={aggregation.function}
                            onChange={(e) => {
                              console.log('🔧 [聚合函数修改] 选择新函数:', e.target.value);
                              handleUpdateFunction(index, e.target.value);
                            }}
                            onOpen={() => {
                              console.log('🔧 [聚合函数修改] 下拉框打开，当前列:', aggregation.column);
                              const options = getAvailableFunctions(aggregation.column, 'basic');
                              console.log('🔧 [聚合函数修改] 可用选项:', options.map(opt => opt.displayName));
                              console.log('🔧 [聚合函数修改] getAvailableFunctions返回数量:', options.length);
                              
                              // 强制状态刷新
                              setTimeout(() => {
                                console.log('🔧 [聚合函数修改] 延迟检查DOM选项数量...');
                                const menuItems = document.querySelectorAll('[role="option"], .MuiMenuItem-root');
                                console.log('🔧 [聚合函数修改] DOM中实际选项数量:', menuItems.length);
                                Array.from(menuItems).forEach((item, index) => {
                                  console.log(`🔧 [聚合函数修改] DOM选项 ${index}:`, item.textContent.trim());
                                });
                              }, 100);
                            }}
                            size="small"
                            sx={{
                              '& .MuiSelect-select': {
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1
                              }
                            }}
                          >
                            {(() => {
                              // 强制返回所有基础聚合函数选项（最终修复方案）
                              const forceAllOptions = [
                                { value: 'COUNT', displayName: '计数', category: 'basic', description: '计算行数' },
                                { value: 'COUNT_DISTINCT', displayName: '去重计数', category: 'basic', description: '计算不重复值的数量' },
                                { value: 'SUM', displayName: '求和', category: 'basic', description: '计算数值列的总和' },
                                { value: 'AVG', displayName: '平均值', category: 'basic', description: '计算数值列的平均值' },
                                { value: 'MIN', displayName: '最小值', category: 'basic', description: '找出最小值' },
                                { value: 'MAX', displayName: '最大值', category: 'basic', description: '找出最大值' }
                              ];
                              
                              console.log('🔥 [强制修复] 聚合函数下拉框渲染，列:', aggregation.column);
                              console.log('🔥 [强制修复] 返回选项数量:', forceAllOptions.length);
                              console.log('🔥 [强制修复] 选项列表:', forceAllOptions.map(opt => opt.displayName));
                              
                              return forceAllOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                  <div className="flex items-center space-x-1">
                                    <span>{getFunctionIcon(option.value)}</span>
                                    <span>{option.displayName}</span>
                                  </div>
                                </MenuItem>
                              ));
                            })()
                            }
                          </Select>
                        </FormControl>
                        
                        <Typography variant="body2" color="text.secondary">
                          应用于: {aggregation.column}
                        </Typography>
                      </div>
                      
                      <Tooltip title="删除聚合函数">
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveAggregation(index)}
                          disabled={disabled}
                          sx={{
                            color: 'error.main',
                            '&:hover': {
                              backgroundColor: 'rgba(211, 47, 47, 0.04)'
                            }
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </div>

                    {/* Alias Input */}
                    <TextField
                      size="small"
                      label="别名 (可选)"
                      value={aggregation.alias || ''}
                      onChange={(e) => handleUpdateAlias(index, e.target.value)}
                      disabled={disabled}
                      placeholder={`${aggregation.function.toLowerCase()}_${aggregation.column.toLowerCase()}`}
                      sx={{
                        '& .MuiInputBase-input': {
                          fontSize: '0.875rem'
                        }
                      }}
                      fullWidth
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {aggregations.length === 0 && (
            <div className="text-center py-4">
              <Typography variant="body2" color="text.secondary">
                尚未添加聚合函数
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                选择列和函数后点击添加按钮
              </Typography>
            </div>
          )}
        </div>
      </Collapse>

      {/* Help Text */}
      {aggregations.length === 0 && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
          <Typography variant="caption" sx={{ color: '#1e40af', fontSize: '0.75rem' }}>
            💡 提示：聚合函数用于统计计算，如求和、平均值、计数等
          </Typography>
        </div>
      )}
    </div>
  );
};

export default AggregationControls;