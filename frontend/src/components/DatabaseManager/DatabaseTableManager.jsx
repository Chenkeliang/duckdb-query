import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Collapse,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Divider
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Visibility as VisibilityIcon,
  Storage as StorageIcon,
  TableChart as TableChartIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  Code as CodeIcon
} from '@mui/icons-material';

const DatabaseTableManager = ({ databaseConnections = [] }) => {
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [tableData, setTableData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedTables, setExpandedTables] = useState(new Set());
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableDetailsOpen, setTableDetailsOpen] = useState(false);
  const [tableDetails, setTableDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // 创建带超时和重试的fetch函数
  const fetchWithTimeout = (url, options = {}, timeout = 30000) => {
    return Promise.race([
      fetch(url, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('请求超时，请检查网络连接或数据库配置')), timeout)
      )
    ]);
  };

  // 带重试的fetch函数
  const fetchWithRetry = async (url, options = {}, timeout = 30000, maxRetries = 2) => {
    let lastError;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        if (i > 0) {
          console.log(`重试第 ${i} 次: ${url}`);
          // 重试前等待一段时间
          await new Promise(resolve => setTimeout(resolve, 1000 * i));
        }

        const response = await fetchWithTimeout(url, options, timeout);
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`请求失败 (尝试 ${i + 1}/${maxRetries + 1}):`, error.message);

        // 如果是最后一次尝试，抛出错误
        if (i === maxRetries) {
          throw lastError;
        }
      }
    }
  };

  // 获取数据库表信息
  const fetchDatabaseTables = async (connectionId) => {
    if (!connectionId) return;

    setLoading(true);
    setError('');

    try {
      console.log(`开始获取数据库表信息: ${connectionId}`);
      const response = await fetchWithRetry(`/api/database_tables/${connectionId}`, {}, 30000, 1);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`成功获取数据库表信息:`, data);
      setTableData(data);
    } catch (err) {
      console.error('获取数据库表信息失败:', err);
      setError(`获取数据库表信息失败: ${err.message}`);
      setTableData(null);
    } finally {
      setLoading(false);
    }
  };

  // 获取表详细信息
  const fetchTableDetails = async (connectionId, tableName) => {
    setDetailsLoading(true);

    try {
      console.log(`开始获取表详细信息: ${connectionId}/${tableName}`);
      const response = await fetchWithRetry(`/api/database_table_details/${connectionId}/${tableName}`, {}, 20000, 1);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`成功获取表详细信息:`, data);
      setTableDetails(data);
      setSelectedTable(tableName);
      setTableDetailsOpen(true);
    } catch (err) {
      console.error('获取表详细信息失败:', err);
      setError(`获取表详细信息失败: ${err.message}`);
    } finally {
      setDetailsLoading(false);
    }
  };

  // 切换表展开状态
  const toggleTableExpanded = (tableName) => {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  };

  // 生成SQL查询示例
  const generateSampleSQL = (tableName, columns) => {
    const columnNames = columns.slice(0, 5).map(col => col.name).join(', ');
    return `SELECT ${columnNames} FROM ${tableName} LIMIT 10;`;
  };

  // 获取字段类型颜色
  const getTypeColor = (type) => {
    if (type.includes('int') || type.includes('decimal') || type.includes('float')) {
      return 'primary';
    } else if (type.includes('varchar') || type.includes('text') || type.includes('char')) {
      return 'secondary';
    } else if (type.includes('date') || type.includes('time')) {
      return 'warning';
    } else {
      return 'default';
    }
  };

  useEffect(() => {
    if (databaseConnections.length > 0 && !selectedConnection) {
      setSelectedConnection(databaseConnections[0].id);
    }
  }, [databaseConnections]);

  useEffect(() => {
    if (selectedConnection) {
      fetchDatabaseTables(selectedConnection);
    }
  }, [selectedConnection]);

  if (databaseConnections.length === 0) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        没有可用的数据库连接，请先在数据源管理页面添加数据库连接。
      </Alert>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
      {/* 数据库连接选择 */}
      <Card sx={{ mb: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              数据库表管理
            </Typography>
            <Box sx={{ ml: 'auto' }}>
              <Button
                startIcon={<RefreshIcon />}
                onClick={() => fetchDatabaseTables(selectedConnection)}
                disabled={loading}
                size="small"
              >
                刷新
              </Button>
            </Box>
          </Box>
          
          {databaseConnections.length > 0 && selectedConnection && (
            <Tabs
              value={selectedConnection}
              onChange={(e, newValue) => setSelectedConnection(newValue)}
              variant="scrollable"
              scrollButtons="auto"
            >
              {databaseConnections.map((conn) => (
                <Tab
                  key={conn.id}
                  label={conn.name}
                  value={conn.id}
                  icon={<StorageIcon />}
                  iconPosition="start"
                />
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* 加载状态 */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}

      {/* 数据库表信息 */}
      {tableData && !loading && (
        <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
          <CardContent>
            {/* 数据库统计信息 */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                📊 数据库概览 - {tableData.database}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.50' }}>
                    <Typography variant="h4" color="primary.main" sx={{ fontWeight: 700 }}>
                      {tableData.table_count}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      总表数
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.50' }}>
                    <Typography variant="h4" color="warning.main" sx={{ fontWeight: 700 }}>
                      {tableData.tables.reduce((sum, table) => sum + table.column_count, 0)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      总列数
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* 表列表 */}
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              📋 表列表
            </Typography>
            
            {tableData.tables.map((table) => (
              <Accordion
                key={table.table_name}
                expanded={expandedTables.has(table.table_name)}
                onChange={() => toggleTableExpanded(table.table_name)}
                sx={{ mb: 1, border: '1px solid #e2e8f0', borderRadius: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <TableChartIcon sx={{ mr: 2, color: 'primary.main' }} />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {table.table_name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {table.column_count} 列
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, mr: 2 }}>
                      <Chip
                        label={`${table.column_count} 列`}
                        size="small"
                        color="secondary"
                        variant="outlined"
                      />
                    </Box>
                    <Tooltip title="查看详细信息">
                      <IconButton
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchTableDetails(selectedConnection, table.table_name);
                        }}
                        disabled={detailsLoading}
                        size="small"
                      >
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                      字段信息
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>字段名</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>类型</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>允许空值</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>键</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>默认值</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>额外</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {table.columns.map((column, index) => (
                            <TableRow key={index}>
                              <TableCell sx={{ fontWeight: 500 }}>{column.name}</TableCell>
                              <TableCell>
                                <Chip
                                  label={column.type}
                                  size="small"
                                  color={getTypeColor(column.type)}
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell>{column.null}</TableCell>
                              <TableCell>
                                {column.key && (
                                  <Chip
                                    label={column.key}
                                    size="small"
                                    color="warning"
                                    variant="filled"
                                  />
                                )}
                              </TableCell>
                              <TableCell>{column.default || '-'}</TableCell>
                              <TableCell>{column.extra || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    
                    {/* SQL查询示例 */}
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <CodeIcon sx={{ mr: 1, fontSize: 16 }} />
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          SQL查询示例
                        </Typography>
                      </Box>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          bgcolor: 'white',
                          p: 1,
                          borderRadius: 0.5,
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        {generateSampleSQL(table.table_name, table.columns)}
                      </Typography>
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 表详细信息对话框 */}
      <Dialog
        open={tableDetailsOpen}
        onClose={() => setTableDetailsOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <TableChartIcon sx={{ mr: 1 }} />
            表详细信息 - {selectedTable}
          </Box>
        </DialogTitle>
        <DialogContent>
          {detailsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : tableDetails ? (
            <Box>
              {/* 表统计信息 */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h5" color="secondary.main">
                      {tableDetails.column_count}
                    </Typography>
                    <Typography variant="body2">总列数</Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* 示例数据 */}
              {tableDetails.sample_data && tableDetails.sample_data.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    示例数据（前5行）
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          {tableDetails.columns.map((column) => (
                            <TableCell key={column.name} sx={{ fontWeight: 600 }}>
                              {column.name}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tableDetails.sample_data.map((row, index) => (
                          <TableRow key={index}>
                            {row.map((cell, cellIndex) => (
                              <TableCell key={cellIndex}>
                                {cell !== null ? String(cell) : '-'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTableDetailsOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DatabaseTableManager;
