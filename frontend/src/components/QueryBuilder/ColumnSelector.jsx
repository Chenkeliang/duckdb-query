import React, { useState, useEffect } from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Paper,
  Divider
} from '@mui/material';
import {
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Info as InfoIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon
} from '@mui/icons-material';
import { detectColumnType } from '../../utils/visualQueryUtils';

/**
 * ColumnSelector - 列选择器组件
 * 允许用户选择要查询的列，支持搜索和类型显示
 */
const ColumnSelector = ({
  selectedTable,
  selectedColumns = [],
  onColumnSelectionChange,
  maxHeight = 200,
  showMetadata = false,
  disabled = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [columnTypes, setColumnTypes] = useState({});

  // 获取表的列信息
  const columns = selectedTable?.columns || [];
  
  // 过滤列
  const filteredColumns = columns.filter(column => {
    const columnName = typeof column === 'string' ? column : column.name;
    return columnName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // 检测列类型
  useEffect(() => {
    if (columns.length > 0) {
      const types = {};
      columns.forEach(column => {
        const columnName = typeof column === 'string' ? column : column.name;
        const sampleValues = column.sampleValues || [];
        types[columnName] = detectColumnType(columnName, sampleValues);
      });
      setColumnTypes(types);
    }
  }, [columns]);

  // 处理列选择
  const handleColumnToggle = (column) => {
    if (disabled) return;

    const columnName = typeof column === 'string' ? column : column.name;
    const isSelected = selectedColumns.some(col => 
      (typeof col === 'string' ? col : col.name) === columnName
    );

    let newSelection;
    if (isSelected) {
      newSelection = selectedColumns.filter(col => 
        (typeof col === 'string' ? col : col.name) !== columnName
      );
    } else {
      newSelection = [...selectedColumns, column];
    }

    onColumnSelectionChange(newSelection);
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (disabled) return;

    if (selectedColumns.length === filteredColumns.length) {
      onColumnSelectionChange([]);
    } else {
      onColumnSelectionChange(filteredColumns);
    }
  };

  // 获取类型颜色
  const getTypeColor = (type) => {
    switch (type) {
      case 'integer':
      case 'decimal':
        return 'primary';
      case 'text':
        return 'default';
      case 'date':
        return 'secondary';
      case 'boolean':
        return 'success';
      default:
        return 'default';
    }
  };

  // 获取类型图标
  const getTypeIcon = (type) => {
    switch (type) {
      case 'integer':
        return '🔢';
      case 'decimal':
        return '💯';
      case 'text':
        return '📝';
      case 'date':
        return '📅';
      case 'boolean':
        return '✅';
      default:
        return '❓';
    }
  };

  if (!selectedTable || columns.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary">
          {!selectedTable ? '请先选择数据表' : '该表没有可用的列'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* 标题和控制 */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1 }}>
          选择列 ({selectedColumns.length}/{columns.length})
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
        <Box sx={{ mb: 2 }}>
          {/* 搜索框 */}
          <TextField
            size="small"
            placeholder="搜索列名..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={disabled}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ width: '100%', mb: 1 }}
          />

          {/* 全选控制 */}
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedColumns.length === filteredColumns.length && filteredColumns.length > 0}
                indeterminate={selectedColumns.length > 0 && selectedColumns.length < filteredColumns.length}
                onChange={handleSelectAll}
                disabled={disabled || filteredColumns.length === 0}
                size="small"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                全选 ({filteredColumns.length} 列)
              </Typography>
            }
          />
        </Box>

        {/* 列列表 */}
        <Paper 
          variant="outlined" 
          sx={{ 
            maxHeight: Math.max(maxHeight, 300), 
            overflow: 'auto',
            bgcolor: 'background.paper'
          }}
        >
          <List dense>
            {filteredColumns.map((column, index) => {
              const columnName = typeof column === 'string' ? column : column.name;
              const columnType = columnTypes[columnName] || 'text';
              const isSelected = selectedColumns.some(col => 
                (typeof col === 'string' ? col : col.name) === columnName
              );

              return (
                <React.Fragment key={columnName}>
                  <ListItem
                    button
                    onClick={() => handleColumnToggle(column)}
                    disabled={disabled}
                    sx={{
                      py: 1.5,
                      minHeight: 56,
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        checked={isSelected}
                        disabled={disabled}
                        size="small"
                        icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                        checkedIcon={<CheckBoxIcon fontSize="small" />}
                      />
                    </ListItemIcon>
                    
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: isSelected ? 600 : 400 }}>
                            {columnName}
                          </Typography>
                          {showMetadata && (
                            <Chip
                              label={`${getTypeIcon(columnType)} ${columnType}`}
                              size="small"
                              color={getTypeColor(columnType)}
                              variant="outlined"
                              sx={{ 
                                height: 20, 
                                fontSize: '0.7rem',
                                '& .MuiChip-label': { px: 1 }
                              }}
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        showMetadata && column.description ? (
                          <Typography variant="caption" color="text.secondary">
                            {column.description}
                          </Typography>
                        ) : null
                      }
                    />

                    {showMetadata && column.nullable !== undefined && (
                      <Tooltip title={column.nullable ? '可为空' : '不可为空'}>
                        <InfoIcon 
                          fontSize="small" 
                          color={column.nullable ? 'action' : 'primary'}
                        />
                      </Tooltip>
                    )}
                  </ListItem>
                  
                  {index < filteredColumns.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </List>

          {filteredColumns.length === 0 && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {searchTerm ? `没有找到匹配 "${searchTerm}" 的列` : '没有可用的列'}
              </Typography>
            </Box>
          )}
        </Paper>

        {/* 已选择的列标签 */}
        {selectedColumns.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              已选择的列:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selectedColumns.map((column) => {
                const columnName = typeof column === 'string' ? column : column.name;
                return (
                  <Chip
                    key={columnName}
                    label={columnName}
                    size="small"
                    onDelete={disabled ? undefined : () => handleColumnToggle(column)}
                    color="primary"
                    variant="outlined"
                  />
                );
              })}
            </Box>
          </Box>
        )}
      </Collapse>
    </Box>
  );
};

export default ColumnSelector;