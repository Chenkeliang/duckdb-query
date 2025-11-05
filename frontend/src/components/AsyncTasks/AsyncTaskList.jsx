import {
  CheckCircle,
  Download,
  Error,
  HourglassBottom,
  PlayArrow,
  Refresh,
  Replay,
  StopCircle
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
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { ClipboardList } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { cancelAsyncTask, listAsyncTasks, retryAsyncTask } from '../../services/apiClient';

const AsyncTaskList = ({ onPreviewResult, onTaskCompleted }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document === 'undefined') {
      return false;
    }
    return document.documentElement.classList.contains('dark');
  });
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [downloadFormat, setDownloadFormat] = useState('parquet');
  const [previousTasks, setPreviousTasks] = useState([]); // 用于检测任务状态变化
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('用户手动取消');
  const [pendingCancelTaskId, setPendingCancelTaskId] = useState(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [retrySubmitting, setRetrySubmitting] = useState(false);
  const [pendingRetryTask, setPendingRetryTask] = useState(null);

  // 获取任务列表
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const response = await listAsyncTasks();
      if (response.success) {
        const newTasks = response.tasks;

        // 检测任务状态变化，通知父组件

        if (previousTasks.length > 0 && onTaskCompleted) {
          newTasks.forEach(newTask => {
            const oldTask = previousTasks.find(old => old.task_id === newTask.task_id);
            if (oldTask && oldTask.status !== newTask.status) {
              // 任务状态发生变化
              if (newTask.status === 'success' && oldTask.status !== 'success') {
                // 任务完成，通知父组件刷新数据源
                onTaskCompleted(newTask);
              }
            }
          });
        } else if (previousTasks.length === 0 && onTaskCompleted) {
          // 第一次加载时，检查是否有已完成的任务
          newTasks.forEach(newTask => {
            if (newTask.status === 'success') {
              // 第一次加载时发现已完成的任务
            }
          });
        }

        setTasks(newTasks);
        setPreviousTasks(newTasks);
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
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
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

  const handleRefresh = () => {
    fetchTasks();
  };

  // 获取状态对应的图标和颜色
  const getStatusInfo = (status) => {
    switch (status) {
      case 'queued':
        return { icon: <HourglassBottom />, background: 'var(--dq-status-info-bg)', color: 'var(--dq-status-info-fg)', label: '排队中' };
      case 'running':
        return { icon: <PlayArrow />, background: 'var(--dq-status-warning-bg)', color: 'var(--dq-status-warning-fg)', label: '运行中' };
      case 'success':
        return { icon: <CheckCircle />, background: 'var(--dq-status-success-bg)', color: 'var(--dq-status-success-fg)', label: '成功' };
      case 'failed':
        return { icon: <Error />, background: 'var(--dq-status-error-bg)', color: 'var(--dq-status-error-fg)', label: '失败' };
      default:
        return { icon: <HourglassBottom />, background: 'var(--dq-status-info-bg)', color: 'var(--dq-status-info-fg)', label: status };
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

  const menuPaperClass = `dq-theme ${isDarkMode ? 'dq-theme--dark' : 'dq-theme--light'}`;

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

  // 下载结果文件
  const handleDownloadResult = async (taskId, format = 'csv') => {
    try {
      setLoading(true);

      // 调用下载API
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

  const openCancelDialog = (taskId) => {
    setPendingCancelTaskId(taskId);
    setCancelReason('用户手动取消');
    setCancelDialogOpen(true);
    setError('');
  };

  const closeCancelDialog = () => {
    if (cancelSubmitting) return;
    setCancelDialogOpen(false);
    setPendingCancelTaskId(null);
  };

  const confirmCancelTask = async () => {
    if (!pendingCancelTaskId) return;
    try {
      setCancelSubmitting(true);
      await cancelAsyncTask(pendingCancelTaskId, {
        reason: cancelReason.trim() || undefined
      });
      setError('');
      await fetchTasks();
      setCancelDialogOpen(false);
      setPendingCancelTaskId(null);
    } catch (err) {
      setError(`取消任务失败: ${err.message}`);
    } finally {
      setCancelSubmitting(false);
    }
  };

  const openRetryDialog = (task) => {
    setPendingRetryTask(task);
    setRetryDialogOpen(true);
    setError('');
  };

  const closeRetryDialog = () => {
    if (retrySubmitting) return;
    setRetryDialogOpen(false);
    setPendingRetryTask(null);
  };

  const confirmRetryTask = async () => {
    if (!pendingRetryTask) return;
    try {
      setRetrySubmitting(true);
      const response = await retryAsyncTask(pendingRetryTask.task_id, {});
      if (!response?.success) {
        throw new Error(response?.message || '重试任务失败');
      }
      setError('');
      await fetchTasks();
    } catch (err) {
      setError(`重试任务失败: ${err.message}`);
    } finally {
      setRetrySubmitting(false);
      setRetryDialogOpen(false);
      setPendingRetryTask(null);
    }
  };


  return (
    <Box>
      <Card
        sx={{
          backgroundColor: 'var(--dq-surface-card)',
          border: '1px solid var(--dq-border-subtle)',
          boxShadow: 'var(--dq-shadow-soft)',
          borderRadius: 3
        }}
      >
        <CardContent sx={{ backgroundColor: 'transparent' }}>
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
            <Alert
              severity="error"
              sx={{
                mb: 2,
                backgroundColor: 'var(--dq-status-error-bg)',
                color: 'var(--dq-status-error-fg)',
                border: '1px solid var(--dq-border-subtle)'
              }}
            >
              {error}
            </Alert>
          )}

          {loading && tasks.length === 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {!loading && tasks.length === 0 && (
            <Typography variant="body1" sx={{ textAlign: 'center', py: 4, color: 'var(--dq-text-secondary)' }}>
              暂无异步任务
            </Typography>
          )}

          {tasks.length > 0 && (
            <TableContainer
              component={Paper}
              sx={{
                backgroundColor: 'var(--dq-surface)',
                border: '1px solid var(--dq-border-subtle)',
                boxShadow: 'none'
              }}
            >
              <Table
                sx={{
                  backgroundColor: 'var(--dq-surface)',
                  '& th': {
                    backgroundColor: 'var(--dq-surface)',
                    color: 'var(--dq-text-secondary)'
                  },
                  '& td': {
                    borderColor: 'var(--dq-border-subtle)'
                  },
                  '& tbody tr': {
                    backgroundColor: 'var(--dq-surface)',
                    transition: 'background-color 0.2s ease'
                  },
                  '& tbody tr:hover': {
                    backgroundColor: 'var(--dq-surface-hover)'
                  }
                }}
              >
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
                          {task.result?.custom_table_name && (
                            <Typography
                              variant="caption"
                              sx={{
                                backgroundColor: 'var(--dq-status-info-bg)',
                                color: 'var(--dq-status-info-fg)',
                                border: 'none',
                                display: 'block',
                                mt: 0.5
                              }}
                            >
                              表名: {task.result.custom_table_name}
                            </Typography>
                          )}
                          {task.result?.display_name && (
                            <Typography
                              variant="caption"
                              sx={{
                                backgroundColor: 'var(--dq-status-info-bg)',
                                color: 'var(--dq-status-info-fg)',
                                border: 'none',
                                display: 'block',
                                mt: 0.5
                              }}
                            >
                              显示名: {task.result.display_name}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            icon={statusInfo.icon}
                            label={statusInfo.label}
                            sx={{
                            backgroundColor: statusInfo.background,
                            color: statusInfo.color,
                            border: 'none',
                            '& .MuiChip-icon': { color: 'inherit' }
                          }}
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
                              const chips = [];

                              // 显示任务类型
                              if (queryObj.task_type) {
                                const typeLabels = {
                                  'query': '查询任务',
                                  'save_to_table': '保存到表',
                                  'export': '导出任务'
                                };
                                chips.push(
                                  <Chip
                                    key="type"
                                    label={typeLabels[queryObj.task_type] || queryObj.task_type}
                                    size="small"
                                    sx={{ backgroundColor: 'var(--dq-status-info-bg)', color: 'var(--dq-status-info-fg)', border: 'none', mt: 1, fontSize: '1rem', height: 20 }}
                                    variant="outlined"
                                  />
                                );
                              }

                              // 显示格式信息
                              if (queryObj.format) {
                                chips.push(
                                  <Chip
                                    key="format"
                                    label={`${(queryObj.format || '').toUpperCase()} 格式`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ mt: 1, fontSize: '1rem', height: 20, backgroundColor: 'var(--dq-status-info-bg)', color: 'var(--dq-status-info-fg)', border: 'none' }}
                                  />
                                );
                              }

                              return chips.length > 0 ? chips : null;
                            } catch (e) {
                              // 如果不是JSON格式，检查是否包含format关键字
                              const formatMatch = task.query.match(/format['"]?\s*:\s*['"]([^'"]+)['"]/);
                              if (formatMatch && formatMatch[1]) {
                                return (
                                  <Chip
                                    label={`${(formatMatch[1] || '').toUpperCase()} 格式`}
                                    size="small"
                                    variant="outlined"
                                    sx={{ mt: 1, fontSize: '1rem', height: 20 }}
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
                            {(task.status === 'running' || task.status === 'queued') && (
                              <Tooltip title="取消任务">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="warning"
                                  startIcon={<StopCircle />}
                                  onClick={() => openCancelDialog(task.task_id)}
                                  sx={{ textTransform: 'none' }}
                                >
                                  取消
                                </Button>
                              </Tooltip>
                            )}
                            {task.status === 'failed' && (
                              <Tooltip title="重新执行">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<Replay />}
                                  onClick={() => openRetryDialog(task)}
                                  sx={{ textTransform: 'none' }}
                                >
                                  重试
                                </Button>
                              </Tooltip>
                            )}
                            {task.status === 'success' && (
                              <>
                                <Tooltip title="下载结果文件">
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
                                    variant="outlined"
                                    sx={{ fontSize: '1rem', height: 20, backgroundColor: 'var(--dq-status-success-bg)', color: 'var(--dq-status-success-fg)', border: 'none' }}
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
        <Dialog className="dq-dialog" open={cancelDialogOpen} onClose={closeCancelDialog} maxWidth="sm" fullWidth>
          <DialogTitle>取消任务</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 420 }}>
              <Alert
                severity="warning"
                sx={{
                  backgroundColor: 'var(--dq-status-warning-bg)',
                  color: 'var(--dq-status-warning-fg)',
                  border: '1px solid var(--dq-border-subtle)'
                }}
              >
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                  将任务标记为失败，后续可通过“重试”按钮重新执行。
                </Typography>
              </Alert>
              <TextField
                label="取消原因（可留空）"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                fullWidth
                placeholder="例如：不再需要结果或 SQL 填写错误"
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeCancelDialog} disabled={cancelSubmitting}>
              保留
            </Button>
            <Button
              onClick={confirmCancelTask}
              variant="contained"
              color="warning"
              startIcon={cancelSubmitting ? <CircularProgress size={16} /> : <StopCircle />}
              disabled={cancelSubmitting}
            >
              {cancelSubmitting ? '取消中...' : '确认取消'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog className="dq-dialog" open={retryDialogOpen} onClose={closeRetryDialog} maxWidth="xs" fullWidth>
          <DialogTitle>重新执行任务</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 400 }}>
              <Typography variant="body2">
                确认要重新执行任务
                {pendingRetryTask ? `（${pendingRetryTask.task_id.slice(0, 8)}...）` : ''} 吗？
              </Typography>
              <Alert
                severity="info"
                sx={{
                  alignItems: 'flex-start',
                  backgroundColor: 'var(--dq-status-info-bg)',
                  color: 'var(--dq-status-info-fg)',
                  border: '1px solid var(--dq-border-subtle)'
                }}
              >
                <Typography variant="body2" sx={{ lineHeight: 1.6, color: 'inherit' }}>
                  重试会复用原始 SQL 与数据源配置，并新建一个任务。原任务状态将保持不变，可在完成后对比结果。
                </Typography>
              </Alert>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeRetryDialog} disabled={retrySubmitting}>
              取消
            </Button>
            <Button
              onClick={confirmRetryTask}
              variant="contained"
              startIcon={retrySubmitting ? <CircularProgress size={16} /> : <Replay />}
              disabled={retrySubmitting}
            >
              {retrySubmitting ? '重新提交中...' : '确认重试'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog className="dq-dialog" open={formatDialogOpen} onClose={closeFormatDialog} maxWidth="sm" fullWidth>
          <DialogTitle>选择下载格式</DialogTitle>
          <DialogContent>
            <Box sx={{ mt: 2 }}>
              <Alert severity="info" sx={{ mb: 2, backgroundColor: 'var(--dq-status-info-bg)', color: 'var(--dq-status-info-fg)', border: '1px solid var(--dq-border-subtle)' }}>
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                  选择您希望下载的文件格式。
                </Typography>
              </Alert>

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>下载格式</InputLabel>
                <Select
                  value={downloadFormat}
                  label="下载格式"
                  onChange={(e) => setDownloadFormat(e.target.value)}
                  MenuProps={{
                    slotProps: {
                      paper: { className: menuPaperClass }
                    }
                  }}
                >
                  <MenuItem value="csv">CSV 格式</MenuItem>
                  <MenuItem value="parquet">Parquet 格式</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ p: 2, bgcolor: 'var(--dq-surface-card)', borderRadius: 2, border: '1px solid var(--dq-border-subtle)' }}>
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

              <Alert severity="success" sx={{ mt: 2, backgroundColor: 'var(--dq-status-success-bg)', color: 'var(--dq-status-success-fg)', border: '1px solid var(--dq-border-subtle)' }}>
                <Typography variant="body2" sx={{ color: 'inherit' }}>
                  文件生成完成后将自动开始下载。
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
