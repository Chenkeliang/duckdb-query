import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Alert,
  Fade,
  CircularProgress,
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
import { CardSurface, RoundedButton, RoundedTextField } from '../common';

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
        sx={{
          mb: 2,
          '& .MuiTabs-indicator': {
            backgroundColor: 'var(--dq-accent-primary)',
            height: 2,
            borderRadius: 999
          },
          '& .MuiTab-root': {
            fontSize: 'var(--dq-tab-font-size-secondary)',
            fontWeight: 'var(--dq-tab-font-weight-secondary)',
            textTransform: 'none',
            minHeight: 48,
            color: 'var(--dq-text-tertiary)',
            backgroundColor: 'transparent',
            '&.Mui-selected': {
              color: 'var(--dq-tab-active-color)',
              backgroundColor: 'transparent'
            },
            '&:hover': {
              color: 'var(--dq-text-primary)',
              backgroundColor: 'transparent'
            }
          }
        }}
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
            sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}
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
            sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}
          >
            数据库连接成功
          </Alert>
        </Fade>
      )}

      {connectionTestResult && (
        <Fade in={!!connectionTestResult}>
          <Alert 
            severity={connectionTestResult.success ? "success" : "error"} 
            sx={{ mb: 2, borderRadius: 'var(--dq-radius-card)' }}
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
          border: '1px solid var(--dq-border-card)',
          borderRadius: 'var(--dq-radius-card)',
          backgroundColor: 'var(--dq-surface)',
          mb: 2,
          '&:before': { display: 'none' },
          overflow: 'hidden',
          boxShadow: expanded ? 'var(--dq-shadow-soft)' : 'none',
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease'
        }}
      >
        <AccordionSummary 
          expandIcon={<ExpandMoreIcon />}
          sx={{ 
            backgroundColor: 'var(--dq-surface)',
            borderBottom: expanded ? '1px solid var(--dq-border-subtle)' : 'none',
            minHeight: '48px',
            '& .MuiAccordionSummary-content': { my: 0 }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FolderOpenIcon sx={{ mr: 1, fontSize: '1.2rem', color: 'var(--dq-accent-primary)' }} />
            <Typography sx={{ fontWeight: 600, fontSize: '16px', color: 'var(--dq-text-secondary)' }}>
              MySQL数据库连接
            </Typography>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ p: 3, backgroundColor: 'var(--dq-surface)' }}>
          <RoundedTextField
            label="主机地址"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="localhost"
          />
          
          <RoundedTextField
            label="端口"
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="3306"
          />
          
          <RoundedTextField
            label="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="root"
          />
          
          <RoundedTextField
            label="密码"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
          />
          
          <RoundedTextField
            label="数据库名称"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            fullWidth
            sx={{ mb: 1.5 }}
            placeholder="your_database"
          />
          
          <RoundedTextField
            label="连接别名（可选）"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder="例如: 生产环境MySQL"
          />

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <RoundedButton
              variant="outlined"
              startIcon={testingConnection ? <CircularProgress size={16} /> : null}
              onClick={handleTestConnection}
              disabled={testingConnection}
              sx={{ minWidth: 120 }}
            >
              {testingConnection ? '测试中...' : '测试连接'}
            </RoundedButton>

            <RoundedButton
              startIcon={loading ? <CircularProgress size={16} /> : null}
              onClick={handleConnect}
              disabled={loading}
              sx={{ minWidth: 120 }}
            >
              {loading ? '连接中...' : '连接数据库'}
            </RoundedButton>
          </Box>

          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <RoundedButton
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={() => setShowSaveConfig(true)}
              size="small"
            >
              保存此配置
            </RoundedButton>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* 已保存的配置列表 */}
      <CardSurface padding={0} sx={{ borderColor: 'var(--dq-border-card)', borderRadius: 'var(--dq-radius-card)', mb: 2 }}>
        <Box sx={{ p: 2.5, borderBottom: '1px solid var(--dq-border-subtle)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <ListIcon fontSize="small" color="var(--dq-accent-primary)" />
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'var(--dq-text-secondary)' }}>
            已保存的MySQL配置
          </Typography>
        </Box>
        
        <List sx={{ p: 0, maxHeight: 220, overflow: 'auto' }}>
          {mySQLConfigs.length > 0 ? (
            mySQLConfigs.map((config) => (
              <React.Fragment key={config.id}>
                <ListItem 
                  sx={{ 
                    py: 1,
                    '&:hover': {
                      backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 8%, transparent)'
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
                      <Typography variant="caption" sx={{ color: 'var(--dq-text-tertiary)' }}>
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
                  <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)' }} align="center">
                    暂无保存的配置
                  </Typography>
                }
              />
            </ListItem>
          )}
        </List>
      </CardSurface>

      {/* 保存配置对话框 */}
      <Dialog open={showSaveConfig} onClose={() => setShowSaveConfig(false)} maxWidth="sm" fullWidth>
        <DialogTitle>保存MySQL配置</DialogTitle>
        <DialogContent>
          <RoundedTextField
            autoFocus
            margin="dense"
            label="配置名称"
            fullWidth
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
          <RoundedButton variant="outlined" onClick={() => setShowSaveConfig(false)} disabled={savingConfig}>
            取消
          </RoundedButton>
          <RoundedButton
            onClick={handleSaveMySQLConfig}
            disabled={savingConfig || !configName.trim()}
            startIcon={savingConfig ? <CircularProgress size={16} /> : <SaveIcon />}
          >
            {savingConfig ? '保存中...' : '保存'}
          </RoundedButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatabaseConnector;
