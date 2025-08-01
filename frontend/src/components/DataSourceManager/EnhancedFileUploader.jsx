import React, { useState, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Switch,
  FormControlLabel,
  Alert,
  Chip,
  LinearProgress,
  Divider,
  Grid,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Speed as SpeedIcon,
  Info as InfoIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import ChunkedUploader from '../ChunkedUpload/ChunkedUploader';
import { useToast } from '../../contexts/ToastContext';

const EnhancedFileUploader = ({ onUpload, onUploadComplete }) => {
  const { showSuccess, showError } = useToast();
  const [useChunkedUpload, setUseChunkedUpload] = useState(false);
  const [autoDetectSize, setAutoDetectSize] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMode, setUploadMode] = useState('auto'); // 'auto', 'standard', 'chunked'
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // 文件大小阈值（50MB）
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024;

  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 处理文件选择（从input事件）
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    processSelectedFile(file);
  };

  // 处理选中的文件（通用函数）
  const processSelectedFile = (file) => {
    if (!file) return;

    setSelectedFile(file);

    // 自动检测上传方式
    if (autoDetectSize) {
      if (file.size > LARGE_FILE_THRESHOLD) {
        setUploadMode('chunked');
        setUseChunkedUpload(true);
      } else {
        setUploadMode('standard');
        setUseChunkedUpload(false);
      }
    }
  };

  // 手动切换上传方式
  const handleUploadModeChange = (event) => {
    setUseChunkedUpload(event.target.checked);
    setUploadMode(event.target.checked ? 'chunked' : 'standard');
    setAutoDetectSize(false);
  };

  // 重置文件选择
  const handleReset = () => {
    setSelectedFile(null);
    setUploadMode('auto');
    setAutoDetectSize(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理标准上传
  const handleStandardUpload = async (file) => {
    if (!file || !onUpload) return;

    try {
      await onUpload(file);
      showSuccess(`文件 "${file.name}" 上传成功`);
      if (onUploadComplete) {
        onUploadComplete({ success: true, filename: file.name });
      }
      handleReset(); // 上传成功后重置
    } catch (error) {
      const errorMsg = `文件上传失败: ${error.message}`;
      showError(errorMsg);
      console.error('上传失败:', error);
      if (onUploadComplete) {
        onUploadComplete({ success: false, error: error.message });
      }
    }
  };

  // 拖拽事件处理
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      processSelectedFile(file);
    }
  };

  return (
    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <CloudUploadIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            智能文件上传
          </Typography>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          支持CSV、Excel文件上传，自动选择最佳上传方式
        </Typography>

        {/* 文件选择和拖拽区域 */}
        <Box sx={{ mb: 3 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="enhanced-file-upload"
          />

          {/* 拖拽上传区域 */}
          <Box
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: `2px dashed ${isDragOver ? '#1976d2' : '#ccc'}`,
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              backgroundColor: isDragOver ? 'rgba(25, 118, 210, 0.04)' : 'transparent',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              '&:hover': {
                borderColor: '#1976d2',
                backgroundColor: 'rgba(25, 118, 210, 0.04)',
              }
            }}
          >
            <CloudUploadIcon
              sx={{
                fontSize: 48,
                color: isDragOver ? '#1976d2' : '#999',
                mb: 2
              }}
            />
            <Typography variant="h6" sx={{ mb: 1, color: isDragOver ? '#1976d2' : 'text.primary' }}>
              拖放文件到此处
            </Typography>
            <Typography variant="body2" color="text.secondary">
              或点击选择文件
            </Typography>
          </Box>
        </Box>

        {/* 文件信息显示 */}
        {selectedFile && (
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    已选择文件: {selectedFile.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    大小: {formatFileSize(selectedFile.size)}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={handleReset}>
                  <CancelIcon />
                </IconButton>
              </Box>
            </Alert>

            {/* 上传方式选择 */}
            <Box sx={{ mb: 2 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={useChunkedUpload}
                        onChange={handleUploadModeChange}
                        color="primary"
                      />
                    }
                    label="使用分块上传"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {uploadMode === 'auto' && (
                      <Chip
                        icon={<SpeedIcon />}
                        label="自动选择"
                        color="primary"
                        variant="outlined"
                        size="small"
                      />
                    )}
                    {uploadMode === 'standard' && (
                      <Chip
                        label="标准上传"
                        color="success"
                        variant="outlined"
                        size="small"
                      />
                    )}
                    {uploadMode === 'chunked' && (
                      <Chip
                        icon={<SpeedIcon />}
                        label="分块上传"
                        color="warning"
                        variant="outlined"
                        size="small"
                      />
                    )}
                    <Tooltip title="大于50MB的文件建议使用分块上传">
                      <IconButton size="small" sx={{ ml: 1 }}>
                        <InfoIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ mb: 2 }} />
          </Box>
        )}

        {/* 上传按钮区域 */}
        {selectedFile && (
          <Box sx={{ mb: 3 }}>
            {!useChunkedUpload ? (
              <Button
                variant="contained"
                fullWidth
                onClick={() => handleStandardUpload(selectedFile)}
                sx={{ py: 1.5 }}
              >
                开始上传
              </Button>
            ) : (
              <ChunkedUploader
                file={selectedFile}
                onUploadComplete={onUploadComplete}
                onUploadProgress={(progress) => {
                  console.log('Upload progress:', progress);
                }}
              />
            )}
          </Box>
        )}

        {/* 功能说明 */}
        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            💡 <strong>智能上传提示：</strong><br />
            • 小文件（&lt;50MB）：使用标准上传，速度快<br />
            • 大文件（≥50MB）：自动切换到分块上传，支持断点续传<br />
            • 支持格式：CSV, Excel (.xlsx, .xls), JSON, Parquet
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default EnhancedFileUploader;
