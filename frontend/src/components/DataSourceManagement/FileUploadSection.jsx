import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  LinearProgress,
  Alert
} from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import { uploadFileToDuckDB } from '../../services/apiClient';

const FileUploadSection = ({ onDataSourceSaved, showNotification }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [tableAlias, setTableAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

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

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}
      
      <input
        type="file"
        accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
        onChange={(e) => setSelectedFile(e.target.files[0])}
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
        {loading ? '上传中...' : '上传并创建表'}
      </Button>
    </Box>
  );
};

export default FileUploadSection;