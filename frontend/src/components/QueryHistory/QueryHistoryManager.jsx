import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tooltip,
  Divider,
  Alert
} from '@mui/material';
import {
  History as HistoryIcon,
  PlayArrow as PlayIcon,
  Delete as DeleteIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Search as SearchIcon,
  Code as CodeIcon
} from '@mui/icons-material';

const QueryHistoryManager = ({ onExecuteQuery, onLoadQuery }) => {
  const [history, setHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // 从localStorage加载历史记录
  useEffect(() => {
    const savedHistory = localStorage.getItem('queryHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Failed to load query history:', error);
      }
    }
  }, []);

  // 保存历史记录到localStorage
  const saveHistory = (newHistory) => {
    setHistory(newHistory);
    localStorage.setItem('queryHistory', JSON.stringify(newHistory));
  };

  // 添加查询到历史记录
  const addToHistory = (queryData) => {
    const newQuery = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      sql: queryData.sql,
      sources: queryData.sources || [],
      joins: queryData.joins || [],
      resultCount: queryData.resultCount || 0,
      executionTime: queryData.executionTime || 0,
      favorite: false
    };

    const newHistory = [newQuery, ...history.slice(0, 49)]; // 保留最近50条
    saveHistory(newHistory);
  };

  // 删除历史记录
  const deleteQuery = (id) => {
    const newHistory = history.filter(q => q.id !== id);
    saveHistory(newHistory);
  };

  // 切换收藏状态
  const toggleFavorite = (id) => {
    const newHistory = history.map(q => 
      q.id === id ? { ...q, favorite: !q.favorite } : q
    );
    saveHistory(newHistory);
  };

  // 清空历史记录
  const clearHistory = () => {
    saveHistory([]);
  };

  // 筛选历史记录
  const filteredHistory = history.filter(query =>
    query.sql.toLowerCase().includes(searchTerm.toLowerCase()) ||
    query.sources.some(source => 
      source.alias?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // 格式化时间
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString();
  };

  // 获取查询类型
  const getQueryType = (query) => {
    if (query.joins && query.joins.length > 0) return 'JOIN';
    if (query.sources && query.sources.length > 1) return 'MULTI';
    return 'SIMPLE';
  };

  // 获取查询类型颜色
  const getQueryTypeColor = (type) => {
    switch (type) {
      case 'JOIN': return 'warning';
      case 'MULTI': return 'info';
      default: return 'default';
    }
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon color="primary" />
            <Typography variant="h6" fontWeight="600">
              查询历史
            </Typography>
            <Chip 
              label={`${history.length} 条记录`} 
              size="small" 
              color="primary" 
              variant="outlined" 
            />
          </Box>
          
          {history.length > 0 && (
            <Button
              size="small"
              color="error"
              onClick={clearHistory}
            >
              清空历史
            </Button>
          )}
        </Box>

        {/* 搜索框 */}
        <TextField
          fullWidth
          size="small"
          placeholder="搜索查询历史..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
          }}
          sx={{ mb: 2 }}
        />

        {/* 历史记录列表 */}
        {filteredHistory.length === 0 ? (
          <Alert severity="info">
            {history.length === 0 ? '暂无查询历史' : '没有找到匹配的查询记录'}
          </Alert>
        ) : (
          <List sx={{ maxHeight: 400, overflow: 'auto' }}>
            {filteredHistory.map((query, index) => (
              <React.Fragment key={query.id}>
                <ListItem
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'action.hover' },
                    borderRadius: 1,
                    mb: 1
                  }}
                  onClick={() => {
                    setSelectedQuery(query);
                    setShowDetails(true);
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="body2" fontWeight="500">
                          {query.sql.substring(0, 60)}
                          {query.sql.length > 60 && '...'}
                        </Typography>
                        {query.favorite && <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          label={getQueryType(query)}
                          size="small"
                          color={getQueryTypeColor(getQueryType(query))}
                          variant="outlined"
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatTime(query.timestamp)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {query.resultCount.toLocaleString()} 条结果
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {query.executionTime}ms
                        </Typography>
                      </Box>
                    }
                  />
                  
                  <ListItemSecondaryAction>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title={query.favorite ? '取消收藏' : '收藏'}>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(query.id);
                          }}
                        >
                          {query.favorite ? <StarIcon /> : <StarBorderIcon />}
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="重新执行">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExecuteQuery?.(query);
                          }}
                        >
                          <PlayIcon />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteQuery(query.id);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </ListItemSecondaryAction>
                </ListItem>
                
                {index < filteredHistory.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}

        {/* 查询详情对话框 */}
        <Dialog
          open={showDetails}
          onClose={() => setShowDetails(false)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CodeIcon />
            查询详情
          </DialogTitle>
          
          <DialogContent>
            {selectedQuery && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="SQL查询"
                  multiline
                  rows={6}
                  value={selectedQuery.sql}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
                
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    执行信息
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={`执行时间: ${selectedQuery.executionTime}ms`} size="small" />
                    <Chip label={`结果数量: ${selectedQuery.resultCount.toLocaleString()}`} size="small" />
                    <Chip label={`数据源: ${selectedQuery.sources.length}`} size="small" />
                    <Chip label={`JOIN: ${selectedQuery.joins.length}`} size="small" />
                  </Box>
                </Box>
              </Box>
            )}
          </DialogContent>
          
          <DialogActions>
            <Button onClick={() => setShowDetails(false)}>
              关闭
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                onLoadQuery?.(selectedQuery);
                setShowDetails(false);
              }}
            >
              加载查询
            </Button>
          </DialogActions>
        </Dialog>
      </CardContent>
    </Card>
  );
};

// 导出添加历史记录的函数，供其他组件使用
export const useQueryHistory = () => {
  const addToHistory = (queryData) => {
    const savedHistory = localStorage.getItem('queryHistory');
    const history = savedHistory ? JSON.parse(savedHistory) : [];
    
    const newQuery = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      sql: queryData.sql,
      sources: queryData.sources || [],
      joins: queryData.joins || [],
      resultCount: queryData.resultCount || 0,
      executionTime: queryData.executionTime || 0,
      favorite: false
    };

    const newHistory = [newQuery, ...history.slice(0, 49)];
    localStorage.setItem('queryHistory', JSON.stringify(newHistory));
  };

  return { addToHistory };
};

export default QueryHistoryManager;
