import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  LinearProgress,
  Tooltip
} from '@mui/material';
import {
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  GetApp as ExportIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { 
  exportData, 
  quickExport, 
  listExportTasks, 
  getExportTaskStatus, 
  downloadExportFile, 
  deleteExportTask 
} from '../../services/apiClient';

const ExportManager = ({ queryRequest, onClose }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 导出表单状态
  const [exportForm, setExportForm] = useState({
    format: 'csv',
    filename: '',
    chunk_size: 10000,
    include_headers: true
  });

  useEffect(() => {
    loadTasks();
    // 设置定时刷新
    const interval = setInterval(loadTasks, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadTasks = async () => {
    try {
      const response = await listExportTasks();
      if (response.success) {
        setTasks(response.tasks);
      }
    } catch (err) {
      console.error('加载导出任务失败:', err);
    }
  };

  const handleQuickExport = async (format) => {
    if (!queryRequest) {
      setError('没有可导出的查询结果');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const exportRequest = {
        query_request: queryRequest,
        format: format,
        filename: `export_${Date.now()}.${format}`
      };

      const response = await quickExport(exportRequest);
      
      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', exportRequest.filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess('文件导出成功!');
    } catch (err) {
      setError('快速导出失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAsyncExport = async () => {
    if (!queryRequest) {
      setError('没有可导出的查询结果');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const exportRequest = {
        query_request: queryRequest,
        format: exportForm.format,
        filename: exportForm.filename || `export_${Date.now()}.${exportForm.format}`,
        chunk_size: exportForm.chunk_size,
        include_headers: exportForm.include_headers
      };

      const response = await exportData(exportRequest);
      
      if (response.success) {
        setSuccess('导出任务已创建，正在后台处理...');
        setExportDialogOpen(false);
        await loadTasks();
      } else {
        setError('创建导出任务失败');
      }
    } catch (err) {
      setError('创建导出任务失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (taskId) => {
    try {
      const response = await downloadExportFile(taskId);
      
      // 从响应头获取文件名
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'export.file';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // 创建下载链接
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      setSuccess('文件下载成功!');
    } catch (err) {
      setError('下载文件失败: ' + err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('确定要删除这个导出任务吗？')) {
      return;
    }

    try {
      const response = await deleteExportTask(taskId);
      if (response.success) {
        setSuccess('导出任务删除成功!');
        await loadTasks();
      }
    } catch (err) {
      setError('删除任务失败: ' + err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'failed': return 'error';
      case 'processing': return 'warning';
      case 'pending': return 'info';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckIcon fontSize="small" />;
      case 'failed': return <ErrorIcon fontSize="small" />;
      case 'processing': return <CircularProgress size={16} />;
      case 'pending': return <ScheduleIcon fontSize="small" />;
      default: return null;
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ExportIcon color="primary" />
          数据导出管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadTasks}
            size="small"
          >
            刷新
          </Button>
          {onClose && (
            <Button onClick={onClose} size="small">
              关闭
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* 快速导出按钮 */}
      {queryRequest && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            快速导出 (适用于小数据集)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => handleQuickExport('csv')}
              disabled={loading}
            >
              导出CSV
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={() => handleQuickExport('json')}
              disabled={loading}
            >
              导出JSON
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setExportDialogOpen(true)}
              disabled={loading}
            >
              高级导出...
            </Button>
          </Box>
        </Box>
      )}

      {/* 导出任务列表 */}
      <Typography variant="subtitle1" gutterBottom>
        导出任务历史
      </Typography>
      
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>文件名</TableCell>
              <TableCell>格式</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>进度</TableCell>
              <TableCell>文件大小</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>{task.filename}</TableCell>
                <TableCell>
                  <Chip label={(task.format || '').toUpperCase()} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Chip
                    icon={getStatusIcon(task.status)}
                    label={task.status}
                    color={getStatusColor(task.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  {task.status === 'processing' ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress 
                        variant="determinate" 
                        value={task.progress * 100} 
                        sx={{ width: 60 }}
                      />
                      <Typography variant="caption">
                        {Math.round(task.progress * 100)}%
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="caption">
                      {task.status === 'completed' ? '100%' : '-'}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{formatFileSize(task.file_size)}</TableCell>
                <TableCell>
                  <Typography variant="caption">
                    {new Date(task.created_at).toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  {task.status === 'completed' && (
                    <Tooltip title="下载">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleDownload(task.id)}
                      >
                        <DownloadIcon />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="删除">
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => handleDeleteTask(task.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography color="textSecondary">
                    暂无导出任务
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 高级导出对话框 */}
      <Dialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>高级导出设置</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>导出格式</InputLabel>
              <Select
                value={exportForm.format}
                onChange={(e) => setExportForm(prev => ({ ...prev, format: e.target.value }))}
                label="导出格式"
              >
                <MenuItem value="csv">CSV</MenuItem>
                <MenuItem value="excel">Excel</MenuItem>
                <MenuItem value="json">JSON</MenuItem>
                <MenuItem value="parquet">Parquet</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="文件名"
              value={exportForm.filename}
              onChange={(e) => setExportForm(prev => ({ ...prev, filename: e.target.value }))}
              placeholder={`export_${Date.now()}.${exportForm.format}`}
            />

            <TextField
              label="分块大小"
              type="number"
              value={exportForm.chunk_size}
              onChange={(e) => setExportForm(prev => ({ ...prev, chunk_size: parseInt(e.target.value) }))}
              helperText="大数据集分块处理的行数"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>取消</Button>
          <Button
            onClick={handleAsyncExport}
            variant="contained"
            disabled={loading}
          >
            开始导出
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default ExportManager;
