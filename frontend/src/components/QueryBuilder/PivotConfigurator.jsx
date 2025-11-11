import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Eye, HelpCircle, Plus, Trash2, RotateCcw } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDistinctValues } from '../../services/apiClient';
import { AggregationFunction, createDefaultPivotConfig } from '../../utils/visualQueryUtils';
import ColumnSelect from './VisualAnalysis/ColumnSelect';

const PIVOT_AGGREGATIONS = [
  AggregationFunction.SUM,
  AggregationFunction.AVG,
  AggregationFunction.COUNT,
  AggregationFunction.COUNT_DISTINCT,
  AggregationFunction.MIN,
  AggregationFunction.MAX,
];

const toColumnLabel = (column) => {
  if (!column) return '';
  if (typeof column === 'string') return column;
  return column.name || column.column || column.id || '';
};

const buildSampleCombos = (samplesPerDimension, limit = 2) => {
  if (!samplesPerDimension || samplesPerDimension.length === 0) {
    return [[]];
  }
  const results = [];
  const visit = (index, path) => {
    if (results.length >= limit) {
      return;
    }
    if (index === samplesPerDimension.length) {
      results.push(path);
      return;
    }
    const values = samplesPerDimension[index] || [];
    if (values.length === 0) {
      visit(index + 1, path);
      return;
    }
    values.slice(0, 2).forEach((value) => {
      visit(index + 1, [...path, value]);
    });
  };
  visit(0, []);
  return results.length > 0 ? results : [[]];
};

const PivotConfigurator = ({
  columns = [],
  pivotConfig,
  onChange,
  disabled = false,
  selectedTable,
  analysisConfig,
}) => {
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewValues, setPreviewValues] = useState([]);
  const [previewStats, setPreviewStats] = useState({});
  const [previewOrderBy, setPreviewOrderBy] = useState('frequency');
  const [previewLimit, setPreviewLimit] = useState(12);
  const [previewMetric, setPreviewMetric] = useState({ agg: 'SUM', column: '' });

  // 本地状态管理，避免频繁重新渲染
  const [localManualColumnValues, setLocalManualColumnValues] = useState(
    pivotConfig.manualColumnValues?.join(', ') || ''
  );
  const [localColumnValueLimit, setLocalColumnValueLimit] = useState(
    pivotConfig.columnValueLimit ?? ''
  );
  const [localFillValue, setLocalFillValue] = useState(
    pivotConfig.fillValue !== undefined && pivotConfig.fillValue !== null ? pivotConfig.fillValue : ''
  );

  // 同步本地状态和 props
  useEffect(() => {
    setLocalManualColumnValues(pivotConfig.manualColumnValues?.join(', ') || '');
  }, [pivotConfig.manualColumnValues]);

  useEffect(() => {
    setLocalColumnValueLimit(pivotConfig.columnValueLimit ?? '');
  }, [pivotConfig.columnValueLimit]);

  useEffect(() => {
    setLocalFillValue(pivotConfig.fillValue !== undefined && pivotConfig.fillValue !== null ? pivotConfig.fillValue : '');
  }, [pivotConfig.fillValue]);

  const normalizedColumns = useMemo(() => {
    return (columns || [])
      .map((col) => {
        if (!col) {
          return null;
        }
        if (typeof col === 'string') {
          return {
            name: col,
            label: col,
            dataType: 'text',
          };
        }
        const label = toColumnLabel(col);
        if (!label) {
          return null;
        }
        const dataType = (col.dataType || col.type || col.column_type || 'text').toString().toLowerCase();
        return {
          name: label,
          label,
          dataType,
        };
      })
      .filter(Boolean);
  }, [columns]);

  // 防抖处理函数
  const debounceRef = useRef({});
  const latestConfigRef = useRef(pivotConfig);

  useEffect(() => {
    latestConfigRef.current = pivotConfig;
  }, [pivotConfig]);

  const scheduleConfigUpdate = useCallback((key, updates, delay = 300) => {
    if (debounceRef.current[key]) {
      clearTimeout(debounceRef.current[key]);
    }

    debounceRef.current[key] = setTimeout(() => {
      if (onChange) {
        onChange({
          ...latestConfigRef.current,
          ...updates,
        });
      }
      delete debounceRef.current[key];
    }, delay);
  }, [onChange]);

  useEffect(() => {
    return () => {
      Object.values(debounceRef.current || {}).forEach((timerId) => {
        clearTimeout(timerId);
      });
      debounceRef.current = {};
    };
  }, []);

  const handleUpdate = useCallback((updates) => {
    if (onChange) {
      onChange({
        ...pivotConfig,
        ...updates,
      });
    }
  }, [onChange, pivotConfig]);

  const handleReset = useCallback(() => {
    if (onChange) {
      onChange(createDefaultPivotConfig());
    }
    setLocalManualColumnValues('');
    setLocalColumnValueLimit('');
    setLocalFillValue('');
  }, [onChange]);

  // 采样预览功能
  const handlePreviewValues = async () => {
    if (!selectedTable || !pivotConfig.columns || pivotConfig.columns.length === 0) {
      return;
    }

    setPreviewLoading(true);
    try {
      const payload = {
        config: {
          table_name: selectedTable.name || selectedTable.id,
          filters: analysisConfig?.filters || [],
        },
        column: pivotConfig.columns[0],
        limit: previewLimit,
        order_by: previewOrderBy,
        metric: previewOrderBy === 'metric' ? previewMetric : null,
      };

      const result = await getDistinctValues(payload);
      if (result.success) {
        setPreviewValues(result.values || []);
        setPreviewStats(result.stats || {});
      }
    } catch (error) {
      console.error('获取采样值失败:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUsePreviewValues = () => {
    if (previewValues.length > 0) {
      handleUpdate({ manualColumnValues: previewValues });
      setPreviewDialogOpen(false);
    }
  };

  const handleMultiSelectChange = (key) => (event) => {
    handleUpdate({ [key]: event.target.value });
  };

  // 仅允许列维度选择 1 个（原生 PIVOT 兼容）
  const handleColumnsChange = (event) => {
    const value = event.target.value;
    let next = [];
    if (Array.isArray(value)) {
      // 保留最后一次选择的 1 个值
      next = value.length > 0 ? [value[value.length - 1]] : [];
    } else if (value) {
      next = [value];
    }
    handleUpdate({ columns: next });
  };

  const handleValueChange = (index, key, value) => {
    const nextValues = pivotConfig.values.map((item, idx) =>
      idx === index
        ? {
          ...item,
          [key]: value,
        }
        : item,
    );
    handleUpdate({ values: nextValues });
  };

  const addValue = () => {
    handleUpdate({
      values: [
        ...pivotConfig.values,
        {
          column: '',
          aggregation: AggregationFunction.SUM,
          alias: '',
        },
      ],
    });
  };

  const removeValue = (index) => {
    const nextValues = pivotConfig.values.filter((_, idx) => idx !== index);
    handleUpdate({ values: nextValues.length > 0 ? nextValues : [{ column: '', aggregation: AggregationFunction.SUM, alias: '' }] });
  };

  const pivotPreview = useMemo(() => {
    const rowDims = Array.isArray(pivotConfig.rows) && pivotConfig.rows.length > 0
      ? pivotConfig.rows
      : ['行维度'];
    const columnDims = Array.isArray(pivotConfig.columns) && pivotConfig.columns.length > 0
      ? pivotConfig.columns
      : [];

    const metricConfigs = Array.isArray(pivotConfig.values) && pivotConfig.values.length > 0
      ? pivotConfig.values
      : [{
        aggregation: AggregationFunction.SUM,
        column: rowDims[0] || '值',
        alias: ''
      }];

    const metricLabels = metricConfigs.map((config) => {
      if (config?.alias && String(config.alias).trim()) {
        return String(config.alias).trim();
      }
      if (config?.aggregation && config?.column) {
        return `${config.aggregation}(${config.column})`;
      }
      if (config?.column) {
        return String(config.column);
      }
      return '指标';
    });

    const columnSamples = columnDims.map((dim) => [`${dim}示例A`, `${dim}示例B`]);
    const columnCombos = buildSampleCombos(columnSamples, 2);
    const hasColumnGroups = columnDims.length > 0;

    const rowSampleValues = [0, 1].map((rowIndex) =>
      rowDims.map((dim) => `${dim}样例${rowIndex + 1}`)
    );

    const previewRows = rowSampleValues.map((rowValues, rowIndex) => {
      const metricGroups = columnCombos.map((combo, comboIndex) =>
        metricLabels.map((_, metricIndex) => {
          const seed = (rowIndex + 1) * 17 + comboIndex * 13 + metricIndex * 7;
          return ((seed % 9) + 1) * 10;
        })
      );
      return {
        rowValues,
        metricGroups
      };
    });

    return {
      rowDims,
      metricLabels,
      columnCombos,
      hasColumnGroups,
      previewRows
    };
  }, [pivotConfig.rows, pivotConfig.columns, pivotConfig.values]);

  const cardSx = {
    borderRadius: 3,
    border: '1px solid var(--dq-border-subtle)',
    backgroundColor: 'var(--dq-surface)',
    p: 3,
    boxShadow: 'var(--dq-shadow-soft)',
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  };

  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 3, xl: 4 },
          gridTemplateColumns: {
            xs: '1fr',
            xl: 'repeat(3, minmax(0, 1fr))'
          }
        }}
      >
        <Box sx={cardSx}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              选择透视布局
            </Typography>
            <Button
              size="small"
              startIcon={<RotateCcw size={14} />}
              onClick={handleReset}
              disabled={disabled}
              sx={{ borderRadius: 2 }}
            >
              重置透视
            </Button>
          </Box>
          <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)' }}>
            先挑选需要展开的行、列，再选择要统计的指标。行与列字段越少，结果越易读。
          </Typography>

          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth disabled={disabled}>
              <InputLabel>行字段（左侧）</InputLabel>
              <Select
                multiple
                label="行字段（左侧）"
                value={pivotConfig.rows}
                onChange={handleMultiSelectChange('rows')}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((name) => (
                      <Chip key={name} label={name} size="small" />
                    ))}
                  </Box>
                )}
              >
                {normalizedColumns.map((col) => (
                  <MenuItem key={col.value} value={col.value}>
                    {col.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={disabled}>
              <InputLabel>列字段（顶部）</InputLabel>
              <Select
                multiple
                label="列字段（顶部）"
                value={pivotConfig.columns}
                onChange={handleColumnsChange}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((name) => (
                      <Chip key={name} label={name} size="small" />
                    ))}
                  </Box>
                )}
              >
                {normalizedColumns.map((col) => (
                  <MenuItem key={col.value} value={col.value}>
                    {col.label}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: 'var(--dq-text-tertiary)' }}>
                原生透视仅支持 1 个列字段
              </Typography>
            </FormControl>
          </Stack>
        </Box>

        <Box sx={cardSx}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                指标与汇总方式
              </Typography>
              <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)' }}>
                每条指标都会生成一列，可为不同指标设置不同的聚合方式与别名。
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Plus size={14} />}
              onClick={addValue}
              disabled={disabled}
            >
              添加指标
            </Button>
          </Box>

          <Stack spacing={2}>
            {pivotConfig.values.map((valueConfig, index) => (
              <Box
                key={`pivot-value-${index}`}
                sx={{
                  borderRadius: 2,
                  border: '1px dashed var(--dq-border-control)',
                  p: 2,
                  backgroundColor: 'var(--dq-surface-control)'
                }}
              >
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                  <Box sx={{ minWidth: 200, flex: 1 }}>
                    <ColumnSelect
                      columns={normalizedColumns}
                      value={valueConfig.column}
                      onChange={(columnName) => handleValueChange(index, 'column', columnName)}
                      label="数据列"
                      disabled={disabled}
                    />
                  </Box>

                  <FormControl fullWidth disabled={disabled || !valueConfig.column}>
                    <InputLabel>汇总方式</InputLabel>
                    <Select
                      label="汇总方式"
                      value={valueConfig.aggregation}
                      onChange={(event) => handleValueChange(index, 'aggregation', event.target.value)}
                    >
                      {PIVOT_AGGREGATIONS.map((func) => (
                        <MenuItem key={func} value={func}>
                          {func === AggregationFunction.COUNT_DISTINCT ? 'COUNT DISTINCT' : func}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl fullWidth disabled={disabled || !valueConfig.column}>
                    <InputLabel>转换类型</InputLabel>
                    <Select
                      label="转换类型"
                      value={valueConfig.typeConversion || 'auto'}
                      onChange={(event) => handleValueChange(index, 'typeConversion', event.target.value)}
                    >
                      <MenuItem value="auto">自动</MenuItem>
                      <MenuItem value="decimal">DECIMAL</MenuItem>
                      <MenuItem value="double">DOUBLE</MenuItem>
                      <MenuItem value="integer">INTEGER</MenuItem>
                      <MenuItem value="bigint">BIGINT</MenuItem>
                      <MenuItem value="smallint">SMALLINT</MenuItem>
                      <MenuItem value="tinyint">TINYINT</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    fullWidth
                    label="展示别名"
                    value={valueConfig.alias || ''}
                    onChange={(event) => handleValueChange(index, 'alias', event.target.value)}
                    placeholder="例：销售额"
                    disabled={disabled}
                  />

                  <Button
                    variant="text"
                    color="error"
                    onClick={() => removeValue(index)}
                    disabled={disabled || pivotConfig.values.length === 1}
                    startIcon={<Trash2 size={16} />}
                  >
                    移除
                  </Button>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>

        <Box sx={cardSx}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              结果展示选项
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)' }}>
              设置缺失值填充、列值顺序和 Top-N 限制，让透视表结构更清晰。
            </Typography>
          </Box>

          <Stack spacing={2}>
            <TextField
              label="缺失值填充"
              placeholder="例如：0 或 -"
              value={localFillValue}
              onChange={(event) => {
                const value = event.target.value;
                setLocalFillValue(value);
                scheduleConfigUpdate('fillValue', { fillValue: value });
              }}
              disabled={disabled}
              fullWidth
              helperText="当某些行列组合没有数据时显示的默认值"
              FormHelperTextProps={{ sx: { color: 'var(--dq-text-tertiary)' } }}
              InputProps={{
                sx: {
                  borderRadius: 2,
                  backgroundColor: 'var(--dq-surface-control)',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--dq-border-control)'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--dq-accent-primary)'
                  }
                }
              }}
            />

            <TextField
              label="列值顺序（可选）"
              placeholder="使用逗号分隔，例如：2022, 2023, 2024"
              value={localManualColumnValues}
              onChange={(event) => {
                const value = event.target.value;
                setLocalManualColumnValues(value);
                scheduleConfigUpdate('manualColumnValues', {
                  manualColumnValues: value
                    .split(/[,，\n]+/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                });
              }}
              disabled={disabled}
              fullWidth
              multiline
              minRows={2}
              helperText={
                <Box display="flex" alignItems="center" gap={0.5} sx={{ color: 'var(--dq-text-tertiary)' }}>
                  <HelpCircle size={14} />
                  指定列维度的值出现顺序（如按年份排序），未填则自动推断。
                </Box>
              }
              InputProps={{
                sx: {
                  borderRadius: 2,
                  backgroundColor: 'var(--dq-surface-control)',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--dq-border-control)'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--dq-accent-primary)'
                  }
                }
              }}
            />

            <TextField
              label="列数量上限（Top-N）"
              type="number"
              value={localColumnValueLimit}
              onChange={(event) => {
                const raw = event.target.value;
                setLocalColumnValueLimit(raw);

                if (raw === '') {
                  scheduleConfigUpdate('columnValueLimit', { columnValueLimit: '' });
                  return;
                }
                const num = Number(raw);
                scheduleConfigUpdate('columnValueLimit', {
                  columnValueLimit: Number.isFinite(num) && num > 0 ? num : '',
                });
              }}
              disabled={disabled}
              fullWidth
              helperText={
                <Box display="flex" alignItems="center" gap={0.5} sx={{ color: 'var(--dq-text-tertiary)' }}>
                  <HelpCircle size={14} />
                  建议 10~12，避免列爆炸；未填则需提供“列值顺序”
                </Box>
              }
              InputProps={{
                sx: {
                  borderRadius: 2,
                  backgroundColor: 'var(--dq-surface-control)',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--dq-border-control)'
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'var(--dq-accent-primary)'
                  }
                }
              }}
            />
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" fontWeight={600}>
              透视结构预览
            </Typography>
            <Typography variant="caption" color="text.secondary">
              以下示例基于当前配置生成，便于快速核对行列与指标布局。
            </Typography>
            <TableContainer
              component={Paper}
              sx={{
                mt: 1.5,
                borderRadius: 2,
                border: '1px solid var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface-control)'
              }}
            >
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {pivotPreview.rowDims.map((dim) => (
                      <TableCell
                        key={`head-row-${dim}`}
                        rowSpan={pivotPreview.hasColumnGroups ? 2 : 1}
                        sx={{ fontWeight: 600 }}
                      >
                        {dim}
                      </TableCell>
                    ))}
                    {pivotPreview.hasColumnGroups ? (
                      pivotPreview.columnCombos.map((combo, comboIndex) => (
                        <TableCell
                          key={`combo-head-${comboIndex}`}
                          align="center"
                          colSpan={pivotPreview.metricLabels.length}
                          sx={{ fontWeight: 600 }}
                        >
                          {combo.length > 0 ? combo.join(' / ') : '指标'}
                        </TableCell>
                      ))
                    ) : (
                      pivotPreview.metricLabels.map((label, labelIndex) => (
                        <TableCell key={`metric-head-${labelIndex}`} align="center" sx={{ fontWeight: 600 }}>
                          {label}
                        </TableCell>
                      ))
                    )}
                  </TableRow>
                  {pivotPreview.hasColumnGroups && (
                    <TableRow>
                      {pivotPreview.columnCombos.map((combo, comboIndex) =>
                        pivotPreview.metricLabels.map((label, labelIndex) => (
                          <TableCell
                            key={`combo-subhead-${comboIndex}-${labelIndex}`}
                            align="center"
                            sx={{ fontWeight: 500 }}
                          >
                            {label}
                          </TableCell>
                        ))
                      )}
                    </TableRow>
                  )}
                </TableHead>
                <TableBody>
                  {pivotPreview.previewRows.map((row, rowIndex) => (
                    <TableRow key={`preview-row-${rowIndex}`}>
                      {row.rowValues.map((value, valueIndex) => (
                        <TableCell
                          key={`preview-row-cell-${rowIndex}-${valueIndex}`}
                          sx={{ fontWeight: valueIndex === 0 ? 500 : 400 }}
                        >
                          {value}
                        </TableCell>
                      ))}
                      {pivotPreview.hasColumnGroups
                        ? row.metricGroups.map((group, groupIndex) =>
                            group.map((metricValue, metricIndex) => (
                              <TableCell key={`preview-metric-${rowIndex}-${groupIndex}-${metricIndex}`} align="center">
                                {metricValue}
                              </TableCell>
                            ))
                          )
                        : row.metricGroups[0].map((metricValue, metricIndex) => (
                            <TableCell key={`preview-metric-${rowIndex}-0-${metricIndex}`} align="center">
                              {metricValue}
                            </TableCell>
                          ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {pivotConfig.columns && pivotConfig.columns.length === 1 && (
            <Button
              variant="outlined"
              startIcon={<Eye size={16} />}
              onClick={() => setPreviewDialogOpen(true)}
              disabled={disabled || !selectedTable}
              sx={{ mt: 2 }}
            >
              预览采样值
            </Button>
          )}

          <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)', mt: 1.5 }}>
            策略：当前仅支持数据库原生透视，建议结合列值顺序或 Top-N 设置使用。
          </Typography>
        </Box>
      </Box>

      {/* 采样预览弹窗 */}
      <Dialog open={previewDialogOpen} onClose={() => setPreviewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>预览采样值</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            {/* 排序方式 */}
            <FormControl fullWidth>
              <InputLabel>排序方式</InputLabel>
              <Select
                value={previewOrderBy}
                onChange={(e) => setPreviewOrderBy(e.target.value)}
                label="排序方式"
              >
                <MenuItem value="frequency">按频次排序</MenuItem>
                <MenuItem value="metric">按指标排序</MenuItem>
              </Select>
            </FormControl>

            {/* 指标配置（当选择按指标排序时） */}
            {previewOrderBy === 'metric' && (
              <Box display="flex" gap={2}>
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel>聚合函数</InputLabel>
                  <Select
                    value={previewMetric.agg}
                    onChange={(e) => setPreviewMetric({ ...previewMetric, agg: e.target.value })}
                    label="聚合函数"
                  >
                    <MenuItem value="SUM">SUM</MenuItem>
                    <MenuItem value="COUNT">COUNT</MenuItem>
                    <MenuItem value="AVG">AVG</MenuItem>
                    <MenuItem value="MIN">MIN</MenuItem>
                    <MenuItem value="MAX">MAX</MenuItem>
                  </Select>
                </FormControl>
                <FormControl sx={{ flex: 1 }}>
                  <InputLabel>指标列</InputLabel>
                  <Select
                    value={previewMetric.column}
                    onChange={(e) => setPreviewMetric({ ...previewMetric, column: e.target.value })}
                    label="指标列"
                  >
                    {normalizedColumns.map((col) => (
                      <MenuItem key={col.value} value={col.value}>
                        {col.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}

            {/* 数量限制 */}
            <TextField
              label="Top-N 数量"
              type="number"
              value={previewLimit}
              onChange={(e) => setPreviewLimit(Number(e.target.value) || 12)}
              inputProps={{ min: 1, max: 50 }}
            />

            {/* 预览按钮 */}
            <Button
              variant="contained"
              onClick={handlePreviewValues}
              disabled={previewLoading || (previewOrderBy === 'metric' && !previewMetric.column)}
              fullWidth
            >
              {previewLoading ? '获取中...' : '获取采样值'}
            </Button>

            {/* 结果展示 */}
            {previewValues.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  采样结果 ({previewValues.length} 个值)
                  {previewStats.distinct_count && (
                    <Typography component="span" variant="caption" sx={{ ml: 1, color: 'var(--dq-text-tertiary)' }}>
                      (共 {previewStats.distinct_count} 个不同值)
                    </Typography>
                  )}
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
                  {previewValues.map((value, index) => (
                    <Chip key={index} label={value} size="small" />
                  ))}
                </Box>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleUsePreviewValues}
            variant="contained"
            disabled={previewValues.length === 0}
          >
            使用这些值
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PivotConfigurator;
