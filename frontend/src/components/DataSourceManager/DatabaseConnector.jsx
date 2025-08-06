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
  FormControlLabel
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ListIcon from '@mui/icons-material/List';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { getMySQLConfigs, saveMySQLConfig, deleteMySQLConfig } from '../../services/apiClient';
import { useToast } from '../../contexts/ToastContext';

const DB_TYPES = [
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'duckdb', label: 'DuckDB' },
  { value: 'csv', label: 'CSV/Excel (SQL查询)' }
];

const DatabaseConnector = ({ onConnect }) => {
  const { showSuccess, showError } = useToast();

  // 原有状态
  const [dbType, setDbType] = useState('');
  const [host, setHost] = useState('localhost');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('');
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM table_name');
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
    if (dbType === 'mysql') {
      loadMySQLConfigs();
    }
  }, [dbType]);

  const loadMySQLConfigs = async () => {
    try {
      const result = await getMySQLConfigs();
      if (result && result.configs) {
        setMySQLConfigs(result.configs);
      }
    } catch (err) {
      console.error('加载MySQL配置失败:', err);
    }
  };

  // 保存MySQL配置
  const handleSaveConfig = async () => {
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
  const handleDeleteConfig = async (configId) => {
    try {
      await deleteMySQLConfig(configId);
      await loadMySQLConfigs();
    } catch (err) {
      setError(`删除配置失败: ${err.message || '未知错误'}`);
    }
  };

  // 使用已保存的MySQL配置
  const handleUseConfig = (config) => {
    if (config && config.params) {
      setHost(config.params.host || 'localhost');
      setPort(config.params.port?.toString() || '3306');
      setUsername(config.params.user || '');
      setPassword(config.params.password === '********' ? '' : (config.params.password || ''));
      setDatabase(config.params.database || '');
      setAlias(config.id || '');
      setOpenConfigDialog(false);
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
        type: dbType,
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

  // 验证连接表单（不包括SQL查询）
  const validateConnectionForm = () => {
    if (!dbType) {
      setError('请选择数据库类型');
      return false;
    }

    if (dbType !== 'csv') {
      if (!host) {
        setError('请输入主机地址');
        return false;
      }

      if (!database) {
        setError('请输入数据库名称');
        return false;
      }
    }

    return true;
  };

  const handleConnect = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    setError('');
    setSuccess(false);
    
    try {
      // 创建连接参数
      const connectionParams = {
        type: dbType,
        params: {
          host,
          port: port ? parseInt(port) : undefined,
          user: username,
          password,
          database
        },
        id: alias || `${dbType}-${database}`
      };
      
      // 调用父组件提供的连接回调
      await onConnect(connectionParams);

      setSuccess(true);
      showSuccess('数据源连接成功');
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const errorMsg = `连接失败: ${err.message || '未知错误'}`;
      setError(errorMsg);
      showError(errorMsg);
      console.error("Error connecting to database:", err);
    } finally {
      setLoading(false);
    }
  };
  
  const validateForm = () => {
    if (!dbType) {
      setError('请选择数据库类型');
      return false;
    }

    if (dbType !== 'csv') {
      if (!host) {
        setError('请输入主机地址');
        return false;
      }

      if (!database) {
        setError('请输入数据库名称');
        return false;
      }
    }

    return true;
  };
  
  const getDefaultPort = () => {
    switch(dbType) {
      case 'mysql': return '3306';
      case 'postgresql': return '5432';
      default: return '';
    }
  };

  return (
    <Box>
      {error && (
        <Fade in={!!error}>
          <Alert 
            severity="error" 
            sx={{ 
              mb: 2, 
              borderRadius: 2,
              fontSize: '0.875rem'
            }}
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
            sx={{
              mb: 2,
              borderRadius: 2,
              fontSize: '0.875rem'
            }}
          >
            {showSaveConfig ? '配置已保存' : '数据源连接成功'}
          </Alert>
        </Fade>
      )}

      {connectionTestResult && (
        <Fade in={!!connectionTestResult}>
          <Alert
            severity={connectionTestResult.success ? "success" : "error"}
            sx={{
              mb: 2,
              borderRadius: 2,
              fontSize: '0.875rem'
            }}
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
            backgroundColor: '#f9f9f9',
            borderBottom: expanded ? '1px solid rgba(0, 0, 0, 0.1)' : 'none',
            minHeight: '48px',
            '& .MuiAccordionSummary-content': { my: 0 }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ListIcon sx={{ mr: 1, fontSize: '1.2rem', color: '#1976d2' }} />
            <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
              数据库连接
            </Typography>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ p: 2, pt: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <FormControl variant="outlined" size="small" sx={{ minWidth: 120, flexGrow: 1 }}>
              <InputLabel id="db-type-label">数据库类型</InputLabel>
              <Select
                labelId="db-type-label"
                value={dbType}
                onChange={(e) => setDbType(e.target.value)}
                label="数据库类型"
                sx={{ borderRadius: '4px' }}
              >
                {DB_TYPES.map(option => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {dbType === 'mysql' && (
              <Tooltip title="加载已保存的MySQL配置">
                <IconButton 
                  color="primary" 
                  sx={{ ml: 1 }} 
                  onClick={() => {
                    loadMySQLConfigs();
                    setOpenConfigDialog(true);
                  }}
                >
                  <FolderOpenIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="别名"
              variant="outlined"
              size="small"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="别名"
              sx={{ borderRadius: '4px' }}
            />
            
            {dbType && dbType !== 'csv' && (
              <>
                <TextField
                  label="主机"
                  variant="outlined"
                  size="small"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  sx={{ borderRadius: '4px' }}
                  fullWidth
                />
                
                <TextField
                  label="端口"
                  variant="outlined"
                  size="small"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder={getDefaultPort()}
                  sx={{ borderRadius: '4px' }}
                />
                
                <TextField
                  label="用户名"
                  variant="outlined"
                  size="small"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  sx={{ borderRadius: '4px' }}
                />
                
                <TextField
                  label="密码"
                  type="password"
                  variant="outlined"
                  size="small"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  sx={{ borderRadius: '4px' }}
                />
                
                <TextField
                  label="数据库名称"
                  variant="outlined"
                  size="small"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  fullWidth
                  sx={{ borderRadius: '4px', gridColumn: '1 / -1' }}
                />
              </>
            )}
            
            {dbType === 'csv' && (
              <>
                <TextField
                  label="数据源名称"
                  variant="outlined"
                  size="small"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  fullWidth
                  sx={{ borderRadius: '4px', gridColumn: '1 / -1' }}
                  placeholder="上传文件的名称，如 users"
                />
                
                <TextField
                  label="SQL查询"
                  variant="outlined"
                  size="small"
                  multiline
                  rows={3}
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  fullWidth
                  sx={{ 
                    borderRadius: '4px', 
                    gridColumn: '1 / -1',
                    '& textarea': { fontFamily: 'monospace' }
                  }}
                  placeholder="SELECT * FROM users"
                />
              </>
            )}
            
            {/* MySQL配置保存选项 */}
            {dbType === 'mysql' && (
              <Box sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center' }}>
                <FormControlLabel 
                  control={
                    <Switch 
                      checked={showSaveConfig} 
                      onChange={(e) => setShowSaveConfig(e.target.checked)} 
                      size="small" 
                    />
                  } 
                  label="保存此配置" 
                />
                
                {showSaveConfig && (
                  <TextField
                    label="配置名称"
                    variant="outlined"
                    size="small"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    sx={{ ml: 2, flexGrow: 1 }}
                    placeholder="输入配置名称"
                  />
                )}
              </Box>
            )}
          </Box>
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
            {/* 测试连接按钮 */}
            {dbType && dbType !== 'csv' && (
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={testingConnection || loading}
                sx={{
                  borderRadius: '20px',
                  minWidth: '120px',
                  py: 0.75,
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                {testingConnection ? <CircularProgress size={24} /> : '测试连接'}
              </Button>
            )}

            {/* 连接按钮 */}
            <Button
              variant="contained"
              onClick={handleConnect}
              disabled={loading}
              sx={{
                borderRadius: '20px',
                minWidth: '160px',
                py: 0.75,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.875rem'
              }}
            >
              {loading ? <CircularProgress size={24} /> : '连接数据源'}
            </Button>

            {/* 保存配置按钮 */}
            {dbType === 'mysql' && showSaveConfig && (
              <Button
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={handleSaveConfig}
                disabled={savingConfig}
                sx={{
                  borderRadius: '20px',
                  py: 0.75,
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                {savingConfig ? <CircularProgress size={24} /> : '保存配置'}
              </Button>
            )}
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* MySQL配置列表对话框 */}
      <Dialog 
        open={openConfigDialog} 
        onClose={() => setOpenConfigDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          已保存的MySQL配置
        </DialogTitle>
        <DialogContent dividers>
          {mySQLConfigs.length > 0 ? (
            <List>
              {mySQLConfigs.map((config) => (
                <React.Fragment key={config.id}>
                  <ListItem>
                    <ListItemText 
                      primary={config.name || config.id} 
                      secondary={`${config.params.host}:${config.params.port || '3306'}/${config.params.database}`}
                      primaryTypographyProps={{ fontWeight: 500 }}
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="使用此配置">
                        <IconButton edge="end" color="primary" onClick={() => handleUseConfig(config)}>
                          <FolderOpenIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除此配置">
                        <IconButton edge="end" color="error" onClick={() => handleDeleteConfig(config.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              ))}
            </List>
          ) : (
            <Typography align="center" color="textSecondary" sx={{ py: 3 }}>
              没有已保存的MySQL配置
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenConfigDialog(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatabaseConnector;