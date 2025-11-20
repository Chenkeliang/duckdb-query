import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Delete as DeleteIcon,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Info as InfoIcon,
  Paper,
  Refresh as RefreshIcon,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { Database } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { deleteDuckDBTableEnhanced, fetchDuckDBTableSummaries, getDuckDBTableDetail } from '../../services/apiClient';

const DuckDBTableManager = ({ onTableSelect, onDataSourceChange }) => {
  const [tables, setTables] = useState([]);
  const [tableDetails, setTableDetails] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document === 'undefined') {
      return false;
    }
    return document.documentElement.classList.contains('dark');
  });

  const resolveMetadataPayload = (payload) => {
    if (!payload) return null;
    if (payload.table) return payload.table;
    if (payload.metadata) return payload.metadata;
    return payload;
  };

  const buildColumnsFromMetadata = (metadata) => {
    if (!metadata || !Array.isArray(metadata.columns)) {
      return [];
    }
    return metadata.columns.map((column) => {
      if (typeof column === 'string') {
        return { name: column, type: 'VARCHAR', dataType: 'VARCHAR' };
      }
      const columnName = column.column_name || column.name;
      const dataType = column.data_type || column.type || 'VARCHAR';
      return {
        name: columnName,
        type: dataType,
        dataType: dataType,
        sampleValues: column.sample_values || [],
      };
    });
  };

  // 加载DuckDB表列表
  const loadTables = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetchDuckDBTableSummaries();
      const sortedTables = (response?.tables || []).sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at) : new Date(0);
        const timeB = b.created_at ? new Date(b.created_at) : new Date(0);
        return timeB - timeA;
      });
      setTables(sortedTables);
    } catch (err) {
      setError(`加载失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  const ensureTableDetail = async (tableName) => {
    if (tableDetails[tableName]) {
      return tableDetails[tableName];
    }
    try {
      const response = await getDuckDBTableDetail(tableName);
      const metadata = resolveMetadataPayload(response);
      if (metadata) {
        setTableDetails(prev => ({ ...prev, [tableName]: metadata }));
        setTables(prev =>
          prev.map(table =>
            table.table_name === tableName
              ? {
                  ...table,
                  columns: buildColumnsFromMetadata(metadata),
                  column_count: metadata.column_count ?? table.column_count,
                  row_count: metadata.row_count ?? table.row_count,
                }
              : table
          )
        );
      }
      return metadata;
    } catch (error) {
      setError(error.message || '获取表详情失败');
      return null;
    }
  };

  // 组件挂载时加载表列表
  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      if (typeof document === 'undefined') {
        return;
      }
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    const handleThemeChange = (event) => {
      if (event?.detail && typeof event.detail.isDark === 'boolean') {
        setIsDarkMode(event.detail.isDark);
      } else {
        syncTheme();
      }
    };
    window.addEventListener('duckquery-theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('duckquery-theme-change', handleThemeChange);
    };
  }, []);

  // 显示表详细信息
  const handleShowInfo = async (table) => {
    setSelectedTable(table);
    setInfoDialogOpen(true);
    const metadata = await ensureTableDetail(table.table_name);
    if (metadata) {
      setSelectedTable(prev => {
        if (!prev || prev.table_name !== table.table_name) {
          return prev;
        }
        return {
          ...prev,
          columns: buildColumnsFromMetadata(metadata),
          column_count: metadata.column_count ?? prev.column_count,
          row_count: metadata.row_count ?? prev.row_count,
        };
      });
    }
  };

  // 选择表作为数据源
  const handleSelectTable = async (table) => {
    if (onTableSelect) {
      const metadata = await ensureTableDetail(table.table_name);
      const columns = metadata ? buildColumnsFromMetadata(metadata) : table.columns || [];
      onTableSelect({
        id: table.table_name,
        type: 'duckdb',
        name: `DuckDB表: ${table.table_name}`,
        params: {
          table_name: table.table_name
        },
        row_count: (metadata && metadata.row_count) || table.row_count,
        columns
      });
    }
  };

  // 删除表
  const handleDeleteTable = (table) => {
    setTableToDelete(table);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tableToDelete) return;

    setDeleting(true);
    setError('');

    try {
      const result = await deleteDuckDBTableEnhanced(tableToDelete.table_name);
      if (result.success) {
        // 重新加载表列表
        await loadTables();
        // 通知全局数据源状态更新
        if (onDataSourceChange) {
          onDataSourceChange();
        }
        setDeleteDialogOpen(false);
        setTableToDelete(null);
      } else {
        setError(result.message || '删除失败');
      }
    } catch (err) {
      setError(`删除失败: ${err.message || '未知错误'}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setTableToDelete(null);
  };

  // 格式化数字
  const formatNumber = (num) => {
    return new Intl.NumberFormat('zh-CN').format(num);
  };

  return (
    <Card sx={{ borderRadius: 2, border: '1px solid var(--dq-border-subtle)', backgroundColor: 'var(--dq-surface-card)' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Database size={20} style={{ color: 'var(--dq-accent-primary)' }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'var(--dq-text-primary)' }}>
              DuckDB 表管理
            </Typography>
            <Chip
              label={`${tables.length} 个表`}
              size="small"
              sx={{
                backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 12%, transparent)',
                color: 'var(--dq-accent-primary)',
                fontWeight: 600,
                borderRadius: '999px'
              }}
            />
          </Box>
          <Tooltip title="刷新表列表">
            <IconButton
              onClick={loadTables}
              disabled={loading}
              sx={{
                backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 18%, transparent)',
                '&:hover': {
                  backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 28%, transparent)'
                },
                '& svg': {
                  color: 'var(--dq-accent-primary)'
                }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : tables.length === 0 ? (
          <Alert severity="info">
            暂无已保存的DuckDB表。执行数据库查询后可以保存结果到DuckDB。
          </Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>表名</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>行数</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>列数</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tables.map((table) => (
                  <TableRow key={table.table_name} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {table.table_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={formatNumber(table.row_count)}
                        size="small"
                        color="success"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={table.column_count}
                        size="small"
                        color="info"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="查看详细信息">
                          <IconButton
                            size="small"
                            onClick={() => handleShowInfo(table)}
                          >
                            <InfoIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除表">
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteTable(table)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleSelectTable(table)}
                        >
                          选择
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* 表详细信息对话框 */}
        <Dialog
          open={infoDialogOpen}
          onClose={() => setInfoDialogOpen(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            表详细信息: {selectedTable?.table_name}
          </DialogTitle>
          <DialogContent>
            {selectedTable && (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  基本信息
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>表名:</strong> {selectedTable.table_name}
                  </Typography>
                  <Typography variant="body2">
                    <strong>行数:</strong> {formatNumber(selectedTable.row_count)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>列数:</strong> {selectedTable.column_count}
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  列信息
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {selectedTable.columns?.map((column, index) => (
                    <Chip
                      key={index}
                      label={typeof column === 'string' ? column : column.name}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setInfoDialogOpen(false)}>
              关闭
            </Button>
            {selectedTable && (
              <Button
                variant="contained"
                onClick={() => {
                  handleSelectTable(selectedTable);
                  setInfoDialogOpen(false);
                }}
              >
                选择此表
              </Button>
            )}
          </DialogActions>
        </Dialog>

        {/* 删除确认对话框 */}
        <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
          <DialogTitle>确认删除</DialogTitle>
          <DialogContent>
            <Typography>
              确定要删除表 <strong>{tableToDelete?.table_name}</strong> 吗？
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              此操作不可撤销，表中的所有数据将被永久删除。
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDeleteCancel} disabled={deleting}>
              取消
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              color="error"
              variant="contained"
              disabled={deleting}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default DuckDBTableManager;
