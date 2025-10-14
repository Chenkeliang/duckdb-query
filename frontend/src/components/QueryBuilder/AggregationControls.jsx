import {
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import React, { useState } from 'react';
import {
  AggregationFunction,
  detectColumnType,
  getSuggestedAggregations
} from '../../utils/visualQueryUtils';

/**
 * AggregationControls - 聚合函数控制组件
 * 允许用户添加和配置聚合函数
 */
const AggregationControls = ({
  selectedTable,
  aggregations = [],
  onAggregationsChange,
  disabled = false,
  maxHeight = 200
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newAggregation, setNewAggregation] = useState({
    function: '',
    column: '',
    alias: ''
  });

  // 获取表的列信息
  const columns = selectedTable?.columns || [];

  // 获取可用的聚合函数
  const getAvailableFunctions = (columnName) => {
    const column = columns.find(col =>
      (typeof col === 'string' ? col : col.name) === columnName
    );

    if (!column) return Object.values(AggregationFunction);

    const columnType = detectColumnType(
      columnName,
      column.sampleValues || []
    );

    return getSuggestedAggregations(columnType);
  };

  // 添加聚合函数
  const handleAddAggregation = () => {
    if (!newAggregation.function || !newAggregation.column) {
      return;
    }

    const aggregation = {
      id: Date.now() + Math.random(),
      function: newAggregation.function,
      column: newAggregation.column,
      alias: newAggregation.alias || `${newAggregation.function.toLowerCase()}_${newAggregation.column}`
    };

    onAggregationsChange([...aggregations, aggregation]);

    // 重置表单
    setNewAggregation({
      function: '',
      column: '',
      alias: ''
    });
  };

  // 删除聚合函数
  const handleRemoveAggregation = (id) => {
    onAggregationsChange(aggregations.filter(agg => agg.id !== id));
  };

  // 更新聚合函数
  const handleUpdateAggregation = (id, field, value) => {
    const updatedAggregations = aggregations.map(agg => {
      if (agg.id === id) {
        const updated = { ...agg, [field]: value };

        // 如果改变了函数或列，自动更新别名
        if (field === 'function' || field === 'column') {
          updated.alias = `${updated.function.toLowerCase()}_${updated.column}`;
        }

        return updated;
      }
      return agg;
    });

    onAggregationsChange(updatedAggregations);
  };

  // 获取函数显示名称
  const getFunctionDisplayName = (func) => {
    const names = {
      [AggregationFunction.SUM]: '求和',
      [AggregationFunction.AVG]: '平均值',
      [AggregationFunction.COUNT]: '计数',
      [AggregationFunction.MIN]: '最小值',
      [AggregationFunction.MAX]: '最大值',
      [AggregationFunction.COUNT_DISTINCT]: '去重计数'
    };
    return names[func] || func;
  };

  // 获取函数颜色
  const getFunctionColor = (func) => {
    switch (func) {
      case AggregationFunction.SUM:
      case AggregationFunction.AVG:
        return 'primary';
      case AggregationFunction.COUNT:
      case AggregationFunction.COUNT_DISTINCT:
        return 'secondary';
      case AggregationFunction.MIN:
      case AggregationFunction.MAX:
        return 'success';
      default:
        return 'default';
    }
  };

  if (columns.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary">
          没有可用的列进行聚合
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ 
      width: '100%',
      bgcolor: '#f9fafb',
      borderRadius: 4,
      border: '1px solid #e5e7eb',
      p: 2
    }}>
      {/* 标题和控制 - 统一蓝色风格 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, px: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 8, height: 8, bgcolor: '#3b82f6', borderRadius: '50%' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
            聚合函数
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {aggregations.length}个聚合
          </Typography>
        </Box>
        <Typography
          variant="caption"
          onClick={handleAddAggregation}
          disabled={disabled || !newAggregation.function || !newAggregation.column}
          sx={{
            color: '#3b82f6',
            fontWeight: 600,
            cursor: disabled || !newAggregation.function || !newAggregation.column ? 'not-allowed' : 'pointer',
            opacity: disabled || !newAggregation.function || !newAggregation.column ? 0.5 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            '&:hover': {
              color: '#2563eb'
            }
          }}
        >
          <AddIcon sx={{ fontSize: 14 }} />
          添加
        </Typography>
      </Box>

      <Collapse in={isExpanded}>
        {/* 添加新聚合函数表单 */}
        <Box sx={{ bgcolor: '#f9fafb', borderRadius: 4, border: '1px solid #e5e7eb', p: 2, mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
            添加聚合函数
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* 选择函数 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>函数</InputLabel>
              <Select
                value={newAggregation.function}
                label="函数"
                onChange={(e) => setNewAggregation(prev => ({
                  ...prev,
                  function: e.target.value
                }))}
                disabled={disabled}
                sx={{
                  borderRadius: 3,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#e5e7eb'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#3b82f6'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#3b82f6',
                    borderWidth: 2
                  }
                }}
              >
                {Object.values(AggregationFunction).map(func => (
                  <MenuItem key={func} value={func}>
                    {getFunctionDisplayName(func)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* 选择列 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>列</InputLabel>
              <Select
                value={newAggregation.column}
                label="列"
                onChange={(e) => setNewAggregation(prev => ({
                  ...prev,
                  column: e.target.value
                }))}
                disabled={disabled}
                sx={{
                  borderRadius: 3,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#e5e7eb'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#3b82f6'
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#3b82f6',
                    borderWidth: 2
                  }
                }}
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

            {/* 别名 */}
            <TextField
              size="small"
              label="别名 (可选)"
              value={newAggregation.alias}
              onChange={(e) => setNewAggregation(prev => ({
                ...prev,
                alias: e.target.value
              }))}
              disabled={disabled}
              sx={{
                minWidth: 120,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                  '& fieldset': {
                    borderColor: '#e5e7eb'
                  },
                  '&:hover fieldset': {
                    borderColor: '#3b82f6'
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#3b82f6',
                    borderWidth: 2
                  }
                }
              }}
            />

            {/* 添加按钮 */}
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddAggregation}
              disabled={disabled || !newAggregation.function || !newAggregation.column}
              sx={{
                ml: 1,
                borderRadius: 3,
                bgcolor: '#3b82f6',
                '&:hover': {
                  bgcolor: '#2563eb'
                }
              }}
            >
              添加
            </Button>
          </Box>
        </Box>

        {/* 已添加的聚合函数列表 - 卡片风格 */}
        {aggregations.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
            {aggregations.map((aggregation, index) => (
              <Box
                key={aggregation.id}
                sx={{
                  bgcolor: '#f9fafb',
                  borderRadius: 4,
                  border: '1px solid #e5e7eb',
                  p: 2
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                  <Chip
                    label={getFunctionDisplayName(aggregation.function)}
                    size="small"
                    sx={{
                      bgcolor: '#3b82f6',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      height: 24,
                      borderRadius: 10
                    }}
                  />
                  <Tooltip title="删除聚合函数">
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveAggregation(aggregation.id)}
                      disabled={disabled}
                      sx={{
                        color: 'text.secondary',
                        '&:hover': {
                          color: 'error.main'
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {/* 选择列 - 这里显示选择的列但不可编辑 */}
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
                      选择列
                    </Typography>
                    <Select
                      size="small"
                      value={aggregation.column}
                      onChange={(e) => handleUpdateAggregation(
                        aggregation.id,
                        'column',
                        e.target.value
                      )}
                      disabled={disabled}
                      sx={{
                        width: '100%',
                        bgcolor: 'white',
                        borderRadius: 3,
                        '& .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#e5e7eb'
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#3b82f6'
                        },
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#3b82f6',
                          borderWidth: 2
                        }
                      }}
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
                  </Box>

                  {/* 别名 */}
                  <Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.75 }}>
                      别名 (可选)
                    </Typography>
                    <TextField
                      size="small"
                      value={aggregation.alias}
                      onChange={(e) => handleUpdateAggregation(
                        aggregation.id,
                        'alias',
                        e.target.value
                      )}
                      disabled={disabled}
                      placeholder={`${aggregation.function.toLowerCase()}_${aggregation.column}`}
                      sx={{
                        width: '100%',
                        '& .MuiOutlinedInput-root': {
                          bgcolor: 'white',
                          borderRadius: 3,
                          '& fieldset': {
                            borderColor: '#e5e7eb'
                          },
                          '&:hover fieldset': {
                            borderColor: '#3b82f6'
                          },
                          '&.Mui-focused fieldset': {
                            borderColor: '#3b82f6',
                            borderWidth: 2
                          }
                        }
                      }}
                    />
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}

      </Collapse>
    </Box>
  );
};

export default AggregationControls;