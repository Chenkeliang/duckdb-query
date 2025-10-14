import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  FormControl,
  Select, 
  MenuItem, 
  Paper, 
  Alert, 
  Fade,
  CircularProgress,
  InputLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Tooltip,
  Switch,
  FormControlLabel,
  Tabs,
  Tab
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ListIcon from '@mui/icons-material/List';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { getMySQLConfigs, saveMySQLConfig, deleteMySQLConfig, getPostgreSQLConfigs, savePostgreSQLConfig, deletePostgreSQLConfig } from '../../services/apiClient';
import { useToast } from '../../contexts/ToastContext';
import PostgreSQLConnector from '../PostgreSQLManager/PostgreSQLConnector';

const DB_TYPES = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' }
];

const DatabaseConnector = ({ onConnect }) => {
  const { showSuccess, showError } = useToast();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={activeTab}
        onChange={(e, newValue) => setActiveTab(newValue)}
        variant="fullWidth"
        sx={{ mb: 2 }}
      >
        <Tab label="MySQL" />
        <Tab label="PostgreSQL" />
      </Tabs>

      {activeTab === 0 && (
        <MySQLConnector onConnect={onConnect} />
      )}

      {activeTab === 1 && (
        <PostgreSQLConnector onConnect={onConnect} />
      )}
    </Box>
  );
};

const MySQLConnector = ({ onConnect }) => {
  const { showSuccess, showError } = useToast();

  // 原有状态
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('3306');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // 新增MySQL配置管理状态
  const [mySQLConfigs, setMySQLConfigs] = useState([]);
  const [openConfigDialog, setOpenConfigDialog] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configName, setConfigName] = useState('');
  const [showSaveConfig, setShowSaveConfig] = useState(false);

  // 连接测试状态
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState(null);

  // 加载MySQL配置
  useEffect(() => {
    loadMySQLConfigs();
  }, []);

  const loadMySQLConfigs = async () => {
    try {
      const result = await getMySQLConfigs();
      if (result) {
        setMySQLConfigs(result);
      }
    } catch (err) {
    }
  };

  // 保存MySQL配置
  const handleSaveMySQLConfig = async () => {
    if (!validateForm()) return;
    
    setSavingConfig(true);
    
    try {
      const configToSave = {
        id: configName || `mysql-${host}-${database}`,
        type: 'mysql',
        name: configName || `${host}:${port || '3306'}/${database}`,
        params: {
          host,
          port: port ? parseInt(port) : 3306,
          user: username,
          password,
          database
        }
      };
      
      await saveMySQLConfig(configToSave);
      await loadMySQLConfigs();

      setSuccess(true);
      setShowSaveConfig(false);
      showSuccess('数据库配置已保存');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const errorMsg = `保存配置失败: ${err.message || '未知错误'}`;
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setSavingConfig(false);
    }
  };

  // 删除MySQL配置
  const handleDeleteMySQLConfig = async (configId) => {
    try {
      await deleteMySQLConfig(configId);
      await loadMySQLConfigs();
    } catch (err) {
      setError(`删除配置失败: ${err.message || '未知错误'}`);
    }
  };

  // 使用已保存的MySQL配置
  const handleUseMySQLConfig = async (config) => {
    if (config && config.params) {
      setHost(config.params.host || 'localhost');
      setPort(config.params.port?.toString() || '3306');
      setUsername(config.params.user || '');

      // 如果密码被遮蔽，需要从后端获取真实密码
      if (config.params.password === '********') {
        try {
          // 调用后端API获取完整配置（包含解密的密码）
          const response = await fetch(`/api/mysql_configs/${config.id}/full`);
          if (response.ok) {
            const fullConfig = await response.json();
            setPassword(fullConfig.params.password || '');
          } else {
            showError('获取完整配置失败');
          }
        } catch (err) {
          showError('获取完整配置失败');
        }
      } else {
        setPassword(config.params.password || '');
      }
    }
  };

  // 测试数据库连接
  const handleTestConnection = async () => {
    if (!validateConnectionForm()) return;

    setTestingConnection(true);
    setConnectionTestResult(null);
    setError('');

    try {
      const testParams = {
        type: 'mysql',
        params: {
          host,
          port: port ? parseInt(port) : undefined,
          user: username,
          password,
          database
        }
      };

      // 调用测试连接API
      const response = await fetch('/api/database_connections/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testParams)
      });

      const result = await response.json();

      if (result.success) {
        const successMsg = `连接测试成功！延迟: ${result.latency_ms?.toFixed(2)}ms`;
        setConnectionTestResult({
          success: true,
          message: successMsg
        });
        showSuccess(successMsg);
      } else {
        const errorMsg = result.message || '连接测试失败';
        setConnectionTestResult({
          success: false,
          message: errorMsg
        });
        showError(errorMsg);
      }
    } catch (err) {
      const errorMsg = `连接测试失败: ${err.message || '未知错误'}`;
      setConnectionTestResult({
        success: false,
        message: errorMsg
      });
      showError(errorMsg);
    } finally {
      setTestingConnection(false);
    }
  };

  // 表单验证
  const validateConnectionForm = () => {
    if (!host || !username || !database) {
      setError('请填写主机地址、用户名和数据库名称');
      return false;
    }
    return true;
  };

  const validateForm = () => {
    if (!host || !username || !database || !configName) {
      setError('请填写所有必填字段');
      return false;
    }
    return true;
  };

  // 连接数据库
  const handleConnect = async () => {
    if (!validateConnectionForm()) return;

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const connectionParams = {
        id: alias || `mysql-${host}-${database}`,
        type: 'mysql',
        params: {
          host,
          port: port ? parseInt(port) : 3306,
          user: username,
          password,
          database
        }
      };

      const result = await onConnect(connectionParams);
      
      if (result && result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(result?.message || '连接失败');
      }
    } catch (err) {
      const errorMsg = `连接失败: ${err.message || '未知错误'}`;
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      {error && (
        <Fade in={!!error}>
          <Alert 
            severity="error" 
            sx={{ mb: 2, borderRadius: 2 }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        </Fade>
      )}

      {success && (
        <Fade in={success}>
          <Alert 
            severity="success" 
            sx={{ mb: 2, borderRadius: 2 }}
          >
            数据库连接成功
          </Alert>
        </Fade>
      )}

      {connectionTestResult && (
        <Fade in={!!connectionTestResult}>
          <Alert 
            severity={connectionTestResult.success ? "success" : "error"} 
            sx={{ mb: 2, borderRadius: 2 }}
            onClose={() => setConnectionTestResult(null)}
          >
            {connectionTestResult.message}
          </Alert>
        </Fade>
      )}

      <Accordion 
        expanded={expanded}
        onChange={() => setExpanded(!expanded)}
        disableGutters
        elevation={0}
        sx={{ 
          border: '1px solid rgba(0, 0, 0, 0.1)',
          borderRadius: '8px',
          mb: 2,
          '&:before': { display: 'none' },
          overflow: 'hidden'
        }}
      >
        <AccordionSummary 
          expandIcon={<ExpandMoreIcon />}
          sx={{ 
            backgroundColor: '#ffffff',
            borderBottom: expanded ? '1px solid rgba(0, 0, 0, 0.1)' : 'none',
            minHeight: '48px',
            '& .MuiAccordionSummary-content': { my: 0 }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FolderOpenIcon sx={{ mr: 1, fontSize: '1.2rem', color: '#1976d2' }} />
            <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
              MySQL数据库连接
            </Typography>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ p: 2, pt: 2.5 }}>
          <TextField
            label="主机地址"
            variant="outlined"
            size="small"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="localhost"
          />
          
          <TextField
            label="端口"
            variant="outlined"
            size="small"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="3306"
          />
          
          <TextField
            label="用户名"
            variant="outlined"
            size="small"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="root"
          />
          
          <TextField
            label="密码"
            variant="outlined"
            size="small"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
          />
          
          <TextField
            label="数据库名称"
            variant="outlined"
            size="small"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="your_database"
          />
          
          <TextField
            label="连接别名（可选）"
            variant="outlined"
            size="small"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder="例如: 生产环境MySQL"
          />

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={testingConnection ? <CircularProgress size={16} /> : null}
              onClick={handleTestConnection}
              disabled={testingConnection}
              sx={{
                borderRadius: '20px',
                minWidth: '120px',
                py: 0.75,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.875rem'
              }}
            >
              {testingConnection ? '测试中...' : '测试连接'}
            </Button>

            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={16} /> : null}
              onClick={handleConnect}
              disabled={loading}
              sx={{
                borderRadius: '20px',
                minWidth: '120px',
                py: 0.75,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.875rem'
              }}
            >
              {loading ? '连接中...' : '连接数据库'}
            </Button>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Button
              startIcon={<SaveIcon />}
              onClick={() => setShowSaveConfig(true)}
              sx={{ textTransform: 'none', fontSize: '0.875rem' }}
            >
              保存此配置
            </Button>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* 已保存的配置列表 */}
      <Paper 
        variant="outlined" 
        sx={{ 
          borderRadius: 2, 
          border: '1px solid #e2e8f0',
          mb: 2
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0' }}>
          <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ListIcon fontSize="small" />
            已保存的MySQL配置
          </Typography>
        </Box>
        
        <List sx={{ p: 0, maxHeight: 200, overflow: 'auto' }}>
          {mySQLConfigs.length > 0 ? (
            mySQLConfigs.map((config) => (
              <React.Fragment key={config.id}>
                <ListItem 
                  sx={{ 
                    py: 1,
                    '&:hover': {
                      backgroundColor: 'rgba(25, 118, 210, 0.04)'
                    }
                  }}
                >
                  <ListItemText
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {config.name || config.id}
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {config.params?.host}:{config.params?.port || '3306'}/{config.params?.database}
                      </Typography>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="使用此配置">
                      <IconButton 
                        edge="end" 
                        size="small"
                        onClick={() => handleUseMySQLConfig(config)}
                      >
                        <FolderOpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="删除配置">
                      <IconButton 
                        edge="end" 
                        size="small"
                        color="error"
                        onClick={() => handleDeleteMySQLConfig(config.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
                <Divider variant="middle" component="li" />
              </React.Fragment>
            ))
          ) : (
            <ListItem>
              <ListItemText 
                primary={
                  <Typography variant="body2" color="text.secondary" align="center">
                    暂无保存的配置
                  </Typography>
                }
              />
            </ListItem>
          )}
        </List>
      </Paper>

      {/* 保存配置对话框 */}
      <Dialog open={showSaveConfig} onClose={() => setShowSaveConfig(false)} maxWidth="sm" fullWidth>
        <DialogTitle>保存MySQL配置</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="配置名称"
            fullWidth
            variant="outlined"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="例如: 生产环境MySQL"
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSaveConfig(false)} disabled={savingConfig}>
            取消
          </Button>
          <Button
            onClick={handleSaveMySQLConfig}
            variant="contained"
            disabled={savingConfig || !configName.trim()}
            startIcon={savingConfig ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {savingConfig ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatabaseConnector;