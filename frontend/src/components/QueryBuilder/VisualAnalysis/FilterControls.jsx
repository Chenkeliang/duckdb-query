import React, { useState, useCallback } from 'react';
import { 
  Stack, 
  Paper, 
  Grid, 
  Select, 
  MenuItem, 
  TextField, 
  IconButton, 
  Button,
  FormControl,
  InputLabel,
  Box,
  Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';

const FilterControls = ({ 
  columns = [], 
  filters = [], 
  onFiltersChange,
  className = ""
}) => {
  // Filter operators with Chinese labels
  const filterOperators = [
    { value: '=', label: '等于', supportedTypes: ['string', 'number', 'date'] },
    { value: '!=', label: '不等于', supportedTypes: ['string', 'number', 'date'] },
    { value: '>', label: '大于', supportedTypes: ['number', 'date'] },
    { value: '<', label: '小于', supportedTypes: ['number', 'date'] },
    { value: '>=', label: '大于等于', supportedTypes: ['number', 'date'] },
    { value: '<=', label: '小于等于', supportedTypes: ['number', 'date'] },
    { value: 'LIKE', label: '包含', supportedTypes: ['string'] },
    { value: 'NOT LIKE', label: '不包含', supportedTypes: ['string'] },
    { value: 'ILIKE', label: '包含(忽略大小写)', supportedTypes: ['string'] },
    { value: 'IS NULL', label: '为空', supportedTypes: ['string', 'number', 'date'] },
    { value: 'IS NOT NULL', label: '不为空', supportedTypes: ['string', 'number', 'date'] },
    { value: 'BETWEEN', label: '介于...之间', supportedTypes: ['number', 'date'] }
  ];

  // Logic operators
  const logicOperators = [
    { value: 'AND', label: '且' },
    { value: 'OR', label: '或' }
  ];

  // Get column data type for operator filtering
  const getColumnType = useCallback((columnName) => {
    const column = columns.find(col => col.name === columnName);
    if (!column) return 'string';
    
    const type = column.dataType?.toLowerCase() || 'string';
    if (type.includes('int') || type.includes('float') || type.includes('double') || type.includes('decimal')) {
      return 'number';
    }
    if (type.includes('date') || type.includes('time')) {
      return 'date';
    }
    return 'string';
  }, [columns]);

  // Get available operators for a column
  const getAvailableOperators = useCallback((columnName) => {
    const columnType = getColumnType(columnName);
    return filterOperators.filter(op => op.supportedTypes.includes(columnType));
  }, [getColumnType]);

  // Add new filter
  const handleAddFilter = useCallback(() => {
    const newFilter = {
      id: Date.now(),
      column: columns.length > 0 ? columns[0].name : '',
      operator: '=',
      value: '',
      value2: '', // For BETWEEN operator
      logicOperator: 'AND'
    };
    
    const updatedFilters = [...filters, newFilter];
    onFiltersChange?.(updatedFilters);
  }, [filters, columns, onFiltersChange]);

  // Remove filter
  const handleRemoveFilter = useCallback((filterId) => {
    const updatedFilters = filters.filter(filter => filter.id !== filterId);
    onFiltersChange?.(updatedFilters);
  }, [filters, onFiltersChange]);

  // Update filter property
  const handleFilterChange = useCallback((filterId, property, value) => {
    const updatedFilters = filters.map(filter => {
      if (filter.id === filterId) {
        const updatedFilter = { ...filter, [property]: value };
        
        // Reset operator if column type changed
        if (property === 'column') {
          const availableOps = getAvailableOperators(value);
          if (availableOps.length > 0 && !availableOps.find(op => op.value === filter.operator)) {
            updatedFilter.operator = availableOps[0].value;
          }
          // Reset values when column changes
          updatedFilter.value = '';
          updatedFilter.value2 = '';
        }
        
        // Reset value2 if operator is not BETWEEN
        if (property === 'operator' && value !== 'BETWEEN') {
          updatedFilter.value2 = '';
        }
        
        // Reset values for NULL operators
        if (property === 'operator' && (value === 'IS NULL' || value === 'IS NOT NULL')) {
          updatedFilter.value = '';
          updatedFilter.value2 = '';
        }
        
        return updatedFilter;
      }
      return filter;
    });
    
    onFiltersChange?.(updatedFilters);
  }, [filters, onFiltersChange, getAvailableOperators]);

  // Render value input based on operator and column type
  const renderValueInput = useCallback((filter, isSecondValue = false) => {
    const { operator, column } = filter;
    const columnType = getColumnType(column);
    const value = isSecondValue ? filter.value2 : filter.value;
    const placeholder = isSecondValue ? '结束值' : 
      operator === 'LIKE' || operator === 'NOT LIKE' || operator === 'ILIKE' ? '搜索文本' :
      columnType === 'number' ? '数值' :
      columnType === 'date' ? 'YYYY-MM-DD' :
      '筛选值';

    // Don't show input for NULL operators
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      return null;
    }

    const inputType = columnType === 'number' ? 'number' : 
                     columnType === 'date' ? 'date' : 'text';

    return (
      <TextField
        size="small"
        type={inputType}
        placeholder={placeholder}
        value={value}
        onChange={(e) => handleFilterChange(
          filter.id, 
          isSecondValue ? 'value2' : 'value', 
          e.target.value
        )}
        sx={{ minWidth: 120 }}
      />
    );
  }, [getColumnType, handleFilterChange]);

  if (columns.length === 0) {
    return (
      <Box className={className}>
        <Typography variant="body2" color="text.secondary">
          请先选择数据表以配置筛选条件
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={className}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          筛选条件
        </Typography>
        <Typography variant="caption" color="text.secondary">
          添加条件来筛选数据行
        </Typography>
      </Box>

      <Stack spacing={2}>
        {filters.map((filter, index) => (
          <Paper 
            key={filter.id}
            sx={{ 
              p: 2, 
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              backgroundColor: '#ffffff',
              '&:hover': {
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
              }
            }}
          >
            <Grid container spacing={2} alignItems="center">
              {/* Logic Operator (show for filters after the first) */}
              {index > 0 && (
                <Grid item xs={12} sm={1}>
                  <FormControl size="small" fullWidth>
                    <Select
                      value={filter.logicOperator}
                      onChange={(e) => handleFilterChange(filter.id, 'logicOperator', e.target.value)}
                      sx={{ minWidth: 60 }}
                    >
                      {logicOperators.map(op => (
                        <MenuItem key={op.value} value={op.value}>
                          {op.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}

              {/* Column Selection */}
              <Grid item xs={12} sm={index > 0 ? 3 : 3}>
                <FormControl size="small" fullWidth>
                  <InputLabel>列名</InputLabel>
                  <Select
                    value={filter.column}
                    label="列名"
                    onChange={(e) => handleFilterChange(filter.id, 'column', e.target.value)}
                  >
                    {columns.map(col => (
                      <MenuItem key={col.name} value={col.name}>
                        <Box>
                          <Typography variant="body2">{col.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {col.dataType}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Operator Selection */}
              <Grid item xs={12} sm={index > 0 ? 2 : 2}>
                <FormControl size="small" fullWidth>
                  <InputLabel>操作符</InputLabel>
                  <Select
                    value={filter.operator}
                    label="操作符"
                    onChange={(e) => handleFilterChange(filter.id, 'operator', e.target.value)}
                  >
                    {getAvailableOperators(filter.column).map(op => (
                      <MenuItem key={op.value} value={op.value}>
                        {op.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Value Input */}
              <Grid item xs={12} sm={index > 0 ? 4 : 5}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  {renderValueInput(filter)}
                  {filter.operator === 'BETWEEN' && (
                    <>
                      <Typography variant="body2" color="text.secondary">至</Typography>
                      {renderValueInput(filter, true)}
                    </>
                  )}
                </Box>
              </Grid>

              {/* Remove Button */}
              <Grid item xs={12} sm={1}>
                <IconButton 
                  size="small" 
                  color="error"
                  onClick={() => handleRemoveFilter(filter.id)}
                  sx={{ 
                    '&:hover': { 
                      backgroundColor: 'rgba(244, 67, 54, 0.1)' 
                    } 
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Grid>
            </Grid>
          </Paper>
        ))}

        {/* Add Filter Button */}
        <Button 
          startIcon={<AddIcon />} 
          variant="outlined" 
          size="small"
          onClick={handleAddFilter}
          sx={{ 
            alignSelf: 'flex-start',
            borderColor: '#e2e8f0',
            color: '#64748b',
            '&:hover': {
              borderColor: '#cbd5e1',
              backgroundColor: '#ffffff'
            }
          }}
        >
          添加筛选条件
        </Button>

        {/* Help Text */}
        {filters.length === 0 && (
          <Box sx={{ 
            p: 3, 
            textAlign: 'center', 
            backgroundColor: '#ffffff',
            borderRadius: 2,
            border: '1px dashed #cbd5e1'
          }}>
            <Typography variant="body2" color="text.secondary">
              点击"添加筛选条件"开始配置数据筛选
            </Typography>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default FilterControls;