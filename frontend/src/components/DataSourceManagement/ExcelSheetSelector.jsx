import React, { useEffect, useMemo, useState } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Checkbox
} from '@mui/material';
import { ThemeProvider, createTheme, useTheme } from '@mui/material/styles';
import { importExcelSheets, inspectExcelSheets } from '../../services/apiClient';
import {
  CardSurface,
  RoundedButton,
  RoundedTextField,
  SectionHeader
} from '../common';

const ExcelSheetSelector = ({
  open,
  pendingInfo,
  onClose,
  onImported,
  showNotification
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sheetConfigs, setSheetConfigs] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const parentTheme = useTheme();
  const dialogTheme = useMemo(
    () =>
      createTheme(parentTheme, {
        components: {
          MuiDialog: {
            styleOverrides: {
              paper: {
                borderRadius: 'var(--dq-radius-card)',
                backgroundColor: 'var(--dq-surface-card)',
                border: '1px solid var(--dq-border-card)',
                boxShadow: 'var(--dq-shadow-soft)'
              }
            }
          },
          MuiDialogTitle: {
            styleOverrides: {
              root: {
                padding: '24px 28px 16px',
                borderBottom: '1px solid var(--dq-border-subtle)'
              }
            }
          },
          MuiDialogContent: {
            styleOverrides: {
              root: {
                padding: '24px 28px',
                backgroundColor: 'var(--dq-surface)'
              }
            }
          },
          MuiDialogActions: {
            styleOverrides: {
              root: {
                padding: '16px 28px 24px',
                borderTop: '1px solid var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface)'
              }
            }
          },
          MuiAccordion: {
            styleOverrides: {
              root: {
                borderRadius: 'var(--dq-radius-card)',
                border: '1px solid var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface-card)',
                transition: 'border-color 0.2s ease, background-color 0.2s ease',
                '&:before': {
                  display: 'none'
                },
                '&.Mui-expanded': {
                  margin: '12px 0',
                  borderColor: 'var(--dq-border-card)',
                  backgroundColor: 'var(--dq-surface-card-active)',
                  boxShadow: 'var(--dq-shadow-soft)'
                }
              }
            }
          },
          MuiAccordionSummary: {
            styleOverrides: {
              root: {
                minHeight: 64,
                padding: '0 20px',
                '&.Mui-expanded': {
                  minHeight: 64
                },
                '& .MuiAccordionSummary-content': {
                  margin: '0 !important'
                },
                '&:hover': {
                  backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 6%, transparent)'
                }
              }
            }
          },
          MuiAccordionDetails: {
            styleOverrides: {
              root: {
                borderTop: '1px solid var(--dq-border-subtle)',
                backgroundColor: 'var(--dq-surface-card)',
                padding: '16px 20px 24px'
              }
            }
          },
          MuiTableHead: {
            styleOverrides: {
              root: {
                backgroundColor: 'var(--dq-surface-card-active)',
                '& .MuiTableCell-root': {
                  color: 'var(--dq-text-secondary)',
                  fontWeight: 600
                }
              }
            }
          },
          MuiCheckbox: {
            styleOverrides: {
              root: {
                color: 'var(--dq-border-subtle)',
                '&.Mui-checked': {
                  color: 'var(--dq-accent-primary)'
                }
              }
            }
          }
        }
      }),
    [parentTheme]
  );

  const fileId = pendingInfo?.file_id;

  const handleFetchSheets = async (currentFileId) => {
    if (!currentFileId) return;
    setLoading(true);
    setError('');
    try {
      const data = await inspectExcelSheets(currentFileId);
      const mapped = (data?.sheets || []).map(sheet => ({
        name: sheet.name,
        selected: true,
        targetTable: sheet.default_table_name || sheet.name,
        headerRows: sheet.suggested_header_rows ?? 1,
        headerRowIndex:
          (sheet.suggested_header_rows ?? 1) > 0
            ? sheet.suggested_header_row_index ?? 1
            : null,
        fillMerged: sheet.has_merged_cells || false,
        meta: {
          ...sheet,
          columns: Array.isArray(sheet.columns) ? sheet.columns : [],
          preview: Array.isArray(sheet.preview) ? sheet.preview : []
        }
      }));
      setSheetConfigs(mapped);
    } catch (err) {
      setError(err?.message || '获取工作表信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && fileId) {
      handleFetchSheets(fileId);
    } else if (!open) {
      setSheetConfigs([]);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fileId]);

  const toggleAll = (nextSelected) => {
    setSheetConfigs(prev => prev.map(sheet => ({ ...sheet, selected: nextSelected })));
  };

  const handleSheetToggle = (name, selected) => {
    setSheetConfigs(prev =>
      prev.map(sheet => (sheet.name === name ? { ...sheet, selected } : sheet))
    );
  };

  const handleSheetFieldChange = (name, field, value) => {
    setSheetConfigs(prev =>
      prev.map(sheet => {
        if (sheet.name !== name) return sheet;

        if (field === 'headerRows') {
          const numericRows = value === '' ? '' : Math.max(0, Number(value) || 0);
          return {
            ...sheet,
            headerRows: numericRows,
            headerRowIndex:
              Number(numericRows) > 0
                ? sheet.headerRowIndex ?? sheet.meta?.suggested_header_row_index ?? 1
                : null
          };
        }

        if (field === 'headerRowIndex') {
          if (Number(sheet.headerRows) === 0) {
            return { ...sheet, headerRowIndex: null };
          }

          if (value === '') {
            return { ...sheet, headerRowIndex: '' };
          }

          const numericIndex = Math.max(1, Number(value) || 1);
          return { ...sheet, headerRowIndex: numericIndex };
        }

        return { ...sheet, [field]: value };
      })
    );
  };

  const handleImport = async () => {
    const selected = sheetConfigs.filter(sheet => sheet.selected);
    if (selected.length === 0) {
      showNotification?.('请至少选择一个工作表进行导入', 'warning');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        file_id: fileId,
        sheets: selected.map(sheet => {
          const headerRowsNumber = Number(sheet.headerRows) || 0;
          const headerRowIndexNumber = headerRowsNumber > 0
            ? Number(sheet.headerRowIndex) || 1
            : null;

          return {
            name: sheet.name,
            target_table: sheet.targetTable,
            mode: 'replace',
            header_rows: headerRowsNumber,
            header_row_index: headerRowIndexNumber,
            fill_merged: Boolean(sheet.fillMerged)
          };
        })
      };

      const result = await importExcelSheets(payload);
      showNotification?.('Excel 导入完成', 'success');
      onImported?.(result);
      onClose?.();
    } catch (err) {
      const message = err?.message || '导入失败';
      setError(message);
      showNotification?.(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemeProvider theme={dialogTheme}>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
        <DialogTitle disableTypography>
          <SectionHeader
            title="Excel 工作表导入"
            subtitle="选择要导入的工作表并确认表头设置"
          />
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <CardSurface padding={2}>
              <Stack spacing={0.5}>
                <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
                  文件：{pendingInfo?.original_filename || '-'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
                  建议表名前缀：{pendingInfo?.default_table_prefix || '-'}
                </Typography>
              </Stack>
            </CardSurface>

            {error && (
              <Alert severity="error">
                {error}
              </Alert>
            )}

            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Stack spacing={2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2" sx={{ color: 'var(--dq-text-secondary)' }}>
                    工作表（{sheetConfigs.length}）
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <RoundedButton variant="outlined" size="small" onClick={() => toggleAll(true)}>
                      全选
                    </RoundedButton>
                    <RoundedButton variant="outlined" size="small" onClick={() => toggleAll(false)}>
                      全不选
                    </RoundedButton>
                  </Stack>
                </Stack>

                {sheetConfigs.length === 0 && (
                  <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)' }}>
                    未检测到可导入的工作表。
                  </Typography>
                )}

                {sheetConfigs.map(sheet => (
                  <Accordion
                    key={sheet.name}
                    disableGutters
                    sx={{
                      mb: 1.5,
                      opacity: sheet.selected ? 1 : 0.65,
                      borderColor: sheet.selected ? 'var(--dq-border-card)' : 'var(--dq-border-subtle)'
                    }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                        <Checkbox
                          checked={sheet.selected}
                          onChange={(_, checked) => handleSheetToggle(sheet.name, checked)}
                          onClick={event => event.stopPropagation()}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 600, color: 'var(--dq-text-primary)' }}>
                            {sheet.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>
                            行数 {sheet.meta?.rows ?? '-'} · 列数 {sheet.meta?.columns_count ?? '-'}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>
                          目标：{sheet.targetTable}
                        </Typography>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                          <RoundedTextField
                            label="目标表名"
                            fullWidth
                            value={sheet.targetTable}
                            onChange={(event) =>
                              handleSheetFieldChange(sheet.name, 'targetTable', event.target.value)
                            }
                            helperText="将按 DuckDB 规则自动清理特殊字符"
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <RoundedTextField
                            label="表头所在行"
                            type="text"
                            fullWidth
                            value={sheet.headerRowIndex ?? ''}
                            onChange={(event) =>
                              handleSheetFieldChange(sheet.name, 'headerRowIndex', event.target.value)
                            }
                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', min: 0 }}
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Tooltip title="按照 Excel 原始行号（从 1 开始）选定要作为列名的表头行。">
                                    <IconButton size="small" edge="end">
                                      <InfoOutlinedIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </InputAdornment>
                              )
                            }}
                            helperText={`选择作为列名的行号（推荐: 第 ${sheet.meta?.suggested_header_row_index ?? 1} 行）`}
                            disabled={Number(sheet.headerRows) === 0}
                          />
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <RoundedTextField
                            label="表头行数"
                            type="text"
                            fullWidth
                            value={sheet.headerRows}
                            onChange={(event) =>
                              handleSheetFieldChange(sheet.name, 'headerRows', event.target.value)
                            }
                            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', min: 0, max: 10 }}
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Tooltip title="从所选行开始向下共计几行作为表头；填 0 表示无表头。">
                                    <IconButton size="small" edge="end">
                                      <InfoOutlinedIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </InputAdornment>
                              )
                            }}
                            helperText="默认 1 行，如遇多行表头请填写实际行数；填 0 表示无表头"
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={sheet.fillMerged}
                                onChange={(_, checked) =>
                                  handleSheetFieldChange(sheet.name, 'fillMerged', checked)
                                }
                              />
                            }
                            label="填充合并单元格内容（向下填充空白单元格）"
                          />
                        </Grid>
                      </Grid>

                      {(sheet.meta?.has_merged_cells || sheet.meta?.suggested_header_rows > 1) && (
                        <Alert severity="warning" sx={{ mt: 2 }}>
                          检测到 {sheet.meta?.has_merged_cells ? '合并单元格' : ''}{' '}
                          {sheet.meta?.suggested_header_rows > 1 ? '可能存在多行表头' : ''}。
                          可通过调整“表头行数”或开启“填充合并单元格”改善导入效果。
                        </Alert>
                      )}

                      {Array.isArray(sheet.meta?.preview) && sheet.meta.preview.length > 0 && (
                        <CardSurface padding={2} sx={{ mt: 2, overflowX: 'auto' }}>
                          <Typography variant="subtitle2" sx={{ mb: 1, color: 'var(--dq-text-secondary)' }}>
                            预览（前 {sheet.meta.preview.length} 行）
                          </Typography>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                {(sheet.meta?.columns || []).map(column => (
                                  <TableCell key={column.name}>{column.name}</TableCell>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {sheet.meta.preview.map((row, rowIndex) => (
                                <TableRow key={rowIndex}>
                                  {(sheet.meta?.columns || []).map(column => (
                                    <TableCell key={column.name}>
                                      {row?.[column.name] ?? ''}
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardSurface>
                      )}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <RoundedButton variant="outlined" onClick={onClose} disabled={submitting}>
            取消
          </RoundedButton>
          <RoundedButton
            onClick={handleImport}
            disabled={submitting || loading || sheetConfigs.length === 0}
          >
            {submitting ? '导入中...' : '开始导入'}
          </RoundedButton>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
};

export default ExcelSheetSelector;
