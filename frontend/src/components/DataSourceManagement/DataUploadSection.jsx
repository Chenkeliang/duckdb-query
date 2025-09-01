import {
  Cancel as CancelIcon,
  CloudUpload as CloudUploadIcon,
  Info as InfoIcon,
  Link as LinkIcon
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import React, { useRef, useState } from 'react';
import { readFromUrl, uploadFile } from '../../services/apiClient';
import ChunkedUploader from '../ChunkedUpload/ChunkedUploader';

const DataUploadSection = ({ onDataSourceSaved, showNotification }) => {
  const [activeTab, setActiveTab] = useState(0);
  // 本地文件上传状态
  const [selectedFile, setSelectedFile] = useState(null);
  const [useChunkedUpload, setUseChunkedUpload] = useState(false);
  const [autoDetectSize, setAutoDetectSize] = useState(true);
  const [uploadMode, setUploadMode] = useState('auto'); // 'auto', 'standard', 'chunked'
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // 表别名和其他状态
  const [tableAlias, setTableAlias] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  // 添加成功消息状态管理
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

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

  // 处理文件选择
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    processSelectedFile(file);
  };

  // 处理选中的文件（通用函数）
  const processSelectedFile = (file) => {
    if (!file) return;

    setSelectedFile(file);

    // 自动生成表别名建议（去除文件扩展名）
    const alias = file.name.replace(/\.[^/.]+$/, "");
    setTableAlias(alias);

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
    setUseChunkedUpload(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 处理标准上传
  const handleStandardUpload = async () => {
    if (!selectedFile) {
      setError('请选择文件');
      return;
    }

    // 表别名现在是可选的，如果为空则使用文件名

    // 前端文件大小校验
    if (selectedFile.size > LARGE_FILE_THRESHOLD) {
      setError(`文件大小超过 ${formatFileSize(LARGE_FILE_THRESHOLD)}，请切换使用分块上传。`);
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      const response = await uploadFile(selectedFile, tableAlias);

      if (response.success) {
        showNotification(`文件上传成功，已创建表: ${response.file_id}`, 'success');

        // 通知父组件数据源已保存
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: response.file_id,
            type: 'duckdb',
            name: `DuckDB表: ${response.file_id}`,
            row_count: response.row_count,
            columns: response.columns
          });
        }

        // 清空输入
        handleReset();
      } else {
        setError(response.message || '文件上传失败');
        showNotification(response.message || '文件上传失败', 'error');
      }
    } catch (err) {
      setError(err.message || '文件上传失败');
      showNotification(err.message || '文件上传失败', 'error');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
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

  // 处理URL读取
  const handleUrlRead = async () => {
    if (!fileUrl.trim()) {
      setError('请输入文件URL');
      return;
    }

    if (!tableAlias.trim()) {
      setError('请输入表别名');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await readFromUrl(fileUrl, tableAlias);

      if (result.success) {
        showNotification(`成功从URL读取文件并创建表: ${result.table_name}`, 'success');

        // 通知父组件数据源已保存0
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: result.table_name,
            type: 'duckdb',
            name: `DuckDB表: ${result.table_name}`,
            row_count: result.row_count,
            columns: result.columns
          });
        }

        // 清空输入
        setFileUrl('');
        setTableAlias('');
      } else {
        setError(result.message || 'URL读取失败');
        showNotification(result.message || 'URL读取失败', 'error');
      }
    } catch (err) {
      setError(`URL读取失败: ${err.message || '未知错误'}`);
      showNotification(`URL读取失败: ${err.message || '未知错误'}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 分块上传完成回调
  const handleChunkedUploadComplete = async (result) => {
    console.log('分块上传完成:', result);

    if (result && result.fileInfo) {
      try {
        const fileInfo = result.fileInfo;

        // 设置成功状态，显示成功消息
        setShowSuccessMessage(true);
        setError(''); // 清除错误状态

        showNotification(`文件上传成功，已创建表: ${fileInfo.source_id}`, 'success');

        // 通知父组件数据源已保存
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: fileInfo.source_id,
            type: 'duckdb',
            name: `DuckDB表: ${fileInfo.source_id}`,
            row_count: fileInfo.row_count || 0,
            columns: fileInfo.columns || []
          });
        }

        // 延迟清空输入，让用户看到成功消息
        setTimeout(() => {
          handleReset();
          setShowSuccessMessage(false);
        }, 3000);

      } catch (err) {
        console.error('处理分块上传结果失败:', err);
        setError('处理上传结果失败');
        showNotification('处理上传结果失败', 'error');
      }
    } else {
      // 错误情况
      const errorMessage = result?.message || result?.error || '文件上传失败';
      setError(errorMessage);
      setShowSuccessMessage(false);
      showNotification(`文件上传失败: ${errorMessage}`, 'error');
    }
  };

  return (
    <Box>
      {error && !showSuccessMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {showSuccessMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>
          文件上传成功！
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onChange={(e, newValue) => setActiveTab(newValue)}
        sx={{ mb: 2 }}
      >
        <Tab label="本地文件上传" />
        <Tab label="远程文件导入" />
      </Tabs>

      {/* 本地文件上传 */}
      {activeTab === 0 && (
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
                  id="file-upload"
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
              // 分块上传界面
              <Box sx={{ mb: 3 }}>
                {selectedFile ? (
                  <>
                    {/* 文件信息显示 */}
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

                    {/* 表别名输入 */}
                    <TextField
                      label="表别名（可选）"
                      value={tableAlias}
                      onChange={(e) => setTableAlias(e.target.value)}
                      fullWidth
                      sx={{ mb: 2 }}
                      placeholder="例如: my_data（留空将使用文件名）"
                      disabled={isUploading}
                      helperText="为DuckDB表指定一个自定义名称"
                    />

                    {/* 分块上传组件 */}
                    <ChunkedUploader
                      file={selectedFile}
                      tableAlias={tableAlias}
                      onUploadComplete={handleChunkedUploadComplete}
                      onUploadProgress={(progress) => {
                        console.log('Upload progress:', progress);
                      }}
                    />
                  </>
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
                        id="file-upload"
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

                {/* 表别名输入 */}
                <TextField
                  label="表别名（可选）"
                  value={tableAlias}
                  onChange={(e) => setTableAlias(e.target.value)}
                  fullWidth
                  sx={{ mb: 2 }}
                  placeholder="例如: my_data（留空将使用文件名）"
                  disabled={isUploading}
                  helperText="为DuckDB表指定一个自定义名称"
                />

                {/* 上传方式提示 */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Chip
                      label={selectedFile.size > LARGE_FILE_THRESHOLD ? "分块上传建议" : "标准上传"}
                      color={selectedFile.size > LARGE_FILE_THRESHOLD ? "warning" : "success"}
                      variant="outlined"
                      size="small"
                    />
                    <Tooltip title={selectedFile.size > LARGE_FILE_THRESHOLD ? "大于50MB的文件建议使用分块上传" : "小于50MB的文件建议使用标准上传"}>
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
                  onClick={handleStandardUpload}
                  sx={{ py: 1.5 }}
                  disabled={isUploading || !selectedFile}
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
                • 支持格式：CSV, Excel (.xlsx, .xls), JSON, Parquet
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 远程文件导入 */}
      {activeTab === 1 && (
        <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <LinkIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                远程文件导入
              </Typography>
            </Box>

            <TextField
              label="文件URL"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              fullWidth
              sx={{ mb: 1 }}
              placeholder="https://example.com/data.csv"
              disabled={loading}
            />

            <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                💡 <strong>支持的URL格式：</strong><br />
                • 直接文件链接：https://example.com/data.csv<br />
                • GitHub文件：https://github.com/user/repo/blob/main/data.csv (自动转换)<br />
                • 支持格式：CSV, JSON, Parquet, Excel
              </Typography>
            </Box>

            <TextField
              label="表别名"
              value={tableAlias}
              onChange={(e) => setTableAlias(e.target.value)}
              fullWidth
              sx={{ mb: 2 }}
              placeholder="例如: remote_data"
              disabled={loading}
            />

            <Button
              variant="contained"
              disabled={loading || !fileUrl || !tableAlias}
              startIcon={<LinkIcon />}
              fullWidth
              onClick={handleUrlRead}
              sx={{ py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : '读取远程文件'}
            </Button>

            {/* 功能说明 */}
            <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">
                💡 <strong>远程文件导入提示：</strong><br />
                • 支持从公共URL导入文件<br />
                • 自动处理GitHub文件链接<br />
                • 导入的文件将直接创建为DuckDB表
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default DataUploadSection;