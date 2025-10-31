import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  IconButton,
  Button,
  Paper,
  Stack,
  Chip
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon
} from '@mui/icons-material';

const SortLimitControls = ({
  columns = [],
  orderBy = [],
  limit = null,
  onOrderByChange,
  onLimitChange,
  className = ""
}) => {
  // Sort direction options with Chinese labels
  const sortDirections = [
    { value: 'ASC', label: '升序', icon: <ArrowUpIcon fontSize="small" /> },
    { value: 'DESC', label: '降序', icon: <ArrowDownIcon fontSize="small" /> }
  ];

  // Add new sort column
  const handleAddSort = useCallback(() => {
    if (columns.length === 0) return;
    
    const newSort = {
      id: Date.now(),
      column: columns[0].name,
      direction: 'ASC',
      priority: orderBy.length
    };
    
    const updatedOrderBy = [...orderBy, newSort];
    onOrderByChange?.(updatedOrderBy);
  }, [columns, orderBy, onOrderByChange]);

  // Remove sort column
  const handleRemoveSort = useCallback((sortId) => {
    const updatedOrderBy = orderBy
      .filter(sort => sort.id !== sortId)
      .map((sort, index) => ({ ...sort, priority: index })); // Reorder priorities
    
    onOrderByChange?.(updatedOrderBy);
  }, [orderBy, onOrderByChange]);

  // Update sort property
  const handleSortChange = useCallback((sortId, property, value) => {
    const updatedOrderBy = orderBy.map(sort => {
      if (sort.id === sortId) {
        return { ...sort, [property]: value };
      }
      return sort;
    });
    
    onOrderByChange?.(updatedOrderBy);
  }, [orderBy, onOrderByChange]);

  // Move sort up in priority
  const handleMoveSortUp = useCallback((sortId) => {
    const sortIndex = orderBy.findIndex(sort => sort.id === sortId);
    if (sortIndex <= 0) return;

    const updatedOrderBy = [...orderBy];
    // Swap with previous item
    [updatedOrderBy[sortIndex - 1], updatedOrderBy[sortIndex]] = 
    [updatedOrderBy[sortIndex], updatedOrderBy[sortIndex - 1]];
    
    // Update priorities
    updatedOrderBy.forEach((sort, index) => {
      sort.priority = index;
    });
    
    onOrderByChange?.(updatedOrderBy);
  }, [orderBy, onOrderByChange]);

  // Move sort down in priority
  const handleMoveSortDown = useCallback((sortId) => {
    const sortIndex = orderBy.findIndex(sort => sort.id === sortId);
    if (sortIndex >= orderBy.length - 1) return;

    const updatedOrderBy = [...orderBy];
    // Swap with next item
    [updatedOrderBy[sortIndex], updatedOrderBy[sortIndex + 1]] = 
    [updatedOrderBy[sortIndex + 1], updatedOrderBy[sortIndex]];
    
    // Update priorities
    updatedOrderBy.forEach((sort, index) => {
      sort.priority = index;
    });
    
    onOrderByChange?.(updatedOrderBy);
  }, [orderBy, onOrderByChange]);

  // Handle limit change
  const handleLimitChange = useCallback((event) => {
    const value = event.target.value;
    const numValue = value === '' ? null : parseInt(value, 10);
    
    if (numValue !== null && (isNaN(numValue) || numValue <= 0)) {
      return; // Invalid input, don't update
    }
    
    onLimitChange?.(numValue);
  }, [onLimitChange]);

  if (columns.length === 0) {
    return (
      <Box className={className}>
        <Typography variant="body2" color="text.secondary">
          请先选择数据表以配置排序设置
        </Typography>
      </Box>
    );
  }

  return (
    <Box className={className}>
      {/* Section Header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
          排序设置
        </Typography>
        <Typography variant="caption" color="text.secondary">
          配置数据排序和显示条数
        </Typography>
      </Box>

      <Stack spacing={3}>
        {/* Sort Columns Section */}
        <Box>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
            排序列
          </Typography>
          
          <Stack spacing={2}>
            {orderBy.map((sort, index) => (
              <Paper
                key={sort.id}
                sx={{
                  p: 2,
                  border: '1px solid var(--dq-border-subtle)',
                  borderRadius: 2,
                  backgroundColor: 'var(--dq-surface)',
                  '&:hover': {
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {/* Priority Indicator */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                      优先级
                    </Typography>
                    <Chip
                      label={index + 1}
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ minWidth: 32, height: 24 }}
                    />
                  </Box>

                  {/* Drag Handle */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveSortUp(sort.id)}
                      disabled={index === 0}
                      sx={{ p: 0.5 }}
                    >
                      <ArrowUpIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleMoveSortDown(sort.id)}
                      disabled={index === orderBy.length - 1}
                      sx={{ p: 0.5 }}
                    >
                      <ArrowDownIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Column Selection */}
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>排序列</InputLabel>
                    <Select
                      value={sort.column}
                      label="排序列"
                      onChange={(e) => handleSortChange(sort.id, 'column', e.target.value)}
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

                  {/* Direction Selection */}
                  <FormControl component="fieldset">
                    <RadioGroup
                      row
                      value={sort.direction}
                      onChange={(e) => handleSortChange(sort.id, 'direction', e.target.value)}
                    >
                      {sortDirections.map(dir => (
                        <FormControlLabel
                          key={dir.value}
                          value={dir.value}
                          control={<Radio size="small" />}
                          label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {dir.icon}
                              <Typography variant="body2">{dir.label}</Typography>
                            </Box>
                          }
                        />
                      ))}
                    </RadioGroup>
                  </FormControl>

                  {/* Remove Button */}
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRemoveSort(sort.id)}
                    sx={{
                      '&:hover': {
                        backgroundColor: 'var(--dq-status-error-bg)'
                      }
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>
              </Paper>
            ))}

            {/* Add Sort Button */}
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              size="small"
              onClick={handleAddSort}
              disabled={orderBy.length >= columns.length}
              sx={{
                alignSelf: 'flex-start',
                borderColor: 'var(--dq-border-subtle)',
                color: 'var(--dq-text-tertiary)',
                '&:hover': {
                  borderColor: 'var(--dq-border-muted)',
                  backgroundColor: 'var(--dq-surface)'
                }
              }}
            >
              添加排序列
            </Button>

            {/* Help Text */}
            {orderBy.length === 0 && (
              <Box sx={{
                p: 3,
                textAlign: 'center',
                backgroundColor: 'var(--dq-surface)',
                borderRadius: 2,
                border: '1px dashed var(--dq-border-muted)'
              }}>
                <Typography variant="body2" color="text.secondary">
                  点击"添加排序列"开始配置数据排序
                </Typography>
              </Box>
            )}
          </Stack>
        </Box>

        {/* Limit Section */}
        <Box>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
            显示条数
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              size="small"
              type="number"
              label="限制行数"
              placeholder="不限制"
              value={limit || ''}
              onChange={handleLimitChange}
              inputProps={{
                min: 1,
                max: 10000
              }}
              sx={{ width: 150 }}
              helperText="留空表示不限制"
            />
            
            {limit && (
              <Typography variant="body2" color="text.secondary">
                将显示前 {limit} 行数据
              </Typography>
            )}
          </Box>
        </Box>

        {/* Summary */}
        {(orderBy.length > 0 || limit) && (
          <Box
            sx={{
              p: 2,
              backgroundColor: "color-mix(in oklab, var(--dq-status-info-fg) 12%, transparent)",
              borderRadius: 2,
              border: "1px solid color-mix(in oklab, var(--dq-status-info-fg) 45%, transparent)"
            }}
          >
            <Typography variant="body2" color="var(--dq-text-primary)" sx={{ fontWeight: 500 }}>
              排序设置摘要：
            </Typography>
            <Box sx={{ mt: 1 }}>
              {orderBy.length > 0 && (
                <Typography variant="body2" color="text.secondary">
                  • 按 {orderBy.map((sort, index) => 
                    `${sort.column}(${sortDirections.find(d => d.value === sort.direction)?.label})`
                  ).join(' → ')} 排序
                </Typography>
              )}
              {limit && (
                <Typography variant="body2" color="text.secondary">
                  • 限制显示 {limit} 行
                </Typography>
              )}
            </Box>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default SortLimitControls;
