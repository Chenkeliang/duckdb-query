/* eslint-disable react/prop-types */
import {
  Info as InfoIcon
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Sparkles, Calendar, FileText, Hash, HelpCircle, Search } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import JsonQuickConfiguratorDialog from './JsonQuickConfiguratorDialog';

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
  disabled = false,
  jsonTables = [],
  onJsonTablesChange = () => {},
  columnProfiles = {}
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [quickConfigColumn, setQuickConfigColumn] = useState(null);

  // Get columns from the selected table
  const availableColumns = useMemo(
    () => (Array.isArray(selectedTable?.columns) ? selectedTable.columns : []),
    [selectedTable],
  );
  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredColumns = useMemo(() => {
    if (!normalizedSearch) {
      return availableColumns;
    }
    return availableColumns.filter((column) => {
      const columnName = getColumnName(column).toLowerCase();
      const dataType = getColumnDataType(column).toLowerCase();
      return (
        columnName.includes(normalizedSearch) ||
        dataType.includes(normalizedSearch)
      );
    });
  }, [availableColumns, normalizedSearch]);

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

  const formatDataTypeLabel = (dataType) => {
    if (!dataType) {
      return { label: '未知', tooltip: '' };
    }
    const raw = dataType.toString();
    const upper = raw.toUpperCase();
    if (upper.startsWith('STRUCT')) {
      return { label: 'STRUCT', tooltip: raw };
    }
    if (upper.includes('JSON')) {
      return { label: 'JSON', tooltip: raw };
    }
    if (upper.startsWith('MAP')) {
      return { label: 'MAP', tooltip: raw };
    }
    return { label: raw, tooltip: raw };
  };

  // Get data type icon
  const getDataTypeIcon = (dataType) => {
    if (isNumericDataType(dataType)) return <Hash size={16} />;
    if (isTextDataType(dataType)) return <FileText size={16} />;
    if (isDateTimeDataType(dataType)) return <Calendar size={16} />;
    return <HelpCircle size={16} />;
  };

  const columnProfilesMap = columnProfiles || {};
  const normalizedJsonTables = Array.isArray(jsonTables) ? jsonTables : [];

  const getColumnProfile = (name) => {
    if (!name) return null;
    return columnProfilesMap[name.toLowerCase()] || null;
  };

  const looksLikeJson = (value) => {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'object') {
      return true;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    const maybeJson =
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'));
    if (!maybeJson) {
      return false;
    }
    try {
      JSON.parse(trimmed);
      return true;
    } catch (err) {
      return false;
    }
  };

  const isJsonColumn = (column) => {
    const dataType = getColumnDataType(column);
    const normalized = (dataType || '').toString().toUpperCase();
    if (/(JSON|STRUCT|MAP|OBJECT)/.test(normalized)) {
      return true;
    }
    const profile = getColumnProfile(getColumnName(column));
    const profileType = (profile?.normalized_type || '').toString().toUpperCase();
    if (/(JSON|STRUCT|MAP|OBJECT)/.test(profileType)) {
      return true;
    }
    const sampleCandidates = [];
    if (Array.isArray(profile?.sample_values)) {
      sampleCandidates.push(...profile.sample_values);
    }
    if (Array.isArray(column?.sample_values)) {
      sampleCandidates.push(...column.sample_values);
    }
    if (Array.isArray(column?.sampleValues)) {
      sampleCandidates.push(...column.sampleValues);
    }
    return sampleCandidates.some(looksLikeJson);
  };

  const getJsonMappingsForColumn = (columnName) => {
    if (!columnName) return [];
    const lowered = columnName.toLowerCase();
    return normalizedJsonTables.filter(
      (mapping) => (mapping?.sourceColumn || '').toLowerCase() === lowered,
    );
  };

  const openQuickConfigurator = (column) => {
    setQuickConfigColumn(column);
  };

  const closeQuickConfigurator = () => {
    setQuickConfigColumn(null);
  };

  const handleQuickSave = (entry) => {
    if (!entry || !onJsonTablesChange) {
      closeQuickConfigurator();
      return;
    }
    const updated = normalizedJsonTables.filter((item) => {
      if (entry.id) {
        return item.id !== entry.id;
      }
      return (item?.sourceColumn || '').toLowerCase() !== (entry.sourceColumn || '').toLowerCase();
    });
    updated.push(entry);
    onJsonTablesChange(updated);
    closeQuickConfigurator();
  };

  if (!selectedTable) {
    return (
      <div className="space-y-2">
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

      {/* Search Field */}
      <TextField
        size="small"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="搜索列名或类型"
        fullWidth
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} color="var(--dq-text-tertiary)" />
            </InputAdornment>
          ),
          sx: {
            borderRadius: 3,
            backgroundColor: 'var(--dq-surface)',
            '& fieldset': {
              borderColor: 'var(--dq-border-subtle)'
            }
          }
        }}
        sx={{ mt: 1 }}
      />

      {/* Column Selection Grid */}
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
            {filteredColumns.map((column, index) => {
              const columnName = getColumnName(column);
              const dataType = getColumnDataType(column);
              const isSelected = selectedColumns.includes(columnName);
              const jsonMappings = getJsonMappingsForColumn(columnName);
              const hasJsonMappings = jsonMappings.length > 0;
              const isJson = isJsonColumn(column);

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

                      <span className="text-sm">{getDataTypeIcon(dataType)}</span>
                      {(() => {
                        const { label, tooltip } = formatDataTypeLabel(dataType);
                        const chip = (
                          <Chip
                            label={label}
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
                        );
                        if (tooltip && tooltip !== label) {
                          return (
                            <Tooltip title={<pre style={{ margin: 0 }}>{tooltip}</pre>} arrow>
                              <span>{chip}</span>
                            </Tooltip>
                          );
                        }
                        return chip;
                      })()}

                      {isJson && (
                        <Tooltip title={hasJsonMappings ? '编辑 JSON 展开' : '展开 JSON/STRUCT 列'}>
                          <IconButton
                            size="small"
                            onClick={(event) => {
                              event.stopPropagation();
                              openQuickConfigurator({
                                name: columnName,
                                dataType,
                                metadata: column,
                                sampleValues: getColumnProfile(columnName)?.sample_values || column?.sample_values || column?.sampleValues || [],
                                existingMappings: jsonMappings,
                              });
                            }}
                            sx={{
                              ml: 0.5,
                              color: hasJsonMappings ? 'var(--dq-accent-primary)' : 'var(--dq-text-secondary)',
                              '&:hover': { color: 'var(--dq-accent-primary)' },
                            }}
                          >
                            <Sparkles size={16} />
                          </IconButton>
                        </Tooltip>
                      )}

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

                    {isJson && (
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          mt: 0.5,
                          color: 'var(--dq-text-tertiary)',
                          textAlign: 'right'
                        }}
                      >
                        JSON/STRUCT 列需要手动配置路径，使用右侧 ✨ 按钮展开字段
                      </Typography>
                    )}

                    {hasJsonMappings && (
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip
                          label={`JSON展开 · ${jsonMappings.length}`}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.75rem',
                            backgroundColor: 'var(--dq-surface-card-active)',
                            color: 'var(--dq-accent-primary)',
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}
          </div>

          {/* Empty State */}
          {filteredColumns.length === 0 && (
            <div className="text-center py-4">
              <Typography variant="body2" color="text.secondary">
                {normalizedSearch ? '没有匹配的列，请调整搜索关键字' : '没有可用的列'}
              </Typography>
            </div>
          )}
        </Box>

      <JsonQuickConfiguratorDialog
        open={Boolean(quickConfigColumn)}
        column={quickConfigColumn}
        onClose={closeQuickConfigurator}
        onSave={handleQuickSave}
      />
    </div>
  );
};

export default ColumnSelector;
