import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Functions as FunctionsIcon
} from '@mui/icons-material';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Lightbulb } from 'lucide-react';
import React, { useState } from 'react';
import {
  AggregationFunction,
  detectColumnType,
  getColumnTypeInfo,
  getSuggestedAggregations,
  isAggregationCompatible
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
    <Box sx={{ width: '100%' }}>
      {/* 标题和控制 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <FunctionsIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
          聚合函数 ({aggregations.length})
        </Typography>
        <Tooltip title={isExpanded ? '收起' : '展开'}>
          <IconButton
            size="small"
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={disabled}
          >
            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      <Collapse in={isExpanded}>
        {/* 添加新聚合函数 */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
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
              >
                {Object.values(AggregationFunction).map(func => {
                  // 检查函数与当前选中列的兼容性
                  let isCompatible = true;
                  let warningMessage = '';

                  if (newAggregation.column) {
                    const columnInfo = getColumnTypeInfo(newAggregation.column);
                    isCompatible = isAggregationCompatible(func, columnInfo.type, columnInfo.name);

                    if (!isCompatible) {
                      warningMessage = `${getFunctionDisplayName(func)}不适用于${columnInfo.type}类型`;
                    }
                  }

                  return (
                    <MenuItem
                      key={func}
                      value={func}
                      disabled={!isCompatible}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                        <span>{getFunctionDisplayName(func)}</span>
                        {!isCompatible && (
                          <Chip
                            label="不兼容"
                            size="small"
                            color="warning"
                            sx={{ ml: 1, height: 16, fontSize: '0.7rem' }}
                          />
                        )}
                      </div>
                    </MenuItem>
                  );
                })}
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
              >
                {columns.map(column => {
                  const columnName = typeof column === 'string' ? column : column.name;

                  return (
                    <MenuItem
                      key={columnName}
                      value={columnName}
                    >
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
              sx={{ minWidth: 120 }}
            />

            {/* 添加按钮 */}
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddAggregation}
              disabled={disabled || !newAggregation.function || !newAggregation.column}
              sx={{ ml: 1 }}
            >
              添加
            </Button>
          </Box>
        </Paper>

        {/* 已添加的聚合函数列表 */}
        {aggregations.length > 0 && (
          <Paper
            variant="outlined"
            sx={{
              maxHeight: maxHeight,
              overflow: 'auto',
              bgcolor: 'background.paper'
            }}
          >
            <List dense>
              {aggregations.map((aggregation, index) => (
                <React.Fragment key={aggregation.id}>
                  <ListItem sx={{ py: 1 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Chip
                            label={getFunctionDisplayName(aggregation.function)}
                            size="small"
                            color={getFunctionColor(aggregation.function)}
                            variant="outlined"
                          />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {aggregation.column}
                          </Typography>
                          {aggregation.alias && (
                            <Typography variant="caption" color="text.secondary">
                              → {aggregation.alias}
                            </Typography>
                          )}
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                          {/* 编辑函数 */}
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                              value={aggregation.function}
                              onChange={(e) => handleUpdateAggregation(
                                aggregation.id,
                                'function',
                                e.target.value
                              )}
                              disabled={disabled}
                              variant="outlined"
                            >
                              {getAvailableFunctions(aggregation.column).map(func => (
                                <MenuItem key={func} value={func}>
                                  {getFunctionDisplayName(func)}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>

                          {/* 编辑别名 */}
                          <TextField
                            size="small"
                            value={aggregation.alias}
                            onChange={(e) => handleUpdateAggregation(
                              aggregation.id,
                              'alias',
                              e.target.value
                            )}
                            disabled={disabled}
                            placeholder="别名"
                            sx={{ minWidth: 100 }}
                          />
                        </Box>
                      }
                    />

                    <ListItemSecondaryAction>
                      <Tooltip title="删除聚合函数">
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveAggregation(aggregation.id)}
                          disabled={disabled}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>

                  {index < aggregations.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        )}

        {aggregations.length === 0 && (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
            <Typography variant="body2" color="text.secondary">
              还没有添加聚合函数
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              聚合函数可以对数据进行统计计算，如求和、平均值等
            </Typography>
          </Paper>
        )}

        {/* 提示信息 */}
        {aggregations.length > 0 && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
            <Typography variant="caption" color="info.contrastText">
              <Lightbulb size={16} style={{ marginRight: '8px' }} />
              提示：使用聚合函数时，建议在"排序和限制"中添加GROUP BY条件
            </Typography>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default AggregationControls;