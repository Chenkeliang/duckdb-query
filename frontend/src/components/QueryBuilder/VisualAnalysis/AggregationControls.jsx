import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Functions as FunctionsIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, Circle, Flag, Hash, Hash as HashIcon, Hash as HashIcon2, Lightbulb, Medal, Minus, Plus, Sigma, Tilde, TrendingUp, Trophy } from 'lucide-react';
import { default as React, default as React, useEffect, useState } from 'react';
import {
  AGGREGATION_CATEGORIES,
  AGGREGATION_OPTIONS,
  createDefaultAggregationConfig,
  getAggregationDisplayName,
  getAggregationFunctionsForDataType
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
      selectedColumn,
      selectedCategory,
      availableColumnsCount: availableColumns.length
    });

    // 如果没有选择列，返回所有基础聚合函数以供显示
    if (!columnName) {
      const allBasicOptions = AGGREGATION_OPTIONS.filter(opt => opt.category === 'basic');
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
      return forceBasicOptions;
    }

    // 其他类别使用原始逻辑
    const column = availableColumns.find(col => getColumnName(col) === columnName);
    if (!column) {
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
      'SUM': <Sigma size={16} />,
      'AVG': <Circle size={16} />,
      'COUNT': <HashIcon size={16} />,
      'MIN': <ArrowDown size={16} />,
      'MAX': <ArrowUp size={16} />,
      'COUNT_DISTINCT': <HashIcon2 size={16} />,

      // Statistical functions
      'MEDIAN': <Tilde size={16} />,
      'MODE': '◊',
      'STDDEV_SAMP': 'σ',
      'VAR_SAMP': 'σ²',
      'PERCENTILE_CONT_25': 'Q1',
      'PERCENTILE_CONT_75': 'Q3',
      'PERCENTILE_DISC_25': 'Q1*',
      'PERCENTILE_DISC_75': 'Q3*',

      // Window functions
      'ROW_NUMBER': <Hash size={16} />,
      'RANK': <Trophy size={16} />,
      'DENSE_RANK': <Medal size={16} />,
      'PERCENT_RANK': <Trophy size={16} />,
      'CUME_DIST': <TrendingUp size={16} />,

      // Trend analysis functions
      'SUM_OVER': <Plus size={16} />,
      'AVG_OVER': <Minus size={16} />,
      'LAG': <ArrowLeft size={16} />,
      'LEAD': <ArrowRight size={16} />,
      'FIRST_VALUE': <Medal size={16} />,
      'LAST_VALUE': <Flag size={16} />
    };
    return icons[func] || <BarChart3 size={16} />;
  };

  if (!selectedTable) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">聚合统计</label>
        <Box
          sx={{
            p: 4,
            borderRadius: 2,
            border: '1px solid var(--dq-border-subtle)',
            backgroundColor: 'var(--dq-surface-card)',
            textAlign: 'center'
          }}
        >
          <Typography variant="body2" color="text.secondary">
            请先选择一个数据表
          </Typography>
        </Box>
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
                fontSize: '1rem',
                color: 'var(--dq-text-secondary)',
                cursor: 'help'
              }}
            />
          </Tooltip>
          <Tooltip title={isExpanded ? '收起' : '展开'}>
            <IconButton
              size="small"
              onClick={() => setIsExpanded(!isExpanded)}
              sx={{
                color: 'var(--dq-text-secondary)',
                '&:hover': {
                  backgroundColor: 'var(--dq-surface-hover)'
                }
              }}
            >
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {/* Aggregation Summary */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontSize: '0.95rem',
          color: 'var(--dq-text-tertiary)'
        }}
      >
        <span>已配置 {aggregations.length} 个聚合函数</span>
        {aggregations.length > 0 && (
          <Chip
            label={`${aggregations.length}个`}
            size="small"
            color="primary"
            sx={{
              height: 18,
              fontSize: '1rem',
              fontWeight: 500
            }}
          />
        )}
      </Box>

      <Collapse in={isExpanded}>
        <Box
          className="rounded-md p-3 space-y-3"
          sx={{
            border: '1px solid var(--dq-border-subtle)',
            backgroundColor: 'var(--dq-surface-card)',
            maxHeight: `${maxHeight}px`,
            overflowY: 'auto',
            transition: 'background-color 0.18s ease, border-color 0.18s ease'
          }}
        >
          {/* Add New Aggregation Section */}
          <Box
            className="rounded-md space-y-3"
            sx={{
              border: '1px solid var(--dq-border-subtle)',
              backgroundColor: 'var(--dq-surface)',
              p: 3,
              boxShadow: 'none'
            }}
          >
            <div className="flex items-center space-x-2">
              <FunctionsIcon sx={{ fontSize: '1rem', color: 'var(--dq-text-primary)' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '1rem' }}>
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
                                fontSize: '1rem',
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
                              fontSize: '1rem',
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
                    setSelectedFunction(e.target.value);
                  }}
                  onOpen={() => {
                    const options = getAvailableFunctions(selectedColumn, selectedCategory);
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
                  color: 'var(--dq-text-primary)',
                  backgroundColor: 'var(--dq-accent-primary-soft)',
                  '&:hover': {
                    backgroundColor: "color-mix(in oklab, var(--dq-accent-primary) 45%, transparent)"
                  },
                  '&.Mui-disabled': {
                    backgroundColor: 'transparent',
                    color: 'var(--dq-text-tertiary)'
                  }
                }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </div>
          </Box>

          {/* Current Aggregations List */}
          {aggregations.length > 0 && (
            <Box className="space-y-2">
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '1rem', color: 'var(--dq-text-primary)' }}>
                当前聚合函数
              </Typography>

              <Box className="space-y-2">
                {aggregations.map((aggregation, index) => (
                  <Box
                    key={`${aggregation.column}-${aggregation.function}-${index}`}
                    sx={{
                      border: '1px solid var(--dq-border-subtle)',
                      backgroundColor: 'var(--dq-surface)',
                      borderRadius: 2,
                      p: 3,
                      transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
                      '&:hover': {
                        borderColor: 'var(--dq-border-card)',
                        boxShadow: '0 10px 24px -18px rgba(15, 23, 42, 0.35)'
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2 flex-1">
                        {/* Function Selection for existing aggregation */}
                        <FormControl size="small" sx={{ minWidth: 120 }} disabled={disabled}>
                          <Select
                            key={`aggregation-select-${index}-${Date.now()}`}
                            value={aggregation.function}
                            onChange={(e) => {
                              handleUpdateFunction(index, e.target.value);
                            }}
                            onOpen={() => {
                              const options = getAvailableFunctions(aggregation.column, 'basic');

                              // 强制状态刷新
                              setTimeout(() => {
                                const menuItems = document.querySelectorAll('[role="option"], .MuiMenuItem-root');
                                Array.from(menuItems).forEach((item, index) => {
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
                            color: 'var(--dq-text-primary)',
                            '&:hover': {
                              backgroundColor: 'var(--dq-status-error-bg)'
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
                          fontSize: '1rem'
                        }
                      }}
                      fullWidth
                    />
                  </div>
                  </Box>
                ))}
              </Box>
            </Box>
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
        </Box>
      </Collapse>

      {/* Help Text */}
      {aggregations.length === 0 && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 2,
            border: '1px solid var(--dq-border-card)',
            backgroundColor: 'var(--dq-surface-card-active)'
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: 'var(--dq-text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Lightbulb size={16} />
            提示：聚合函数用于统计计算，如求和、平均值、计数等
          </Typography>
        </Box>
      )}
    </div>
  );
};

export default AggregationControls;
