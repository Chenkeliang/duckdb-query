import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Paper,
  Divider,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  GetApp as DownloadIcon,
  Description as FileIcon,
  Storage as DatabaseIcon
} from '@mui/icons-material';
import { useToast } from '../../contexts/ToastContext';
import { deleteFileDataSource } from '../../services/apiClient'; // 导入新的删除函数

const DataSourceList = ({ dataSources = [], databaseConnections = [], onRefresh }) => {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');

  // 从传递的dataSources中分离文件数据源
  const fileDataSources = dataSources.filter(ds => ds.sourceType === 'file');
  const effectiveDatabases = databaseConnections || [];

  const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null, type: null });
  const [previewDialog, setPreviewDialog] = useState({ open: false, data: null });

  // 手动刷新（仅通知父组件）
  const manualRefresh = async () => {
    setLoading(true);
    setError('');
    try {
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      setError('刷新数据源失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setInitialLoading(false);
  }, []);

  // 新的、健壮的删除文件数据源函数
  const handleDeleteFileDataSource = async (sourceId) => {
    try {
      await deleteFileDataSource(sourceId);
      setDeleteDialog({ open: false, item: null, type: null });
      showSuccess('文件数据源删除成功');
      if (onRefresh) {
        onRefresh();
      }
    } catch (err) {
      const errorMsg = `删除文件失败: ${err.message}`;
      setError(errorMsg);
      showError(errorMsg);
    }
  };

  // 删除数据库连接
  const deleteDatabase = async (connectionId) => {
    try {
      const response = await fetch(`/api/database_connections/${connectionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setDeleteDialog({ open: false, item: null, type: null });
        showSuccess('数据库连接删除成功');
        if (onRefresh) {
          onRefresh();
        }
      } else {
        const errorMsg = '删除数据库连接失败';
        setError(errorMsg);
        showError(errorMsg);
      }
    } catch (err) {
      const errorMsg = `删除数据库连接失败: ${err.message}`;
      setError(errorMsg);
      showError(errorMsg);
    }
  };

  // 预览文件数据
  const previewFile = async (filename) => {
    try {
      const response = await fetch(`/api/file_preview/${filename}?rows=5`);
      if (response.ok) {
        const data = await response.json();
        setPreviewDialog({ open: true, data: { filename, ...data } });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || '预览失败');
      }
    } catch (err) {
      const errorMsg = `预览文件失败: ${err.message}`;
      setError(errorMsg);
      showError(errorMsg);
    }
  };

  const handleDelete = (item, type) => {
    setDeleteDialog({ open: true, item, type });
  };

  const confirmDelete = () => {
    const { item, type } = deleteDialog;
    if (type === 'file') {
      handleDeleteFileDataSource(item.id); // 使用新的删除函数和 item.id
    } else if (type === 'database') {
      deleteDatabase(item.id);
    }
  };

  return (
    <Box>
      {/* 头部操作栏 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          数据源列表
        </Typography>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={manualRefresh}
          disabled={loading || initialLoading}
          sx={{ borderRadius: 2 }}
        >
          {loading ? '刷新中...' : '刷新'}
        </Button>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* 文件列表 */}
      <Paper sx={{ mb: 3, borderRadius: 2 }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FileIcon color="primary" />
            已上传文件 ({fileDataSources.length})
          </Typography>
        </Box>
        <Divider />
        {fileDataSources.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            暂无上传的文件
          </Box>
        ) : (
          <List>
            {fileDataSources.map((source, index) => (
              <ListItem key={source.id} divider={index < fileDataSources.length - 1}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">{source.name}</Typography>
                      <Chip
                        label={source.name.split('.').pop().toUpperCase()}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="预览数据">
                    <IconButton onClick={() => previewFile(source.name)} size="small">
                      <ViewIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除文件">
                    <IconButton 
                      onClick={() => handleDelete(source, 'file')} 
                      size="small"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* 数据库连接列表 */}
      <Paper sx={{ borderRadius: 2 }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <DatabaseIcon color="secondary" />
            数据库连接 ({effectiveDatabases.length})
          </Typography>
        </Box>
        <Divider />
        {effectiveDatabases.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            暂无数据库连接
          </Box>
        ) : (
          <List>
            {effectiveDatabases.map((db, index) => (
              <ListItem key={db.id} divider={index < effectiveDatabases.length - 1}>
                <ListItemText
                  primary={
                    <Box>
                      <Typography variant="body1" sx={{ mb: 1 }}>
                        {db.name || `${db.type} 连接`}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip label={db.type.toUpperCase()} size="small" color="secondary" />
                        <Chip
                          label={db.status || 'unknown'}
                          size="small"
                          color={db.status === 'active' ? 'success' : 'default'}
                        />
                      </Box>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="删除连接">
                    <IconButton 
                      onClick={() => handleDelete(db, 'database')} 
                      size="small"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, item: null, type: null })}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          确定要删除这个{deleteDialog.type === 'file' ? '文件数据源' : '数据库连接'}吗？
          <br />
          <strong>
            {deleteDialog.type === 'file' 
              ? deleteDialog.item?.name 
              : deleteDialog.item?.name || '未命名连接'
            }
          </strong>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, item: null, type: null })}>
            取消
          </Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            删除
          </Button>
        </DialogActions>
      </Dialog>

      {/* 文件预览对话框 */}
      <Dialog 
        open={previewDialog.open} 
        onClose={() => setPreviewDialog({ open: false, data: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>文件预览 - {previewDialog.data?.filename}</DialogTitle>
        <DialogContent>
          {previewDialog.data && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                文件大小: {previewDialog.data.file_size} 字节 | 
                总行数: {previewDialog.data.total_rows === -1 ? 'N/A' : previewDialog.data.total_rows} | 
                列数: {previewDialog.data.columns?.length}
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {previewDialog.data.columns?.map((col, i) => (
                        <th key={i} style={{ border: '1px solid #ddd', padding: '8px', backgroundColor: '#f5f5f5' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewDialog.data.preview_data?.map((row, i) => (
                      <tr key={i}>
                        <tr key={i}>
                          {previewDialog.data.columns?.map((col, j) => (
                            <td key={j} style={{ border: '1px solid #ddd', padding: '8px' }}>
                              {typeof row[col] === 'object' ? JSON.stringify(row[col]) : row[col]}
                            </td>
                          ))}
                        </tr>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialog({ open: false, data: null })}>
            关闭
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DataSourceList;
