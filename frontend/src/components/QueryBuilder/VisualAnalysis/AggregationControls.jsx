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
    const column = availableColumns.find(col => getColumnName(col) === columnName);
    if (!column) return AGGREGATION_OPTIONS;

    const dataType = getColumnDataType(column);
    const availableFunctions = getAggregationFunctionsForDataType(dataType);
    
    let filteredOptions = AGGREGATION_OPTIONS.filter(option => 
      availableFunctions.includes(option.value)
    );

    // Filter by category if specified
    if (category) {
      filteredOptions = filteredOptions.filter(option => option.category === category);
    }
    
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
                  {availableColumns.map((column, index) => {
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
                  onChange={(e) => setSelectedFunction(e.target.value)}
                  label="聚合函数"
                >
                  {getAvailableFunctions(selectedColumn, selectedCategory).map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <div className="flex items-center space-x-2">
                        <span>{getFunctionIcon(option.value)}</span>
                        <span>{option.displayName}</span>
                        <Typography variant="caption" color="text.secondary">
                          ({option.description})
                        </Typography>
                      </div>
                    </MenuItem>
                  ))}
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
                      <div className="flex items-center space-x-2">
                        <Chip
                          label={`${getFunctionIcon(aggregation.function)} ${aggregation.displayName}`}
                          color={getFunctionColor(aggregation.function)}
                          size="small"
                          sx={{ fontWeight: 500 }}
                        />
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