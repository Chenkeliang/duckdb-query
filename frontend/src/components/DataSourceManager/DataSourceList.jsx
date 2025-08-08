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

const DataSourceList = ({ dataSources = [], databaseConnections = [], onRefresh, refreshTrigger }) => {
  console.log('DataSourceList 组件渲染 - 不再进行任何API调用');

  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');

  // 使用 ref 来避免不必要的重新渲染
  const lastPropsRef = useRef({ dataSources: [], databaseConnections: [] });

  // 从传递的dataSources中分离文件，数据库连接单独传递
  const files = dataSources.filter(ds => ds.sourceType === 'file').map(ds => ds.name);

  // ⚠️ 重要：完全依赖 props，绝不进行任何 API 调用
  const effectiveDatabases = databaseConnections || [];
  const [deleteDialog, setDeleteDialog] = useState({ open: false, item: null, type: null });
  const [previewDialog, setPreviewDialog] = useState({ open: false, data: null });

  // ⚠️ 绝对不进行任何 API 调用，完全依赖 props

  // 手动刷新（仅通知父组件）
  const manualRefresh = async () => {
    console.log('DataSourceList - 手动刷新：通知父组件');
    setLoading(true);
    setError('');
    try {
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      setError('刷新数据源失败');
    } finally {
      setLoading(false);
    }
  };

  // 简化的初始化逻辑 - 只设置加载状态，不进行任何 API 调用
  useEffect(() => {
    console.log('DataSourceList - useEffect 初始化，不进行任何 API 调用');
    // 立即设置为加载完成，因为数据来自 props
    setInitialLoading(false);
  }, []); // 空依赖数组，只执行一次

  // 监听 props 变化，但不进行 API 调用
  useEffect(() => {
    console.log('DataSourceList - props 变化:', {
      dataSources: dataSources.length,
      databaseConnections: databaseConnections.length
    });

    // 更新 ref 以避免不必要的重新渲染
    lastPropsRef.current = { dataSources, databaseConnections };
  }, [dataSources, databaseConnections]);

  // 不再需要响应外部刷新触发，数据由父组件管理

  // 删除文件
  const deleteFile = async (filename) => {
    try {
      // 构建完整的文件路径
      const filePath = `temp_files/${filename}`;
      const response = await fetch('/api/delete_file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      });

      if (response.ok) {
        setDeleteDialog({ open: false, item: null, type: null });
        showSuccess('文件删除成功');
        // 立即触发父组件刷新
        if (onRefresh) {
          onRefresh();
        }
      } else {
        const errorMsg = '删除文件失败';
        setError(errorMsg);
        showError(errorMsg);
      }
    } catch (error) {
      const errorMsg = '删除文件失败: ' + error.message;
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
        // 立即触发父组件刷新
        if (onRefresh) {
          onRefresh();
        }
      } else {
        const errorMsg = '删除数据库连接失败';
        setError(errorMsg);
        showError(errorMsg);
      }
    } catch (error) {
      const errorMsg = '删除数据库连接失败: ' + error.message;
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
      }
    } catch (error) {
      const errorMsg = '预览文件失败: ' + error.message;
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
      deleteFile(item);
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
            已上传文件 ({files.length})
          </Typography>
        </Box>
        <Divider />
        {files.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
            暂无上传的文件
          </Box>
        ) : (
          <List>
            {files.map((filename, index) => (
              <ListItem key={index} divider={index < files.length - 1}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1">{filename}</Typography>
                      <Chip
                        label={filename.split('.').pop().toUpperCase()}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="预览数据">
                    <IconButton onClick={() => previewFile(filename)} size="small">
                      <ViewIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除文件">
                    <IconButton 
                      onClick={() => handleDelete(filename, 'file')} 
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
          确定要删除这个{deleteDialog.type === 'file' ? '文件' : '数据库连接'}吗？
          <br />
          <strong>
            {deleteDialog.type === 'file' 
              ? deleteDialog.item 
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
                总行数: {previewDialog.data.total_rows} | 
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
                        {previewDialog.data.columns?.map((col, j) => (
                          <td key={j} style={{ border: '1px solid #ddd', padding: '8px' }}>
                            {row[col]}
                          </td>
                        ))}
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
