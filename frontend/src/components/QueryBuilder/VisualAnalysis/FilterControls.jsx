import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
  FilterValueType,
  LogicOperator
} from '../../../utils/visualQueryUtils';
import ColumnSelect from './ColumnSelect';

const filterOperators = [
  { value: '=', label: '等于', supportedTypes: ['string', 'number', 'date', 'boolean'] },
  { value: '!=', label: '不等于', supportedTypes: ['string', 'number', 'date', 'boolean'] },
  { value: '>', label: '大于', supportedTypes: ['number', 'date'] },
  { value: '<', label: '小于', supportedTypes: ['number', 'date'] },
  { value: '>=', label: '大于等于', supportedTypes: ['number', 'date'] },
  { value: '<=', label: '小于等于', supportedTypes: ['number', 'date'] },
  { value: 'LIKE', label: '包含', supportedTypes: ['string'] },
  { value: 'NOT LIKE', label: '不包含', supportedTypes: ['string'] },
  { value: 'ILIKE', label: '包含(忽略大小写)', supportedTypes: ['string'] },
  { value: 'IS NULL', label: '为空', supportedTypes: ['string', 'number', 'date', 'boolean'] },
  { value: 'IS NOT NULL', label: '不为空', supportedTypes: ['string', 'number', 'date', 'boolean'] },
  { value: 'BETWEEN', label: '介于...之间', supportedTypes: ['number', 'date'] }
];

const logicOperators = [
  { value: LogicOperator.AND, label: '且' },
  { value: LogicOperator.OR, label: '或' }
];

const valueTypeOptions = [
  { value: FilterValueType.CONSTANT, label: '常量值' },
  { value: FilterValueType.COLUMN, label: '列对列' },
  { value: FilterValueType.EXPRESSION, label: '表达式' }
];

const isComparisonOperator = (operator) => ['>', '<', '>=', '<='].includes(operator);
const isStringOperator = (operator) => ['LIKE', 'ILIKE', 'NOT LIKE'].includes(operator);

const getColumnMetadata = (column) => {
  if (!column) {
    return { name: '', label: '', dataType: 'string' };
  }

  if (typeof column === 'string') {
    return {
      name: column,
      label: column,
      dataType: 'string'
    };
  }

  const name = column.name || column.column_name || '';
  return {
    name,
    label: column.displayName || column.label || name,
    dataType: (column.dataType || column.type || 'string').toLowerCase()
  };
};

const deriveColumnType = (dataType) => {
  if (!dataType) {
    return 'string';
  }
  const normalized = dataType.toLowerCase();
  if (/int|float|double|decimal|numeric|real|number/.test(normalized)) {
    return 'number';
  }
  if (/date|time/.test(normalized)) {
    return 'date';
  }
  if (/bool/.test(normalized)) {
    return 'boolean';
  }
  return 'string';
};

const FilterControls = ({
  columns = [],
  filters = [],
  onFiltersChange,
  disabled = false,
  className = '',
  title: titleProp,
  subtitle: subtitleProp,
  emptyMessage: emptyMessageProp,
  allowLogicOperator = true,
  mode = 'where',
  noColumnsMessage,
  showHeader = true
}) => {
  const normalizedColumns = useMemo(() => {
    return columns
      .map(getColumnMetadata)
      .filter((item) => item?.name);
  }, [columns]);

  const findColumnMeta = useCallback((columnName) => {
    if (!columnName) {
      return null;
    }
    return normalizedColumns.find((col) => col.name === columnName) || null;
  }, [normalizedColumns]);

  const isHavingMode = mode === 'having';
  const columnInputLabel = isHavingMode ? '聚合字段' : '列名';
  const resolvedTitle = titleProp ?? (isHavingMode ? '聚合筛选 (HAVING)' : '筛选条件 (WHERE)');
  const resolvedSubtitle = subtitleProp ?? (isHavingMode ? '对聚合结果添加筛选条件' : '添加条件来筛选数据行');
  const resolvedEmptyMessage =
    emptyMessageProp ??
    (isHavingMode
      ? '点击“添加聚合筛选条件”定义 HAVING 规则'
      : '点击"添加筛选条件"开始配置数据筛选');

  const [preferredValueType, setPreferredValueType] = useState(FilterValueType.CONSTANT);
  const menuPaperSx = useMemo(() => ({ maxHeight: 320, minWidth: 240 }), []);
  const hasColumns = normalizedColumns.length > 0;

  const getColumnType = useCallback((columnName) => {
    const target = findColumnMeta(columnName);
    if (!target) {
      return 'string';
    }
    return deriveColumnType(target.dataType);
  }, [findColumnMeta]);

  const getAvailableOperators = useCallback((columnName, valueType) => {
    const baseType = getColumnType(columnName);
    const baseOps = filterOperators.filter((op) => op.supportedTypes.includes(baseType));

    if (valueType === FilterValueType.COLUMN) {
      return baseOps.filter((op) => !['BETWEEN', 'LIKE', 'ILIKE', 'NOT LIKE', 'IS NULL', 'IS NOT NULL'].includes(op.value));
    }

    if (valueType === FilterValueType.EXPRESSION) {
      return baseOps.filter((op) => !['BETWEEN', 'IS NULL', 'IS NOT NULL'].includes(op.value));
    }

    return baseOps;
  }, [getColumnType]);

  const ensureValidOperator = useCallback((columnName, valueType, operator) => {
    const options = getAvailableOperators(columnName, valueType);
    if (options.length === 0) {
      return operator;
    }
    const match = options.find((item) => item.value === operator);
    return match ? operator : options[0].value;
  }, [getAvailableOperators]);

  const firstAlternativeColumn = useCallback((excludeName) => {
    const candidate = normalizedColumns.find((col) => col.name !== excludeName);
    return candidate ? candidate.name : normalizedColumns[0]?.name || '';
  }, [normalizedColumns]);

  const enrichFilterMeta = useCallback((filter) => {
    if (!filter) {
      return filter;
    }
    const columnType = getColumnType(filter.column);
    const rightColumnName = filter.rightColumn || filter.right_column || '';
    const rightColumnType = rightColumnName ? getColumnType(rightColumnName) : undefined;
    return {
      ...filter,
      columnType,
      rightColumnType,
    };
  }, [getColumnType]);

  const handleFiltersUpdate = useCallback((updater) => {
    const updated = typeof updater === 'function' ? updater(filters) : updater;
    const normalizedList = (updated || []).map((filter) => enrichFilterMeta(filter));
    onFiltersChange?.(normalizedList);
  }, [enrichFilterMeta, filters, onFiltersChange]);

  const createEmptyFilter = useCallback((valueType = FilterValueType.CONSTANT) => {
    if (!hasColumns) {
      return null;
    }

    let effectiveValueType = valueType;
    if (valueType === FilterValueType.COLUMN && normalizedColumns.length < 2) {
      effectiveValueType = FilterValueType.CONSTANT;
    }

    const defaultColumn = normalizedColumns[0];
    const defaultOperator = ensureValidOperator(defaultColumn.name, effectiveValueType, '=');
    const base = {
      id: Date.now(),
      column: effectiveValueType === FilterValueType.EXPRESSION ? '' : defaultColumn.name,
      columnType:
        effectiveValueType === FilterValueType.EXPRESSION ? undefined : getColumnType(defaultColumn.name),
      operator: defaultOperator,
      value: '',
      value2: '',
      logicOperator: LogicOperator.AND,
      valueType: effectiveValueType,
      cast: null,
    };

    if (effectiveValueType === FilterValueType.COLUMN) {
      base.rightColumn = '';
      base.rightColumnType = undefined;
    }

    if (effectiveValueType === FilterValueType.EXPRESSION) {
      base.expression = '';
    }

    return base;
  }, [ensureValidOperator, firstAlternativeColumn, getColumnType, hasColumns, normalizedColumns]);

  const handleAddFilter = useCallback(() => {
    const newFilter = createEmptyFilter(preferredValueType);
    if (!newFilter) {
      return;
    }
    handleFiltersUpdate([...(filters || []), newFilter]);
  }, [createEmptyFilter, filters, handleFiltersUpdate, preferredValueType]);

  const handleRemoveFilter = useCallback((filterId) => {
    handleFiltersUpdate((prev) => prev.filter((filter) => filter.id !== filterId));
  }, [handleFiltersUpdate]);

  const handleValueTypeChange = useCallback((filterId, valueType) => {
    setPreferredValueType(valueType);

    handleFiltersUpdate((prev) => prev.map((filter) => {
      if (filter.id !== filterId) {
        return filter;
      }
      const nextValueType = valueType;
      const currentColumn = filter.column;
      const nextOperator = ensureValidOperator(currentColumn, nextValueType, filter.operator);
      const updated = {
        ...filter,
        valueType: nextValueType,
        operator: nextOperator,
        value: '',
        value2: '',
        expression: nextValueType === FilterValueType.EXPRESSION ? (filter.expression || '') : '',
        rightColumn: filter.rightColumn,
      };

      if (nextValueType === FilterValueType.COLUMN) {
        updated.rightColumn = '';
        updated.rightColumnType = undefined;
      } else {
        updated.rightColumn = undefined;
        updated.rightColumnType = undefined;
      }

      if (nextValueType !== FilterValueType.EXPRESSION) {
        updated.expression = '';
        updated.cast = null;
      } else {
        if (!updated.column) {
          updated.columnType = undefined;
        }
        updated.cast = filter.cast || null;
      }

      return updated;
    }));
  }, [ensureValidOperator, firstAlternativeColumn, getColumnType, handleFiltersUpdate]);

  const handleColumnChange = useCallback((filterId, columnName) => {
    handleFiltersUpdate((prev) => prev.map((filter) => {
      if (filter.id !== filterId) {
        return filter;
      }

      const valueType = filter.valueType || filter.value_type || FilterValueType.CONSTANT;
      const normalizedColumn = columnName || '';
      const nextOperator = ensureValidOperator(normalizedColumn, valueType, filter.operator);
      let nextRightColumn = filter.rightColumn || filter.right_column;
      if (valueType === FilterValueType.COLUMN) {
        nextRightColumn = '';
      } else {
        nextRightColumn = undefined;
      }

      const updated = {
        ...filter,
        column: normalizedColumn,
        columnType: normalizedColumn ? getColumnType(normalizedColumn) : undefined,
        operator: nextOperator,
        value: '',
        value2: '',
        rightColumn: nextRightColumn,
        right_column: nextRightColumn,
        rightColumnType: nextRightColumn ? getColumnType(nextRightColumn) : undefined,
      };

      return updated;
    }));
  }, [ensureValidOperator, getColumnType, handleFiltersUpdate, normalizedColumns]);

  const handleOperatorChange = useCallback((filterId, operator) => {
    handleFiltersUpdate((prev) => prev.map((filter) => {
      if (filter.id !== filterId) {
        return filter;
      }
      const updated = {
        ...filter,
        operator,
      };

      if (operator !== 'BETWEEN') {
        updated.value2 = '';
      }

      if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
        updated.value = '';
        updated.value2 = '';
      }

      return updated;
    }));
  }, [handleFiltersUpdate]);

  const handleLogicOperatorChange = useCallback((filterId, logicOperatorValue) => {
    handleFiltersUpdate((prev) => prev.map((filter) => (
      filter.id === filterId
        ? { ...filter, logicOperator: logicOperatorValue }
        : filter
    )));
  }, [handleFiltersUpdate]);

  const handleValueChange = useCallback((filterId, field, rawValue) => {
    handleFiltersUpdate((prev) => prev.map((filter) => {
      if (filter.id !== filterId) {
        return filter;
      }

      const updated = { ...filter };
      if (field === 'rightColumn' || field === 'right_column') {
        updated.rightColumn = rawValue;
        updated.right_column = rawValue;
        updated.rightColumnType = rawValue ? getColumnType(rawValue) : undefined;
      } else if (field === 'expression') {
        updated.expression = rawValue;
      } else if (field === 'value' || field === 'value2') {
        updated[field] = rawValue;
      } else {
        updated[field] = rawValue;
      }

      return updated;
    }));
  }, [getColumnType, handleFiltersUpdate]);

  const getComparisonWarning = useCallback((filter) => {
    const valueType = filter.valueType || filter.value_type || FilterValueType.CONSTANT;
    if (valueType !== FilterValueType.COLUMN) {
      return null;
    }

    const operator = filter.operator;
    const leftType = getColumnType(filter.column);
    const rightColumnName = filter.rightColumn || filter.right_column;
    if (!rightColumnName) {
      return '请选择用于比较的列';
    }
    const rightType = getColumnType(rightColumnName);

    if (isComparisonOperator(operator)) {
      const numericTypes = ['number', 'date'];
      if (!numericTypes.includes(leftType) || !numericTypes.includes(rightType) || leftType !== rightType) {
        return '该比较仅支持数值或日期列，并且两列类型需一致';
      }
    }

    if (isStringOperator(operator)) {
      if (leftType !== 'string' || rightType !== 'string') {
        return '包含/不包含操作仅支持文本列';
      }
    }

    return null;
  }, [getColumnType]);

  const renderValueInput = useCallback((filter) => {
    const valueType = filter.valueType || filter.value_type || FilterValueType.CONSTANT;

    if (valueType === FilterValueType.COLUMN) {
      const candidateColumns = normalizedColumns.filter((col) => col.name !== filter.column);
      const selected = filter.rightColumn || filter.right_column || '';

      return (
        <Stack spacing={0.5}>
          <ColumnSelect
            columns={candidateColumns}
            value={selected}
            onChange={(columnName) => handleValueChange(filter.id, 'rightColumn', columnName)}
            label="比较列"
            placeholder="请选择比较列"
            disabled={disabled}
            allowClear
          />
        </Stack>
      );
    }

    if (valueType === FilterValueType.EXPRESSION) {
      return (
        <Stack spacing={1.5}>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={3}
            placeholder="输入完整的 SQL 表达式，例如 (列A + 列B) / 2"
            value={filter.expression || ''}
            onChange={(event) => handleValueChange(filter.id, 'expression', event.target.value)}
            disabled={disabled}
          />
        </Stack>
      );
    }

    const columnType = getColumnType(filter.column);
    const isNumber = columnType === 'number';
    const isDate = columnType === 'date';
    const isBoolean = columnType === 'boolean';

    const placeholder = (() => {
      if (filter.operator === 'BETWEEN') {
        return isDate ? '开始日期' : isNumber ? '起始数值' : '起始值';
      }
      if (isBoolean) {
        return 'true / false';
      }
      if (isDate) {
        return 'YYYY-MM-DD';
      }
      if (isNumber) {
        return '数值';
      }
      if (isStringOperator(filter.operator)) {
        return '文本（支持模糊匹配）';
      }
      return '筛选值';
    })();

    const inputType = isNumber ? 'number' : isDate ? 'date' : 'text';

    const inputs = [
      <TextField
        key="primary"
        size="small"
        type={inputType}
        placeholder={placeholder}
        value={filter.value ?? ''}
        onChange={(event) => handleValueChange(filter.id, 'value', event.target.value)}
        disabled={disabled || filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL'}
        sx={{ minWidth: 140 }}
      />
    ];

    if (filter.operator === 'BETWEEN') {
      inputs.push(
        <Typography key="spacer" variant="body2" color="text.secondary">
          至
        </Typography>
      );
      inputs.push(
        <TextField
          key="secondary"
          size="small"
          type={inputType}
          placeholder={isDate ? '结束日期' : isNumber ? '结束数值' : '结束值'}
          value={filter.value2 ?? ''}
          onChange={(event) => handleValueChange(filter.id, 'value2', event.target.value)}
          disabled={disabled}
          sx={{ minWidth: 140 }}
        />
      );
    }

    return (
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {inputs}
      </Box>
    );
  }, [disabled, getColumnType, handleValueChange, normalizedColumns]);

  const emptyColumnsMessage = noColumnsMessage
    ? noColumnsMessage
    : mode === 'having'
      ? '请先配置聚合或计算字段，以便添加聚合筛选条件'
      : '请先选择数据表以配置筛选条件';

  if (!hasColumns) {
    return (
      <Box className={className}>
        <Typography variant="body2" color="text.secondary">
          {emptyColumnsMessage}
        </Typography>
      </Box>
    );
  }

  const rootClassName = ['space-y-2', className].filter(Boolean).join(' ');

  return (
    <Box className={rootClassName}>
      {showHeader && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600, color: 'var(--dq-text-primary)' }}>
            {resolvedTitle}
          </Typography>
          {resolvedSubtitle && (
            <Typography variant="caption" color="text.secondary">
              {resolvedSubtitle}
            </Typography>
          )}
        </Box>
      )}

      <Box className="space-y-2">
        {(filters || []).map((filter, index) => {
          const valueType = filter.valueType || filter.value_type || FilterValueType.CONSTANT;
          const availableOperators = getAvailableOperators(filter.column, valueType);
          const comparisonWarning = getComparisonWarning(filter);

          return (
            <Box
              key={filter.id}
              sx={{
                p: 3,
                borderRadius: 2,
                border: '1px solid var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface)',
                transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
                '&:hover': {
                  borderColor: 'var(--dq-border-card)',
                  boxShadow: '0 10px 24px -18px color-mix(in oklab, var(--dq-text-primary) 28%, transparent)'
                }
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 2,
                  alignItems: 'center'
                }}
              >
                {allowLogicOperator && index > 0 && (
                  <Box sx={{ flex: '0 0 120px', minWidth: 120 }}>
                    <FormControl size="small" fullWidth disabled={disabled}>
                      <InputLabel>逻辑</InputLabel>
                      <Select
                        label="逻辑"
                        value={filter.logicOperator || filter.logic_operator || LogicOperator.AND}
                        onChange={(event) => handleLogicOperatorChange(filter.id, event.target.value)}
                      >
                        {logicOperators.map((op) => (
                          <MenuItem key={op.value} value={op.value}>
                            {op.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                )}

                <Box sx={{ flex: '1 1 240px', minWidth: 200 }}>
                  <ColumnSelect
                    columns={normalizedColumns}
                    value={filter.column || ''}
                    onChange={(columnName) => handleColumnChange(filter.id, columnName)}
                    label={valueType === FilterValueType.EXPRESSION ? '比较列（可选）' : columnInputLabel}
                    placeholder={valueType === FilterValueType.EXPRESSION ? '留空表示直接使用表达式' : ''}
                    disabled={disabled}
                    allowClear={valueType === FilterValueType.EXPRESSION}
                    fullWidth
                  />
                </Box>

                <Box sx={{ flex: '0 0 180px', minWidth: 160 }}>
                  <FormControl
                    size="small"
                    fullWidth
                    disabled={
                      disabled ||
                        availableOperators.length === 0 ||
                        (valueType === FilterValueType.EXPRESSION && !filter.column)
                      }
                    >
                      <InputLabel>操作符</InputLabel>
                      <Select
                        label="操作符"
                        value={filter.operator}
                      onChange={(event) => handleOperatorChange(filter.id, event.target.value)}
                      MenuProps={{
                        PaperProps: { sx: menuPaperSx }
                      }}
                    >
                      {availableOperators.map((op) => (
                        <MenuItem key={op.value} value={op.value}>
                          {op.label}
                        </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                <Box sx={{ flex: '1 1 220px', minWidth: 200 }}>
                  {renderValueInput(filter)}
                  {comparisonWarning && (
                    <FormHelperText sx={{ color: 'var(--dq-status-warning-text)', mt: 1 }}>
                      {comparisonWarning}
                    </FormHelperText>
                  )}
                </Box>

                <Box sx={{ flex: '0 0 48px', display: 'flex', justifyContent: 'flex-end' }}>
                  <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ width: '100%' }}>
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveFilter(filter.id)}
                      disabled={disabled}
                      sx={{
                        color: 'var(--dq-status-error-text)',
                        '&:hover': {
                          backgroundColor: 'var(--dq-status-error-bg)'
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              </Box>

              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  匹配模式
                </Typography>
                <Box
                  className="dq-tab-group"
                  sx={{
                    display: 'inline-flex',
                    flexWrap: 'nowrap',
                    gap: 1,
                    overflowX: 'auto'
                  }}
                >
                  {valueTypeOptions.map((option) => (
                    <Button
                      key={option.value}
                      disableRipple
                      variant="text"
                      className={`dq-tab ${valueType === option.value ? 'dq-tab--active' : ''}`}
                      sx={{
                        minWidth: 'auto',
                        padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)',
                        whiteSpace: 'nowrap'
                      }}
                      onClick={() => handleValueTypeChange(filter.id, option.value)}
                      disabled={disabled || (option.value === FilterValueType.COLUMN && normalizedColumns.length < 2)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </Box>
              </Box>
            </Box>
          );
        })}

        <Button
          startIcon={<AddIcon />}
          variant="outlined"
          size="small"
          onClick={handleAddFilter}
          disabled={disabled || !hasColumns}
          sx={{ alignSelf: 'flex-start' }}
        >
          添加{mode === 'having' ? '聚合' : ''}筛选条件
        </Button>

        {(!filters || filters.length === 0) && (
          <Box
            sx={{
              p: 3,
              textAlign: 'center',
              backgroundColor: 'var(--dq-surface-card)',
              borderRadius: 3,
              border: '1px dashed var(--dq-border-muted)'
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {resolvedEmptyMessage}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default FilterControls;
