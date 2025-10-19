import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Eye, HelpCircle, Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDistinctValues } from '../../services/apiClient';
import { AggregationFunction, PivotValueAxis } from '../../utils/visualQueryUtils';

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

  const normalizedColumns = useMemo(
    () =>
      (columns || [])
        .map((col) => {
          const label = toColumnLabel(col);
          return label ? { label, value: label } : null;
        })
        .filter(Boolean),
    [columns],
  );

  // 防抖处理函数
  const debounceRef = useRef({});

  const debouncedUpdate = useCallback((updates, delay = 300) => {
    const key = JSON.stringify(updates);

    // 清除之前的定时器
    if (debounceRef.current[key]) {
      clearTimeout(debounceRef.current[key]);
    }

    // 设置新的定时器
    debounceRef.current[key] = setTimeout(() => {
      if (onChange) {
        onChange({
          ...pivotConfig,
          ...updates,
        });
      }
      delete debounceRef.current[key];
    }, delay);
  }, [onChange, pivotConfig]);

  const handleUpdate = useCallback((updates) => {
    if (onChange) {
      onChange({
        ...pivotConfig,
        ...updates,
      });
    }
  }, [onChange, pivotConfig]);

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

  const handleToggle = (key) => (event) => {
    handleUpdate({ [key]: event.target.checked });
  };

  const handleAxisChange = (_event, newAxis) => {
    if (newAxis) {
      handleUpdate({ valueAxis: newAxis });
    }
  };

  const manualColumnValuesText = (pivotConfig.manualColumnValues || []).join(', ');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: 3,
        boxShadow: 1
      }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          选择透视布局
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          先挑选需要展开的行、列，再选择要统计的指标。行与列字段越少，结果越易读。
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} mt={2}>
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
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              原生透视仅支持 1 个列字段
            </Typography>
          </FormControl>
        </Stack>
      </Box>

      <Box sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: 3,
        boxShadow: 1
      }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          指标与汇总方式
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          每条指标都会生成一列，可为不同指标设置不同的聚合方式与别名。
        </Typography>

        <Stack direction="row" justifyContent="flex-end" mb={2}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Plus size={14} />}
            onClick={addValue}
            disabled={disabled}
          >
            添加指标
          </Button>
        </Stack>

        <Stack spacing={3}>
          {pivotConfig.values.map((valueConfig, index) => (
            <Box
              key={`pivot-value-${index}`}
              sx={{
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'divider',
                p: 3
              }}
            >
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="center">
                <FormControl fullWidth disabled={disabled}>
                  <InputLabel>数据列</InputLabel>
                  <Select
                    label="数据列"
                    value={valueConfig.column}
                    onChange={(event) => handleValueChange(index, 'column', event.target.value)}
                  >
                    {normalizedColumns.map((col) => (
                      <MenuItem key={col.value} value={col.value}>
                        {col.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

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

      <Box sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: 3,
        boxShadow: 1
      }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          结果展示选项
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          配置透视表的显示方式和数据填充选项，让结果更易读。
        </Typography>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} mt={2}>
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(pivotConfig.includeSubtotals)}
                onChange={handleToggle('includeSubtotals')}
                disabled={disabled}
              />
            }
            label={<Box display="flex" alignItems="center" gap={0.5}>显示分类小计
              <HelpCircle size={14} title="在每个分类分组下方显示一行小计，快速查看该组汇总。" />
            </Box>}
          />

          <FormControlLabel
            control={
              <Switch
                checked={Boolean(pivotConfig.includeGrandTotals)}
                onChange={handleToggle('includeGrandTotals')}
                disabled={disabled}
              />
            }
            label={<Box display="flex" alignItems="center" gap={0.5}>显示总计
              <HelpCircle size={14} title="在结果的末尾追加总计行/列，展示整体汇总。" />
            </Box>}
          />
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} mt={2} alignItems="center">
          <Box>
            <Typography variant="body2" color="text.secondary">
              指标标签位置 <HelpCircle size={14} title="多个指标时，选择是在列方向展开还是在行方向展开。" />
            </Typography>
            <ToggleButtonGroup
              value={pivotConfig.valueAxis || PivotValueAxis.COLUMNS}
              exclusive
              onChange={handleAxisChange}
              size="small"
              disabled={disabled}
              sx={{ mt: 1 }}
            >
              <ToggleButton value={PivotValueAxis.COLUMNS}>与列标题并列</ToggleButton>
              <ToggleButton value={PivotValueAxis.ROWS}>与行标题并列</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <TextField
            label="缺失值填充"
            placeholder="例如：0 或 -"
            value={localFillValue}
            onChange={(event) => {
              const value = event.target.value;
              setLocalFillValue(value);
              debouncedUpdate({ fillValue: value });
            }}
            disabled={disabled}
            fullWidth
            helperText="当某些行列组合没有数据时显示的默认值"
          />
        </Stack>

        <TextField
          label="列值顺序（可选）"
          placeholder="使用逗号分隔，例如：2022, 2023, 2024"
          value={localManualColumnValues}
          onChange={(event) => {
            const value = event.target.value;
            setLocalManualColumnValues(value);
            debouncedUpdate({
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
          sx={{ mt: 3 }}
          helperText={
            <Box display="flex" alignItems="center" gap={0.5}>
              <HelpCircle size={14} />
              指定列维度的值出现顺序（如按年份排序），未填则自动推断。
            </Box>
          }
        />

        {/* 列数量上限（Top-N 自动采样） */}
        <TextField
          label="列数量上限（Top-N）"
          type="number"
          value={localColumnValueLimit}
          onChange={(event) => {
            const raw = event.target.value;
            setLocalColumnValueLimit(raw);

            if (raw === '') {
              debouncedUpdate({ columnValueLimit: '' });
              return;
            }
            const num = Number(raw);
            debouncedUpdate({ columnValueLimit: Number.isFinite(num) && num > 0 ? num : '' });
          }}
          disabled={disabled}
          fullWidth
          sx={{ mt: 2 }}
          helperText={
            <Box display="flex" alignItems="center" gap={0.5}>
              <HelpCircle size={14} />
              建议 10~12，避免列爆炸；未填则需提供"列值顺序"
            </Box>
          }
        />

        {/* 采样预览按钮 */}
        {pivotConfig.columns && pivotConfig.columns.length === 1 && (
          <Button
            variant="outlined"
            startIcon={<Eye size={16} />}
            onClick={() => setPreviewDialogOpen(true)}
            disabled={disabled || !selectedTable}
            fullWidth
            sx={{ mt: 2 }}
          >
            预览采样值
          </Button>
        )}

        {/* 策略切换（仅保留原生PIVOT） */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            策略 <HelpCircle size={14} title="使用数据库原生透视功能，性能更好但需要明确指定列值" />
          </Typography>
          <ToggleButtonGroup
            value="native"
            exclusive
            size="small"
            disabled={true}
            sx={{ mt: 1 }}
          >
            <ToggleButton value="native">NATIVE</ToggleButton>
          </ToggleButtonGroup>
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
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
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
    </Box>
  );
};

export default PivotConfigurator;
