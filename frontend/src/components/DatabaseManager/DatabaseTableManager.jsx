import {
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { BarChart3, ClipboardList, Code, Database, Eye, RotateCcw, Search } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50); // 每页显示50个表
  const [searchTerm, setSearchTerm] = useState('');
  const [showAllColumns, setShowAllColumns] = useState(new Set()); // 记录哪些表显示所有字段


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
          // 重试前等待一段时间
          await new Promise(resolve => setTimeout(resolve, 1000 * i));
        }

        const response = await fetchWithTimeout(url, options, timeout);
        return response;
      } catch (error) {
        lastError = error;

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
      const response = await fetchWithRetry(`/api/database_tables/${connectionId}`, {}, 30000, 1);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setTableData(data);
    } catch (err) {
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
      const response = await fetchWithRetry(`/api/database_table_details/${connectionId}/${tableName}`, {}, 20000, 1);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setTableDetails(data);
      setSelectedTable(tableName);
      setTableDetailsOpen(true);
    } catch (err) {
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

  // 切换显示所有字段状态
  const toggleShowAllColumns = (tableName) => {
    const newShowAll = new Set(showAllColumns);
    if (newShowAll.has(tableName)) {
      newShowAll.delete(tableName);
    } else {
      newShowAll.add(tableName);
    }
    setShowAllColumns(newShowAll);
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
    if (!selectedConnection) return;
    const stillExists = databaseConnections.some(conn => conn.id === selectedConnection);
    if (!stillExists) {
      setSelectedConnection(null);
    }
  }, [databaseConnections, selectedConnection]);

  // 过滤和分页的表数据
  const filteredAndPaginatedTables = useMemo(() => {
    if (!tableData?.tables) return { tables: [], totalPages: 0, totalTables: 0 };

    // 搜索过滤
    const filtered = tableData.tables.filter(table =>
      table.table_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // 分页
    const totalPages = Math.ceil(filtered.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedTables = filtered.slice(startIndex, endIndex);

    return {
      tables: paginatedTables,
      totalPages,
      totalTables: filtered.length
    };
  }, [tableData?.tables, searchTerm, currentPage, pageSize]);

  useEffect(() => {
    if (!selectedConnection) {
      setTableData(null);
      setError('');
      return;
    }
    setCurrentPage(1);
    setExpandedTables(new Set());
    setTableData(null);
    fetchDatabaseTables(selectedConnection);
  }, [selectedConnection]);

  // 搜索时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
            <Database size={20} style={{ marginRight: '8px', color: '#1976d2' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              数据库表管理
            </Typography>
            <Box sx={{ ml: 'auto' }}>
              <Button
                startIcon={<RotateCcw size={20} />}
                onClick={() => selectedConnection && fetchDatabaseTables(selectedConnection)}
                disabled={loading || !selectedConnection}
                size="small"
              >
                刷新
              </Button>
            </Box>
          </Box>

          {databaseConnections.length > 0 && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                overflowX: 'auto',
                pb: 1,
                position: 'relative',
                '&::-webkit-scrollbar': {
                  height: 6
                }
              }}
            >
              {databaseConnections.map((conn) => {
                const isActive = conn.id === selectedConnection;
                return (
                  <ButtonBase
                    key={conn.id}
                    onClick={() => {
                      setSelectedConnection(conn.id);
                      setError('');
                    }}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      position: 'relative',
                      color: isActive ? 'var(--dq-text-primary)' : 'var(--dq-text-tertiary)',
                      transition: 'color 0.2s ease, transform 0.2s ease',
                      '&:hover': {
                        color: 'var(--dq-text-primary)'
                      },
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        left: 12,
                        right: 12,
                        bottom: -6,
                        height: 2,
                        borderRadius: 999,
                        backgroundColor: 'var(--dq-accent-100)',
                        opacity: isActive ? 1 : 0,
                        transform: isActive ? 'scaleX(1)' : 'scaleX(0.6)',
                        transition: 'opacity 0.2s ease, transform 0.2s ease'
                      }
                    }}
                  >
                    <Database size={18} />
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: isActive ? 600 : 500, fontSize: '16px', lineHeight: 1.3 }}
                    >
                      {conn.name}
                    </Typography>
                  </ButtonBase>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {!selectedConnection && (
        <Alert severity="info" sx={{ mb: 2 }}>
          请选择要查看的数据库连接。
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
                <BarChart3 size={20} style={{ marginRight: '8px' }} />
                数据库概览 - {tableData.database}
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

            {/* 搜索和过滤 */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                <ClipboardList size={20} style={{ marginRight: '8px' }} />
                表列表
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="搜索表名..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={20} />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />

              {/* 搜索结果统计 */}
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {searchTerm ?
                  `找到 ${filteredAndPaginatedTables.totalTables} 个匹配的表` :
                  `显示第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, tableData.table_count)} 个表，共 ${tableData.table_count} 个`
                }
              </Typography>
            </Box>

            {filteredAndPaginatedTables.tables.map((table) => (
              <Accordion
                key={table.table_name}
                expanded={expandedTables.has(table.table_name)}
                onChange={() => toggleTableExpanded(table.table_name)}
                sx={{ mb: 1, border: '1px solid #e2e8f0', borderRadius: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <BarChart3 size={20} style={{ marginRight: '16px', color: '#1976d2' }} />
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
                        <Eye size={20} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {/* 只在真正展开时才渲染内容，提升性能 */}
                  {expandedTables.has(table.table_name) && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                        字段信息 ({table.column_count} 个字段)
                      </Typography>

                      {/* 如果字段太多，显示警告并提供显示所有字段的选项 */}
                      {table.column_count > 50 && !showAllColumns.has(table.table_name) && (
                        <Alert
                          severity="info"
                          sx={{ mb: 2 }}
                          action={
                            <Button
                              size="small"
                              onClick={() => toggleShowAllColumns(table.table_name)}
                              sx={{ color: 'info.main' }}
                            >
                              查看所有字段
                            </Button>
                          }
                        >
                          此表有 {table.column_count} 个字段，为提升性能仅显示前50个字段。
                        </Alert>
                      )}

                      {/* 当显示所有字段时的提示 */}
                      {table.column_count > 50 && showAllColumns.has(table.table_name) && (
                        <Alert
                          severity="warning"
                          sx={{ mb: 2 }}
                          action={
                            <Button
                              size="small"
                              onClick={() => toggleShowAllColumns(table.table_name)}
                              sx={{ color: 'warning.main' }}
                            >
                              只显示前50个
                            </Button>
                          }
                        >
                          正在显示所有 {table.column_count} 个字段，可能会影响页面性能。
                        </Alert>
                      )}

                      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.50' }}>字段名</TableCell>
                              <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.50' }}>类型</TableCell>
                              <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.50' }}>允许空值</TableCell>
                              <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.50' }}>键</TableCell>
                              <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.50' }}>默认值</TableCell>
                              <TableCell sx={{ fontWeight: 600, bgcolor: 'grey.50' }}>额外</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {(showAllColumns.has(table.table_name) ? table.columns : table.columns.slice(0, 50)).map((column, index) => (
                              <TableRow key={index} hover>
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

                      {/* 字段统计信息 */}
                      {table.column_count > 50 && (
                        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" color="text.secondary">
                            {showAllColumns.has(table.table_name)
                              ? `显示所有 ${table.column_count} 个字段`
                              : `显示前 50 个字段，共 ${table.column_count} 个`
                            }
                          </Typography>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => toggleShowAllColumns(table.table_name)}
                          >
                            {showAllColumns.has(table.table_name) ? '收起' : '查看全部'}
                          </Button>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* SQL查询示例 - 在展开状态下显示 */}
                  {expandedTables.has(table.table_name) && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Code size={16} style={{ marginRight: '8px' }} />
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
                  )}
                </AccordionDetails>
              </Accordion>
            ))}

            {/* 分页组件 */}
            {filteredAndPaginatedTables.totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={filteredAndPaginatedTables.totalPages}
                  page={currentPage}
                  onChange={(event, value) => setCurrentPage(value)}
                  color="primary"
                  size="large"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
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
            <BarChart3 size={20} style={{ marginRight: '8px' }} />
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
