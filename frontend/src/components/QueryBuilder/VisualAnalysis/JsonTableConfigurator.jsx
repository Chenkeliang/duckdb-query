import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  Checkbox,
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';

const JSON_DATA_TYPES = ['VARCHAR', 'INTEGER', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'TIMESTAMP'];

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `json_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const createDefaultJsonTable = () => ({
  id: createId(),
  sourceColumn: '',
  alias: '',
  rootPath: '$.items[*]',
  joinType: 'left',
  columns: [
    {
      id: createId(),
      name: '',
      path: '$',
      dataType: 'VARCHAR',
      defaultValue: '',
      ordinal: false,
    },
  ],
});

const createDefaultJsonColumn = () => ({
  id: createId(),
  name: '',
  path: '$',
  dataType: 'VARCHAR',
  defaultValue: '',
  ordinal: false,
});

const JsonTableConfigurator = ({
  columns = [],
  jsonTables = [],
  onChange = () => {},
  disabled = false,
}) => {
  const tableList = Array.isArray(jsonTables) ? jsonTables : [];

  const availableJsonColumns = useMemo(() => {
    const normalized = (columns || []).map((column) => {
      if (!column) {
        return null;
      }
      if (typeof column === 'string') {
        return { name: column, dataType: 'TEXT' };
      }
      return column;
    }).filter(Boolean);

    const jsonCandidates = normalized.filter((column) => {
      const typeToken = (column.dataType || column.type || '').toString().toUpperCase();
      return /(JSON|STRUCT|MAP|OBJECT)/.test(typeToken);
    });

    return jsonCandidates.length > 0 ? jsonCandidates : normalized;
  }, [columns]);

  const applyChange = (nextTables) => {
    onChange(nextTables);
  };

  const handleAddMapping = () => {
    const next = [...tableList, createDefaultJsonTable()];
    applyChange(next);
  };

  const handleRemoveMapping = (id) => {
    applyChange(tableList.filter((item) => item?.id !== id));
  };

  const handleUpdateMapping = (id, patch) => {
    applyChange(
      tableList.map((item) =>
        item?.id === id
          ? {
              ...item,
              ...patch,
            }
          : item,
      ),
    );
  };

  const handleAddColumn = (tableId) => {
    applyChange(
      tableList.map((item) => {
        if (item?.id !== tableId) {
          return item;
        }
        return {
          ...item,
          columns: [...(item.columns || []), createDefaultJsonColumn()],
        };
      }),
    );
  };

  const handleRemoveColumn = (tableId, columnId) => {
    applyChange(
      tableList.map((item) => {
        if (item?.id !== tableId) {
          return item;
        }
        return {
          ...item,
          columns: (item.columns || []).filter((column) => column?.id !== columnId),
        };
      }),
    );
  };

  const handleUpdateColumn = (tableId, columnId, patch) => {
    applyChange(
      tableList.map((item) => {
        if (item?.id !== tableId) {
          return item;
        }
        return {
          ...item,
          columns: (item.columns || []).map((column) =>
            column?.id === columnId
              ? {
                  ...column,
                  ...patch,
                }
              : column,
          ),
        };
      }),
    );
  };

  return (
    <Stack spacing={2} sx={{ width: '100%' }}>
      {tableList.length === 0 && (
        <Box
          sx={{
            border: '1px dashed var(--dq-border-subtle)',
            borderRadius: 2,
            p: 2,
            textAlign: 'center',
            backgroundColor: 'var(--dq-surface-hover)',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            选择 JSON/STRUCT 列并配置路径，即可将嵌套字段展开为独立列。
          </Typography>
        </Box>
      )}

      {tableList.map((table, index) => {
        const derivedTitle = table.alias?.trim() || `JSON 展开 #${index + 1}`;
        const hasJsonColumn = availableJsonColumns.length > 0;

        return (
          <Box
            key={table.id}
            sx={{
              border: '1px solid var(--dq-border-subtle)',
              borderRadius: 2,
              p: 2,
              backgroundColor: 'var(--dq-surface-card)',
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              spacing={1}
              sx={{ mb: 1 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {derivedTitle}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                {!hasJsonColumn && (
                  <Chip
                    size="small"
                    color="warning"
                    variant="outlined"
                    label="未检测到 JSON 列"
                  />
                )}
                <IconButton
                  size="small"
                  onClick={() => handleRemoveMapping(table.id)}
                  disabled={disabled}
                >
                  <Trash2 size={16} />
                </IconButton>
              </Stack>
            </Stack>

            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>JSON 列</InputLabel>
                  <Select
                    label="JSON 列"
                    value={table.sourceColumn || ''}
                    onChange={(event) => handleUpdateMapping(table.id, { sourceColumn: event.target.value })}
                    disabled={disabled || !hasJsonColumn}
                  >
                    {(availableJsonColumns || []).map((column) => (
                      <MenuItem key={column.name} value={column.name}>
                        {column.label || column.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="别名"
                  value={table.alias || ''}
                  onChange={(event) => handleUpdateMapping(table.id, { alias: event.target.value })}
                  disabled={disabled}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="行路径"
                  value={table.rootPath || ''}
                  helperText="例如 $.items[*]"
                  onChange={(event) => handleUpdateMapping(table.id, { rootPath: event.target.value })}
                  disabled={disabled}
                />
              </Grid>
              <Grid item xs={12} md={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>关联方式</InputLabel>
                  <Select
                    label="关联方式"
                    value={table.joinType || 'left'}
                    onChange={(event) => handleUpdateMapping(table.id, { joinType: event.target.value })}
                    disabled={disabled}
                  >
                    <MenuItem value="left">保留主表 (LEFT)</MenuItem>
                    <MenuItem value="inner">仅匹配行 (INNER)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Divider sx={{ mb: 2 }} />

            <Stack spacing={1.5}>
              {(table.columns || []).map((column) => (
                <Box
                  key={column.id}
                  sx={{
                    border: '1px solid var(--dq-border-subtle)',
                    borderRadius: 1,
                    p: 1.5,
                    backgroundColor: 'var(--dq-surface-alt)',
                  }}
                >
                  <Grid container spacing={1.5} alignItems="center">
                    <Grid item xs={12} md={3}>
                      <TextField
                        fullWidth
                        size="small"
                        label="列别名"
                        value={column.name || ''}
                        onChange={(event) =>
                          handleUpdateColumn(table.id, column.id, { name: event.target.value })
                        }
                        disabled={disabled}
                      />
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField
                        fullWidth
                        size="small"
                        label="JSON 路径"
                        value={column.path || ''}
                        helperText={column.ordinal ? '序号列无需路径' : '例如 $.name'}
                        onChange={(event) =>
                          handleUpdateColumn(table.id, column.id, { path: event.target.value })
                        }
                        disabled={disabled || column.ordinal}
                      />
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <FormControl fullWidth size="small" disabled={disabled || column.ordinal}>
                        <InputLabel>数据类型</InputLabel>
                        <Select
                          label="数据类型"
                          value={column.dataType || 'VARCHAR'}
                          onChange={(event) =>
                            handleUpdateColumn(table.id, column.id, { dataType: event.target.value })
                          }
                        >
                          {JSON_DATA_TYPES.map((type) => (
                            <MenuItem key={type} value={type}>
                              {type}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <TextField
                        fullWidth
                        size="small"
                        label="默认值"
                        value={column.defaultValue ?? ''}
                        onChange={(event) =>
                          handleUpdateColumn(table.id, column.id, { defaultValue: event.target.value })
                        }
                        disabled={disabled || column.ordinal}
                      />
                    </Grid>
                    <Grid item xs={10} md={1}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={Boolean(column.ordinal)}
                            onChange={(event) =>
                              handleUpdateColumn(table.id, column.id, {
                                ordinal: event.target.checked,
                              })
                            }
                            disabled={disabled}
                          />
                        }
                        label="序号"
                      />
                    </Grid>
                    <Grid item xs={2} md={0.5} sx={{ textAlign: 'right' }}>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveColumn(table.id, column.id)}
                        disabled={disabled}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Grid>
                  </Grid>
                </Box>
              ))}

              <Button
                variant="text"
                size="small"
                startIcon={<Plus size={16} />}
                onClick={() => handleAddColumn(table.id)}
                disabled={disabled}
                sx={{ alignSelf: 'flex-start' }}
              >
                添加字段
              </Button>
            </Stack>
          </Box>
        );
      })}

      <Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Plus size={16} />}
          onClick={handleAddMapping}
          disabled={disabled}
        >
          新增 JSON 展开
        </Button>
      </Box>
    </Stack>
  );
};

export default JsonTableConfigurator;
