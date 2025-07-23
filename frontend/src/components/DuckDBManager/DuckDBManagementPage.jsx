import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Fab,
  Snackbar
} from '@mui/material';
import {
  Storage as StorageIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  TableChart as TableIcon
} from '@mui/icons-material';
import { getDuckDBTables, deleteDuckDBTable } from '../../services/apiClient';

const DuckDBManagementPage = () => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // 加载表列表
  const loadTables = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await getDuckDBTables();
      if (response.success) {
        setTables(response.tables || []);
      } else {
        setError('获取表列表失败');
      }
    } catch (err) {
      setError(`加载失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 组件挂载时加载数据
  useEffect(() => {
    loadTables();
  }, []);

  // 显示表详细信息
  const handleShowInfo = (table) => {
    setSelectedTable(table);
    setInfoDialogOpen(true);
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
      const result = await deleteDuckDBTable(tableToDelete.table_name);
      if (result.success) {
        setSuccessMessage(`表 "${tableToDelete.table_name}" 已成功删除`);
        await loadTables(); // 重新加载表列表
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

  // 获取表类型标签颜色
  const getTableTypeColor = (tableName) => {
    if (tableName.includes('query_result')) return 'primary';
    if (tableName.includes('temp')) return 'warning';
    return 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* 页面标题 */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <StorageIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          <Typography variant="h4" component="h1" fontWeight="bold">
            DuckDB 表管理
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadTables}
          disabled={loading}
        >
          刷新
        </Button>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* 统计信息 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TableIcon color="primary" />
                <Box>
                  <Typography variant="h6">{tables.length}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    总表数
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <StorageIcon color="success" />
                <Box>
                  <Typography variant="h6">
                    {formatNumber(tables.reduce((sum, table) => sum + (table.row_count || 0), 0))}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    总行数
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 表列表 */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>表名</TableCell>
                <TableCell align="right">行数</TableCell>
                <TableCell align="right">列数</TableCell>
                <TableCell>类型</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography>加载中...</Typography>
                  </TableCell>
                </TableRow>
              ) : tables.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    <Typography color="text.secondary">
                      暂无DuckDB表，请先执行SQL查询并保存结果
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                tables.map((table) => (
                  <TableRow key={table.table_name} hover>
                    <TableCell>
                      <Typography variant="body1" fontWeight="medium">
                        {table.table_name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {formatNumber(table.row_count || 0)}
                    </TableCell>
                    <TableCell align="right">
                      {table.column_count || 0}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={table.table_name.includes('query_result') ? '查询结果' : '数据表'}
                        size="small"
                        color={getTableTypeColor(table.table_name)}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
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
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* 表详细信息对话框 */}
      <Dialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>表详细信息</DialogTitle>
        <DialogContent>
          {selectedTable && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedTable.table_name}
              </Typography>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">行数</Typography>
                  <Typography variant="body1">{formatNumber(selectedTable.row_count || 0)}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">列数</Typography>
                  <Typography variant="body1">{selectedTable.column_count || 0}</Typography>
                </Grid>
              </Grid>
              
              {selectedTable.columns && selectedTable.columns.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" gutterBottom>列信息</Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>列名</TableCell>
                          <TableCell>数据类型</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedTable.columns.map((column, index) => (
                          <TableRow key={index}>
                            <TableCell>{column.column_name || column}</TableCell>
                            <TableCell>{column.data_type || 'VARCHAR'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoDialogOpen(false)}>关闭</Button>
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

      {/* 成功提示 */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DuckDBManagementPage;
