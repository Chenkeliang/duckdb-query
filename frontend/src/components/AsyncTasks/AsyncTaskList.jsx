import {
  CheckCircle,
  Download,
  Error,
  HourglassBottom,
  PlayArrow,
  Refresh
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { ClipboardList } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { listAsyncTasks } from '../../services/apiClient';

const AsyncTaskList = ({ onPreviewResult }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [downloadFormat, setDownloadFormat] = useState('parquet');

  // 获取任务列表
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await listAsyncTasks();
      if (response.success) {
        setTasks(response.tasks);
      } else {
        setError('获取任务列表失败');
      }
    } catch (err) {
      setError(`获取任务列表失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 开始定时刷新
  useEffect(() => {
    fetchTasks(); // 立即获取一次

    const interval = setInterval(() => {
      fetchTasks();
    }, 5000); // 每5秒刷新一次

    setRefreshInterval(interval);

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  // 手动刷新
  const handleRefresh = () => {
    fetchTasks();
  };

  // 获取状态对应的图标和颜色
  const getStatusInfo = (status) => {
    switch (status) {
      case 'queued':
        return { icon: <HourglassBottom />, color: 'default', label: '排队中' };
      case 'running':
        return { icon: <PlayArrow />, color: 'primary', label: '运行中' };
      case 'success':
        return { icon: <CheckCircle />, color: 'success', label: '成功' };
      case 'failed':
        return { icon: <Error />, color: 'error', label: '失败' };
      default:
        return { icon: <HourglassBottom />, color: 'default', label: status };
    }
  };

  // 格式化时间
  const formatTime = (timeString) => {
    if (!timeString) return '-';
    return new Date(timeString).toLocaleString('zh-CN');
  };

  // 格式化执行时间
  const formatExecutionTime = (seconds) => {
    if (!seconds) return '-';
    if (seconds < 60) {
      return `${seconds.toFixed(1)}秒`;
    } else {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}分${remainingSeconds.toFixed(0)}秒`;
    }
  };

  // 解析查询信息以提取格式
  const parseQueryInfo = (query) => {
    try {
      // 尝试解析JSON格式的查询信息
      const queryInfo = JSON.parse(query.replace(/'/g, '"'));
      if (typeof queryInfo === 'object' && queryInfo.format) {
        return queryInfo.format.toLowerCase();
      }
    } catch (e) {
      // 如果不是JSON格式，尝试从字符串中提取格式信息
      const formatMatch = query.match(/['"]format['"]\s*:\s*['"]([^'"]+)['"]/);
      if (formatMatch && formatMatch[1]) {
        return formatMatch[1].toLowerCase();
      }
    }
    // 默认返回parquet格式
    return 'parquet';
  };

  // 根据任务ID获取任务对象
  const getTaskById = (taskId) => {
    if (!taskId) return null;
    return tasks.find(task => task.task_id === taskId) || null;
  };

  // 下载结果文件 - 一步完成生成和下载
  const handleDownloadResult = async (taskId, format = 'csv') => {
    try {
      setLoading(true);

      // 调用一步完成的下载API
      const response = await fetch(`/api/async-tasks/${taskId}/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format }),
      });

      if (!response.ok) {
        // 尝试解析错误响应，如果失败则使用默认错误信息
        let errorMessage = '下载失败';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || '下载失败';
        } catch (e) {
          // 如果无法解析JSON，使用状态文本
          errorMessage = response.statusText || '下载失败';
        }
        throw new Error(errorMessage);
      }

      // 获取文件名
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `task-${taskId}-result.${format}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
      }

      // 创建下载链接
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (err) {
      setError(`下载结果失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 打开格式选择对话框
  const openFormatDialog = (taskId) => {
    setSelectedTaskId(taskId);
    setFormatDialogOpen(true);
  };

  // 关闭格式选择对话框
  const closeFormatDialog = () => {
    setFormatDialogOpen(false);
    setSelectedTaskId(null);
    setDownloadFormat('parquet');
  };

  // 确认下载格式并开始下载
  const confirmDownloadWithFormat = async () => {
    try {
      await handleDownloadResult(selectedTaskId, downloadFormat);
      closeFormatDialog();
    } catch (err) {
      setError(`下载结果失败: ${err.message}`);
    }
  };

  return (
    <Box>
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ClipboardList size={24} />
              异步任务列表
            </Typography>
            <IconButton onClick={handleRefresh} disabled={loading}>
              <Refresh />
            </IconButton>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
          )}

          {loading && tasks.length === 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!loading && tasks.length === 0 && (
            <Typography variant="body1" sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              暂无异步任务
            </Typography>
          )}

          {tasks.length > 0 && (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>任务ID</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>查询语句</TableCell>
                    <TableCell>创建时间</TableCell>
                    <TableCell>执行时间</TableCell>
                    <TableCell>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tasks.map((task) => {
                    const statusInfo = getStatusInfo(task.status);
                    return (
                      <TableRow key={task.task_id}>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {task.task_id.substring(0, 8)}...
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={statusInfo.icon}
                            label={statusInfo.label}
                            color={statusInfo.color}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip title={task.query}>
                            <Typography
                              variant="body2"
                              sx={{
                                maxWidth: 200,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {task.query}
                            </Typography>
                          </Tooltip>
                          {(() => {
                            // 尝试解析查询中的格式信息
                            try {
                              const queryObj = JSON.parse(task.query.replace(/'/g, '"'));
                              if (queryObj && queryObj.format) {
                                return (
                                  <Chip
                                    label={`${(queryObj.format || '').toUpperCase()} 格式`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ mt: 1, fontSize: '0.7rem', height: 20 }}
                                  />
                                );
                              }
                            } catch (e) {
                              // 如果不是JSON格式，检查是否包含format关键字
                              const formatMatch = task.query.match(/format['"]?\s*:\s*['"]([^'"]+)['"]/);
                              if (formatMatch && formatMatch[1]) {
                                return (
                                  <Chip
                                    label={`${(formatMatch[1] || '').toUpperCase()} 格式`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ mt: 1, fontSize: '0.7rem', height: 20 }}
                                  />
                                );
                              }
                            }
                            return null;
                          })()}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {formatTime(task.created_at)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {task.status === 'success' || task.status === 'failed'
                              ? formatExecutionTime(task.execution_time)
                              : '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                            {task.status === 'success' && (
                              <>
                                <Tooltip title="按需生成并下载文件">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<Download />}
                                    onClick={() => openFormatDialog(task.task_id)}
                                    sx={{ textTransform: 'none' }}
                                  >
                                    下载
                                  </Button>
                                </Tooltip>
                                {task.file_generated && (
                                  <Chip
                                    label="文件已生成"
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                    sx={{ fontSize: '0.7rem', height: 20 }}
                                  />
                                )}
                                {!task.file_generated && (
                                  <Chip
                                    label="按需生成"
                                    size="small"
                                    color="info"
                                    variant="outlined"
                                    sx={{ fontSize: '0.7rem', height: 20 }}
                                  />
                                )}
                              </>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* 格式选择对话框 */}
      <Dialog open={formatDialogOpen} onClose={closeFormatDialog} maxWidth="sm" fullWidth>
        <DialogTitle>选择下载格式</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                选择您希望下载的文件格式。系统将按需生成文件。
              </Typography>
            </Alert>

            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>下载格式</InputLabel>
              <Select
                value={downloadFormat}
                label="下载格式"
                onChange={(e) => setDownloadFormat(e.target.value)}
              >
                <MenuItem value="csv">CSV 格式</MenuItem>
                <MenuItem value="parquet">Parquet 格式</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                格式说明:
              </Typography>
              <Typography variant="body2" component="div">
                {downloadFormat === 'parquet' ? (
                  <>
                    • <strong>Parquet</strong>: 高效的列式存储格式<br />
                    • 适合大数据分析<br />
                    • 文件体积小，读取速度快<br />
                    • 需要专门工具打开
                  </>
                ) : (
                  <>
                    • <strong>CSV</strong>: 通用的表格数据格式<br />
                    • 兼容性好，几乎所有工具都支持<br />
                    • 易于在Excel等工具中打开<br />
                    • 文件体积相对较大
                  </>
                )}
              </Typography>
            </Box>

            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography variant="body2">
                文件将按需生成，节省存储空间。生成完成后将自动开始下载。
              </Typography>
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeFormatDialog}>取消</Button>
          <Button
            onClick={confirmDownloadWithFormat}
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <Download />}
          >
            {loading ? '生成中...' : '生成并下载'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AsyncTaskList;

