import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import ColumnSelect from './ColumnSelect';

const MODE_OPTIONS = [
  { value: 'combine', label: '组合运算' },
  { value: 'case', label: '条件 CASE' },
  { value: 'window', label: '窗口函数' }
];

const COMBINATION_OPERATORS = ['+', '-', '*', '/'];

const OPERAND_TYPE_OPTIONS = [
  { value: 'column', label: '列' },
  { value: 'constant', label: '数值' },
  { value: 'expression', label: '表达式' }
];

const CASE_VALUE_MODE_OPTIONS = [
  { value: 'constant', label: '常量' },
  { value: 'column', label: '列' },
  { value: 'expression', label: '表达式' }
];

const CASE_OPERATORS = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'NOT LIKE', 'IN', 'NOT IN', 'IS NULL', 'IS NOT NULL', 'BETWEEN'];

const RESULT_MODE_OPTIONS = [
  { value: 'constant', label: '常量' },
  { value: 'column', label: '列' },
  { value: 'expression', label: '表达式' }
];

const WINDOW_FUNCTIONS = [
  { value: 'ROW_NUMBER', label: 'ROW_NUMBER()', requiresColumn: false },
  { value: 'RANK', label: 'RANK()', requiresColumn: false },
  { value: 'DENSE_RANK', label: 'DENSE_RANK()', requiresColumn: false },
  { value: 'PERCENT_RANK', label: 'PERCENT_RANK()', requiresColumn: false },
  { value: 'CUME_DIST', label: 'CUME_DIST()', requiresColumn: false },
  { value: 'LAG', label: 'LAG()', requiresColumn: true, supportsOffset: true },
  { value: 'LEAD', label: 'LEAD()', requiresColumn: true, supportsOffset: true },
  { value: 'FIRST_VALUE', label: 'FIRST_VALUE()', requiresColumn: true },
  { value: 'LAST_VALUE', label: 'LAST_VALUE()', requiresColumn: true },
  { value: 'SUM', label: 'SUM()', requiresColumn: true },
  { value: 'AVG', label: 'AVG()', requiresColumn: true },
  { value: 'MIN', label: 'MIN()', requiresColumn: true },
  { value: 'MAX', label: 'MAX()', requiresColumn: true }
];

const ORDER_DIRECTIONS = [
  { value: 'ASC', label: '升序' },
  { value: 'DESC', label: '降序' }
];

const createId = () => `calc_${Math.random().toString(36).slice(2, 10)}`;

const createCombinationRow = () => ({
  id: createId(),
  operator: '+',
  operandType: 'column',
  column: '',
  constant: '',
  expression: ''
});

const createCaseRow = () => ({
  id: createId(),
  leftColumn: '',
  operator: '=',
  valueMode: 'constant',
  compareValue: '',
  compareColumn: '',
  compareExpression: '',
  resultMode: 'constant',
  resultValue: '',
  resultColumn: '',
  resultExpression: ''
});

const createWindowConfig = () => ({
  functionName: 'ROW_NUMBER',
  targetColumn: '',
  partitionColumns: [],
  orderings: [{ id: createId(), column: '', direction: 'ASC' }],
  offset: 1
});

const normalizeColumn = (column) => {
  if (!column) {
    return null;
  }

  if (typeof column === 'string') {
    return {
      name: column,
      label: column,
      dataType: 'string'
    };
  }

  const name = column.name || column.column_name || '';
  if (!name) {
    return null;
  }

  return {
    name,
    label: column.displayName || column.label || name,
    dataType: (column.dataType || column.type || 'string').toLowerCase()
  };
};

const isNumeric = (value) => {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  return Number.isFinite(Number(value));
};

const escapeLiteral = (value) => {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

const numericTypePatterns = [
  'integer',
  'int',
  'bigint',
  'smallint',
  'tinyint',
  'decimal',
  'numeric',
  'double',
  'float',
  'real'
];

const shouldCastToDecimal = (columnMeta) => {
  if (!columnMeta || !columnMeta.dataType) {
    return false;
  }
  const type = columnMeta.dataType.toLowerCase();
  return !numericTypePatterns.some((pattern) => type.includes(pattern));
};

const toNumericExpression = (columnName, columnMetaMap) => {
  if (!columnName) {
    return null;
  }
  const quoted = `"${columnName}"`;
  if (!columnMetaMap) {
    return quoted;
  }
  const meta = columnMetaMap.get(columnName);
  if (!shouldCastToDecimal(meta)) {
    return quoted;
  }
  return `TRY_CAST(${quoted} AS DECIMAL)`;
};

const buildCombinationExpression = (rows, columnMetaMap) => {
  if (!rows || rows.length === 0) {
    return '';
  }

  const validRows = rows.filter((row, index) => {
    if (row.operandType === 'column') {
            return Boolean(row.column);
    }
    if (row.operandType === 'constant') {
      return isNumeric(row.constant);
    }
    if (row.operandType === 'expression') {
      return Boolean(row.expression && row.expression.trim());
    }
    return index === 0;
  });

  if (validRows.length === 0) {
    return '';
  }

  const parts = [];
  validRows.forEach((row, index) => {
    let operandExpression = '';
    if (row.operandType === 'column') {
      operandExpression = toNumericExpression(row.column, columnMetaMap);
    } else if (row.operandType === 'constant') {
      operandExpression = Number(row.constant);
    } else if (row.operandType === 'expression') {
      operandExpression = `(${row.expression.trim()})`;
    }

    if (!operandExpression && operandExpression !== 0) {
      return;
    }

    if (index === 0) {
      parts.push(`${operandExpression}`);
    } else {
      const operator = COMBINATION_OPERATORS.includes(row.operator)
        ? row.operator
        : '+';
      parts.push(`${operator} ${operandExpression}`);
    }
  });

  if (parts.length === 0) {
    return '';
  }

  return parts.length === 1 ? parts[0] : `(${parts.join(' ')})`;
};

const buildCaseExpression = (rows, elseConfig) => {
  if (!rows || rows.length === 0) {
    return '';
  }

  const clauses = [];

  rows.forEach((row) => {
    if (!row.leftColumn) {
      return;
    }

    const operator = row.operator || '=';
    if (operator === 'BETWEEN') {
      // BETWEEN 需要 compareValue 以 A,B 形式输入
      if (!row.compareValue || !String(row.compareValue).includes(',')) {
        return;
      }
    }

    let rightExpression = '';
    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      rightExpression = '';
    } else if (row.valueMode === 'column') {
      if (!row.compareColumn) {
        return;
      }
      rightExpression = `"${row.compareColumn}"`;
    } else if (row.valueMode === 'expression') {
      if (!row.compareExpression || !row.compareExpression.trim()) {
        return;
      }
      rightExpression = `(${row.compareExpression.trim()})`;
    } else {
      if (!row.compareValue && row.compareValue !== 0) {
        return;
      }
      if (operator === 'BETWEEN') {
        const [start, end] = String(row.compareValue)
          .split(',')
          .map((item) => item.trim());
        if (!start || !end) {
          return;
        }
        const startLiteral = isNumeric(start) ? Number(start) : escapeLiteral(start);
        const endLiteral = isNumeric(end) ? Number(end) : escapeLiteral(end);
        rightExpression = `${startLiteral} AND ${endLiteral}`;
      } else if (operator === 'IN' || operator === 'NOT IN') {
        const values = String(row.compareValue)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => (isNumeric(item) ? Number(item) : escapeLiteral(item)));
        if (values.length === 0) {
          return;
        }
        rightExpression = `(${values.join(', ')})`;
      } else if (isNumeric(row.compareValue)) {
        rightExpression = Number(row.compareValue);
      } else {
        rightExpression = escapeLiteral(row.compareValue);
      }
    }

    let resultExpression = '';
    if (row.resultMode === 'column') {
      if (!row.resultColumn) {
        return;
      }
      resultExpression = `"${row.resultColumn}"`;
    } else if (row.resultMode === 'expression') {
      if (!row.resultExpression || !row.resultExpression.trim()) {
        return;
      }
      resultExpression = `(${row.resultExpression.trim()})`;
    } else {
      if (!row.resultValue && row.resultValue !== 0) {
        return;
      }
      resultExpression = isNumeric(row.resultValue)
        ? Number(row.resultValue)
        : escapeLiteral(row.resultValue);
    }

    const leftExpression = `"${row.leftColumn}"`;
    const clause =
      operator === 'IS NULL' || operator === 'IS NOT NULL'
        ? `WHEN ${leftExpression} ${operator} THEN ${resultExpression}`
        : operator === 'BETWEEN'
          ? `WHEN ${leftExpression} BETWEEN ${rightExpression} THEN ${resultExpression}`
          : `WHEN ${leftExpression} ${operator} ${rightExpression} THEN ${resultExpression}`;
    clauses.push(clause);
  });

  if (clauses.length === 0) {
    return '';
  }

  let elseClause = '';
  if (elseConfig) {
    const { mode, value, column, expression } = elseConfig;
    if (mode === 'column' && column) {
      elseClause = ` ELSE "${column}"`;
    } else if (mode === 'expression' && expression && expression.trim()) {
      elseClause = ` ELSE (${expression.trim()})`;
    } else if (mode === 'constant' && (value || value === 0)) {
      elseClause = isNumeric(value)
        ? ` ELSE ${Number(value)}`
        : ` ELSE ${escapeLiteral(value)}`;
    }
  }

  return `CASE ${clauses.join(' ')}${elseClause} END`;
};

const buildWindowExpression = (config) => {
  if (!config || !config.functionName) {
    return '';
  }

  const fnMeta = WINDOW_FUNCTIONS.find((fn) => fn.value === config.functionName);
  const requiresColumn = fnMeta?.requiresColumn;
  const supportsOffset = fnMeta?.supportsOffset;

  if (requiresColumn && !config.targetColumn) {
    return '';
  }

  const functionCall = (() => {
    if (requiresColumn) {
      const columnExpr = `"${config.targetColumn}"`;
      if (supportsOffset) {
        const offset = Number.isFinite(Number(config.offset)) ? Number(config.offset) : 1;
        return `${config.functionName}(${columnExpr}, ${offset || 1})`;
      }
      return `${config.functionName}(${columnExpr})`;
    }
    return `${config.functionName}()`;
  })();

  const partitions = (config.partitionColumns || []).filter(Boolean);
  const partitionClause = partitions.length > 0
    ? `PARTITION BY ${partitions.map((column) => `"${column}"`).join(', ')}`
    : '';

  const orderings = (config.orderings || [])
    .filter((item) => item.column)
    .map((item) => {
      const direction = ORDER_DIRECTIONS.some((dir) => dir.value === item.direction)
        ? item.direction
        : 'ASC';
      return `"${item.column}" ${direction}`;
    });
  const orderClause = orderings.length > 0 ? `ORDER BY ${orderings.join(', ')}` : '';

  const windowSections = [partitionClause, orderClause].filter(Boolean);
  const overBody = windowSections.join(' ');
  return `${functionCall} OVER (${overBody || ''})`;
};

const CalculatedFieldsControls = ({
  columns = [],
  calculatedFields = [],
  onCalculatedFieldsChange,
  disabled = false,
  showHeader = true
}) => {
  const normalizedColumns = useMemo(
    () => columns.map(normalizeColumn).filter(Boolean),
    [columns]
  );

  const columnMetaMap = useMemo(() => {
    const map = new Map();
    normalizedColumns.forEach((col) => {
      if (col?.name) {
        map.set(col.name, col);
      }
    });
    return map;
  }, [normalizedColumns]);

  const [formState, setFormState] = useState({
    name: '',
    mode: 'combine',
    combinationRows: [createCombinationRow()],
    caseRows: [createCaseRow()],
    caseElse: {
      mode: 'constant',
      value: '',
      column: '',
      expression: ''
    },
    windowConfig: createWindowConfig()
  });

  const currentFunctionMeta = useMemo(
    () => WINDOW_FUNCTIONS.find((fn) => fn.value === formState.windowConfig.functionName),
    [formState.windowConfig.functionName]
  );

  const combinationExpression = useMemo(
    () => buildCombinationExpression(formState.combinationRows, columnMetaMap),
    [formState.combinationRows, columnMetaMap]
  );

  const caseExpression = useMemo(
    () => buildCaseExpression(formState.caseRows, formState.caseElse),
    [formState.caseRows, formState.caseElse]
  );

  const windowExpression = useMemo(
    () => buildWindowExpression(formState.windowConfig),
    [formState.windowConfig]
  );

  const expressionPreview = useMemo(() => {
    if (formState.mode === 'case') {
      return caseExpression;
    }
    if (formState.mode === 'window') {
      return windowExpression;
    }
    return combinationExpression;
  }, [caseExpression, windowExpression, combinationExpression, formState.mode]);

  const handleModeChange = (mode) => {
    setFormState((prev) => ({
      ...prev,
      mode
    }));
  };

  const handleNameChange = (event) => {
    const value = event.target.value;
    setFormState((prev) => ({
      ...prev,
      name: value
    }));
  };

  const updateCombinationRow = (rowId, updates) => {
    setFormState((prev) => ({
      ...prev,
      combinationRows: prev.combinationRows.map((row) =>
        row.id === rowId ? { ...row, ...updates } : row
      )
    }));
  };

  const addCombinationRow = () => {
    setFormState((prev) => ({
      ...prev,
      combinationRows: [...prev.combinationRows, { ...createCombinationRow(), operator: '+' }]
    }));
  };

  const removeCombinationRow = (rowId) => {
    setFormState((prev) => {
      if (prev.combinationRows.length === 1) {
        return prev;
      }
      return {
        ...prev,
        combinationRows: prev.combinationRows.filter((row) => row.id !== rowId)
      };
    });
  };

  const updateCaseRow = (rowId, updates) => {
    setFormState((prev) => ({
      ...prev,
      caseRows: prev.caseRows.map((row) =>
        row.id === rowId ? { ...row, ...updates } : row
      )
    }));
  };

  const addCaseRow = () => {
    setFormState((prev) => ({
      ...prev,
      caseRows: [...prev.caseRows, createCaseRow()]
    }));
  };

  const removeCaseRow = (rowId) => {
    setFormState((prev) => {
      if (prev.caseRows.length === 1) {
        return prev;
      }
      return {
        ...prev,
        caseRows: prev.caseRows.filter((row) => row.id !== rowId)
      };
    });
  };

  const updateCaseElse = (updates) => {
    setFormState((prev) => ({
      ...prev,
      caseElse: { ...prev.caseElse, ...updates }
    }));
  };

  const updateWindowConfig = (updates) => {
    setFormState((prev) => ({
      ...prev,
      windowConfig: { ...prev.windowConfig, ...updates }
    }));
  };

  const updateWindowOrdering = (orderingId, updates) => {
    setFormState((prev) => ({
      ...prev,
      windowConfig: {
        ...prev.windowConfig,
        orderings: prev.windowConfig.orderings.map((ordering) =>
          ordering.id === orderingId ? { ...ordering, ...updates } : ordering
        )
      }
    }));
  };

  const addWindowOrdering = () => {
    setFormState((prev) => ({
      ...prev,
      windowConfig: {
        ...prev.windowConfig,
        orderings: [...prev.windowConfig.orderings, { id: createId(), column: '', direction: 'ASC' }]
      }
    }));
  };

  const removeWindowOrdering = (orderingId) => {
    setFormState((prev) => {
      if (prev.windowConfig.orderings.length === 1) {
        return prev;
      }
      return {
        ...prev,
        windowConfig: {
          ...prev.windowConfig,
          orderings: prev.windowConfig.orderings.filter((ordering) => ordering.id !== orderingId)
        }
      };
    });
  };

  const resetForm = () => {
    setFormState((prev) => ({
      ...prev,
      name: '',
      combinationRows: [createCombinationRow()],
      caseRows: [createCaseRow()],
      caseElse: {
        mode: 'constant',
        value: '',
        column: '',
        expression: ''
      },
      windowConfig: createWindowConfig()
    }));
  };

  const handleAddField = () => {
    const trimmedName = formState.name.trim();
    const trimmedExpression = (expressionPreview || '').trim();
    if (!trimmedName || !trimmedExpression) {
      return;
    }

    const nextFieldType = formState.mode === 'combine'
      ? 'mathematical'
      : formState.mode === 'case'
        ? 'string'
        : 'mathematical';

    const buildParams = () => {
      if (formState.mode === 'combine') {
        return {
          rows: formState.combinationRows.map((row) => ({ ...row }))
        };
      }
      if (formState.mode === 'case') {
        return {
          rows: formState.caseRows.map((row) => ({ ...row })),
          else: { ...formState.caseElse }
        };
      }
      if (formState.mode === 'window') {
        return {
          window: {
            ...formState.windowConfig,
            partitionColumns: [...(formState.windowConfig.partitionColumns || [])],
            orderings: (formState.windowConfig.orderings || []).map((ordering) => ({ ...ordering })),
          }
        };
      }
      return undefined;
    };

    const nextField = {
      id: createId(),
      name: trimmedName,
      alias: trimmedName,
      expression: trimmedExpression,
      type: nextFieldType,
      operation: formState.mode,
      params: buildParams()
    };

    onCalculatedFieldsChange?.([...(calculatedFields || []), nextField]);
    resetForm();
  };

  const handleDeleteField = (fieldId) => {
    const remaining = (calculatedFields || []).filter((field) => field.id !== fieldId);
    onCalculatedFieldsChange?.(remaining);
  };

  const submitDisabled = !formState.name.trim() || !expressionPreview || disabled;

  return (
    <Box>
      {showHeader && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600, color: 'var(--dq-text-primary)' }}>
            计算字段
          </Typography>
          <Typography variant="caption" color="text.secondary">
            构建组合、条件或窗口函数字段，增强分析能力
          </Typography>
        </Box>
      )}

      {(calculatedFields || []).length > 0 && (
        <Stack spacing={1.5} sx={{ mb: 3 }}>
          {(calculatedFields || []).map((field) => (
            <Paper
              key={field.id}
              variant="outlined"
              sx={{
                px: 2,
                py: 1.5,
                borderRadius: 2,
                borderColor: 'var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--dq-text-primary)' }}>
                    {field.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {field.operation === 'combine' && '组合运算'}
                    {field.operation === 'case' && '条件 CASE'}
                    {field.operation === 'window' && '窗口函数'}
                    {!['combine', 'case', 'window'].includes(field.operation) && field.operation}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => handleDeleteField(field.id)}
                  disabled={disabled}
                  sx={{
                    color: 'var(--dq-status-error-text)',
                    '&:hover': { backgroundColor: 'var(--dq-status-error-bg)' }
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'var(--dq-font-monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
                  wordBreak: 'break-all',
                  color: 'var(--dq-text-tertiary)'
                }}
              >
                {field.expression}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}

      <Stack spacing={3}>
        <TextField
          label="字段名称"
          value={formState.name}
          size="small"
          onChange={handleNameChange}
          disabled={disabled}
          placeholder="输入新字段的名称"
        />

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            字段类型
          </Typography>
          <Box className="dq-tab-group" sx={{ display: 'inline-flex', flexWrap: 'wrap', gap: 1 }}>
            {MODE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                disableRipple
                variant="text"
                className={`dq-tab ${formState.mode === option.value ? 'dq-tab--active' : ''}`}
                sx={{
                  minWidth: 'auto',
                  padding: 'var(--dq-tab-padding-y) var(--dq-tab-padding-x)'
                }}
                onClick={() => handleModeChange(option.value)}
                disabled={disabled}
              >
                {option.label}
              </Button>
            ))}
          </Box>
        </Box>

        {formState.mode === 'combine' && (
          <Stack spacing={2}>
            {(formState.combinationRows || []).map((row, index) => (
              <Paper
                key={row.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  borderColor: 'var(--dq-border-subtle)',
                  backgroundColor: 'var(--dq-surface)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 1.5,
                  alignItems: 'center'
                }}
              >
                {index > 0 && (
                  <FormControl size="small" sx={{ minWidth: 90 }} disabled={disabled}>
                    <InputLabel>运算符</InputLabel>
                    <Select
                      label="运算符"
                      value={row.operator}
                      onChange={(event) => updateCombinationRow(row.id, { operator: event.target.value })}
                    >
                      {COMBINATION_OPERATORS.map((operator) => (
                        <MenuItem key={operator} value={operator}>
                          {operator}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <FormControl size="small" sx={{ minWidth: 120 }} disabled={disabled}>
                  <InputLabel>值类型</InputLabel>
                  <Select
                    label="值类型"
                    value={row.operandType}
                    onChange={(event) => updateCombinationRow(row.id, {
                      operandType: event.target.value,
                      column: event.target.value === 'column' ? row.column : '',
                      constant: event.target.value === 'constant' ? row.constant : '',
                      expression: event.target.value === 'expression' ? row.expression : ''
                    })}
                  >
                    {OPERAND_TYPE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {row.operandType === 'column' && (
                  <Box sx={{ minWidth: 200, flex: 1 }}>
                    <ColumnSelect
                      columns={normalizedColumns}
                      value={row.column}
                      onChange={(columnName) => updateCombinationRow(row.id, { column: columnName })}
                      label="列"
                      disabled={disabled}
                    />
                  </Box>
                )}

                {row.operandType === 'constant' && (
                  <TextField
                    label="数值"
                    size="small"
                    type="number"
                    value={row.constant}
                    onChange={(event) => updateCombinationRow(row.id, { constant: event.target.value })}
                    disabled={disabled}
                    sx={{ minWidth: 160 }}
                    placeholder="输入数值"
                  />
                )}

                {row.operandType === 'expression' && (
                  <TextField
                    label="表达式"
                    size="small"
                    value={row.expression}
                    onChange={(event) => updateCombinationRow(row.id, { expression: event.target.value })}
                    disabled={disabled}
                    sx={{ minWidth: 200, flex: 1 }}
                    placeholder={'例如 ("列A" * 0.2)'}
                  />
                )}

                {formState.combinationRows.length > 1 && (
                  <IconButton
                    size="small"
                    onClick={() => removeCombinationRow(row.id)}
                    disabled={disabled}
                    sx={{
                      color: 'var(--dq-status-error-text)',
                      '&:hover': { backgroundColor: 'var(--dq-status-error-bg)' }
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </Paper>
            ))}

            <Button
              startIcon={<AddIcon />}
              size="small"
              variant="outlined"
              onClick={addCombinationRow}
              disabled={disabled}
              sx={{ alignSelf: 'flex-start' }}
            >
              添加运算项
            </Button>
          </Stack>
        )}

        {formState.mode === 'case' && (
          <Stack spacing={2}>
            {(formState.caseRows || []).map((row) => (
              <Paper
                key={row.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  borderColor: 'var(--dq-border-subtle)',
                  backgroundColor: 'var(--dq-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5
                }}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Box sx={{ minWidth: 180, flex: 1 }}>
                    <ColumnSelect
                      columns={normalizedColumns}
                      value={row.leftColumn}
                      onChange={(columnName) => updateCaseRow(row.id, { leftColumn: columnName })}
                      label="左侧列"
                      disabled={disabled}
                    />
                  </Box>

                  <FormControl size="small" sx={{ minWidth: 120 }} disabled={disabled}>
                    <InputLabel>操作符</InputLabel>
                    <Select
                      label="操作符"
                      value={row.operator}
                      onChange={(event) => updateCaseRow(row.id, { operator: event.target.value })}
                    >
                      {CASE_OPERATORS.map((operator) => (
                        <MenuItem key={operator} value={operator}>
                          {operator}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 140 }} disabled={disabled || row.operator === 'IS NULL' || row.operator === 'IS NOT NULL'}>
                    <InputLabel>比较类型</InputLabel>
                    <Select
                      label="比较类型"
                      value={row.valueMode}
                      onChange={(event) => updateCaseRow(row.id, {
                        valueMode: event.target.value,
                        compareColumn: '',
                        compareValue: '',
                        compareExpression: ''
                      })}
                    >
                      {CASE_VALUE_MODE_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                {row.operator !== 'IS NULL' && row.operator !== 'IS NOT NULL' && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                    {row.valueMode === 'column' && (
                      <Box sx={{ minWidth: 200, flex: 1 }}>
                        <ColumnSelect
                          columns={normalizedColumns}
                          value={row.compareColumn}
                          onChange={(columnName) => updateCaseRow(row.id, { compareColumn: columnName })}
                          label="比较列"
                          disabled={disabled}
                        />
                      </Box>
                    )}

                    {row.valueMode === 'constant' && (
                      <TextField
                        label={row.operator === 'BETWEEN' ? '数值范围 (使用逗号分隔)' : '比较值'}
                        size="small"
                        value={row.compareValue}
                        onChange={(event) => updateCaseRow(row.id, { compareValue: event.target.value })}
                        disabled={disabled}
                        sx={{ minWidth: 200 }}
                        placeholder={row.operator === 'BETWEEN' ? '如 10, 20' : '例如 100 或 高'}
                      />
                    )}

                    {row.valueMode === 'expression' && (
                      <TextField
                        label="比较表达式"
                        size="small"
                        value={row.compareExpression}
                        onChange={(event) => updateCaseRow(row.id, { compareExpression: event.target.value })}
                        disabled={disabled}
                        sx={{ minWidth: 220, flex: 1 }}
                    placeholder={'例如 ("列B" * 0.2)'}
                      />
                    )}
                  </Box>
                )}

                <Divider sx={{ my: 1 }} />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
                  <Typography variant="caption" sx={{ minWidth: 60 }} color="text.secondary">
                    THEN
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 140 }} disabled={disabled}>
                    <InputLabel>结果类型</InputLabel>
                    <Select
                      label="结果类型"
                      value={row.resultMode}
                      onChange={(event) => updateCaseRow(row.id, {
                        resultMode: event.target.value,
                        resultColumn: '',
                        resultValue: '',
                        resultExpression: ''
                      })}
                    >
                      {RESULT_MODE_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {row.resultMode === 'column' && (
                    <Box sx={{ minWidth: 200, flex: 1 }}>
                      <ColumnSelect
                        columns={normalizedColumns}
                        value={row.resultColumn}
                        onChange={(columnName) => updateCaseRow(row.id, { resultColumn: columnName })}
                        label="结果列"
                        disabled={disabled}
                      />
                    </Box>
                  )}

                  {row.resultMode === 'constant' && (
                    <TextField
                      label="结果值"
                      size="small"
                      value={row.resultValue}
                      onChange={(event) => updateCaseRow(row.id, { resultValue: event.target.value })}
                      disabled={disabled}
                      sx={{ minWidth: 200 }}
                      placeholder="数值或文本"
                    />
                  )}

                  {row.resultMode === 'expression' && (
                    <TextField
                      label="结果表达式"
                      size="small"
                      value={row.resultExpression}
                      onChange={(event) => updateCaseRow(row.id, { resultExpression: event.target.value })}
                      disabled={disabled}
                      sx={{ minWidth: 220, flex: 1 }}
                    placeholder={'例如 ("列C" * 0.1)'}
                    />
                  )}
                </Stack>

                {formState.caseRows.length > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <IconButton
                      size="small"
                      onClick={() => removeCaseRow(row.id)}
                      disabled={disabled}
                      sx={{
                        color: 'var(--dq-status-error-text)',
                        '&:hover': { backgroundColor: 'var(--dq-status-error-bg)' }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </Paper>
            ))}

            <Button
              startIcon={<AddIcon />}
              size="small"
              variant="outlined"
              onClick={addCaseRow}
              disabled={disabled}
              sx={{ alignSelf: 'flex-start' }}
            >
              添加 WHEN 条件
            </Button>

            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                borderColor: 'var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface)'
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                ELSE 分支（可选）
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 140 }} disabled={disabled}>
                  <InputLabel>结果类型</InputLabel>
                  <Select
                    label="结果类型"
                    value={formState.caseElse.mode}
                    onChange={(event) => updateCaseElse({
                      mode: event.target.value,
                      column: '',
                      value: '',
                      expression: ''
                    })}
                  >
                    {RESULT_MODE_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {formState.caseElse.mode === 'column' && (
                  <Box sx={{ minWidth: 200, flex: 1 }}>
                    <ColumnSelect
                      columns={normalizedColumns}
                      value={formState.caseElse.column}
                      onChange={(columnName) => updateCaseElse({ column: columnName })}
                      label="结果列"
                      disabled={disabled}
                    />
                  </Box>
                )}

                {formState.caseElse.mode === 'constant' && (
                  <TextField
                    label="结果值"
                    size="small"
                    value={formState.caseElse.value}
                    onChange={(event) => updateCaseElse({ value: event.target.value })}
                    disabled={disabled}
                    sx={{ minWidth: 200 }}
                    placeholder="默认结果"
                  />
                )}

                {formState.caseElse.mode === 'expression' && (
                  <TextField
                    label="结果表达式"
                    size="small"
                    value={formState.caseElse.expression}
                    onChange={(event) => updateCaseElse({ expression: event.target.value })}
                    disabled={disabled}
                    sx={{ minWidth: 220, flex: 1 }}
                    placeholder={'例如 ("列D" * 0.5)'}
                  />
                )}
              </Stack>
            </Paper>
          </Stack>
        )}

        {formState.mode === 'window' && (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <FormControl size="small" sx={{ minWidth: 200 }} disabled={disabled}>
                <InputLabel>窗口函数</InputLabel>
                <Select
                  label="窗口函数"
                  value={formState.windowConfig.functionName}
                  onChange={(event) => updateWindowConfig({
                    functionName: event.target.value,
                    targetColumn: '',
                    offset: 1
                  })}
                >
                  {WINDOW_FUNCTIONS.map((fn) => (
                    <MenuItem key={fn.value} value={fn.value}>
                      {fn.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {currentFunctionMeta?.requiresColumn && (
                <FormControl size="small" sx={{ minWidth: 200, flex: 1 }} disabled={disabled}>
                  <InputLabel>目标列</InputLabel>
                  <Select
                    label="目标列"
                    value={formState.windowConfig.targetColumn}
                    onChange={(event) => updateWindowConfig({ targetColumn: event.target.value })}
                  >
                    {normalizedColumns.map((column) => (
                      <MenuItem key={column.name} value={column.name}>
                        {column.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {currentFunctionMeta?.supportsOffset && (
                <TextField
                  label="偏移量"
                  size="small"
                  type="number"
                  value={formState.windowConfig.offset}
                  onChange={(event) => updateWindowConfig({ offset: Number(event.target.value) || 1 })}
                  disabled={disabled}
                  sx={{ minWidth: 120 }}
                />
              )}
            </Stack>

            <FormControl
              size="small"
              fullWidth
              disabled={disabled}
            >
              <InputLabel>分区列（可多选）</InputLabel>
              <Select
                label="分区列（可多选）"
                multiple
                value={formState.windowConfig.partitionColumns}
                onChange={(event) => updateWindowConfig({ partitionColumns: event.target.value })}
                renderValue={(selected) =>
                  (selected || []).map((column) => `"${column}"`).join(', ')
                }
              >
                {normalizedColumns.map((column) => (
                  <MenuItem key={column.name} value={column.name}>
                    {column.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Stack spacing={1.5}>
              <Typography variant="caption" color="text.secondary">
                排序列
              </Typography>
              {(formState.windowConfig.orderings || []).map((ordering) => (
                <Paper
                  key={ordering.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderColor: 'var(--dq-border-subtle)',
                    backgroundColor: 'var(--dq-surface)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    alignItems: 'center'
                  }}
                >
                  <FormControl size="small" sx={{ minWidth: 200, flex: 1 }} disabled={disabled}>
                    <InputLabel>列</InputLabel>
                    <Select
                      label="列"
                      value={ordering.column}
                      onChange={(event) => updateWindowOrdering(ordering.id, { column: event.target.value })}
                    >
                      {normalizedColumns.map((column) => (
                        <MenuItem key={column.name} value={column.name}>
                          {column.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 120 }} disabled={disabled}>
                    <InputLabel>方向</InputLabel>
                    <Select
                      label="方向"
                      value={ordering.direction}
                      onChange={(event) => updateWindowOrdering(ordering.id, { direction: event.target.value })}
                    >
                      {ORDER_DIRECTIONS.map((direction) => (
                        <MenuItem key={direction.value} value={direction.value}>
                          {direction.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {formState.windowConfig.orderings.length > 1 && (
                    <IconButton
                      size="small"
                      onClick={() => removeWindowOrdering(ordering.id)}
                      disabled={disabled}
                      sx={{
                        color: 'var(--dq-status-error-text)',
                        '&:hover': { backgroundColor: 'var(--dq-status-error-bg)' }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Paper>
              ))}

              <Button
                startIcon={<AddIcon />}
                size="small"
                variant="outlined"
                onClick={addWindowOrdering}
                disabled={disabled}
                sx={{ alignSelf: 'flex-start' }}
              >
                添加排序列
              </Button>
            </Stack>
          </Stack>
        )}

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            SQL 预览
          </Typography>
          <Box
            sx={{
              fontFamily: 'var(--dq-font-monospace, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
              fontSize: 12,
              color: expressionPreview ? 'var(--dq-text-primary)' : 'var(--dq-text-tertiary)',
              backgroundColor: 'var(--dq-surface)',
              border: '1px solid var(--dq-border-muted)',
              borderRadius: 2,
              p: 1.5,
              minHeight: 48,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {expressionPreview || '根据上方配置自动生成表达式'}
          </Box>
        </Box>

        <Button
          variant="contained"
          onClick={handleAddField}
          disabled={submitDisabled}
          startIcon={<AddIcon />}
        >
          添加计算字段
        </Button>
      </Stack>
    </Box>
  );
};

export default CalculatedFieldsControls;
