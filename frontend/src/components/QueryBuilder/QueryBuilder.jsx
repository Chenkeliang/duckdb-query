import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Typography,
  Stack,
  Divider,
  Alert,
  Card,
  CardContent,
  CardHeader,
  Fade,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  TextField
} from '@mui/material';
import JoinCondition from './JoinCondition';
import SourceSelector from './SourceSelector';
import { performQuery, downloadResults, executeSQL } from '../../services/apiClient';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import TableChartIcon from '@mui/icons-material/TableChart';
import HistoryIcon from '@mui/icons-material/History';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ReplayIcon from '@mui/icons-material/Replay';
import DeleteIcon from '@mui/icons-material/Delete';

// 受控组件：selectedSources/setSelectedSources 由父组件(App.jsx)传入
const QueryBuilder = ({ dataSources = [], selectedSources = [], setSelectedSources, onResultsReceived }) => {
  const [joins, setJoins] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sqlInput, setSqlInput] = useState('');
  const [sqlLoading, setSqlLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [queryHistory, setQueryHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('queryHistory') || '[]');
    } catch {
      return [];
    }
  });

  // 选中/移除数据源全部用props
  const handleSourceSelect = (source) => {
    if (!selectedSources.some(s => s.id === source.id)) {
      setSelectedSources([...selectedSources, source]);
    }
  };
  const handleSourceRemove = (sourceId) => {
    setSelectedSources(selectedSources.filter(s => s.id !== sourceId));
    setJoins(joins.filter(j => j.left_source_id !== sourceId && j.right_source_id !== sourceId));
  };

  const handleAddJoin = () => {
    if (selectedSources.length < 2) {
      setError('需要至少选择两个数据源才能创建连接');
      return;
    }

    setJoins([...joins, {
      left_source_id: selectedSources[0].id,
      right_source_id: selectedSources[1].id,
      left_on: '',
      right_on: '',
      how: 'inner'
    }]);
    setError('');
  };

  const handleJoinUpdate = (index, updatedJoin) => {
    const updatedJoins = [...joins];
    updatedJoins[index] = updatedJoin;
    setJoins(updatedJoins);
  };

  const handleJoinRemove = (index) => {
    const updatedJoins = [...joins];
    updatedJoins.splice(index, 1);
    setJoins(updatedJoins);
  };

  const handleExecuteQuery = async () => {
    if (selectedSources.length === 0) {
      setError('请至少选择一个数据源');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const queryRequest = {
        sources: selectedSources,
        joins: joins
      };

      // 获取后端实际执行的SQL
      const results = await performQuery(queryRequest);
      onResultsReceived(results);
      if (results && results.sql) {
        saveHistory(results.sql);
      }
    } catch (err) {
      setError(`查询执行失败: ${err.message || '未知错误'}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (selectedSources.length === 0) {
      setError('请至少选择一个数据源');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const queryRequest = {
        sources: selectedSources,
        joins: joins
      };

      await downloadResults(queryRequest);
    } catch (err) {
      setError(`下载失败: ${err.message || '未知错误'}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  // 保存历史（只保存最终执行的SQL字符串）
  const saveHistory = (sql) => {
    const newItem = {
      sql,
      time: new Date().toLocaleString(),
      id: Date.now() + Math.random()
    };
    const newHistory = [newItem, ...queryHistory].slice(0, 50); // 最多50条
    setQueryHistory(newHistory);
    localStorage.setItem('queryHistory', JSON.stringify(newHistory));
  };

  const handleSqlExecute = async () => {
    if (!sqlInput.trim()) {
      setError('请输入SQL语句');
      return;
    }
    if (selectedSources.length === 0) {
      setError('请至少选择一个数据源');
      return;
    }
    setError('');
    setSqlLoading(true);
    try {
      // 只传第一个数据源给后端，后端会自动注册
      const datasource = selectedSources[0];
      const result = await executeSQL(sqlInput, datasource);
      if (result && (result.data || result.columns)) {
        onResultsReceived(result);
      } else {
        setError('SQL执行无结果');
      }
      saveHistory(sqlInput);
    } catch (err) {
      setError(`SQL执行失败: ${err.message || '未知错误'}`);
    } finally {
      setSqlLoading(false);
    }
  };

  return (
    <Paper 
      sx={{ 
        p: 3, 
        borderRadius: 3, 
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        height: '100%',
        backdropFilter: 'blur(20px)',
        background: 'rgba(255,255,255,0.95)'
      }}
    >
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        mb: 3 
      }}>
        <Typography 
          variant="h6" 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            fontWeight: 500,
            color: 'text.primary',
            fontSize: '1.1rem'
          }}
        >
          <TableChartIcon sx={{ color: 'primary.main', fontSize: 22 }} /> 
          查询构建器
        </Typography>
        <Tooltip title="查询构建器帮助信息">
          <IconButton size="small" color="primary">
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Fade in={!!error}>
          <Alert 
            severity="error" 
            sx={{ 
              mb: 3, 
              borderRadius: 2,
              border: '1px solid rgba(211, 47, 47, 0.1)'
            }}
            onClose={() => setError('')}
          >
            {error}
          </Alert>
        </Fade>
      )}

      <Card 
        variant="outlined" 
        sx={{ 
          mb: 4, 
          borderRadius: 2, 
          overflow: 'visible',
          boxShadow: 'none',
          border: '1px solid rgba(0, 0, 0, 0.08)'
        }}
      >
        <CardHeader 
          title="选择数据源" 
          titleTypographyProps={{ 
            variant: 'subtitle1', 
            fontWeight: 500,
            fontSize: '0.95rem',
            color: 'text.primary' 
          }}
          sx={{ 
            pb: 1, 
            bgcolor: 'background.paper', 
            borderBottom: '1px solid rgba(0,0,0,0.05)'
          }}
        />
        <CardContent sx={{ pt: 2, px: 2 }}>
          <SourceSelector
            availableSources={dataSources}
            selectedSources={selectedSources}
            onSourceSelect={handleSourceSelect}
            onSourceRemove={handleSourceRemove}
          />
        </CardContent>
      </Card>

      {selectedSources.length >= 2 && (
        <Card 
          variant="outlined" 
          sx={{ 
            mb: 4, 
            borderRadius: 2, 
            overflow: 'visible',
            boxShadow: 'none',
            border: '1px solid rgba(0, 0, 0, 0.08)'
          }}
        >
          <CardHeader 
            title="连接条件" 
            titleTypographyProps={{ 
              variant: 'subtitle1', 
              fontWeight: 500,
              fontSize: '0.95rem',
              color: 'text.primary' 
            }}
            action={
              <Button 
                variant="outlined" 
                size="small" 
                onClick={handleAddJoin}
                startIcon={<AddIcon />}
                sx={{ 
                  borderRadius: 20,
                  fontWeight: 500,
                  textTransform: 'none',
                  fontSize: '0.8125rem',
                  border: '1px solid rgba(0, 113, 227, 0.5)',
                  '&:hover': {
                    border: '1px solid rgba(0, 113, 227, 0.8)',
                    backgroundColor: 'rgba(0, 113, 227, 0.04)'
                  }
                }}
              >
                添加连接
              </Button>
            }
            sx={{ 
              pb: 1, 
              bgcolor: 'background.paper',
              borderBottom: '1px solid rgba(0,0,0,0.05)'
            }}
          />
          <CardContent sx={{ pt: 3 }}>
            {joins.length > 0 ? (
              <Stack spacing={2}>
                {joins.map((join, index) => (
                  <JoinCondition
                    key={index}
                    join={join}
                    sources={selectedSources}
                    onUpdate={(updatedJoin) => handleJoinUpdate(index, updatedJoin)}
                    onRemove={() => handleJoinRemove(index)}
                  />
                ))}
              </Stack>
            ) : (
              <Box sx={{ 
                p: 3, 
                textAlign: 'center',
                backgroundColor: 'rgba(0,0,0,0.01)',
                borderRadius: 2,
                border: '1px dashed rgba(0,0,0,0.1)'
              }}>
                <Typography 
                  variant="body2" 
                  color="text.secondary" 
                  sx={{ 
                    fontWeight: 500,
                  }}
                >
                  未添加连接条件
                </Typography>
                <Typography 
                  variant="caption" 
                  color="text.secondary"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  点击"添加连接"创建数据源之间的关联
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'flex-end', 
        mt: 'auto',
        pt: 3,
        borderTop: '1px solid rgba(0,0,0,0.06)'
      }}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleExecuteQuery}
          disabled={selectedSources.length === 0 || isLoading}
          sx={{ 
            mr: 2,
            borderRadius: 20, 
            px: 3,
            py: 1,
            textTransform: 'none',
            fontWeight: 500,
            boxShadow: 'none',
            backgroundColor: '#0071e3',
            '&:hover': {
              backgroundColor: '#0077ed',
              boxShadow: '0 2px 8px rgba(0, 113, 227, 0.3)'
            },
            '&.Mui-disabled': {
              backgroundColor: '#e0e0e0',
              color: 'rgba(0, 0, 0, 0.38)'
            }
          }}
          startIcon={<PlayArrowIcon />}
        >
          执行查询
        </Button>
        <Button
          variant="outlined"
          onClick={handleDownload}
          disabled={selectedSources.length === 0 || isLoading}
          sx={{ 
            borderRadius: 20, 
            px: 3,
            py: 1,
            textTransform: 'none',
            fontWeight: 500,
            border: '1px solid rgba(0, 113, 227, 0.5)',
            color: '#0071e3',
            '&:hover': {
              border: '1px solid rgba(0, 113, 227, 0.8)',
              backgroundColor: 'rgba(0, 113, 227, 0.04)'
            },
            '&.Mui-disabled': {
              borderColor: 'rgba(0, 0, 0, 0.12)',
              color: 'rgba(0, 0, 0, 0.38)'
            }
          }}
          startIcon={<DownloadIcon />}
        >
          下载结果
        </Button>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 500, mb: 1 }}>
          SQL自定义查询
        </Typography>
        <TextField
          label="输入SQL语句"
          value={sqlInput}
          onChange={e => setSqlInput(e.target.value)}
          multiline
          minRows={3}
          maxRows={8}
          fullWidth
          variant="outlined"
          size="small"
          placeholder={selectedSources.length > 0 ? `如：SELECT * FROM \"${selectedSources[0]?.id}\" LIMIT 10` : '请先选择数据源'}
          sx={{ mb: 2 }}
          disabled={selectedSources.length === 0}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleSqlExecute}
            disabled={selectedSources.length === 0 || sqlLoading || !sqlInput.trim()}
            sx={{ borderRadius: 20, px: 3, fontWeight: 500 }}
          >
            {sqlLoading ? '执行中...' : '执行SQL'}
          </Button>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<HistoryIcon />}
            onClick={() => setHistoryOpen(true)}
            sx={{ borderRadius: 20, px: 3, fontWeight: 500 }}
          >
            查询历史
          </Button>
        </Box>
      </Box>

      {/* 历史查询弹窗 */}
      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, fontSize: '1.1rem' }}>历史查询</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <List dense>
            {queryHistory.length === 0 && (
              <ListItem>
                <ListItemText primary={<Typography color="text.secondary">暂无历史记录</Typography>} />
              </ListItem>
            )}
            {queryHistory.map((item, idx) => (
              <ListItem key={item.id} alignItems="flex-start" sx={{ borderBottom: '1px solid #f0f0f0', py: 1.5 }}>
                <ListItemText
                  primary={<Box sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.95rem', color: '#333' }}>{item.sql}</Box>}
                  secondary={<Typography variant="caption" color="text.secondary">{item.time}</Typography>}
                />
                <ListItemSecondaryAction>
                  <Tooltip title="复制SQL">
                    <IconButton edge="end" size="small" onClick={() => {navigator.clipboard.writeText(item.sql)}}>
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="重放查询">
                    <IconButton edge="end" size="small" color="primary" onClick={() => {
                      setSqlInput(item.sql);
                      setHistoryOpen(false);
                    }}>
                      <ReplayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除记录">
                    <IconButton edge="end" size="small" color="error" onClick={() => {
                      const newHistory = queryHistory.filter(h => h.id !== item.id);
                      setQueryHistory(newHistory);
                      localStorage.setItem('queryHistory', JSON.stringify(newHistory));
                    }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)} color="primary">关闭</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default QueryBuilder;
