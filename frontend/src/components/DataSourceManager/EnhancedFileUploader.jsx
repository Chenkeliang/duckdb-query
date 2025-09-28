import {
  Cancel as CancelIcon,
  CloudUpload as CloudUploadIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress // 导入 CircularProgress
  ,


  Divider,
  FormControlLabel,
  IconButton,
  Switch,
  Tooltip,
  Typography
} from '@mui/material';
import React, { useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import ChunkedUploader from '../ChunkedUpload/ChunkedUploader';

const EnhancedFileUploader = ({ onUpload, onUploadComplete }) => {
  const { showSuccess, showError } = useToast();
  const [useChunkedUpload, setUseChunkedUpload] = useState(false);
  const [autoDetectSize, setAutoDetectSize] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMode, setUploadMode] = useState('auto'); // 'auto', 'standard', 'chunked'
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // 新增上传状态
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
    console.log('切换上传模式:', event.target.checked);
    setUseChunkedUpload(event.target.checked);
    setUploadMode(event.target.checked ? 'chunked' : 'standard');
    setAutoDetectSize(false);
  };

  // 重置文件选择
  const handleReset = () => {
    setSelectedFile(null);
    setUploadMode('auto');
    setAutoDetectSize(true);
    setUseChunkedUpload(false); // 重置为标准上传
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理标准上传
  const handleStandardUpload = async (file) => {
    if (!file || !onUpload) return;

    // 前端文件大小校验
    if (file.size > LARGE_FILE_THRESHOLD) {
      showError(`文件大小超过 ${formatFileSize(LARGE_FILE_THRESHOLD)}，请切换使用分块上传。`);
      return;
    }

    setIsUploading(true); // 设置加载状态为 true

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
    } finally {
      setIsUploading(false); // 结束后设置加载状态为 false
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
          支持CSV、Excel、Parquet、JSON文件上传，自动选择最佳上传方式
        </Typography>

        {/* 上传方式选择 - 在文件选择之前 */}
        <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
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
          <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
            {useChunkedUpload ? "已启用分块上传（支持大文件和断点续传）" : "已启用标准上传（适合小文件）"}
          </Typography>
        </Box>

        {/* 文件选择和拖拽区域 - 根据上传方式显示不同界面 */}
        {!useChunkedUpload ? (
          // 标准上传界面
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
        ) : (
          // 分块上传界面（直接显示分块上传组件）
          <Box sx={{ mb: 3 }}>
            {selectedFile ? (
              <ChunkedUploader
                file={selectedFile}
                onUploadComplete={onUploadComplete}
                onUploadProgress={(progress) => {
                  console.log('Upload progress:', progress);
                }}
              />
            ) : (
              <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    请先选择文件
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    请先选择要上传的文件，然后开始分块上传
                  </Typography>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="enhanced-file-upload"
                  />
                  <Button
                    variant="contained"
                    startIcon={<CloudUploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{ borderRadius: 20 }}
                  >
                    选择文件
                  </Button>
                </CardContent>
              </Card>
            )}
          </Box>
        )}

        {/* 文件信息显示和标准上传按钮 */}
        {selectedFile && !useChunkedUpload && (
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

            {/* 上传方式提示 */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Chip
                  label="标准上传"
                  color="success"
                  variant="outlined"
                  size="small"
                />
                <Tooltip title="小于50MB的文件建议使用标准上传">
                  <IconButton size="small" sx={{ ml: 1 }}>
                    <InfoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* 标准上传按钮 */}
            <Button
              variant="contained"
              fullWidth
              onClick={() => handleStandardUpload(selectedFile)}
              sx={{ py: 1.5 }}
              disabled={isUploading}
            >
              {isUploading ? <CircularProgress size={24} color="inherit" /> : '开始上传'}
            </Button>
          </Box>
        )}

        {/* 功能说明 */}
        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            💡 <strong>智能上传提示：</strong><br />
            • 标准上传：适合小于50MB的小文件，上传速度快<br />
            • 分块上传：适合大文件，支持断点续传，提高上传成功率<br />
            • 支持格式：CSV, Excel (xls/xlsx), Parquet, JSON
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default EnhancedFileUploader;
