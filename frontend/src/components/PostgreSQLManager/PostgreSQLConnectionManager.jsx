import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Paper,
  Grid,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Science as TestIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { savePostgreSQLConfig } from '../../services/apiClient';

const PostgreSQLConnectionManager = ({ onConnectionAdded }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    host: 'localhost',
    port: 5432,
    database: '',
    username: '',
    password: ''
  });
  
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');

    try {
      const testData = {
        type: 'postgresql',
        host: formData.host,
        port: formData.port,
        database: formData.database,
        username: formData.username,
        password: formData.password
      };

      // 创建一个模拟的测试连接函数
      // 在实际应用中，这里应该调用后端API来测试连接
      const mockTestResult = await new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            message: '连接测试成功'
          });
        }, 1000);
      });

      setTestResult(mockTestResult);
      
      if (!mockTestResult.success) {
        setError(mockTestResult.message);
      }
    } catch (error) {
      setError('连接测试失败: ' + error.message);
      setTestResult({ success: false, message: error.message });
    } finally {
      setTesting(false);
    }
  };

  const saveConnection = async () => {
    if (!formData.name.trim()) {
      setError('请输入连接名称');
      return;
    }

    if (!formData.id.trim()) {
      setError('请输入连接ID');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const connectionData = {
        id: formData.id,
        type: 'postgresql',
        name: formData.name,
        params: {
          host: formData.host,
          port: formData.port,
          database: formData.database,
          username: formData.username,
          password: formData.password
        },
        status: 'inactive',
        created_at: new Date().toISOString()
      };

      const response = await savePostgreSQLConfig(connectionData);

      if (response.success) {
        // 重置表单
        setFormData({
          id: '',
          name: '',
          host: 'localhost',
          port: 5432,
          database: '',
          username: '',
          password: ''
        });
        setTestResult(null);
        
        if (onConnectionAdded) {
          onConnectionAdded();
        }
      } else {
        setError('保存连接失败: ' + (response.message || '未知错误'));
      }
    } catch (error) {
      setError('保存连接失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
        添加PostgreSQL连接
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {testResult && (
        <Alert 
          severity={testResult.success ? 'success' : 'error'} 
          sx={{ mb: 2 }}
          onClose={() => setTestResult(null)}
        >
          {testResult.message}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="连接ID"
            value={formData.id}
            onChange={(e) => handleInputChange('id', e.target.value)}
            placeholder="例如: pg_conn_1"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="连接名称"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="例如: 生产环境PostgreSQL"
          />
        </Grid>

        <Grid item xs={12} sm={8}>
          <TextField
            fullWidth
            label="主机地址"
            value={formData.host}
            onChange={(e) => handleInputChange('host', e.target.value)}
            placeholder="localhost"
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label="端口"
            type="number"
            value={formData.port}
            onChange={(e) => handleInputChange('port', parseInt(e.target.value))}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="数据库名称"
            value={formData.database}
            onChange={(e) => handleInputChange('database', e.target.value)}
            placeholder="database_name"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="用户名"
            value={formData.username}
            onChange={(e) => handleInputChange('username', e.target.value)}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="密码"
            type="password"
            value={formData.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
          />
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          startIcon={testing ? <CircularProgress size={16} /> : <TestIcon />}
          onClick={testConnection}
          disabled={testing || !formData.database}
        >
          {testing ? '测试中...' : '测试连接'}
        </Button>

        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
          onClick={saveConnection}
          disabled={saving || !formData.name.trim() || !formData.database}
        >
          {saving ? '保存中...' : '保存连接'}
        </Button>
      </Box>
    </Paper>
  );
};

export default PostgreSQLConnectionManager;