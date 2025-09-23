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
  FormControlLabel,
  Slider
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { SortDirection } from '../../utils/visualQueryUtils';

/**
 * SortLimitControls - 排序和限制控制组件
 * 允许用户配置排序条件和结果限制
 */
const SortLimitControls = ({
  columns = [],
  orderBy = [],
  limit,
  onOrderByChange,
  onLimitChange,
  disabled = false
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newSort, setNewSort] = useState({
    column: '',
    direction: SortDirection.ASC
  });
  const [limitEnabled, setLimitEnabled] = useState(!!limit);
  const [limitValue, setLimitValue] = useState(limit || 100);

  // 添加排序条件
  const handleAddSort = () => {
    if (!newSort.column) {
      return;
    }

    const sortItem = {
      id: Date.now() + Math.random(),
      column: newSort.column,
      direction: newSort.direction
    };

    onOrderByChange([...orderBy, sortItem]);
    
    // 重置表单
    setNewSort({
      column: '',
      direction: SortDirection.ASC
    });
  };

  // 删除排序条件
  const handleRemoveSort = (id) => {
    onOrderByChange(orderBy.filter(sort => sort.id !== id));
  };

  // 更新排序条件
  const handleUpdateSort = (id, field, value) => {
    const updatedSorts = orderBy.map(sort => {
      if (sort.id === id) {
        return { ...sort, [field]: value };
      }
      return sort;
    });
    
    onOrderByChange(updatedSorts);
  };

  // 移动排序条件位置
  const handleMoveSort = (id, direction) => {
    const currentIndex = orderBy.findIndex(sort => sort.id === id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= orderBy.length) return;

    const newOrderBy = [...orderBy];
    [newOrderBy[currentIndex], newOrderBy[newIndex]] = [newOrderBy[newIndex], newOrderBy[currentIndex]];
    
    onOrderByChange(newOrderBy);
  };

  // 处理限制数量变化
  const handleLimitToggle = (enabled) => {
    setLimitEnabled(enabled);
    if (enabled) {
      onLimitChange(limitValue);
    } else {
      onLimitChange(null);
    }
  };

  const handleLimitValueChange = (value) => {
    setLimitValue(value);
    if (limitEnabled) {
      onLimitChange(value);
    }
  };

  // 获取方向显示名称
  const getDirectionDisplayName = (direction) => {
    return direction === SortDirection.ASC ? '升序' : '降序';
  };

  // 获取方向图标
  const getDirectionIcon = (direction) => {
    return direction === SortDirection.ASC ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />;
  };

  // 获取方向颜色
  const getDirectionColor = (direction) => {
    return direction === SortDirection.ASC ? 'primary' : 'secondary';
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* 标题和控制 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <SortIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
          排序和限制
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
        {/* 排序控制 */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 500 }}>
            添加排序条件
          </Typography>
          
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* 选择列 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>排序列</InputLabel>
              <Select
                value={newSort.column}
                label="排序列"
                onChange={(e) => setNewSort(prev => ({ 
                  ...prev, 
                  column: e.target.value 
                }))}
                disabled={disabled}
              >
                {columns.map(column => {
                  const columnName = typeof column === 'string' ? column : column.name;
                  const isAlreadyUsed = orderBy.some(sort => sort.column === columnName);
                  
                  return (
                    <MenuItem 
                      key={columnName} 
                      value={columnName}
                      disabled={isAlreadyUsed}
                    >
                      {columnName}
                      {isAlreadyUsed && (
                        <Chip 
                          label="已使用" 
                          size="small" 
                          color="default" 
                          sx={{ ml: 1, height: 16 }}
                        />
                      )}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>

            {/* 选择方向 */}
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>方向</InputLabel>
              <Select
                value={newSort.direction}
                label="方向"
                onChange={(e) => setNewSort(prev => ({ 
                  ...prev, 
                  direction: e.target.value 
                }))}
                disabled={disabled}
              >
                <MenuItem value={SortDirection.ASC}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ArrowUpwardIcon fontSize="small" />
                    升序
                  </Box>
                </MenuItem>
                <MenuItem value={SortDirection.DESC}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ArrowDownwardIcon fontSize="small" />
                    降序
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* 添加按钮 */}
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddSort}
              disabled={disabled || !newSort.column}
              sx={{ ml: 1 }}
            >
              添加
            </Button>
          </Box>
        </Paper>

        {/* 已添加的排序条件列表 */}
        {orderBy.length > 0 && (
          <Paper variant="outlined" sx={{ mb: 2, bgcolor: 'background.paper' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                排序条件 ({orderBy.length})
              </Typography>
              <Typography variant="caption" color="text.secondary">
                排序优先级从上到下递减
              </Typography>
            </Box>
            
            <List dense>
              {orderBy.map((sort, index) => (
                <React.Fragment key={sort.id}>
                  <ListItem sx={{ py: 1 }}>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 20 }}>
                            {index + 1}.
                          </Typography>
                          <Chip
                            label={sort.column}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                          <Chip
                            icon={getDirectionIcon(sort.direction)}
                            label={getDirectionDisplayName(sort.direction)}
                            size="small"
                            color={getDirectionColor(sort.direction)}
                            variant="outlined"
                          />
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
                          {/* 编辑方向 */}
                          <FormControl size="small" sx={{ minWidth: 100 }}>
                            <Select
                              value={sort.direction}
                              onChange={(e) => handleUpdateSort(
                                sort.id, 
                                'direction', 
                                e.target.value
                              )}
                              disabled={disabled}
                              variant="outlined"
                            >
                              <MenuItem value={SortDirection.ASC}>升序</MenuItem>
                              <MenuItem value={SortDirection.DESC}>降序</MenuItem>
                            </Select>
                          </FormControl>

                          {/* 移动按钮 */}
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="上移">
                              <IconButton
                                size="small"
                                onClick={() => handleMoveSort(sort.id, 'up')}
                                disabled={disabled || index === 0}
                              >
                                <ArrowUpwardIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="下移">
                              <IconButton
                                size="small"
                                onClick={() => handleMoveSort(sort.id, 'down')}
                                disabled={disabled || index === orderBy.length - 1}
                              >
                                <ArrowDownwardIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      }
                    />
                    
                    <ListItemSecondaryAction>
                      <Tooltip title="删除排序条件">
                        <IconButton
                          edge="end"
                          size="small"
                          onClick={() => handleRemoveSort(sort.id)}
                          disabled={disabled}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                  
                  {index < orderBy.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        )}

        {/* 限制数量控制 */}
        <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
              限制结果数量
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={limitEnabled}
                  onChange={(e) => handleLimitToggle(e.target.checked)}
                  disabled={disabled}
                  size="small"
                />
              }
              label=""
            />
          </Box>

          {limitEnabled && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                最多返回 {limitValue} 条记录
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Slider
                  value={limitValue}
                  onChange={(e, value) => handleLimitValueChange(value)}
                  disabled={disabled}
                  min={1}
                  max={10000}
                  step={limitValue <= 100 ? 10 : limitValue <= 1000 ? 50 : 100}
                  marks={[
                    { value: 10, label: '10' },
                    { value: 100, label: '100' },
                    { value: 1000, label: '1K' },
                    { value: 10000, label: '10K' }
                  ]}
                  sx={{ flex: 1 }}
                />
                
                <TextField
                  size="small"
                  type="number"
                  value={limitValue}
                  onChange={(e) => {
                    const value = Math.max(1, Math.min(10000, parseInt(e.target.value) || 1));
                    handleLimitValueChange(value);
                  }}
                  disabled={disabled}
                  inputProps={{ min: 1, max: 10000 }}
                  sx={{ width: 80 }}
                />
              </Box>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                💡 提示：限制结果数量可以提高查询性能
              </Typography>
            </Box>
          )}
        </Paper>

        {/* 提示信息 */}
        {orderBy.length === 0 && !limitEnabled && (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
            <Typography variant="body2" color="text.secondary">
              还没有配置排序和限制条件
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              排序可以控制结果的顺序，限制可以控制返回的记录数量
            </Typography>
          </Paper>
        )}
      </Collapse>
    </Box>
  );
};

export default SortLimitControls;