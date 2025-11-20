/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { ChevronDown, ChevronUp, Copy, Info, Plus, Trash2 } from 'lucide-react';
import { getColumnStatistics } from '../../../services/apiClient';

const DATA_TYPE_OPTIONS = ['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'TIMESTAMP'];

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `json_quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const quoteJsonKey = (key) => {
  if (!key) return '';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return `.${key}`;
  }
  return `."${String(key).replace(/"/g, '\\"')}"`;
};

const inferDuckType = (value) => {
  if (value === null || value === undefined) return 'VARCHAR';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return 'INTEGER';
    return 'DOUBLE';
  }
  if (typeof value === 'boolean') return 'BOOLEAN';
  return 'VARCHAR';
};

const tryParseSample = (samples) => {
  if (!Array.isArray(samples)) return null;
  for (const raw of samples) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === 'object') {
      return raw;
    }
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        // 尝试宽松解析：处理单引号/True/False
        try {
          const normalized = raw
            .replace(/'/g, '"')
            .replace(/\bTrue\b/g, 'true')
            .replace(/\bFalse\b/g, 'false')
            .replace(/\bNone\b/g, 'null');
          return JSON.parse(normalized);
        } catch (err) {
          continue;
        }
      }
    }
  }
  return null;
};

const guessRowPath = (parsed, columnName) => {
  if (!parsed || typeof parsed !== 'object') {
    return '$';
  }
  if (Array.isArray(parsed)) {
    return '$[*]';
  }
  const arrayEntry = Object.entries(parsed).find(([, value]) => Array.isArray(value));
  if (arrayEntry) {
    const [key] = arrayEntry;
    return `$${quoteJsonKey(key)}[*]`;
  }
  if (columnName) {
    return `$${quoteJsonKey(columnName)}`;
  }
  return '$';
};

const getRowSampleByPath = (parsed, rowPath) => {
  if (!parsed) return null;
  if (!rowPath || rowPath === '$') {
    return parsed;
  }
  if (rowPath === '$[*]') {
    return Array.isArray(parsed) ? parsed[0] : null;
  }
  const match = rowPath.match(/^\$\.(.*)\[\*\]$/);
  if (match) {
    const keyPath = match[1];
    const segments = keyPath
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .map((seg) => seg.replace(/^"+|"+$/g, ''))
      .filter(Boolean);
    let cursor = parsed;
    for (const segment of segments) {
      if (!cursor) break;
      cursor = cursor[segment];
    }
    if (Array.isArray(cursor)) {
      return cursor[0];
    }
    return cursor || null;
  }
  return parsed;
};

const buildFieldSuggestions = (sample) => {
  if (!sample) return [];
  const source =
    Array.isArray(sample) && sample.length > 0 ? sample[0] : sample;

  if (!source || typeof source !== 'object') return [];

  return Object.entries(source).map(([key, value]) => ({
    id: createId(),
    name: key,
    jsonPath: `$${quoteJsonKey(key)}`,
    dataType: inferDuckType(value),
    defaultValue: '',
    enabled: true,
    ordinal: false,
  }));
};

const buildDefaultFields = (existingColumns, suggestions) => {
  if (Array.isArray(existingColumns) && existingColumns.length > 0) {
    return existingColumns.map((column) => ({
      id: column.id || createId(),
      name: column.name || '',
      jsonPath: column.path || '$',
      dataType: column.dataType || 'VARCHAR',
      defaultValue: column.defaultValue || '',
      ordinal: Boolean(column.ordinal),
      enabled: true,
    }));
  }
  if (suggestions.length > 0) {
    return suggestions;
  }
  return [
    {
      id: createId(),
      name: '',
      jsonPath: '$',
      dataType: 'VARCHAR',
      defaultValue: '',
      ordinal: false,
      enabled: true,
    },
  ];
};

const JsonQuickConfiguratorDialog = ({ open, column, tableName, onClose, onSave, onRemove }) => {
  const [fetchedSamples, setFetchedSamples] = useState([]);
  const [fetchingSample, setFetchingSample] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [showFullSample, setShowFullSample] = useState(false);
  const [isRowPathUserSet, setIsRowPathUserSet] = useState(false);
  const baseSamples = useMemo(() => column?.sampleValues || [], [column]);
  const sampleValues = useMemo(
    () => (fetchedSamples.length > 0 ? fetchedSamples : baseSamples),
    [baseSamples, fetchedSamples],
  );

  const samplesAvailable = useMemo(
    () => Array.isArray(sampleValues) && sampleValues.length > 0,
    [sampleValues],
  );

  const parsedSample = useMemo(() => tryParseSample(sampleValues), [sampleValues]);
  const defaultRowPath = useMemo(
    () => guessRowPath(parsedSample, column?.name || column?.metadata?.name),
    [parsedSample, column?.name, column?.metadata?.name],
  );
  const [rowPath, setRowPath] = useState(defaultRowPath);
  const rowSample = useMemo(
    () => getRowSampleByPath(parsedSample, rowPath),
    [parsedSample, rowPath],
  );
  const suggestions = useMemo(
    () => buildFieldSuggestions(rowSample),
    [rowSample],
  );

  const [alias, setAlias] = useState('');
  const [joinType, setJoinType] = useState('left');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fields, setFields] = useState(suggestions);

  const rowPathPresets = useMemo(() => {
    const presets = [
      { label: '根对象', value: '$' },
      { label: '根数组元素', value: '$[*]' },
    ];
    if (parsedSample && typeof parsedSample === 'object' && !Array.isArray(parsedSample)) {
      const arrayEntry = Object.entries(parsedSample).find(([, value]) => Array.isArray(value));
      if (arrayEntry) {
        presets.unshift({
          label: `${arrayEntry[0]} 数组`,
          value: `$${quoteJsonKey(arrayEntry[0])}[*]`,
        });
      }
    }
    return presets;
  }, [parsedSample]);

  const structureHint = useMemo(() => {
    if (!parsedSample) return '未检测到示例，路径默认使用根节点 $';
    if (Array.isArray(parsedSample)) return '检测到顶层数组，建议使用 $[*] 作为行路径';
    if (typeof parsedSample === 'object') return '检测到对象，可直接使用 $ 或选择其中的数组键';
    return '示例为标量值，可直接使用 $ 提取';
  }, [parsedSample]);

  const handleRowPathChange = (value, { isUser = false, rebuild = false } = {}) => {
    setRowPath(value);
    if (isUser) {
      setIsRowPathUserSet(true);
    }
    if (rebuild) {
      setFields(buildFieldSuggestions(getRowSampleByPath(parsedSample, value)));
    }
  };

  const samplePreviewInfo = useMemo(() => {
    if (!rowSample && !samplesAvailable) {
      return { text: '', isJson: false, parseError: '', raw: '' };
    }
    const rawInput =
      rowSample && typeof rowSample === 'object'
        ? rowSample
        : samplesAvailable
          ? sampleValues[0]
          : '';
    if (typeof rawInput === 'object' && rawInput !== null) {
      try {
        return {
          text: JSON.stringify(rawInput, null, 2),
          isJson: true,
          parseError: '',
          raw: JSON.stringify(rawInput),
        };
      } catch (error) {
        return { text: String(rawInput), isJson: false, parseError: error?.message, raw: String(rawInput) };
      }
    }
    if (typeof rawInput === 'string') {
      try {
        const parsed = JSON.parse(rawInput);
        return {
          text: JSON.stringify(parsed, null, 2),
          isJson: true,
          parseError: '',
          raw: rawInput,
        };
      } catch (error) {
        try {
          const normalized = rawInput
            .replace(/'/g, '"')
            .replace(/\bTrue\b/g, 'true')
            .replace(/\bFalse\b/g, 'false')
            .replace(/\bNone\b/g, 'null');
          const parsed = JSON.parse(normalized);
          return {
            text: JSON.stringify(parsed, null, 2),
            isJson: true,
            parseError: '示例经过兼容处理后解析为 JSON',
            raw: rawInput,
          };
        } catch (err) {
          return { text: rawInput, isJson: false, parseError: '示例不是合法 JSON，按文本展示', raw: rawInput };
        }
      }
    }
    return { text: String(rawInput), isJson: false, parseError: '', raw: String(rawInput) };
  }, [rowSample, samplesAvailable, sampleValues]);

  const truncatedSample = useMemo(() => {
    const MAX_CHARS = 1200;
    if (!samplePreviewInfo.text) return '';
    if (showFullSample || samplePreviewInfo.text.length <= MAX_CHARS) {
      return samplePreviewInfo.text;
    }
    return `${samplePreviewInfo.text.slice(0, MAX_CHARS)}\n...（已截断，点击展开查看全部）`;
  }, [samplePreviewInfo.text, showFullSample]);

  const handleFetchSample = async () => {
    if (!tableName || !column?.name) return;
    setShowFullSample(false);
    setFetchingSample(true);
    setFetchError('');
    try {
      const resp = await getColumnStatistics(tableName, column.name);
      const samples = resp?.statistics?.sample_values || [];
      if (samples.length === 0) {
        setFetchError('未能获取样例数据，请稍后重试或先运行一次查询。');
      }
      setFetchedSamples(samples);
    } catch (error) {
      setFetchError(error?.message || '获取示例失败');
    } finally {
      setFetchingSample(false);
    }
  };

  useEffect(() => {
    if (open && (!sampleValues || sampleValues.length === 0) && tableName && column?.name) {
      handleFetchSample();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tableName, column?.name]);

  useEffect(() => {
    if (!open) return;
    setFetchedSamples([]);
    setFetchError('');
    setFetchingSample(false);
    setShowFullSample(false);
    setIsRowPathUserSet(false);
  }, [open, column]);

  useEffect(() => {
    if (!open || !column) return;
    const existing = Array.isArray(column?.existingMappings) ? column.existingMappings[0] : null;
    const defaultAlias =
      existing?.alias ||
      `${column.name || column?.metadata?.name || column?.metadata?.column_name || 'json'}_items`;
    setAlias(defaultAlias);
    const resolvedRootPath = existing?.rootPath || defaultRowPath || '$';
    if (!isRowPathUserSet) {
      setRowPath(resolvedRootPath);
    }
    setJoinType(existing?.joinType || 'left');
    setFields(buildDefaultFields(existing?.columns, buildFieldSuggestions(rowSample)));
    if (!isRowPathUserSet) {
      setIsRowPathUserSet(Boolean(existing?.rootPath));
    }
  }, [open, column, defaultRowPath, isRowPathUserSet, rowSample]);

  const handleFieldChange = (fieldId, patch) => {
    setFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    );
  };

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: createId(),
        name: '',
        jsonPath: '$',
        dataType: 'VARCHAR',
        defaultValue: '',
        ordinal: false,
        enabled: true,
      },
    ]);
  };

  const handleRemoveField = (fieldId) => {
    setFields((prev) => prev.filter((field) => field.id !== fieldId));
  };

  const handleSave = () => {
    const enabledFields = fields.filter((field) => field.enabled && field.name);
    if (!column?.name || enabledFields.length === 0) {
      onClose?.();
      return;
    }
    const entry = column?.existingMappings?.[0] || {};
    const payload = {
      id: entry.id || createId(),
      sourceColumn: column.name,
      alias: alias || `${column.name}_json`,
      rootPath: rowPath || '$',
      joinType,
      columns: enabledFields.map((field) => ({
        id: field.id || createId(),
        name: field.name,
        path: field.jsonPath || '$',
        dataType: field.dataType || 'VARCHAR',
        defaultValue: field.defaultValue || '',
        ordinal: Boolean(field.ordinal),
      })),
    };
    onSave?.(payload);
  };

  const toggleSuggestion = (fieldId) => {
    setFields((prev) =>
      prev.map((field) =>
        field.id === fieldId ? { ...field, enabled: !field.enabled } : field,
      ),
    );
  };

  const handleCopySample = async () => {
    try {
      const text = samplePreviewInfo.raw || samplePreviewInfo.text || '';
      if (text) {
        await navigator.clipboard.writeText(text);
      }
    } catch (error) {
      // ignore copy failures
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>JSON 展开</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
            选择 JSON 字段并配置路径，系统会自动生成 `JSON_TABLE` 查询。
          </Typography>

          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: 2,
              border: '1px solid var(--dq-border-subtle)',
              borderRadius: 'var(--dq-radius-card)',
              backgroundColor: 'var(--dq-surface)',
            }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  示例 JSON
                </Typography>
                {fetchingSample && (
                  <Typography variant="caption" color="text.secondary">
                    获取中…
                  </Typography>
                )}
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={handleCopySample} startIcon={<Copy size={14} />}>
                  复制
                </Button>
                <Button size="small" variant="text" onClick={handleFetchSample}>
                  重新获取
                </Button>
              </Stack>
            </Stack>

            {truncatedSample ? (
              <Box
                component="pre"
                sx={{
                  p: 1.5,
                  borderRadius: 'var(--dq-radius-card)',
                  backgroundColor: 'color-mix(in oklab, var(--dq-surface-card) 92%, var(--dq-accent-primary) 8%)',
                  maxHeight: 260,
                  minHeight: 120,
                  overflow: 'auto',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  border: '1px solid var(--dq-border-subtle)',
                }}
              >
                {truncatedSample}
              </Box>
            ) : (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 'var(--dq-radius-card)',
                  border: '1px dashed var(--dq-border-subtle)',
                  color: 'var(--dq-text-tertiary)',
                  fontSize: '0.9rem',
                }}
              >
                {fetchingSample ? '正在获取示例…' : '暂无示例数据，可点击重新获取或先运行一次查询。'}
              </Box>
            )}
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
              {samplePreviewInfo.text && samplePreviewInfo.text.length > 1200 && (
                <Button
                  size="small"
                  variant="text"
                  onClick={() => setShowFullSample((prev) => !prev)}
                  sx={{ textTransform: 'none' }}
                >
                  {showFullSample ? '收起示例' : '展开全部'}
                </Button>
              )}
              {samplePreviewInfo.parseError && (
                <Typography variant="caption" color="error">
                  {samplePreviewInfo.parseError}
                </Typography>
              )}
              {fetchError && (
                <Typography variant="caption" color="error">
                  {fetchError}
                </Typography>
              )}
            </Stack>
          </Box>

          <Box
            sx={{
              p: 1.5,
              border: '1px solid var(--dq-border-subtle)',
              borderRadius: 'var(--dq-radius-card)',
              backgroundColor: 'var(--dq-surface-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              结构与行路径
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
              {structureHint}
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {rowPathPresets.map((preset) => (
                <Button
                  key={preset.value}
                  variant={rowPath === preset.value ? 'contained' : 'outlined'}
                  size="small"
                  onClick={() => setRowPath(preset.value)}
                  sx={{ textTransform: 'none' }}
                >
                  {preset.label} {preset.value}
                </Button>
              ))}
            </Stack>
            <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>
              当前行路径: {rowPath || '$'}
            </Typography>
            {samplesAvailable && (
              <Button
                size="small"
                variant="text"
                startIcon={<Plus size={14} />}
                onClick={() => setFields(buildFieldSuggestions(rowSample))}
                sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
              >
                基于示例重建字段
              </Button>
            )}
          </Box>

          <TextField
            label="目标列别名"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            helperText="用于引用展开结果的表别名"
            fullWidth
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              label="行路径 (Row Path)"
              value={rowPath}
              onChange={(event) => handleRowPathChange(event.target.value, { isUser: true })}
              fullWidth
              helperText="默认使用检测到的数组路径，可自行调整"
            />
            <Stack spacing={0.5}>
              {rowPathPresets.map((preset) => (
                <Button
                  key={preset.value}
                  variant="outlined"
                  size="small"
                  onClick={() => handleRowPathChange(preset.value, { isUser: true, rebuild: true })}
                  sx={{ textTransform: 'none' }}
                >
                  {preset.value}
                </Button>
              ))}
            </Stack>
          </Stack>

          {samplesAvailable ? (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                推荐字段
              </Typography>
              {fields.map((field) => (
                <Stack
                  key={field.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems="flex-end"
                  sx={{ mb: 1, borderBottom: '1px solid var(--dq-border-subtle)', pb: 1 }}
                >
                  <TextField
                    label="列别名"
                    value={field.name}
                    onChange={(event) => handleFieldChange(field.id, { name: event.target.value })}
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <FormControlLabel
                            control={
                              <Switch
                                checked={field.enabled}
                                onChange={() => toggleSuggestion(field.id)}
                                size="small"
                              />
                            }
                            label="启用"
                          />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    label="JSON 路径"
                    value={field.jsonPath}
                    onChange={(event) =>
                      handleFieldChange(field.id, { jsonPath: event.target.value })
                    }
                    fullWidth
                  />
                  <Select
                    label="数据类型"
                    value={field.dataType}
                    onChange={(event) =>
                      handleFieldChange(field.id, { dataType: event.target.value })
                    }
                    fullWidth
                  >
                    {DATA_TYPE_OPTIONS.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </Select>
                  <Tooltip title="移除字段">
                    <span>
                      <IconButton onClick={() => handleRemoveField(field.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              ))}
              <Button
                variant="text"
                startIcon={<Plus size={16} />}
                sx={{ textTransform: 'none' }}
                onClick={handleAddField}
              >
                添加字段
              </Button>
            </Box>
          ) : (
            <Box
              sx={{
                border: '1px dashed var(--dq-border-subtle)',
                borderRadius: 2,
                p: 2,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                暂未获取到示例值，可手动添加字段。建议先运行一次查询以获取样本数据。
              </Typography>
              <Button
                variant="outlined"
                size="small"
                sx={{ mt: 1, textTransform: 'none' }}
                startIcon={<Plus size={16} />}
                onClick={handleAddField}
              >
                添加字段
              </Button>
            </Box>
          )}

          <Button
            size="small"
            variant="text"
            startIcon={showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            onClick={() => setShowAdvanced((prev) => !prev)}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            {showAdvanced ? '收起高级设置' : '展开高级设置'}
          </Button>

          <Collapse in={showAdvanced}>
            <Stack spacing={2} sx={{ border: '1px solid var(--dq-border-subtle)', borderRadius: 2, p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                高级设置
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="JOIN 类型"
                  select
                  value={joinType}
                  onChange={(event) => setJoinType(event.target.value)}
                  fullWidth
                >
                  <MenuItem value="left">LEFT JOIN (保留主表记录)</MenuItem>
                  <MenuItem value="inner">INNER JOIN (仅匹配 JSON 行)</MenuItem>
                </TextField>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={fields.some((field) => field.ordinal)}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          setFields((prev) =>
                            prev.map((field, index) =>
                              index === 0 ? { ...field, ordinal: enabled } : field,
                            ),
                          );
                        }}
                      />
                    }
                    label="生成序号列"
                  />
                  <Tooltip title="开启后将输出 JSON 数组的行号，便于排序">
                    <Info size={16} />
                  </Tooltip>
                </Box>
              </Stack>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary">
                  行路径和 JOIN 类型会影响最终 SQL，可在高级设置中微调。
                </Typography>
              </Box>
            </Stack>
          </Collapse>
        </Stack>
      </DialogContent>
      <DialogActions>
        {Array.isArray(column?.existingMappings) && column.existingMappings.length > 0 && (
          <Button onClick={() => onRemove?.(column)} sx={{ mr: 'auto' }}>
            取消展开
          </Button>
        )}
        <Button onClick={onClose}>取消</Button>
        <Button onClick={handleSave} variant="contained">
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default JsonQuickConfiguratorDialog;
