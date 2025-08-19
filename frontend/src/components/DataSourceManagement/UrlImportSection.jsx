import React, { useState } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert
} from '@mui/material';
import { Link } from '@mui/icons-material';
import { readFromUrl } from '../../services/apiClient';

const UrlImportSection = ({ onDataSourceSaved, showNotification }) => {
  const [fileUrl, setFileUrl] = useState('');
  const [tableAlias, setTableAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        {loading ? '读取中...' : '读取远程文件'}
      </Button>
    </Box>
  );
};

export default UrlImportSection;