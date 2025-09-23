import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Chip,
  Tooltip,
  IconButton,
  Collapse,
  Alert
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Info as InfoIcon,
  CheckBox as SelectAllIcon,
  CheckBoxOutlineBlank as DeselectAllIcon
} from '@mui/icons-material';

/**
 * ColumnSelector Component
 * 
 * Provides a checkbox-based multi-select interface for column selection
 * with responsive grid layout and column metadata display.
 * 
 * Features:
 * - Checkbox-based multi-select interface with Tailwind styling
 * - Display column names, data types, and metadata
 * - Column selection state management
 * - Responsive grid layout for mobile/desktop
 * - Select all/deselect all functionality
 * - Column metadata tooltips
 */
const ColumnSelector = ({
  selectedTable = null,
  selectedColumns = [],
  onColumnSelectionChange,
  maxHeight = 200,
  showMetadata = true,
  disabled = false
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [selectAllState, setSelectAllState] = useState('none'); // 'none', 'some', 'all'

  // Get columns from the selected table
  const availableColumns = selectedTable?.columns || [];

  // Update select all state when selection changes
  useEffect(() => {
    if (availableColumns.length === 0) {
      setSelectAllState('none');
    } else if (selectedColumns.length === 0) {
      setSelectAllState('none');
    } else if (selectedColumns.length === availableColumns.length) {
      setSelectAllState('all');
    } else {
      setSelectAllState('some');
    }
  }, [selectedColumns.length, availableColumns.length]);

  // Handle individual column toggle
  const handleColumnToggle = (columnName) => {
    if (disabled) return;

    const isCurrentlySelected = selectedColumns.includes(columnName);
    let newSelection;

    if (isCurrentlySelected) {
      newSelection = selectedColumns.filter(col => col !== columnName);
    } else {
      newSelection = [...selectedColumns, columnName];
    }

    onColumnSelectionChange?.(newSelection);
  };

  // Handle select all/deselect all
  const handleSelectAll = () => {
    if (disabled) return;

    if (selectAllState === 'all') {
      // Deselect all
      onColumnSelectionChange?.([]);
    } else {
      // Select all
      const allColumnNames = availableColumns.map(col => col.name || col);
      onColumnSelectionChange?.(allColumnNames);
    }
  };

  // Get column data type for display
  const getColumnDataType = (column) => {
    if (typeof column === 'string') return 'TEXT';
    return column.dataType || column.type || 'UNKNOWN';
  };

  // Get column name for display
  const getColumnName = (column) => {
    if (typeof column === 'string') return column;
    return column.name || column.column_name || 'Unknown';
  };

  // Check if column data type is numeric
  const isNumericDataType = (dataType) => {
    const numericTypes = ['INTEGER', 'BIGINT', 'DOUBLE', 'REAL', 'DECIMAL', 'NUMERIC', 'FLOAT', 'INT', 'NUMBER'];
    return numericTypes.some(type => dataType.toUpperCase().includes(type));
  };

  // Check if column data type is text
  const isTextDataType = (dataType) => {
    const textTypes = ['VARCHAR', 'TEXT', 'STRING', 'CHAR'];
    return textTypes.some(type => dataType.toUpperCase().includes(type));
  };

  // Check if column data type is date/time
  const isDateTimeDataType = (dataType) => {
    const dateTimeTypes = ['DATE', 'TIME', 'TIMESTAMP', 'DATETIME'];
    return dateTimeTypes.some(type => dataType.toUpperCase().includes(type));
  };

  // Get data type color
  const getDataTypeColor = (dataType) => {
    if (isNumericDataType(dataType)) return 'primary';
    if (isTextDataType(dataType)) return 'secondary';
    if (isDateTimeDataType(dataType)) return 'warning';
    return 'default';
  };

  // Get data type icon
  const getDataTypeIcon = (dataType) => {
    if (isNumericDataType(dataType)) return '🔢';
    if (isTextDataType(dataType)) return '📝';
    if (isDateTimeDataType(dataType)) return '📅';
    return '❓';
  };

  if (!selectedTable) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">选择分析列</label>
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
        <label className="text-sm font-medium text-gray-700">选择分析列</label>
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
      {/* Header with expand/collapse and select all controls */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          选择分析列
        </label>
        <div className="flex items-center space-x-1">
          {/* Select All/Deselect All Button */}
          <Tooltip title={selectAllState === 'all' ? '取消全选' : '全选'}>
            <IconButton
              size="small"
              onClick={handleSelectAll}
              disabled={disabled}
              sx={{
                color: selectAllState === 'all' ? 'primary.main' : 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(0, 113, 227, 0.04)'
                }
              }}
            >
              {selectAllState === 'all' ? <DeselectAllIcon fontSize="small" /> : <SelectAllIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Expand/Collapse Button */}
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

      {/* Selection Summary */}
      <div className="flex items-center space-x-2 text-xs text-gray-600">
        <span>已选择 {selectedColumns.length} / {availableColumns.length} 列</span>
        {selectedColumns.length > 0 && (
          <Chip
            label={`${selectedColumns.length}列`}
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

      {/* Column Selection Grid */}
      <Collapse in={isExpanded}>
        <div 
          className="border border-gray-200 rounded-md bg-gray-50 p-3"
          style={{ maxHeight: `${maxHeight}px`, overflowY: 'auto' }}
        >
          {/* Responsive Grid Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {availableColumns.map((column, index) => {
              const columnName = getColumnName(column);
              const dataType = getColumnDataType(column);
              const isSelected = selectedColumns.includes(columnName);

              return (
                <div
                  key={`${columnName}-${index}`}
                  className={`
                    flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors
                    ${isSelected 
                      ? 'bg-blue-50 border border-blue-200' 
                      : 'bg-white border border-gray-200 hover:bg-gray-50'
                    }
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                  onClick={() => handleColumnToggle(columnName)}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleColumnToggle(columnName)}
                    disabled={disabled}
                    size="small"
                    sx={{
                      padding: 0,
                      '&.Mui-checked': {
                        color: '#2563eb'
                      }
                    }}
                  />
                  
                  <div className="flex-1 min-w-0">
                    {/* Column Name */}
                    <div className="flex items-center space-x-1">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isSelected ? 600 : 500,
                          fontSize: '0.875rem',
                          color: isSelected ? '#1e40af' : '#374151',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={columnName}
                      >
                        {columnName}
                      </Typography>
                      
                      {showMetadata && (
                        <Tooltip
                          title={
                            <div>
                              <div><strong>列名:</strong> {columnName}</div>
                              <div><strong>数据类型:</strong> {dataType}</div>
                              {typeof column === 'object' && column.nullable !== undefined && (
                                <div><strong>可为空:</strong> {column.nullable ? '是' : '否'}</div>
                              )}
                            </div>
                          }
                          arrow
                        >
                          <InfoIcon 
                            sx={{ 
                              fontSize: '0.75rem', 
                              color: 'text.secondary',
                              cursor: 'help'
                            }} 
                          />
                        </Tooltip>
                      )}
                    </div>

                    {/* Data Type Display */}
                    <div className="flex items-center space-x-1 mt-1">
                      <span className="text-xs">{getDataTypeIcon(dataType)}</span>
                      <Chip
                        label={dataType}
                        size="small"
                        color={getDataTypeColor(dataType)}
                        variant="outlined"
                        sx={{
                          height: 16,
                          fontSize: '0.6rem',
                          fontWeight: 500,
                          '& .MuiChip-label': {
                            padding: '0 4px'
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Empty State */}
          {availableColumns.length === 0 && (
            <div className="text-center py-4">
              <Typography variant="body2" color="text.secondary">
                没有可用的列
              </Typography>
            </div>
          )}
        </div>
      </Collapse>

      {/* Help Text */}
      {selectedColumns.length === 0 && (
        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
          <Typography variant="caption" sx={{ color: '#1e40af', fontSize: '0.75rem' }}>
            💡 提示：选择要分析的列，或保持空白以显示所有列
          </Typography>
        </div>
      )}
    </div>
  );
};

export default ColumnSelector;