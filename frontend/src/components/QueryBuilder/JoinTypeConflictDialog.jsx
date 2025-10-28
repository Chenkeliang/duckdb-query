import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Autocomplete,
  TextField,
  Chip,
  Stack,
} from '@mui/material';
import { AlertTriangle } from 'lucide-react';

const DEFAULT_OPTIONS = [
  'VARCHAR',
  'DECIMAL(18,4)',
  'DOUBLE',
  'BIGINT',
  'INTEGER',
  'TIMESTAMP',
  'DATE',
  'BOOLEAN',
];

const JoinTypeConflictDialog = ({
  open,
  conflicts = [],
  onClose,
  onSubmit,
  isSubmitting = false,
  resolvedSelections = {},
}) => {
  const [selectionMap, setSelectionMap] = useState({});

  const mergedOptions = useMemo(() => {
    return conflicts.reduce((acc, conflict) => {
      const options = [
        ...(conflict.recommendedTypes || []),
        ...DEFAULT_OPTIONS,
      ]
        .filter(Boolean)
        .map((item) => item.toUpperCase());
      acc[conflict.key] = Array.from(new Set(options));
      return acc;
    }, {});
  }, [conflicts]);

  useEffect(() => {
    if (!open) {
      setSelectionMap({});
      return;
    }
    const nextSelection = {};
    conflicts.forEach((conflict) => {
      const key = conflict.key;
      const recommended = conflict.defaultType || 'VARCHAR';
      nextSelection[key] =
        resolvedSelections[key] || recommended || mergedOptions[key]?.[0] || 'VARCHAR';
    });
    setSelectionMap(nextSelection);
  }, [open, conflicts, mergedOptions, resolvedSelections]);

  const handleChange = (key, value) => {
    setSelectionMap((prev) => ({
      ...prev,
      [key]: (value || '').toUpperCase(),
    }));
  };

  const handleSubmit = () => {
    onSubmit?.(selectionMap);
  };

  const handleClose = () => {
    setSelectionMap({});
    onClose?.();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
          borderRadius: 3,
          boxShadow: '0 28px 60px rgba(15, 23, 42, 0.55)',
          border: '1px solid rgba(148, 163, 184, 0.25)',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pr: 2,
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              background: 'rgba(251, 191, 36, 0.12)',
              color: '#facc15',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={18} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#e2e8f0' }}>
              检测到JOIN类型冲突
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(148, 163, 184, 0.9)' }}>
              请选择一个统一的类型来对齐左右两侧字段，以避免 DuckDB 类型转换错误。
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>JOIN 条件</TableCell>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>左侧类型</TableCell>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>右侧类型</TableCell>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>统一为</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {conflicts.map((conflict) => {
              const key = conflict.key;
              const value = selectionMap[key] || '';
              const options = mergedOptions[key] || DEFAULT_OPTIONS;

              return (
                <TableRow key={key} hover>
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Typography sx={{ fontWeight: 600, color: '#e2e8f0' }}>
                        {conflict.left.sourceLabel}.{conflict.left.column}
                      </Typography>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label="="
                          size="small"
                          sx={{
                            bgcolor: 'rgba(148, 163, 184, 0.12)',
                            color: '#e2e8f0',
                            fontWeight: 500,
                          }}
                        />
                        <Typography sx={{ fontWeight: 600, color: '#e2e8f0' }}>
                          {conflict.right.sourceLabel}.{conflict.right.column}
                        </Typography>
                      </Stack>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: 'rgba(148, 163, 184, 0.9)' }}>
                      {conflict.left.displayType}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: 'rgba(148, 163, 184, 0.9)' }}>
                      {conflict.right.displayType}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    <Autocomplete
                      freeSolo
                      options={options}
                      value={value}
                      onChange={(_, newValue) => handleChange(key, newValue || '')}
                      onInputChange={(_, newValue) => handleChange(key, newValue || '')}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="outlined"
                          size="small"
                          placeholder="例如 VARCHAR"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              color: '#e2e8f0',
                              backgroundColor: 'rgba(15, 23, 42, 0.6)',
                              borderRadius: 2,
                              '& fieldset': {
                                borderColor: 'rgba(148, 163, 184, 0.25)',
                              },
                              '&:hover fieldset': {
                                borderColor: '#facc15',
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: '#facc15',
                              },
                            },
                            '& .MuiAutocomplete-input': {
                              fontSize: '1rem',
                            },
                          }}
                        />
                      )}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isSubmitting} sx={{ color: 'rgba(148, 163, 184, 0.9)' }}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting}
          sx={{
            borderRadius: 2,
            px: 3,
            fontWeight: 600,
            background: 'linear-gradient(135deg, #f97316, #facc15)',
            boxShadow: '0 12px 30px rgba(250, 204, 21, 0.35)',
            '&:hover': {
              background: 'linear-gradient(135deg, #ea580c, #f59e0b)',
            },
          }}
        >
          {isSubmitting ? '应用中...' : '应用类型转换并继续'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default JoinTypeConflictDialog;
