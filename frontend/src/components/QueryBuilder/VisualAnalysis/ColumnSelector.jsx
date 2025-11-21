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
import { Sparkles, Search } from 'lucide-react';
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
  maxHeight = undefined,
  showMetadata = true,
  disabled = false,
  jsonTables = [],
  onJsonTablesChange = () => {},
  columnProfiles = {}
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [quickConfigColumn, setQuickConfigColumn] = useState(null);
  const resolvedTableName = selectedTable?.table_name || selectedTable?.name || '';

  const columnProfilesMap = columnProfiles || {};
  const normalizedJsonTables = Array.isArray(jsonTables) ? jsonTables : [];

  const getColumnDataType = (column) => {
    if (typeof column === 'string') return 'TEXT';
    return column.normalizedType || column.normalized_type || column.dataType || column.type || 'UNKNOWN';
  };

  const getColumnName = (column) => {
    if (typeof column === 'string') return column;
    return column.name || column.column_name || 'Unknown';
  };

  const isNumericDataType = (dataType) => {
    const numericTypes = ['INTEGER', 'BIGINT', 'DOUBLE', 'REAL', 'DECIMAL', 'NUMERIC', 'FLOAT', 'INT', 'NUMBER'];
    return numericTypes.some((type) => dataType.toUpperCase().includes(type));
  };

  const isTextDataType = (dataType) => {
    const textTypes = ['VARCHAR', 'TEXT', 'STRING', 'CHAR'];
    return textTypes.some((type) => dataType.toUpperCase().includes(type));
  };

  const isDateTimeDataType = (dataType) => {
    const dateTimeTypes = ['DATE', 'TIME', 'TIMESTAMP', 'DATETIME'];
    return dateTimeTypes.some((type) => dataType.toUpperCase().includes(type));
  };

  const formatDataTypeLabel = (dataType, rawType) => {
    if (!dataType) {
      return { label: '未知', tooltip: '' };
    }
    const raw = dataType.toString();
    const upper = raw.toUpperCase();

    if (isNumericDataType(upper)) {
      return { label: 'number', tooltip: rawType || raw };
    }
    if (isTextDataType(upper)) {
      return { label: 'text', tooltip: rawType || raw };
    }
    if (upper.includes('JSON') || upper.includes('STRUCT') || upper.includes('MAP') || upper.includes('ARRAY') || upper.includes('LIST')) {
      return { label: 'json/struct', tooltip: rawType || raw };
    }
    if (isDateTimeDataType(upper)) {
      return { label: 'date', tooltip: rawType || raw };
    }
    return { label: upper.slice(0, 6), tooltip: rawType || raw };
  };

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

  const handleQuickRemove = () => {
    if (!quickConfigColumn || !onJsonTablesChange) {
      closeQuickConfigurator();
      return;
    }
    const currentMappings = Array.isArray(quickConfigColumn.existingMappings)
      ? quickConfigColumn.existingMappings
      : [];
    const ids = currentMappings.map((item) => item.id).filter(Boolean);
    const columnLower = (quickConfigColumn.name || '').toLowerCase();
    const filtered = normalizedJsonTables.filter((item) => {
      if (ids.length > 0) {
        return !ids.includes(item.id);
      }
      return (item?.sourceColumn || '').toLowerCase() !== columnLower;
    });
    onJsonTablesChange(filtered);
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

  const resolvedMaxHeight = (() => {
    if (typeof maxHeight === 'number' && maxHeight > 0) return `${maxHeight}px`;
    if (typeof maxHeight === 'string' && maxHeight.trim()) return maxHeight.trim();
    return null;
  })();

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
          backgroundColor: 'var(--dq-surface-card)',
          maxHeight: resolvedMaxHeight || 'none',
          overflowY: resolvedMaxHeight ? 'auto' : 'visible',
          transition: 'background-color 0.18s ease, border-color 0.18s ease'
        }}
      >
        <div className="grid grid-cols-1 gap-2">
            {filteredColumns.map((column, index) => {
              const columnName = getColumnName(column);
              const dataType = getColumnDataType(column);
              const isSelected = selectedColumns.includes(columnName);
              const jsonMappings = getJsonMappingsForColumn(columnName);
              const hasJsonMappings = jsonMappings.length > 0;
              const isJson = isJsonColumn(column);
              const rawType = typeof column === 'string' ? '' : column.rawType || column.dataType || column.type || '';
              const { label: formattedTypeLabel, tooltip: tooltipValue } = formatDataTypeLabel(dataType, rawType);
              const normalizedTypeLabel = (formattedTypeLabel || dataType || 'UNKNOWN').toString();
              const rawTypeTooltip = tooltipValue ? tooltipValue.toString() : '';
              const typeLabelNode = (
                <Typography
                  component="span"
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--dq-text-secondary)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {normalizedTypeLabel}
                </Typography>
              );
              const shouldShowTypeTooltip =
                rawTypeTooltip && rawTypeTooltip.toUpperCase() !== normalizedTypeLabel.toUpperCase();
              const typeLabelWithTooltip = shouldShowTypeTooltip ? (
                <Tooltip title={<pre style={{ margin: 0 }}>{rawTypeTooltip}</pre>} arrow>
                  <span>{typeLabelNode}</span>
                </Tooltip>
              ) : (
                typeLabelNode
              );

              return (
                <div className="col-span-1" key={`${columnName}-${index}`}>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      px: 1.5,
                      py: 1.4,
                      minHeight: 64,
                      width: '100%',
                      borderRadius: 2,
                      border: `1px solid ${isSelected ? 'var(--dq-accent-primary)' : 'var(--dq-border-subtle)'}`,
                      backgroundColor: isSelected ? 'var(--dq-accent-primary-soft)' : 'var(--dq-surface)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.55 : 1,
                      pointerEvents: disabled ? 'none' : 'auto',
                      transition: 'border-color 0.18s ease, background-color 0.18s ease, transform 0.18s ease',
                      '&:hover': {
                        backgroundColor: 'var(--dq-accent-primary-soft)',
                        borderColor: isSelected
                          ? 'var(--dq-accent-primary)'
                          : 'color-mix(in oklab, var(--dq-accent-primary) 30%, var(--dq-border-card))',
                        transform: disabled ? 'none' : 'translateY(-1px)'
                      }
                    }}
                    onClick={() => handleColumnToggle(columnName)}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--dq-field-meta-gap)',
                        width: '100%',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          flex: 1,
                          minWidth: 0,
                        }}
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

                        <Typography
                          variant="body2"
                          sx={{
                            flexShrink: 1,
                            fontWeight: isSelected ? 600 : 500,
                            fontSize: '1rem',
                            color: isSelected ? 'var(--dq-accent-primary)' : 'var(--dq-text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}
                          title={columnName}
                        >
                          {columnName}
                        </Typography>
                      </Box>

                      {/* 右侧元数据区：JSON 展开按钮 / 类型 / Info 图标 */}
                      <Box
                        sx={{
                          marginLeft: 'auto',
                          flex: '0 0 var(--dq-field-meta-width)',
                          minWidth: 'var(--dq-field-meta-width)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 'var(--dq-field-meta-gap)',
                          textAlign: 'right',
                        }}
                      >
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
                                width: 'var(--dq-json-flag-size)',
                                height: 'var(--dq-json-flag-size)',
                                minWidth: 'var(--dq-json-flag-size)',
                                borderRadius: 'var(--dq-json-flag-radius)',
                                border: '1px dashed var(--dq-json-flag-border)',
                                backgroundColor: 'var(--dq-json-flag-bg)',
                                color: hasJsonMappings ? 'var(--dq-accent-primary)' : 'var(--dq-text-secondary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                '&:hover': {
                                  backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 14%, transparent)',
                                  borderColor: 'color-mix(in oklab, var(--dq-accent-primary) 45%, transparent)',
                                  color: 'var(--dq-accent-primary)'
                                }
                              }}
                            >
                              <Sparkles size={14} strokeWidth={2} />
                            </IconButton>
                          </Tooltip>
                        )}

                        {typeLabelWithTooltip}

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
                      </Box>
                    </Box>

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
              </div>
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
        tableName={resolvedTableName}
        onClose={closeQuickConfigurator}
        onSave={handleQuickSave}
        onRemove={handleQuickRemove}
      />
    </div>
  );
};

export default ColumnSelector;
