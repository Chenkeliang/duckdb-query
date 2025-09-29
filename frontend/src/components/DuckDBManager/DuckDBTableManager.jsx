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
import { deleteDuckDBTableEnhanced, getDuckDBTablesEnhanced } from '../../services/apiClient';

const DuckDBTableManager = ({ onTableSelect, onDataSourceChange }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // 加载DuckDB表列表
  const loadTables = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await getDuckDBTablesEnhanced();
      if (response.success) {
        // 按创建时间倒序排序
        const sortedTables = (response.tables || []).sort((a, b) => {
          const timeA = a.created_at ? new Date(a.created_at) : new Date(0);
          const timeB = b.created_at ? new Date(b.created_at) : new Date(0);
          return timeB - timeA;
        });
        setTables(sortedTables);
      } else {
        setError('获取表列表失败');
      }
    } catch (err) {
      setError(`加载失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载表列表
  useEffect(() => {
    loadTables();
  }, []);

  // 显示表详细信息
  const handleShowInfo = (table) => {
    setSelectedTable(table);
    setInfoDialogOpen(true);
  };

  // 选择表作为数据源
  const handleSelectTable = (table) => {
    if (onTableSelect) {
      onTableSelect({
        id: table.table_name,
        type: 'duckdb',
        name: `DuckDB表: ${table.table_name}`,
        params: {
          table_name: table.table_name
        },
        row_count: table.row_count,
        columns: table.columns
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
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Database size={20} color="#1976d2" />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              DuckDB 表管理
            </Typography>
            <Chip
              label={`${tables.length} 个表`}
              size="small"
              color="primary"
              variant="outlined"
            />
          </Box>
          <Tooltip title="刷新表列表">
            <IconButton onClick={loadTables} disabled={loading}>
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
