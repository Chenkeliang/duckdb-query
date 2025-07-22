import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  TestTube as TestIcon,
  Storage as DatabaseIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { testDatabaseConnection, createDatabaseConnection, listDatabaseConnections, deleteDatabaseConnection } from '../../services/apiClient';

const DatabaseManager = () => {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [testingConnection, setTestingConnection] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 表单状态
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    type: 'mysql',
    params: {
      host: '',
      port: '',
      user: '',
      password: '',
      database: ''
    }
  });

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const response = await listDatabaseConnections();
      if (response.success) {
        setConnections(response.connections);
      }
    } catch (err) {
      setError('加载数据库连接失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (connection = null) => {
    if (connection) {
      setEditingConnection(connection);
      setFormData({
        id: connection.id,
        name: connection.name || '',
        type: connection.type,
        params: { ...connection.params }
      });
    } else {
      setEditingConnection(null);
      setFormData({
        id: '',
        name: '',
        type: 'mysql',
        params: {
          host: '',
          port: '',
          user: '',
          password: '',
          database: ''
        }
      });
    }
    setDialogOpen(true);
    setError('');
    setSuccess('');
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConnection(null);
    setError('');
    setSuccess('');
  };

  const handleFormChange = (field, value) => {
    if (field.startsWith('params.')) {
      const paramField = field.replace('params.', '');
      setFormData(prev => ({
        ...prev,
        params: {
          ...prev.params,
          [paramField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestingConnection(formData.id || 'new');
      setError('');
      
      const testRequest = {
        type: formData.type,
        params: {
          ...formData.params,
          port: parseInt(formData.params.port) || getDefaultPort(formData.type)
        }
      };

      const result = await testDatabaseConnection(testRequest);
      
      if (result.success) {
        setSuccess(`连接测试成功! 延迟: ${result.latency_ms?.toFixed(2)}ms`);
      } else {
        setError('连接测试失败: ' + result.message);
      }
    } catch (err) {
      setError('连接测试失败: ' + err.message);
    } finally {
      setTestingConnection(null);
    }
  };

  const handleSaveConnection = async () => {
    try {
      setLoading(true);
      setError('');

      const connectionData = {
        ...formData,
        params: {
          ...formData.params,
          port: parseInt(formData.params.port) || getDefaultPort(formData.type)
        }
      };

      const response = await createDatabaseConnection(connectionData);
      
      if (response.success) {
        setSuccess('数据库连接保存成功!');
        await loadConnections();
        handleCloseDialog();
      } else {
        setError('保存失败: ' + response.message);
      }
    } catch (err) {
      setError('保存失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConnection = async (connectionId) => {
    if (!window.confirm('确定要删除这个数据库连接吗？')) {
      return;
    }

    try {
      setLoading(true);
      const response = await deleteDatabaseConnection(connectionId);
      
      if (response.success) {
        setSuccess('数据库连接删除成功!');
        await loadConnections();
      } else {
        setError('删除失败: ' + response.message);
      }
    } catch (err) {
      setError('删除失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultPort = (type) => {
    const ports = {
      mysql: 3306,
      postgresql: 5432,
      sqlite: null
    };
    return ports[type];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'success';
      case 'inactive': return 'default';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return <CheckIcon fontSize="small" />;
      case 'error': return <ErrorIcon fontSize="small" />;
      default: return <WarningIcon fontSize="small" />;
    }
  };

  return (
    <Paper sx={{ p: 3, borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DatabaseIcon color="primary" />
          数据库连接管理
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ borderRadius: 20 }}
        >
          添加连接
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
          <CircularProgress />
        </Box>
      )}

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>名称</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>主机</TableCell>
              <TableCell>数据库</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {connections.map((connection) => (
              <TableRow key={connection.id}>
                <TableCell>{connection.name || connection.id}</TableCell>
                <TableCell>
                  <Chip 
                    label={connection.type.toUpperCase()} 
                    size="small" 
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{connection.params?.host || '-'}</TableCell>
                <TableCell>{connection.params?.database || '-'}</TableCell>
                <TableCell>
                  <Chip
                    icon={getStatusIcon(connection.status)}
                    label={connection.status || 'unknown'}
                    color={getStatusColor(connection.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title="编辑">
                    <IconButton 
                      size="small" 
                      onClick={() => handleOpenDialog(connection)}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton 
                      size="small" 
                      color="error"
                      onClick={() => handleDeleteConnection(connection.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {connections.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="textSecondary">
                    暂无数据库连接，点击"添加连接"开始
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 添加/编辑连接对话框 */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingConnection ? '编辑数据库连接' : '添加数据库连接'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="连接ID"
              value={formData.id}
              onChange={(e) => handleFormChange('id', e.target.value)}
              required
              disabled={!!editingConnection}
            />
            
            <TextField
              label="连接名称"
              value={formData.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
            />

            <FormControl>
              <InputLabel>数据库类型</InputLabel>
              <Select
                value={formData.type}
                onChange={(e) => handleFormChange('type', e.target.value)}
                label="数据库类型"
              >
                <MenuItem value="mysql">MySQL</MenuItem>
                <MenuItem value="postgresql">PostgreSQL</MenuItem>
                <MenuItem value="sqlite">SQLite</MenuItem>
              </Select>
            </FormControl>

            {formData.type !== 'sqlite' && (
              <>
                <TextField
                  label="主机地址"
                  value={formData.params.host}
                  onChange={(e) => handleFormChange('params.host', e.target.value)}
                  required
                />
                
                <TextField
                  label="端口"
                  type="number"
                  value={formData.params.port}
                  onChange={(e) => handleFormChange('params.port', e.target.value)}
                  placeholder={getDefaultPort(formData.type)?.toString()}
                />
                
                <TextField
                  label="用户名"
                  value={formData.params.user}
                  onChange={(e) => handleFormChange('params.user', e.target.value)}
                  required
                />
                
                <TextField
                  label="密码"
                  type="password"
                  value={formData.params.password}
                  onChange={(e) => handleFormChange('params.password', e.target.value)}
                  required
                />
              </>
            )}

            <TextField
              label={formData.type === 'sqlite' ? '数据库文件路径' : '数据库名称'}
              value={formData.params.database}
              onChange={(e) => handleFormChange('params.database', e.target.value)}
              required
            />

            {error && (
              <Alert severity="error">{error}</Alert>
            )}

            {success && (
              <Alert severity="success">{success}</Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>取消</Button>
          <Button
            onClick={handleTestConnection}
            disabled={testingConnection === (formData.id || 'new')}
            startIcon={testingConnection === (formData.id || 'new') ? <CircularProgress size={16} /> : <TestIcon />}
          >
            测试连接
          </Button>
          <Button
            onClick={handleSaveConnection}
            variant="contained"
            disabled={loading}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default DatabaseManager;
