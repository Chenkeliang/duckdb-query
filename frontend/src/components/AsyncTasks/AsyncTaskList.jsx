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
  Button
} from '@mui/material';
import {
  Refresh,
  Download,
  Visibility,
  HourglassBottom,
  PlayArrow,
  CheckCircle,
  Error
} from '@mui/icons-material';
import { listAsyncTasks, downloadAsyncTaskResult } from '../../services/apiClient';

const AsyncTaskList = ({ onPreviewResult }) => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(null);

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

  // 下载结果文件
  const handleDownloadResult = async (taskId) => {
    try {
      await downloadAsyncTaskResult(taskId);
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
                                  <IconButton 
                                    size="small" 
                                    onClick={() => handleDownloadResult(task.task_id)}
                                  >
                                    <Download />
                                  </IconButton>
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
    </Box>
  );
};

export default AsyncTaskList;