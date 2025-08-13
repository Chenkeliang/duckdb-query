import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Alert,
  Chip,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  CircularProgress
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Cancel as CancelIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  InsertDriveFile as FileIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useToast } from '../../contexts/ToastContext';

const ChunkedUploader = ({ file, onUploadComplete, onUploadProgress }) => {
  const theme = useTheme();
  const { showSuccess, showError } = useToast();
  const [uploadSessions, setUploadSessions] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isCompleting, setIsCompleting] = useState(false); // 添加完成状态

  // 在组件挂载时开始上传文件
  useEffect(() => {
    console.log('ChunkedUploader useEffect triggered, file:', file);
    let isMounted = true;
    
    if (file) {
      console.log('Starting upload for file:', file.name);
      initializeUpload(file).catch(error => {
        console.error('上传过程中出现未处理的错误:', error);
        if (isMounted) {
          showError(`文件 "${file.name}" 上传失败: ${error.message}`);
        }
      });
    } else {
      console.log('No file provided to ChunkedUploader');
    }
    
    // 清理函数
    return () => {
      console.log('ChunkedUploader 组件即将卸载');
      isMounted = false;
    };
  }, [file]);

  // 文件大小格式化
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 计算文件MD5哈希
  const calculateFileHash = (file) => {
    // 暂时不计算文件哈希，返回 null
    return Promise.resolve(null);
  };

  // 初始化上传
  const initializeUpload = async (file) => {
    try {
      const chunkSize = 10 * 1024 * 1024; // 10MB chunks
      // 暂时不计算文件哈希
      const fileHash = null;

      const formData = new FormData();
      formData.append('file_name', file.name);
      formData.append('file_size', file.size.toString());
      formData.append('chunk_size', chunkSize.toString());
      formData.append('file_hash', fileHash || '');

      console.log('正在初始化上传...', {
        fileName: file.name,
        fileSize: file.size,
        chunkSize: chunkSize
      });

      const response = await fetch('/api/upload/init', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      console.log('上传初始化响应:', data);

      if (data.success) {
        const session = {
          uploadId: data.upload_id,
          file: file,
          fileName: file.name,
          fileSize: file.size,
          chunkSize: chunkSize,
          totalChunks: data.total_chunks,
          uploadedChunks: 0,
          status: 'uploading',
          progress: 0,
          startTime: Date.now(),
          fileHash: fileHash,
          error: null
        };

        setUploadSessions(prev => ({
          ...prev,
          [data.upload_id]: session
        }));

        console.log('开始上传分块...', session);
        // 开始上传分块
        await uploadChunks(session);
        console.log('分块上传完成');

        return data.upload_id;
      } else {
        const error = new Error(data.detail || '初始化上传失败');
        showError(`文件 "${file.name}" 初始化上传失败: ${error.message}`);
        throw error;
      }
    } catch (error) {
      console.error('初始化上传失败:', error);
      if (error.message) {
        showError(`文件 "${file.name}" 上传失败: ${error.message}`);
      }
      throw error;
    }
  };

  // 上传分块
  const uploadChunks = async (session) => {
    const { uploadId, file, chunkSize, totalChunks } = session;

    try {
      console.log(`开始上传 ${totalChunks} 个分块，每个分块大小: ${chunkSize} bytes`);
      
      for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
        console.log(`正在上传分块 ${chunkNumber + 1}/${totalChunks}`);
        
        // 检查是否已取消
        let currentSession = session; // 默认使用传入的会话
        
        // 尝试从状态中获取最新的会话信息
        setUploadSessions(prev => {
          if (prev[uploadId]) {
            currentSession = prev[uploadId];
          }
          return prev;
        });
        
        console.log(`当前会话状态:`, currentSession);
        
        if (!currentSession) {
          console.log('会话不存在，上传被取消');
          return;
        }
        
        if (currentSession.status === 'cancelled') {
          console.log('会话状态为已取消，上传被取消');
          return;
        }

        const start = chunkNumber * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        
        console.log(`分块 ${chunkNumber} 大小: ${chunk.size} bytes`);

        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('chunk_number', chunkNumber.toString());
        formData.append('chunk', chunk);

        const response = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();
        console.log(`分块 ${chunkNumber} 上传响应:`, data);

        if (data.success) {
          // 更新进度
          setUploadSessions(prev => ({
            ...prev,
            [uploadId]: {
              ...prev[uploadId],
              uploadedChunks: data.uploaded_chunks,
              progress: data.progress
            }
          }));

          // 通知父组件进度更新
          if (onUploadProgress) {
            onUploadProgress({
              uploadId,
              progress: data.progress,
              uploadedChunks: data.uploaded_chunks,
              totalChunks
            });
          }
        } else {
          throw new Error(data.detail || `上传分块 ${chunkNumber} 失败`);
        }
      }

      console.log('所有分块上传完成，开始调用完成接口');
      // 完成上传
      await completeUpload(uploadId);

    } catch (error) {
      console.error('上传分块失败:', error);
      setUploadSessions(prev => {
        const session = prev[uploadId];
        const errorMessage = error.message || '未知错误';
        showError(`文件 "${session?.fileName || '未知文件'}" 分块上传失败: ${errorMessage}`);
        
        if (!session) {
          return prev;
        }

        return {
          ...prev,
          [uploadId]: {
            ...session,
            status: 'failed',
            error: errorMessage
          }
        };
      });
    }
  };

  // 完成上传
  const completeUpload = async (uploadId) => {
    try {
      // 设置完成状态为加载中
      setIsCompleting(true);
      
      const formData = new FormData();
      formData.append('upload_id', uploadId);

      const response = await fetch('/api/upload/complete', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setUploadSessions(prev => {
          const session = prev[uploadId];
          if (!session) {
            console.error("Session not found for uploadId:", uploadId);
            showError("An error occurred while completing the upload: session not found.");
            return prev;
          }

          const endTime = Date.now();
          const uploadTime = endTime - session.startTime;

          // 通知父组件上传完成
          showSuccess(`文件 "${session.fileName}" 分块上传完成`);
          if (onUploadComplete) {
            onUploadComplete({
              uploadId,
              fileInfo: data.file_info,
              uploadTime
            });
          }

          return {
            ...prev,
            [uploadId]: {
              ...session,
              status: 'completed',
              progress: 100,
              uploadTime: uploadTime,
              fileInfo: data.file_info
            }
          };
        });
      } else {
        throw new Error(data.detail || '完成上传失败');
      }
    } catch (error) {
      console.error('完成上传失败:', error);
      setUploadSessions(prev => {
        const session = prev[uploadId];
        const errorMessage = error.message || '未知错误';
        showError(`文件 "${session?.fileName || '未知文件'}" 上传失败: ${errorMessage}`);
        
        if (!session) {
          return prev;
        }

        return {
          ...prev,
          [uploadId]: {
            ...session,
            status: 'failed',
            error: errorMessage
          }
        };
      });
    } finally {
      // 无论成功还是失败，都要重置加载状态
      setIsCompleting(false);
    }
  };

  // 取消上传
  const cancelUpload = async (uploadId) => {
    try {
      await fetch(`/api/upload/cancel/${uploadId}`, {
        method: 'DELETE'
      });

      setUploadSessions(prev => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          status: 'cancelled'
        }
      }));
    } catch (error) {
      console.error('取消上传失败:', error);
    }
  };

  // 获取状态图标
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'failed':
      case 'cancelled':
        return <ErrorIcon color="error" />;
      default:
        return <FileIcon color="primary" />;
    }
  };

  // 获取状态颜色
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      case 'cancelled':
        return 'default';
      default:
        return 'primary';
    }
  };

  const sessions = Object.values(uploadSessions);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
        📁 大文件分块上传
      </Typography>

      {/* 文件信息显示 */}
      {file && (
        <Card sx={{ mb: 3, borderRadius: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
              正在上传文件: {file.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              文件大小: {formatFileSize(file.size)}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* 上传会话列表 */}
      {sessions.length > 0 && (
        <Card sx={{ borderRadius: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
              上传进度 ({sessions.length})
            </Typography>

            {sessions.map((session) => (
              <Box key={session.uploadId} sx={{ mb: 2, p: 2, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                <Grid container alignItems="center" spacing={2}>
                  <Grid item>
                    {getStatusIcon(session.status)}
                  </Grid>
                  
                  <Grid item xs>
                    <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
                      {session.fileName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(session.fileSize)}
                    </Typography>
                  </Grid>

                  <Grid item>
                    <Chip
                      label={session.status === 'uploading' ? '上传中' : 
                            session.status === 'completed' ? '已完成' :
                            session.status === 'failed' ? '失败' : '已取消'}
                      color={getStatusColor(session.status)}
                      size="small"
                    />
                  </Grid>

                  <Grid item>
                    <Typography variant="body2">
                      {session.progress.toFixed(1)}%
                    </Typography>
                  </Grid>

                  {session.status === 'uploading' && (
                    <Grid item>
                      <IconButton
                        size="small"
                        onClick={() => cancelUpload(session.uploadId)}
                        color="error"
                      >
                        <CancelIcon />
                      </IconButton>
                    </Grid>
                  )}
                </Grid>

                <LinearProgress
                  variant="determinate"
                  value={session.progress}
                  sx={{ mt: 1, height: 6, borderRadius: 3 }}
                />

                {session.status === 'uploading' && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    {session.uploadedChunks} / {session.totalChunks} 分块已上传
                  </Typography>
                )}

                {isCompleting && session.status === 'uploading' && session.progress === 100 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                    <Typography variant="caption" color="text.secondary">
                      正在处理文件，请稍候...
                    </Typography>
                  </Box>
                )}

                {session.error && (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {session.error}
                  </Alert>
                )}

                {session.status === 'completed' && session.uploadTime && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    上传完成，耗时 {(session.uploadTime / 1000).toFixed(1)} 秒
                  </Typography>
                )}
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 使用说明 */}
      <Card sx={{ mt: 3, borderRadius: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
            📋 使用说明
          </Typography>
          <List dense>
            <ListItem>
              <ListItemIcon>
                <SpeedIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="分块上传"
                secondary="大文件自动分块上传，支持断点续传，提高上传成功率"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <StorageIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="格式支持"
                secondary="支持 CSV, Excel (.xlsx/.xls), JSON, Parquet 格式，最大文件大小 50GB"
              />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon color="primary" />
              </ListItemIcon>
              <ListItemText
                primary="自动处理"
                secondary="上传完成后自动加载到 DuckDB，可立即用于 SQL 查询"
              />
            </ListItem>
          </List>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ChunkedUploader;
