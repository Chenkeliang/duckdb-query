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
  Chip,
  Stack,
  Autocomplete,
  TextField,
} from '@mui/material';
import { AlertTriangle } from 'lucide-react';
import TypeHelpPopover from './TypeHelpPopover';

const DEFAULT_CAST_OPTIONS = ['DECIMAL(18,4)', 'DOUBLE', 'BIGINT', 'VARCHAR'];

const TypeConflictDialog = ({
  open,
  conflicts = [],
  suggestedCasts = {},
  onClose,
  onSubmit,
  isSubmitting = false,
  resolvedCasts = {},
}) => {
  const conflictMap = useMemo(() => {
    const map = new Map();
    conflicts.forEach((conflict) => {
      const column = conflict?.left?.column;
      if (!column) {
        return;
      }
      if (!map.has(column)) {
        map.set(column, []);
      }
      map.get(column).push(conflict);
    });
    return map;
  }, [conflicts]);

  const [selectionMap, setSelectionMap] = useState({});

  useEffect(() => {
    if (!open) {
      setSelectionMap({});
      return;
    }
    const nextSelection = {};
    conflictMap.forEach((list, column) => {
      const columnKey = column.toLowerCase();
      const recommended = suggestedCasts[column] || [];
      const resolved = resolvedCasts?.[columnKey];
      nextSelection[column] = resolved || recommended[0] || 'DECIMAL(18,4)';
    });
    setSelectionMap(nextSelection);
  }, [open, conflictMap, suggestedCasts, resolvedCasts]);

  const handleCastChange = (column, value) => {
    setSelectionMap((prev) => ({
      ...prev,
      [column]: (value || '').toUpperCase(),
    }));
  };

  const handleSubmit = () => {
    const cleaned = Object.entries(selectionMap)
      .filter(([, cast]) => cast && cast.trim())
      .reduce((acc, [column, cast]) => {
        acc[column.toLowerCase()] = cast.trim().toUpperCase();
        return acc;
      }, {});
    onSubmit?.(cleaned);
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
              background: 'rgba(14, 165, 233, 0.12)',
              color: '#38bdf8',
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
              检测到类型冲突
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(148, 163, 184, 0.9)' }}>
              请选择合适的 TRY_CAST 类型以继续运行分析
            </Typography>
          </Box>
        </Stack>
        <TypeHelpPopover />
      </DialogTitle>
      <DialogContent sx={{ pt: 0 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>列名</TableCell>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>当前类型</TableCell>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>操作</TableCell>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>推荐转换</TableCell>
              <TableCell sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>应用类型</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from(conflictMap.entries()).map(([column, rows]) => {
              const firstConflict = rows[0];
              const currentType = firstConflict?.left?.duckdb_type || firstConflict?.left?.type || firstConflict?.left?.raw_type;
              const normalized = firstConflict?.left?.normalized_type || currentType;
              const func = firstConflict?.function;
              const optionSet = Array.from(
                new Set(
                  [
                    ...(suggestedCasts[column] || []),
                    ...(DEFAULT_CAST_OPTIONS || []),
                  ].map((item) => item.toUpperCase()),
                ),
              );
              const value = selectionMap[column] || '';

              return (
                <TableRow key={column} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontWeight: 600, color: '#e2e8f0' }}>
                        {column}
                      </Typography>
                      {func && (
                        <Chip
                          label={func}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(56, 189, 248, 0.12)',
                            color: '#38bdf8',
                            fontWeight: 500,
                          }}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: 'rgba(148, 163, 184, 0.9)' }}>
                      {currentType || normalized || '未知'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: 'rgba(226, 232, 240, 0.8)' }}>
                      TRY_CAST
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ minWidth: 220 }}>
                    <Autocomplete
                      freeSolo
                      options={optionSet}
                      value={value}
                      onChange={(_, newValue) => handleCastChange(column, newValue || '')}
                      onInputChange={(_, newValue) => handleCastChange(column, newValue || '')}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          variant="outlined"
                          size="small"
                          placeholder="例如 DECIMAL(18,4)"
                          sx={{
                            '& .MuiOutlinedInput-root': {
                              color: '#e2e8f0',
                              backgroundColor: 'rgba(15, 23, 42, 0.6)',
                              borderRadius: 2,
                              '& fieldset': {
                                borderColor: 'rgba(148, 163, 184, 0.25)',
                              },
                              '&:hover fieldset': {
                                borderColor: '#38bdf8',
                              },
                              '&.Mui-focused fieldset': {
                                borderColor: '#38bdf8',
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
                  <TableCell>
                    <Typography variant="body2" sx={{ color: '#38bdf8', fontWeight: 600 }}>
                      {value || '保持原类型'}
                    </Typography>
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
            background: 'linear-gradient(135deg, #0ea5e9, #38bdf8)',
            boxShadow: '0 12px 30px rgba(14, 165, 233, 0.35)',
            '&:hover': {
              background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
            },
          }}
        >
          {isSubmitting ? '应用中...' : '应用转换并继续'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TypeConflictDialog;
