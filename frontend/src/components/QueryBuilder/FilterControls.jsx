import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  IconButton,
  Tooltip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Collapse,
  Chip,
  Divider,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';
import { 
  FilterOperator, 
  LogicOperator,
  getSuggestedOperators,
  detectColumnType 
} from '../../utils/visualQueryUtils';

/**
 * FilterControls - 筛选条件控制组件
 * 允许用户添加和配置筛选条件
 */
const FilterControls = ({
  columns = [],
  filters = [],
  onFiltersChange,
  disabled = false
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newFilter, setNewFilter] = useState({
    column: '',
    operator: '',
    value: '',
    value2: '', // 用于BETWEEN操作
    values: [], // 用于IN操作
    logicOperator: LogicOperator.AND
  });

  // 添加筛选条件
  const handleAddFilter = () => {
    if (!newFilter.column || !newFilter.operator) {
      return;
    }

    // 验证值
    const needsValue = ![FilterOperator.IS_NULL, FilterOperator.IS_NOT_NULL].includes(newFilter.operator);
    const needsSecondValue = newFilter.operator === FilterOperator.BETWEEN;
    const needsMultipleValues = [FilterOperator.IN, FilterOperator.NOT_IN].includes(newFilter.operator);

    if (needsValue && !newFilter.value && !needsMultipleValues) {
      return;
    }

    if (needsSecondValue && !newFilter.value2) {
      return;
    }

    if (needsMultipleValues && newFilter.values.length === 0) {
      return;
    }

    const filter = {
      id: Date.now() + Math.random(),
      column: newFilter.column,
      operator: newFilter.operator,
      value: newFilter.value,
      value2: newFilter.value2,
      values: [...newFilter.values],
      logicOperator: filters.length > 0 ? newFilter.logicOperator : LogicOperator.AND
    };

    onFiltersChange([...filters, filter]);
    
    // 重置表单
    setNewFilter({
      column: '',
      operator: '',
      value: '',
      value2: '',
      values: [],
      logicOperator: LogicOperator.AND
    });
  };

  // 删除筛选条件
  const handleRemoveFilter = (id) => {
    onFiltersChange(filters.filter(filter => filter.id !== id));
  };

  // 更新筛选条件
  const handleUpdateFilter = (id, field, value) => {
    const updatedFilters = filters.map(filter => {
      if (filter.id === id) {
        const updated = { ...filter, [field]: value };
        
        // 如果改变了操作符，清空相关值
        if (field === 'operator') {
          updated.value = '';
          updated.value2 = '';
          updated.values = [];
        }
        
        return updated;
      }
      return filter;
    });
    
    onFiltersChange(updatedFilters);
  };

  // 获取列的可用操作符
  const getAvailableOperators = (columnName) => {
    const column = columns.find(col => 
      (typeof col === 'string' ? col : col.name) === columnName
    );
    
    if (!column) return Object.values(FilterOperator);
    
    const columnType = detectColumnType(
      columnName, 
      column.sampleValues || []
    );
    
    return getSuggestedOperators(columnType);
  };

  // 获取操作符显示名称
  const getOperatorDisplayName = (operator) => {
    const names = {
      [FilterOperator.EQUAL]: '等于',
      [FilterOperator.NOT_EQUAL]: '不等于',
      [FilterOperator.GREATER_THAN]: '大于',
      [FilterOperator.LESS_THAN]: '小于',
      [FilterOperator.GREATER_EQUAL]: '大于等于',
      [FilterOperator.LESS_EQUAL]: '小于等于',
      [FilterOperator.LIKE]: '包含',
      [FilterOperator.IS_NULL]: '为空',
      [FilterOperator.IS_NOT_NULL]: '不为空',
      [FilterOperator.BETWEEN]: '介于',
      [FilterOperator.IN]: '在列表中',
      [FilterOperator.NOT_IN]: '不在列表中'
    };
    return names[operator] || operator;
  };

  // 获取逻辑操作符显示名称
  const getLogicOperatorDisplayName = (operator) => {
    return operator === LogicOperator.AND ? '并且' : '或者';
  };

  // 渲染值输入控件
  const renderValueInput = (filter, isNew = false) => {
    const filterData = isNew ? newFilter : filter;
    const updateValue = isNew 
      ? (field, value) => setNewFilter(prev => ({ ...prev, [field]: value }))
      : (field, value) => handleUpdateFilter(filter.id, field, value);

    switch (filterData.operator) {
      case FilterOperator.IS_NULL:
      case FilterOperator.IS_NOT_NULL:
        return null;

      case FilterOperator.BETWEEN:
        return (
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              value={filterData.value}
              onChange={(e) => updateValue('value', e.target.value)}
              disabled={disabled}
              placeholder="最小值"
              sx={{ width: 80 }}
            />
            <Typography variant="body2" color="text.secondary">至</Typography>
            <TextField
              size="small"
              value={filterData.value2}
              onChange={(e) => updateValue('value2', e.target.value)}
              disabled={disabled}
              placeholder="最大值"
              sx={{ width: 80 }}
            />
          </Box>
        );

      case FilterOperator.IN:
      case FilterOperator.NOT_IN:
        return (
          <TextField
            size="small"
            value={filterData.values.join(', ')}
            onChange={(e) => {
              const values = e.target.value.split(',').map(v => v.trim()).filter(Boolean);
              updateValue('values', values);
            }}
            disabled={disabled}
            placeholder="值1, 值2, 值3..."
            sx={{ minWidth: 150 }}
          />
        );

      default:
        return (
          <TextField
            size="small"
            value={filterData.value}
            onChange={(e) => updateValue('value', e.target.value)}
            disabled={disabled}
            placeholder="筛选值"
            sx={{ minWidth: 100 }}
          />
        );
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* 标题和控制 - 统一蓝色风格 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, px: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: '#3b82f6', borderRadius: '50%' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            筛选条件 (WHERE)
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {filters.length}个条件
          </Typography>
        </Box>
        <Typography
          variant="caption"
          onClick={handleAddFilter}
          disabled={disabled || !newFilter.column || !newFilter.operator}
          sx={{
            color: '#3b82f6',
            fontWeight: 600,
            cursor: disabled || !newFilter.column || !newFilter.operator ? 'not-allowed' : 'pointer',
            opacity: disabled || !newFilter.column || !newFilter.operator ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            '&:hover': {
              color: '#2563eb'
            }
          }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
          </svg>
          添加
        </Typography>
      </Box>

      <Collapse in={isExpanded}>
        {/* 筛选条件列表 - 柔和圆润风格 */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
            添加筛选条件
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-end', mb: 2 }}>
            {/* 逻辑操作符 (仅在有现有筛选条件时显示) */}
            {filters.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 80 }}>
                <InputLabel>逻辑</InputLabel>
                <Select
                  value={newFilter.logicOperator}
                  label="逻辑"
                  onChange={(e) => setNewFilter(prev => ({ 
                    ...prev, 
                    logicOperator: e.target.value 
                  }))}
                  disabled={disabled}
                >
                  <MenuItem value={LogicOperator.AND}>并且</MenuItem>
                  <MenuItem value={LogicOperator.OR}>或者</MenuItem>
                </Select>
              </FormControl>
            )}

            {/* 选择列 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>列</InputLabel>
              <Select
                value={newFilter.column}
                label="列"
                onChange={(e) => setNewFilter(prev => ({ 
                  ...prev, 
                  column: e.target.value,
                  operator: '', // 重置操作符
                  value: '',
                  value2: '',
                  values: []
                }))}
                disabled={disabled}
              >
                {columns.map(column => {
                  const columnName = typeof column === 'string' ? column : column.name;
                  return (
                    <MenuItem key={columnName} value={columnName}>
                      {columnName}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>

            {/* 选择操作符 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>操作符</InputLabel>
              <Select
                value={newFilter.operator}
                label="操作符"
                onChange={(e) => setNewFilter(prev => ({ 
                  ...prev, 
                  operator: e.target.value,
                  value: '',
                  value2: '',
                  values: []
                }))}
                disabled={disabled || !newFilter.column}
              >
                {newFilter.column && getAvailableOperators(newFilter.column).map(operator => (
                  <MenuItem key={operator} value={operator}>
                    {getOperatorDisplayName(operator)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 值输入 */}
            {newFilter.operator && renderValueInput(null, true)}

            {/* 添加按钮 */}
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddFilter}
              disabled={disabled || !newFilter.column || !newFilter.operator}
              sx={{ ml: 1 }}
            >
              添加
            </Button>
          </Box>
        </Paper>

        {/* 已添加的筛选条件列表 */}
        {filters.length > 0 && (
          <Paper variant="outlined" sx={{ bgcolor: 'background.paper' }}>
            <List dense>
              {filters.map((filter, index) => (
                <React.Fragment key={filter.id}>
                  <ListItem sx={{ py: 1 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          {index > 0 && (
                            <Chip
                              label={getLogicOperatorDisplayName(filter.logicOperator)}
                              size="small"
                              color="default"
                              variant="outlined"
                            />
                          )}
                          <Chip
                            label={filter.column}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          <Chip
                            label={getOperatorDisplayName(filter.operator)}
                            size="small"
                            color="secondary"
                            variant="outlined"
                          />
                          {filter.operator === FilterOperator.BETWEEN ? (
                            <Typography variant="body2">
                              {filter.value} ~ {filter.value2}
                            </Typography>
                          ) : filter.operator === FilterOperator.IN || filter.operator === FilterOperator.NOT_IN ? (
                            <Typography variant="body2">
                              [{filter.values.join(', ')}]
                            </Typography>
                          ) : ![FilterOperator.IS_NULL, FilterOperator.IS_NOT_NULL].includes(filter.operator) ? (
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {filter.value}
                            </Typography>
                          ) : null}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                          {/* 编辑逻辑操作符 */}
                          {index > 0 && (
                            <FormControl size="small" sx={{ minWidth: 80 }}>
                              <Select
                                value={filter.logicOperator}
                                onChange={(e) => handleUpdateFilter(
                                  filter.id, 
                                  'logicOperator', 
                                  e.target.value
                                )}
                                disabled={disabled}
                                variant="outlined"
                              >
                                <MenuItem value={LogicOperator.AND}>并且</MenuItem>
                                <MenuItem value={LogicOperator.OR}>或者</MenuItem>
                              </Select>
                            </FormControl>
                          )}

                          {/* 编辑操作符 */}
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                              value={filter.operator}
                              onChange={(e) => handleUpdateFilter(
                                filter.id, 
                                'operator', 
                                e.target.value
                              )}
                              disabled={disabled}
                              variant="outlined"
                            >
                              {getAvailableOperators(filter.column).map(operator => (
                                <MenuItem key={operator} value={operator}>
                                  {getOperatorDisplayName(operator)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          {/* 编辑值 */}
                          {renderValueInput(filter)}
                        </Box>
                      }
                    />
                    
                    <ListItemSecondaryAction>
                      <Tooltip title="删除筛选条件">
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveFilter(filter.id)}
                          disabled={disabled}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                  
                  {index < filters.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        )}

        {filters.length === 0 && (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
            <Typography variant="body2" color="text.secondary">
              还没有添加筛选条件
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              筛选条件可以限制查询结果的范围
            </Typography>
          </Paper>
        )}
      </Collapse>
    </Box>
  );
};

export default FilterControls;