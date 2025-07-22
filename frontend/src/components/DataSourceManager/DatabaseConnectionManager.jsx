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

const DatabaseConnectionManager = ({ onConnectionAdded }) => {
  const [formData, setFormData] = useState({
    type: 'mysql',
    name: '',
    host: 'localhost',
    port: 3306,
    database: '',
    username: '',
    password: ''
  });
  
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const dbTypes = [
    { value: 'mysql', label: 'MySQL', defaultPort: 3306 },
    { value: 'postgresql', label: 'PostgreSQL', defaultPort: 5432 },
    { value: 'sqlite', label: 'SQLite', defaultPort: null }
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // 当数据库类型改变时，自动设置默认端口
    if (field === 'type') {
      const dbType = dbTypes.find(db => db.value === value);
      if (dbType && dbType.defaultPort) {
        setFormData(prev => ({
          ...prev,
          port: dbType.defaultPort
        }));
      }
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');

    try {
      const testData = {
        type: formData.type,
        host: formData.host,
        port: formData.port,
        database: formData.database,
        username: formData.username,
        password: formData.password
      };

      const response = await fetch('/api/test_connection_simple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });

      const result = await response.json();
      setTestResult(result);
      
      if (!result.success) {
        setError(result.message);
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

    setSaving(true);
    setError('');

    try {
      const connectionData = {
        id: `conn_${Date.now()}`,
        type: formData.type,
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

      const response = await fetch('/api/database_connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionData)
      });

      if (response.ok) {
        // 重置表单
        setFormData({
          type: 'mysql',
          name: '',
          host: 'localhost',
          port: 3306,
          database: '',
          username: '',
          password: ''
        });
        setTestResult(null);
        
        if (onConnectionAdded) {
          onConnectionAdded();
        }
      } else {
        const errorData = await response.json();
        setError('保存连接失败: ' + (errorData.detail || '未知错误'));
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
        添加数据库连接
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
          <FormControl fullWidth>
            <InputLabel>数据库类型</InputLabel>
            <Select
              value={formData.type}
              label="数据库类型"
              onChange={(e) => handleInputChange('type', e.target.value)}
            >
              {dbTypes.map(db => (
                <MenuItem key={db.value} value={db.value}>
                  {db.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="连接名称"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="例如: 生产环境MySQL"
          />
        </Grid>

        {formData.type !== 'sqlite' && (
          <>
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
          </>
        )}

        <Grid item xs={12}>
          <TextField
            fullWidth
            label={formData.type === 'sqlite' ? '数据库文件路径' : '数据库名称'}
            value={formData.database}
            onChange={(e) => handleInputChange('database', e.target.value)}
            placeholder={formData.type === 'sqlite' ? '/path/to/database.db' : 'database_name'}
          />
        </Grid>

        {formData.type !== 'sqlite' && (
          <>
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
          </>
        )}
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

export default DatabaseConnectionManager;
