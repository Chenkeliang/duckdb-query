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
import { ChevronDown, ChevronUp, Info, Plus, Trash2 } from 'lucide-react';

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
        continue;
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

const JsonQuickConfiguratorDialog = ({ open, column, onClose, onSave, onRemove }) => {
  const sampleValues = useMemo(() => column?.sampleValues || [], [column]);
  const parsedSample = useMemo(() => tryParseSample(sampleValues), [sampleValues]);
  const defaultRowPath = useMemo(
    () => guessRowPath(parsedSample, column?.name || column?.metadata?.name),
    [parsedSample, column?.name, column?.metadata?.name],
  );
  const rowSample = useMemo(
    () => getRowSampleByPath(parsedSample, defaultRowPath),
    [parsedSample, defaultRowPath],
  );
  const suggestions = useMemo(
    () => buildFieldSuggestions(rowSample),
    [rowSample],
  );

  const [alias, setAlias] = useState('');
  const [rowPath, setRowPath] = useState(defaultRowPath);
  const [joinType, setJoinType] = useState('left');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [fields, setFields] = useState(suggestions);

  useEffect(() => {
    if (!open || !column) return;
    const existing = Array.isArray(column?.existingMappings) ? column.existingMappings[0] : null;
    const defaultAlias =
      existing?.alias ||
      `${column.name || column?.metadata?.name || column?.metadata?.column_name || 'json'}_items`;
    setAlias(defaultAlias);
    setRowPath(existing?.rootPath || defaultRowPath || '$');
    setJoinType(existing?.joinType || 'left');
    setFields(buildDefaultFields(existing?.columns, buildFieldSuggestions(rowSample)));
  }, [open, column, defaultRowPath, rowSample]);

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

  const samplesAvailable = Array.isArray(sampleValues) && sampleValues.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>JSON 展开</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
            选择 JSON 字段并配置路径，系统会自动生成 `JSON_TABLE` 查询。
          </Typography>
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
              onChange={(event) => setRowPath(event.target.value)}
              fullWidth
              helperText="默认使用检测到的数组路径，可自行调整"
            />
            <Stack spacing={0.5}>
              {['$[*]', '$.items[*]', '$'].map((preset) => (
                <Button
                  key={preset}
                  variant="outlined"
                  size="small"
                  onClick={() => setRowPath(preset)}
                  sx={{ textTransform: 'none' }}
                >
                  {preset}
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
