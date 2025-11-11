import {
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon
} from '@mui/icons-material';
import {
  Box,
  Checkbox,
  Collapse,
  Paper,
  Typography
} from '@mui/material';
import { Calendar, CheckCircle, FileText, Hash, HelpCircle, Percent } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
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
  disabled = false,
  resolvedCasts = {},
  showHeader = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [columnTypes, setColumnTypes] = useState({});

  // 获取表的列信息
  const columns = selectedTable?.columns || [];

  // 过滤列
  const filteredColumns = columns.filter(column => {
    const columnName = typeof column === 'string' ? column : (column?.name || '');
    if (!columnName || typeof columnName !== 'string') return false;
    return columnName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const resolvedCastTypes = useMemo(() => {
    const map = {};
    Object.entries(resolvedCasts || {}).forEach(([column, cast]) => {
      if (!column || !cast) {
        return;
      }
      const upper = cast.toUpperCase();
      let mapped = 'text';
      if (/BOOL/.test(upper)) {
        mapped = 'boolean';
      } else if (/DECIMAL|NUMERIC/.test(upper)) {
        mapped = 'decimal';
      } else if (/DOUBLE|FLOAT|REAL/.test(upper)) {
        mapped = 'decimal';
      } else if (/INT/.test(upper)) {
        mapped = 'integer';
      }
      map[column.toLowerCase()] = mapped;
    });
    return map;
  }, [resolvedCasts]);

  const mapMetadataType = (column) => {
    if (!column || typeof column === 'string') {
      return null;
    }
    const rawType = (column.dataType || column.type || column.normalizedType || '').toString().toUpperCase();
    if (!rawType) {
      return null;
    }
    const columnName = (column.name || '').toLowerCase();
    if (columnName && resolvedCastTypes[columnName]) {
      return resolvedCastTypes[columnName];
    }
    if (/BOOL/.test(rawType)) {
      return 'boolean';
    }
    if (/INT/.test(rawType) && !/BIGDEC/.test(rawType)) {
      return 'integer';
    }
    if (/DECIMAL|NUMERIC|DOUBLE|FLOAT|REAL/.test(rawType)) {
      return 'decimal';
    }
    if (/DATE|TIME/.test(rawType)) {
      return 'date';
    }
    return 'text';
  };

  // 检测列类型
  useEffect(() => {
    if (columns.length > 0) {
      const types = {};
      columns.forEach(column => {
        const columnName = typeof column === 'string' ? column : column.name;
        const lowerName = (columnName || '').toLowerCase();
        if (!columnName) {
          return;
        }
        const castOverride = resolvedCastTypes[lowerName];
        if (castOverride) {
          types[columnName] = castOverride;
        } else {
          const metadataType = mapMetadataType(column);
          if (metadataType) {
            types[columnName] = metadataType;
          } else {
            const sampleValues = column.sampleValues || [];
            types[columnName] = detectColumnType(columnName, sampleValues);
          }
        }
      });
      setColumnTypes(types);
    }
  }, [columns, resolvedCastTypes]);

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
        return <Hash size={16} />;
      case 'decimal':
        return <Percent size={16} />;
      case 'text':
        return <FileText size={16} />;
      case 'date':
        return <Calendar size={16} />;
      case 'boolean':
        return <CheckCircle size={16} />;
      default:
        return <HelpCircle size={16} />;
    }
  };

  if (!selectedTable || columns.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'var(--dq-surface)', borderRadius: 3, border: '1px solid var(--dq-border-subtle)' }}>
        <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
          {!selectedTable ? '请先选择数据表' : '该表没有可用的列'}
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{
      width: '100%',
      bgcolor: 'var(--dq-surface)',
      borderRadius: 4,
      border: '1px solid var(--dq-border-subtle)',
      p: 2,
      color: 'var(--dq-text-primary)'
    }}>
      {showHeader && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, px: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 8, height: 8, bgcolor: 'var(--dq-accent-primary)', borderRadius: '50%' }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--dq-text-primary)' }}>
              选择列 (SELECT)
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--dq-text-secondary)' }}>
              已选 {selectedColumns.length}/{columns.length}
            </Typography>
          </Box>
          <Typography
            variant="caption"
            onClick={handleSelectAll}
            disabled={disabled || filteredColumns.length === 0}
            sx={{
              color: 'var(--dq-accent-primary)',
              fontWeight: 600,
              cursor: disabled || filteredColumns.length === 0 ? 'not-allowed' : 'pointer',
              opacity: disabled || filteredColumns.length === 0 ? 0.5 : 1,
              '&:hover': {
                color: 'var(--dq-accent-primary)'
              }
            }}
          >
            全选
          </Typography>
        </Box>
      )}

      <Collapse in={isExpanded}>
        {/* 列列表 - 柔和圆润风格 */}
        <Box
          sx={{
            maxHeight: Math.max(maxHeight, 300),
            overflow: 'auto',
            bgcolor: 'var(--dq-surface)',
            borderRadius: 4,
            border: '1px solid var(--dq-border-subtle)',
            p: 2
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {filteredColumns.map((column, index) => {
              const columnName = typeof column === 'string' ? column : column.name;
              const columnType = columnTypes[columnName] || 'text';
              const isSelected = selectedColumns.some(col =>
                (typeof col === 'string' ? col : col.name) === columnName
              );

              return (
                <Box
                  key={columnName}
                  onClick={() => handleColumnToggle(column)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    p: 0.75,
                    borderRadius: 3,
                    bgcolor: isSelected ? 'var(--dq-surface-card)' : 'transparent',
                    boxShadow: isSelected ? '0 1px 3px 0 rgb(0 0 0 / 0.1)' : 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: isSelected ? 1 : 0.5,
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'var(--dq-surface-card)',
                      opacity: 1
                    }
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={disabled}
                    size="small"
                    icon={<CheckBoxOutlineBlankIcon fontSize="small" />}
                    checkedIcon={<CheckBoxIcon fontSize="small" />}
                    sx={{
                      color: 'var(--dq-accent-primary)',
                      '&.Mui-checked': {
                        color: 'var(--dq-accent-primary)'
                      }
                    }}
                  />
                  <Box sx={{ flex: 1, ml: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: isSelected ? 600 : 500, color: 'var(--dq-text-primary)' }}>
                      {columnName}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'var(--dq-text-secondary)',
                        bgcolor: 'var(--dq-surface-alt)',
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 10,
                        fontSize: '1rem'
                      }}
                    >
                      {columnType === 'integer' || columnType === 'decimal' ? '数值' : columnType === 'date' ? '日期' : '文本'}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {filteredColumns.length === 0 && (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
                {searchTerm ? `没有找到匹配 "${searchTerm}" 的列` : '没有可用的列'}
              </Typography>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

export default ColumnSelector;
