import {
  Cancel as CancelIcon,
  Info as InfoIcon,
  Link as LinkIcon
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  MenuItem,
  Tab,
  Tabs,
  Tooltip,
  Typography
} from '@mui/material';
import { FileText, FolderOpen, HardDrive, Lightbulb, RefreshCw, Upload } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  browseServerDirectory,
  getServerMounts,
  importServerFile,
  readFromUrl,
  uploadFile
} from '../../services/apiClient';
import ChunkedUploader from '../ChunkedUpload/ChunkedUploader';
import {
  CardSurface,
  RoundedButton,
  RoundedSwitch,
  RoundedTextField,
  SectionHeader
} from '../common';
import ExcelSheetSelector from './ExcelSheetSelector';

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

  // 服务器目录导入状态
  const [serverMounts, setServerMounts] = useState([]);
  const [serverMountLoading, setServerMountLoading] = useState(false);
  const [selectedServerMount, setSelectedServerMount] = useState('');
  const [serverEntries, setServerEntries] = useState([]);
  const [serverBreadcrumbs, setServerBreadcrumbs] = useState([]);
  const [serverCurrentPath, setServerCurrentPath] = useState('');
  const [serverSelectedFile, setServerSelectedFile] = useState(null);
  const [serverAlias, setServerAlias] = useState('');
  const [serverBrowseError, setServerBrowseError] = useState('');
  const [serverBrowseLoading, setServerBrowseLoading] = useState(false);
  const [serverImportLoading, setServerImportLoading] = useState(false);

  const filteredServerEntries = useMemo(
    () =>
      serverEntries.filter(
        (entry) => entry.type === 'directory' || entry.supported
      ),
    [serverEntries]
  );

  // 添加成功消息状态管理
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [pendingExcel, setPendingExcel] = useState(null);
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);

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

  const formatModifiedTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString();
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

  const handleExcelPending = (pending) => {
    if (!pending) return;
    setPendingExcel(pending);
    setExcelDialogOpen(true);
  };

  const handleExcelSelectorClose = () => {
    setExcelDialogOpen(false);
    setPendingExcel(null);
  };

  const handleExcelImportComplete = (result) => {
    const items = result?.results || [];
    items.forEach(item => {
      onDataSourceSaved?.({
        id: item.target_table,
        type: 'duckdb',
        name: `DuckDB表: ${item.target_table}`,
        row_count: item.row_count,
        columns: item.columns || []
      });
    });
    handleExcelSelectorClose();
  };

  const handleServerMountChange = async (newPath) => {
    setSelectedServerMount(newPath);
    await loadServerDirectory(newPath);
  };

  const handleServerEntryClick = async (entry) => {
    if (entry.type === 'directory') {
      await loadServerDirectory(entry.path);
      return;
    }
    if (!entry.supported) {
      showNotification?.('该文件类型暂不支持，请选择 CSV/Excel/Parquet/JSON 文件', 'warning');
      return;
    }
    setServerSelectedFile(entry);
    setServerAlias(entry.suggested_table_name || entry.name.replace(/\.[^/.]+$/, ''));
  };

  const handleServerBreadcrumbClick = async (crumb) => {
    if (!crumb?.path) return;
    await loadServerDirectory(crumb.path);
  };

  const loadServerDirectory = useCallback(async (targetPath) => {
    if (!targetPath) return;
    setServerBrowseLoading(true);
    setServerBrowseError('');
    setServerSelectedFile(null);
    setServerAlias('');
    try {
      const response = await browseServerDirectory(targetPath);
      setServerEntries(response.entries || []);
      setServerBreadcrumbs(response.breadcrumbs || []);
      setServerCurrentPath(response.path || targetPath);
    } catch (err) {
      setServerBrowseError(err?.response?.data?.detail || err.message || '无法读取目录');
    } finally {
      setServerBrowseLoading(false);
    }
  }, []);

  const loadServerMounts = useCallback(async () => {
    setServerMountLoading(true);
    setServerBrowseError('');
    try {
      const response = await getServerMounts();
      const mounts = response?.mounts || [];
      setServerMounts(mounts);
      if (mounts.length > 0) {
        const firstMount = mounts[0];
        setSelectedServerMount(firstMount.path);
        await loadServerDirectory(firstMount.path);
      } else {
        setServerEntries([]);
      }
    } catch (err) {
      setServerBrowseError(err?.response?.data?.detail || err.message || '无法获取服务器目录');
    } finally {
      setServerMountLoading(false);
    }
  }, [loadServerDirectory]);

  useEffect(() => {
    if (activeTab === 2 && serverMounts.length === 0 && !serverMountLoading) {
      loadServerMounts();
    }
  }, [activeTab, serverMounts.length, serverMountLoading, loadServerMounts]);

  const handleServerImport = async () => {
    if (!serverSelectedFile) {
      showNotification?.('请先选择一个文件', 'warning');
      return;
    }
    const alias = (serverAlias || serverSelectedFile.suggested_table_name || '').trim();
    if (!alias) {
      showNotification?.('请输入表别名', 'warning');
      return;
    }

    setServerImportLoading(true);
    try {
      const response = await importServerFile({
        path: serverSelectedFile.path,
        table_alias: alias,
      });

      showNotification?.(response.message || '导入成功', 'success');
      onDataSourceSaved?.({
        id: response.table_name,
        type: 'duckdb',
        name: `DuckDB表: ${response.table_name}`,
        row_count: response.row_count,
        columns: response.columns || [],
      });

      setServerSelectedFile(null);
      setServerAlias('');
    } catch (err) {
      showNotification?.(err?.response?.data?.detail || err.message || '导入失败', 'error');
    } finally {
      setServerImportLoading(false);
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

      if (response?.pending_excel) {
        showNotification('Excel 文件上传成功，请选择需要导入的工作表', 'info');
        handleExcelPending({
          ...response.pending_excel,
          file_id: response.pending_excel.file_id
        });
        handleReset();
        return;
      }

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
    if (result?.pending_excel) {
      showNotification('Excel 文件上传成功，请选择需要导入的工作表', 'info');
      handleExcelPending({
        ...result.pending_excel,
        file_id: result.pending_excel.file_id
      });
      setShowSuccessMessage(false);
      setError('');
      handleReset();
      return;
    }

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

        handleReset();

        // 延迟清空输入，让用户看到成功消息
        setTimeout(() => {
          setShowSuccessMessage(false);
        }, 3000);

      } catch (err) {
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
        <Alert severity="error" sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}>{error}</Alert>
      )}

      {showSuccessMessage && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}>
          文件上传成功！
        </Alert>
      )}

      <Tabs
        value={activeTab}
        onChange={(e, newValue) => setActiveTab(newValue)}
        sx={{
          mb: 2,
          '& .MuiTabs-indicator': {
            backgroundColor: 'var(--dq-accent-primary)',
            height: 2,
            borderRadius: 999
          },
          '& .MuiTab-root': {
            fontSize: 'var(--dq-tab-font-size-secondary)',
            fontWeight: 'var(--dq-tab-font-weight-secondary-inactive)',
            textTransform: 'none',
            minHeight: 48,
            color: 'var(--dq-text-tertiary)',
            backgroundColor: 'transparent',
            '&.Mui-selected': {
              color: 'var(--dq-tab-active-color)',
              backgroundColor: 'transparent',
              fontWeight: 'var(--dq-tab-font-weight-secondary)'
            },
            '&:hover': {
              color: 'var(--dq-text-primary)',
              backgroundColor: 'transparent'
            }
          }
        }}
      >
        <Tab label="本地文件上传" sx={{ mr: 2 }} />
        <Tab label="远程文件导入" />
        <Tab label="服务器目录" sx={{ ml: 2 }} />
      </Tabs>

      {/* 本地文件上传 */}
      {activeTab === 0 && (
        <CardSurface padding={3} elevation sx={{ borderColor: 'var(--dq-border-card)', borderRadius: 'var(--dq-radius-card)' }}>
          <SectionHeader
            title="智能文件上传"
            subtitle="支持 CSV、Excel、Parquet、JSON 文件上传，自动选择最佳上传方式"
            icon={<Upload size={18} color="var(--dq-accent-primary)" />}
          />

          {/* 上传方式选择 - 在文件选择之前 */}
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'var(--dq-surface)', borderRadius: 'var(--dq-radius-card)', border: '1px solid var(--dq-border-subtle)' }}>
            <FormControlLabel
              control={
                <RoundedSwitch
                  checked={useChunkedUpload}
                  onChange={handleUploadModeChange}
                  size="small"
                />
              }
              label="使用分块上传"
              sx={{ gap: 1.5, '& .MuiSwitch-root': { mr: 1 } }}
            />
            <Typography variant="caption" sx={{ ml: 2, color: 'var(--dq-text-tertiary)' }}>
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
                  border: '2px dashed',
                  borderColor: isDragOver ? 'var(--dq-accent-primary)' : 'var(--dq-border-subtle)',
                  borderRadius: 'var(--dq-radius-card)',
                  p: 4,
                  textAlign: 'center',
                  backgroundColor: isDragOver
                    ? 'var(--dq-surface-hover)'
                    : 'transparent',
                  transition: 'background-color 0.2s ease, border-color 0.2s ease',
                  cursor: 'pointer',
                  '&:hover': {
                    borderColor: 'var(--dq-accent-primary)',
                    backgroundColor: 'var(--dq-surface-hover)'
                  }
                }}
              >
                <Upload
                  sx={{
                    fontSize: 48,
                    color: isDragOver ? 'var(--dq-accent-primary)' : 'var(--dq-text-tertiary)',
                    mb: 2
                  }}
                />
                <Typography variant="h6" sx={{ mb: 1, color: isDragOver ? 'var(--dq-accent-primary)' : 'var(--dq-text-primary)' }}>
                  拖放文件到此处
                </Typography>
                <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)' }}>
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
                  <Alert severity="info" sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          已选择文件: {selectedFile.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>
                          大小: {formatFileSize(selectedFile.size)}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={handleReset}>
                        <CancelIcon />
                      </IconButton>
                    </Box>
                  </Alert>

                  {/* 表别名输入 */}
                  <RoundedTextField
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
                    }}
                  />
                </>
              ) : (
                <CardSurface padding={3} sx={{ borderColor: 'var(--dq-border-subtle)', textAlign: 'center' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                    请先选择文件
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)', mb: 3 }}>
                    选择要上传的文件后即可开始分块上传
                  </Typography>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="file-upload"
                  />
                  <RoundedButton
                    startIcon={<Upload size={20} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    选择文件
                  </RoundedButton>
                </CardSurface>
              )}
            </Box>
          )}

          {/* 文件信息显示和标准上传按钮 */}
          {selectedFile && !useChunkedUpload && (
            <Box sx={{ mb: 3 }}>
              <Alert severity="info" sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      已选择文件: {selectedFile.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>
                      大小: {formatFileSize(selectedFile.size)}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={handleReset}>
                    <CancelIcon />
                  </IconButton>
                </Box>
              </Alert>

              {/* 表别名输入 */}
              <RoundedTextField
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
              <RoundedButton
                fullWidth
                onClick={handleStandardUpload}
                sx={{ py: 1.5 }}
                disabled={isUploading || !selectedFile}
              >
                {isUploading ? <CircularProgress size={24} color="inherit" /> : '开始上传'}
              </RoundedButton>
            </Box>
          )}

          {/* 功能说明 */}
          <Box sx={{ mt: 3, p: 2, backgroundColor: 'var(--dq-surface-alt)', borderRadius: 'var(--dq-radius-card)', border: '1px solid var(--dq-border-subtle)' }}>
            <Typography variant="caption" sx={{ color: 'var(--dq-text-secondary)' }}>
              <Lightbulb size={16} style={{ marginRight: '8px' }} />
              <strong>智能上传提示：</strong><br />
              • 标准上传：适合小于50MB的小文件，上传速度快<br />
              • 分块上传：适合大文件，支持断点续传，提高上传成功率<br />
              • 支持格式：CSV, Excel (xls/xlsx), Parquet, JSON
            </Typography>
          </Box>
        </CardSurface>
      )}

      {/* 远程文件导入 */}
      {activeTab === 1 && (
        <CardSurface padding={3} elevation sx={{ borderColor: 'var(--dq-border-card)', borderRadius: 'var(--dq-radius-card)' }}>
          <SectionHeader
            title="远程文件导入"
            subtitle="支持从公共 URL 或 GitHub 仓库读取常见文件格式"
            icon={<LinkIcon sx={{ color: 'var(--dq-accent-primary)' }} />}
          />

          <RoundedTextField
            label="文件URL"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            fullWidth
            sx={{ mb: 1 }}
            placeholder="https://example.com/data.csv"
            disabled={loading}
          />

          <Box sx={{ mb: 2, p: 1.5, backgroundColor: 'var(--dq-surface)', borderRadius: 'var(--dq-radius-card)', border: '1px solid var(--dq-border-subtle)' }}>
            <Typography variant="caption" sx={{ color: 'var(--dq-text-secondary)' }}>
              <Lightbulb size={16} style={{ marginRight: '8px' }} />
              <strong>支持的URL格式：</strong><br />
              • 直接文件链接：https://example.com/data.csv<br />
              • GitHub文件：https://github.com/user/repo/blob/main/data.csv (自动转换)<br />
              • 支持格式：CSV, Excel (xls/xlsx), Parquet, JSON
            </Typography>
          </Box>

          <RoundedTextField
            label="表别名"
            value={tableAlias}
            onChange={(e) => setTableAlias(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder="例如: remote_data"
            disabled={loading}
          />

          <RoundedButton
            disabled={loading || !fileUrl || !tableAlias}
            startIcon={<LinkIcon />}
            fullWidth
            onClick={handleUrlRead}
            sx={{ py: 1.5 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '读取远程文件'}
          </RoundedButton>

          {/* 功能说明 */}
          <Box sx={{ mt: 3, p: 2, backgroundColor: 'var(--dq-surface)', borderRadius: 'var(--dq-radius-card)', border: '1px solid var(--dq-border-subtle)' }}>
            <Typography variant="caption" sx={{ color: 'var(--dq-text-secondary)' }}>
              <Lightbulb size={16} style={{ marginRight: '8px' }} />
              <strong>远程文件导入提示：</strong><br />
              • 支持从公共URL导入文件<br />
              • 自动处理GitHub文件链接<br />
              • 导入的文件将直接创建为DuckDB表
            </Typography>
          </Box>
        </CardSurface>
      )}

      {/* 服务器目录导入 */}
      {activeTab === 2 && (
        <CardSurface padding={3} elevation sx={{ borderColor: 'var(--dq-border-card)', borderRadius: 'var(--dq-radius-card)' }}>
          <SectionHeader
            title="服务器目录导入"
            subtitle="直接从容器挂载目录读取 CSV / Excel / Parquet / JSON 文件"
            icon={<HardDrive size={18} color="var(--dq-accent-primary)" />}
          />

          <Alert severity="info" sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}>
            <Typography variant="body2">
              请运维在 docker-compose / K8s 中挂载目录并更新 <code>server_data_mounts</code> 配置，重启后即可在此处浏览文件。
              <br />
              仅能访问配置文件中允许的目录，其他路径不会显示。
            </Typography>
          </Alert>

          {serverMountLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress size={32} />
            </Box>
          ) : serverMounts.length === 0 ? (
            <Alert severity="warning" sx={{ borderRadius: 'var(--dq-radius-card)' }}>
              未检测到可用的挂载目录。请在配置文件 <code>server_data_mounts</code> 中添加条目并重启服务。
            </Alert>
          ) : (
            <>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
                <RoundedTextField
                  select
                  label="选择挂载目录"
                  value={selectedServerMount}
                  onChange={(e) => handleServerMountChange(e.target.value)}
                  sx={{ flex: 1 }}
                >
                  {serverMounts.map((mount) => (
                    <MenuItem key={mount.path} value={mount.path}>
                      {mount.label} {mount.exists === false ? '(目录不存在)' : ''}
                    </MenuItem>
                  ))}
                </RoundedTextField>
                <IconButton
                  aria-label="refresh-directory"
                  onClick={() => loadServerDirectory(selectedServerMount || serverMounts[0]?.path)}
                  sx={{ border: '1px solid var(--dq-border-subtle)', borderRadius: 'var(--dq-radius-card)' }}
                >
                  <RefreshCw size={18} />
                </IconButton>
              </Box>

              {serverBreadcrumbs.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                  {serverBreadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                      <Chip
                        label={crumb.name}
                        icon={crumb.is_root ? <HardDrive size={14} /> : <FolderOpen size={14} />}
                        onClick={() => handleServerBreadcrumbClick(crumb)}
                        sx={{ cursor: 'pointer' }}
                      />
                      {index < serverBreadcrumbs.length - 1 && (
                        <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>/</Typography>
                      )}
                    </React.Fragment>
                  ))}
                </Box>
              )}

              {serverBrowseError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}>
                  {serverBrowseError}
                </Alert>
              )}

              <Box
                sx={{
                  border: '1px solid var(--dq-border-subtle)',
                  borderRadius: 'var(--dq-radius-card)',
                  mb: 3,
                  maxHeight: 320,
                  overflowY: 'auto',
                  backgroundColor: 'var(--dq-surface)'
                }}
              >
                {serverBrowseLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress size={28} />
                  </Box>
                ) : filteredServerEntries.length === 0 ? (
                  <Typography variant="body2" sx={{ p: 3, color: 'var(--dq-text-tertiary)' }}>
                    当前目录暂无可导入的文件
                  </Typography>
                ) : (
                  filteredServerEntries.map((entry) => {
                    const isSelected = serverSelectedFile?.path === entry.path;
                    return (
                      <Box
                        key={entry.path}
                        onClick={() => handleServerEntryClick(entry)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          p: 1.5,
                          borderBottom: '1px solid var(--dq-border-subtle)',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'color-mix(in oklab, var(--dq-accent-primary) 12%, transparent)' : 'transparent',
                          '&:hover': { backgroundColor: 'var(--dq-surface-hover)' }
                        }}
                      >
                        {entry.type === 'directory' ? (
                          <FolderOpen size={20} color="var(--dq-text-secondary)" />
                        ) : (
                          <FileText size={20} color={entry.supported ? 'var(--dq-accent-primary)' : 'var(--dq-text-tertiary)'} />
                        )}
                        <Box sx={{ flexGrow: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: entry.type === 'directory' ? 600 : 500 }}>
                            {entry.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>
                            {entry.type === 'directory'
                              ? '文件夹'
                              : `${(entry.extension || '').toUpperCase()} · ${formatFileSize(entry.size || 0)}`} · {formatModifiedTime(entry.modified)}
                          </Typography>
                        </Box>
                        {entry.type === 'file' && (
                          <Chip
                            size="small"
                            label={entry.supported ? '可导入' : '不支持'}
                            color={entry.supported ? 'success' : 'default'}
                          />
                        )}
                      </Box>
                    );
                  })
                )}
              </Box>

              {serverSelectedFile && (
                <Alert severity="success" sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}>
                  已选择文件：{serverSelectedFile.name}（{formatFileSize(serverSelectedFile.size || 0)}）
                </Alert>
              )}

              <RoundedTextField
                label="表别名"
                value={serverAlias}
                onChange={(e) => setServerAlias(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
                placeholder="例如: server_data"
                helperText="导入后会在DuckDB中创建此名称的表"
                disabled={!serverSelectedFile || serverImportLoading}
              />

              <RoundedButton
                fullWidth
                startIcon={!serverImportLoading && <Upload size={18} />}
                disabled={!serverSelectedFile || serverImportLoading}
                onClick={handleServerImport}
                sx={{ py: 1.5 }}
              >
                {serverImportLoading ? <CircularProgress size={22} color="inherit" /> : '导入到 DuckDB'}
              </RoundedButton>
            </>
          )}
        </CardSurface>
      )}

      <ExcelSheetSelector
        open={excelDialogOpen}
        pendingInfo={pendingExcel}
        onClose={handleExcelSelectorClose}
        onImported={handleExcelImportComplete}
        showNotification={showNotification}
      />
    </Box>
  );
};

export default DataUploadSection;
