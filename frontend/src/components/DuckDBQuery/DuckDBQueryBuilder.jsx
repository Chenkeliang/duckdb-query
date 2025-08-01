import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Chip,
  Grid,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Tooltip,
  IconButton,
  Snackbar
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  PlayArrow as PlayArrowIcon,
  Info as InfoIcon,
  TableChart as TableChartIcon,
  Save as SaveIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';

const DuckDBQueryBuilder = ({ onResultsReceived }) => {
  const theme = useTheme();
  const [sqlQuery, setSqlQuery] = useState('');
  const [availableTables, setAvailableTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [queryResults, setQueryResults] = useState(null);
  const [limit, setLimit] = useState(1000);
  const [saveAsTable, setSaveAsTable] = useState('');
  const [enableSaveAsTable, setEnableSaveAsTable] = useState(false);
  const [queryHistory, setQueryHistory] = useState([]);
  const [showSnackbar, setShowSnackbar] = useState(false);

  // 加载可用表
  const loadAvailableTables = async () => {
    setTablesLoading(true);
    try {
      const response = await fetch('/api/duckdb/available_tables');
      const data = await response.json();
      
      if (data.success) {
        setAvailableTables(data.tables || []);
        if (data.tables.length === 0) {
          setError('当前DuckDB中没有可用的表，请先上传文件或连接数据库');
        }
      } else {
        setError('获取表信息失败');
      }
    } catch (err) {
      setError(`获取表信息失败: ${err.message}`);
    } finally {
      setTablesLoading(false);
    }
  };

  // 获取表结构
  const getTableSchema = async (tableName) => {
    try {
      const response = await fetch(`/api/duckdb/table_schema/${tableName}`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedTable(data);
      } else {
        setError('获取表结构失败');
      }
    } catch (err) {
      setError(`获取表结构失败: ${err.message}`);
    }
  };

  // 执行SQL查询
  const executeQuery = async () => {
    if (!sqlQuery.trim()) {
      setError('请输入SQL查询语句');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const requestBody = {
        sql: sqlQuery,
        limit: limit,
        save_as_table: enableSaveAsTable ? saveAsTable : null
      };

      const response = await fetch('/api/duckdb/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.success) {
        setQueryResults(data);
        setSuccess(`查询成功，返回 ${data.row_count} 行数据，耗时 ${data.execution_time_ms.toFixed(2)}ms`);
        
        // 添加到查询历史
        const historyItem = {
          sql: sqlQuery,
          timestamp: new Date().toLocaleString(),
          rowCount: data.row_count,
          executionTime: data.execution_time_ms
        };
        setQueryHistory(prev => [historyItem, ...prev.slice(0, 9)]); // 保留最近10条

        // 如果保存为表成功
        if (data.saved_table) {
          setSuccess(prev => `${prev} 查询结果已保存为表: ${data.saved_table}`);
          loadAvailableTables(); // 重新加载表列表
        }

        // 传递结果给父组件
        if (onResultsReceived) {
          onResultsReceived({
            data: data.data,
            columns: data.columns,
            sqlQuery: sqlQuery,
            executionTime: data.execution_time_ms
          });
        }

        setShowSnackbar(true);
      } else {
        setError(data.detail || '查询执行失败');
      }
    } catch (err) {
      setError(`查询执行失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 插入表名到SQL
  const insertTableName = (tableName) => {
    const newQuery = sqlQuery ? `${sqlQuery} "${tableName}"` : `SELECT * FROM "${tableName}" LIMIT 10`;
    setSqlQuery(newQuery);
  };

  // 使用历史查询
  const useHistoryQuery = (historySql) => {
    setSqlQuery(historySql);
  };

  useEffect(() => {
    loadAvailableTables();
  }, []);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
        🔍 DuckDB SQL 查询构建器
      </Typography>
      
      {/* 可用表列表 */}
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 500 }}>
              可用数据表 ({availableTables.length})
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={loadAvailableTables}
              disabled={tablesLoading}
              startIcon={tablesLoading ? <CircularProgress size={16} /> : <TableChartIcon />}
            >
              刷新表列表
            </Button>
          </Box>

          {tablesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress />
            </Box>
          ) : availableTables.length > 0 ? (
            <Grid container spacing={1}>
              {availableTables.map((table) => (
                <Grid item key={table.table_name}>
                  <Tooltip title={`${table.row_count} 行, ${table.column_count} 列`}>
                    <Chip
                      label={table.table_name}
                      onClick={() => insertTableName(table.table_name)}
                      onDoubleClick={() => getTableSchema(table.table_name)}
                      variant="outlined"
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: theme.palette.primary.light,
                          color: 'white'
                        }
                      }}
                    />
                  </Tooltip>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Alert severity="info">
              当前没有可用的表。请先上传文件或连接数据库。
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* SQL查询输入 */}
      <Card sx={{ mb: 3, borderRadius: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 500 }}>
            SQL 查询语句
          </Typography>
          
          <TextField
            label="输入DuckDB SQL查询"
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            multiline
            minRows={6}
            maxRows={12}
            fullWidth
            variant="outlined"
            placeholder={`示例查询：
SELECT * FROM "your_table" LIMIT 10;
SELECT column1, COUNT(*) as count FROM "your_table" GROUP BY column1;
SELECT a.*, b.column FROM "table_a" a JOIN "table_b" b ON a.id = b.id;`}
            sx={{ 
              mb: 2,
              '& .MuiInputBase-root': {
                fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                fontSize: '0.9rem'
              }
            }}
          />

          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="结果限制"
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value) || 1000)}
                size="small"
                inputProps={{ min: 1, max: 10000 }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={4}>
              <FormControlLabel
                control={
                  <Switch
                    checked={enableSaveAsTable}
                    onChange={(e) => setEnableSaveAsTable(e.target.checked)}
                  />
                }
                label="保存为新表"
              />
            </Grid>

            {enableSaveAsTable && (
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="新表名"
                  value={saveAsTable}
                  onChange={(e) => setSaveAsTable(e.target.value)}
                  size="small"
                  placeholder="new_table_name"
                />
              </Grid>
            )}

            <Grid item xs={12} sm={6} md={2}>
              <Button
                variant="contained"
                onClick={executeQuery}
                disabled={loading || !sqlQuery.trim()}
                startIcon={loading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                fullWidth
                sx={{ borderRadius: 20 }}
              >
                执行查询
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 查询历史 */}
      {queryHistory.length > 0 && (
        <Accordion sx={{ mb: 3 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 500 }}>
              <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
              查询历史 ({queryHistory.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
              {queryHistory.map((item, index) => (
                <Box
                  key={index}
                  sx={{
                    p: 1,
                    mb: 1,
                    border: '1px solid #e0e0e0',
                    borderRadius: 1,
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: '#f5f5f5' }
                  }}
                  onClick={() => useHistoryQuery(item.sql)}
                >
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', mb: 0.5 }}>
                    {item.sql.length > 100 ? `${item.sql.substring(0, 100)}...` : item.sql}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.timestamp} • {item.rowCount} 行 • {item.executionTime.toFixed(2)}ms
                  </Typography>
                </Box>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}

      {/* 表结构信息 */}
      {selectedTable && (
        <Accordion sx={{ mb: 3 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography sx={{ fontWeight: 500 }}>
              表结构: {selectedTable.table_name} ({selectedTable.row_count} 行)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>列名</TableCell>
                    <TableCell>数据类型</TableCell>
                    <TableCell>允许空值</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedTable.schema.map((column, index) => (
                    <TableRow key={index}>
                      <TableCell sx={{ fontWeight: 500 }}>{column.column_name}</TableCell>
                      <TableCell>{column.column_type}</TableCell>
                      <TableCell>{column.null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      )}

      {/* 错误和成功消息 */}
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

      {/* 成功提示 Snackbar */}
      <Snackbar
        open={showSnackbar}
        autoHideDuration={3000}
        onClose={() => setShowSnackbar(false)}
        message="查询执行成功！"
      />
    </Box>
  );
};

export default DuckDBQueryBuilder;
