import React, { useState, useRef, useCallback } from 'react';
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
  Divider
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

const ChunkedUploader = ({ onUploadComplete, onUploadProgress }) => {
  const theme = useTheme();
  const { showSuccess, showError } = useToast();
  const fileInputRef = useRef(null);
  const [uploadSessions, setUploadSessions] = useState({});
  const [dragOver, setDragOver] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);

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
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        const hashBuffer = await crypto.subtle.digest('MD5', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        resolve(hashHex);
      };
      reader.readAsArrayBuffer(file);
    });
  };

  // 初始化上传
  const initializeUpload = async (file) => {
    try {
      const chunkSize = 1024 * 1024; // 1MB chunks
      const fileHash = await calculateFileHash(file);

      const formData = new FormData();
      formData.append('file_name', file.name);
      formData.append('file_size', file.size.toString());
      formData.append('chunk_size', chunkSize.toString());
      formData.append('file_hash', fileHash);

      const response = await fetch('/api/upload/init', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

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

        // 开始上传分块
        uploadChunks(session);

        return data.upload_id;
      } else {
        throw new Error(data.detail || '初始化上传失败');
      }
    } catch (error) {
      console.error('初始化上传失败:', error);
      throw error;
    }
  };

  // 上传分块
  const uploadChunks = async (session) => {
    const { uploadId, file, chunkSize, totalChunks } = session;

    try {
      for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
        // 检查是否已取消
        const currentSession = uploadSessions[uploadId];
        if (!currentSession || currentSession.status === 'cancelled') {
          return;
        }

        const start = chunkNumber * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('chunk_number', chunkNumber.toString());
        formData.append('chunk', chunk);

        const response = await fetch('/api/upload/chunk', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

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

      // 完成上传
      await completeUpload(uploadId);

    } catch (error) {
      console.error('上传分块失败:', error);
      const session = uploadSessions[uploadId];
      showError(`文件 "${session?.fileName || '未知文件'}" 分块上传失败: ${error.message}`);
      setUploadSessions(prev => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          status: 'failed',
          error: error.message
        }
      }));
    }
  };

  // 完成上传
  const completeUpload = async (uploadId) => {
    try {
      const formData = new FormData();
      formData.append('upload_id', uploadId);

      const response = await fetch('/api/upload/complete', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        const endTime = Date.now();
        const session = uploadSessions[uploadId];
        const uploadTime = endTime - session.startTime;

        setUploadSessions(prev => ({
          ...prev,
          [uploadId]: {
            ...prev[uploadId],
            status: 'completed',
            progress: 100,
            uploadTime: uploadTime,
            fileInfo: data.file_info
          }
        }));

        // 通知父组件上传完成
        showSuccess(`文件 "${session.fileName}" 分块上传完成`);
        if (onUploadComplete) {
          onUploadComplete({
            uploadId,
            fileInfo: data.file_info,
            uploadTime
          });
        }
      } else {
        throw new Error(data.detail || '完成上传失败');
      }
    } catch (error) {
      console.error('完成上传失败:', error);
      const session = uploadSessions[uploadId];
      showError(`文件 "${session?.fileName || '未知文件'}" 上传失败: ${error.message}`);
      setUploadSessions(prev => ({
        ...prev,
        [uploadId]: {
          ...prev[uploadId],
          status: 'failed',
          error: error.message
        }
      }));
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

  // 处理文件选择
  const handleFileSelect = async (files) => {
    for (const file of files) {
      try {
        await initializeUpload(file);
      } catch (error) {
        console.error(`文件 ${file.name} 上传失败:`, error);
      }
    }
  };

  // 拖拽处理
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFileSelect(files);
  }, []);

  // 文件输入处理
  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files);
    handleFileSelect(files);
    e.target.value = ''; // 清空输入
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

      {/* 上传区域 */}
      <Card
        sx={{
          mb: 3,
          borderRadius: 2,
          border: dragOver ? `2px dashed ${theme.palette.primary.main}` : '2px dashed #e0e0e0',
          backgroundColor: dragOver ? theme.palette.primary.light + '10' : 'transparent',
          transition: 'all 0.3s ease'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CloudUploadIcon sx={{ fontSize: 64, color: theme.palette.primary.main, mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            拖拽文件到此处或点击选择文件
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            支持 CSV, Excel, JSON, Parquet 格式，最大 1GB
          </Typography>
          <Button
            variant="contained"
            startIcon={<CloudUploadIcon />}
            onClick={() => fileInputRef.current?.click()}
            sx={{ borderRadius: 20 }}
          >
            选择文件
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv,.xlsx,.xls,.json,.jsonl,.parquet,.pq"
            style={{ display: 'none' }}
            onChange={handleFileInputChange}
          />
        </CardContent>
      </Card>

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
                secondary="支持 CSV, Excel (.xlsx/.xls), JSON, Parquet 格式，最大文件大小 1GB"
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
