import React, { useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  LinearProgress,
  Alert,
  CircularProgress
} from '@mui/material';
import { CloudUpload, Link } from '@mui/icons-material';
import { uploadFileToDuckDB, readFromUrl } from '../../services/apiClient';

const DataUploadSection = ({ onDataSourceSaved, showNotification }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [tableAlias, setTableAlias] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  // 处理文件选择
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      // 自动生成表别名建议（去除文件扩展名）
      const alias = file.name.replace(/\.[^/.]+$/, "");
      setTableAlias(alias);
    }
  };

  // 处理文件上传
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('请选择文件');
      return;
    }

    if (!tableAlias.trim()) {
      setError('请输入表别名');
      return;
    }

    setLoading(true);
    setError('');
    setUploadProgress(0);

    try {
      const response = await uploadFileToDuckDB(selectedFile, tableAlias);

      if (response.success) {
        showNotification(`文件上传成功，已创建表: ${tableAlias}`, 'success');
        
        // 通知父组件数据源已保存
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: tableAlias,
            type: 'duckdb',
            name: `DuckDB表: ${tableAlias}`,
            row_count: response.row_count,
            columns: response.columns
          });
        }
        
        // 清空输入
        setSelectedFile(null);
        setTableAlias('');
      } else {
        setError(response.message || '文件上传失败');
      }
    } catch (err) {
      setError(err.message || '文件上传失败');
    } finally {
      setLoading(false);
      setUploadProgress(0);
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
        
        // 通知父组件数据源已保存
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
      }
    } catch (err) {
      setError(`URL读取失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
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
        <Box>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="file-upload"
          />
          <label htmlFor="file-upload">
            <Button
              variant="outlined"
              component="span"
              startIcon={<CloudUpload />}
              fullWidth
              sx={{ mb: 2 }}
              disabled={loading}
            >
              选择文件
            </Button>
          </label>
          
          {selectedFile && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              已选择: {selectedFile.name}
            </Typography>
          )}

          <TextField
            label="表别名"
            value={tableAlias}
            onChange={(e) => setTableAlias(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder="例如: my_data"
            disabled={loading}
          />

          {uploadProgress > 0 && (
            <LinearProgress variant="determinate" value={uploadProgress} sx={{ mb: 2 }} />
          )}

          <Button
            variant="contained"
            onClick={handleFileUpload}
            disabled={loading || !selectedFile || !tableAlias}
            fullWidth
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '上传并创建表'}
          </Button>
        </Box>
      )}

      {/* 远程文件导入 */}
      {activeTab === 1 && (
        <Box>
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
            startIcon={<Link />}
            fullWidth
            onClick={handleUrlRead}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '读取远程文件'}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default DataUploadSection;