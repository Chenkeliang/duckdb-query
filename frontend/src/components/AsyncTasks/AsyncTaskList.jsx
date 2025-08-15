import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider
} from '@mui/material';
import {
  Refresh,
  Download,
  Visibility,
  HourglassBottom,
  PlayArrow,
  CheckCircle,
  Error,
  ArrowDropDown
} from '@mui/icons-material';
import { listAsyncTasks, downloadAsyncTaskResult } from '../../services/apiClient';

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

  // 下载结果文件
  const handleDownloadResult = async (taskId) => {
    try {
      await downloadAsyncTaskResult(taskId);
    } catch (err) {
      setError(`下载结果失败: ${err.message}`);
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
      await downloadAsyncTaskResult(selectedTaskId);
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
            <Typography variant="h5" component="h2">
              📋 异步任务列表
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
                                    label={`${queryObj.format.toUpperCase()} 格式`} 
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
                                    label={`${formatMatch[1].toUpperCase()} 格式`} 
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
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            {task.status === 'success' && (
                              <>
                                <Tooltip title="下载完整结果">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<Download />}
                                    onClick={() => openFormatDialog(task.task_id)}
                                    sx={{ textTransform: 'none' }}
                                  >
                                    下载 ({parseQueryInfo(task.query).toUpperCase()})
                                  </Button>
                                </Tooltip>
                                <Tooltip title="预览结果">
                                  <IconButton 
                                    size="small" 
                                    onClick={() => onPreviewResult(task.task_id)}
                                  >
                                    <Visibility />
                                  </IconButton>
                                </Tooltip>
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
      <Dialog open={formatDialogOpen} onClose={closeFormatDialog} maxWidth="xs" fullWidth>
        <DialogTitle>任务信息</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2">
                此任务在创建时已指定输出格式为 <strong>{parseQueryInfo(getTaskById(selectedTaskId)?.query || '{}').toUpperCase()}</strong> 格式。
              </Typography>
            </Alert>
            
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                格式说明:
              </Typography>
              <Typography variant="body2" component="div">
                {parseQueryInfo(getTaskById(selectedTaskId)?.query || '{}') === 'parquet' ? (
                  <>
                    • <strong>Parquet</strong>: 高效的列式存储格式<br/>
                    • 适合大数据分析<br/>
                    • 文件体积小，读取速度快<br/>
                    • 需要专门工具打开
                  </>
                ) : (
                  <>
                    • <strong>CSV</strong>: 通用的表格数据格式<br/>
                    • 兼容性好，几乎所有工具都支持<br/>
                    • 易于在Excel等工具中打开<br/>
                    • 文件体积相对较大
                  </>
                )}
              </Typography>
            </Box>
            
            <Alert severity="warning" sx={{ mt: 2 }}>
              <Typography variant="body2">
                注意：任务完成后格式已锁定。如需其他格式，请重新提交任务并选择所需格式。
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
          >
            确认下载
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AsyncTaskList;

