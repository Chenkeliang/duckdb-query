import {
  CheckBoxOutlineBlank as DeselectAllIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
  CheckBox as SelectAllIcon
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Collapse,
  IconButton,
  Tooltip,
  Typography
} from '@mui/material';
import { Calendar, FileText, Hash, HelpCircle, Lightbulb } from 'lucide-react';
import React, { useEffect, useState } from 'react';

/**
 * ColumnSelector Component
 * 
 * Provides a checkbox-based multi-select interface for column selection
 * with responsive grid layout and column metadata display.
 * 
 * Features:
 * - Checkbox-based multi-select interface with custom utility styling
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
    if (isNumericDataType(dataType)) return <Hash size={16} />;
    if (isTextDataType(dataType)) return <FileText size={16} />;
    if (isDateTimeDataType(dataType)) return <Calendar size={16} />;
    return <HelpCircle size={16} />;
  };

  if (!selectedTable) {
    return (
      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: 'var(--dq-text-secondary)' }}>选择分析列</label>
        <div
          className="p-4 rounded-md text-center"
          style={{
            border: '1px solid var(--dq-border-subtle)',
            backgroundColor: 'color-mix(in oklab, var(--dq-surface-card) 92%, var(--dq-accent-primary) 8%)'
          }}
        >
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
        <label className="text-sm font-medium" style={{ color: 'var(--dq-text-secondary)' }}>选择分析列</label>
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
        <label className="text-sm font-medium" style={{ color: 'var(--dq-text-secondary)' }}>
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
                color: selectAllState === 'all' ? 'var(--dq-text-primary)' : 'var(--dq-text-secondary)',
                '&:hover': {
                  backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 14%, transparent)'
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
                color: 'var(--dq-text-secondary)',
                '&:hover': {
                  backgroundColor: 'var(--dq-accent-primary-soft)'
                }
              }}
            >
              {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {/* Selection Summary */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          fontSize: '0.95rem',
          color: 'var(--dq-text-tertiary)'
        }}
      >
        <span>已选择 {selectedColumns.length} / {availableColumns.length} 列</span>
        {selectedColumns.length > 0 && (
          <Chip
            label={`${selectedColumns.length}列`}
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

      {/* Column Selection Grid */}
      <Collapse in={isExpanded}>
        <Box
          className="rounded-md p-3 visual-analysis-card-inner"
          sx={{
            border: '1px solid var(--dq-border-subtle)',
            backgroundColor: 'transparent',
            maxHeight: `${maxHeight}px`,
            overflowY: 'auto',
            transition: 'background-color 0.18s ease, border-color 0.18s ease'
          }}
          style={{ backgroundColor: 'var(--dq-surface-card)' }}
        >
          {/* Responsive Grid Layout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {availableColumns.map((column, index) => {
              const columnName = getColumnName(column);
              const dataType = getColumnDataType(column);
              const isSelected = selectedColumns.includes(columnName);

              return (
                <Box
                  key={`${columnName}-${index}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    border: `1px solid ${isSelected ? 'var(--dq-accent-primary)' : 'var(--dq-border-subtle)'}`,
                    backgroundColor: isSelected ? 'var(--dq-accent-primary-soft)' : 'var(--dq-surface)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.55 : 1,
                    pointerEvents: disabled ? 'none' : 'auto',
                    transition: 'border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease',
                    '&:hover': {
                      backgroundColor: isSelected
                        ? 'var(--dq-accent-primary-soft)'
                        : 'var(--dq-accent-primary-soft)',
                      borderColor: isSelected
                        ? 'var(--dq-accent-primary)'
                        : 'color-mix(in oklab, var(--dq-accent-primary) 30%, var(--dq-border-card))',
                      transform: disabled ? 'none' : 'translateY(-1px)'
                    }
                  }}
                  onClick={() => handleColumnToggle(columnName)}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleColumnToggle(columnName)}
                    disabled={disabled}
                    size="small"
                    sx={{
                      p: 0,
                      flexShrink: 0,
                      '&.Mui-checked': {
                        color: 'var(--dq-accent-primary)'
                      }
                    }}
                  />

                  <Box className="flex-1 min-w-0">
                    {/* Column Name */}
                    <div className="flex items-center space-x-1">
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: isSelected ? 600 : 500,
                          fontSize: '1rem',
                          color: isSelected ? 'var(--dq-accent-primary)' : 'var(--dq-text-secondary)',
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
                              fontSize: '1rem',
                              color: 'var(--dq-text-secondary)',
                              cursor: 'help'
                            }}
                          />
                        </Tooltip>
                      )}
                    </div>

                    {/* Data Type Display */}
                    <div className="flex items-center space-x-1 mt-1">
                      <span className="text-sm">{getDataTypeIcon(dataType)}</span>
                      <Chip
                        label={dataType}
                        size="small"
                        color={getDataTypeColor(dataType)}
                        variant="outlined"
                        sx={{
                          height: 16,
                          fontSize: '1rem',
                          fontWeight: 500,
                          '& .MuiChip-label': {
                            padding: '0 4px'
                          }
                        }}
                      />
                    </div>
                  </Box>
                </Box>
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
        </Box>
      </Collapse>

      {/* Help Text */}
      {selectedColumns.length === 0 && (
        <Box
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 2,
            border: '1px solid var(--dq-border-card)',
            backgroundColor: 'var(--dq-surface-card-active)'
          }}
        >
          <Typography variant="caption" sx={{ color: 'var(--dq-text-secondary)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Lightbulb size={16} />
            提示：选择要分析的列，或保持空白以显示所有列
          </Typography>
        </Box>
      )}
    </div>
  );
};

export default ColumnSelector;
