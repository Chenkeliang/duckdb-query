import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  IconButton,
  LinearProgress,
  Paper
} from '@mui/material';
import {
  PlayArrow,
  CloudUpload,
  Link,
  Save,
  TableChart,
  Delete,
  Visibility,
  Edit
} from '@mui/icons-material';
import {
  executeDuckDBSQL,
  uploadFileToDuckDB,
  getDuckDBTablesEnhanced,
  deleteDuckDBTableEnhanced,
  getDuckDBTableInfo,
  readFromUrl,
  getUrlInfo,
  submitAsyncQuery
} from '../services/apiClient';

const EnhancedSQLExecutor = ({ onResultsReceived, onDataSourceSaved }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [sqlQuery, setSqlQuery] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [tableAlias, setTableAlias] = useState('');
  const [saveAsTable, setSaveAsTable] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [duckdbTables, setDuckdbTables] = useState([]);
  const [tableManagerOpen, setTableManagerOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // 获取DuckDB中的表列表
  const fetchDuckDBTables = async () => {
    try {
      const response = await getDuckDBTablesEnhanced();
      // 提取表名数组
      const tableNames = response.tables ? response.tables.map(table => table.table_name) : [];
      setDuckdbTables(tableNames);
    } catch (err) {
      console.error('获取表列表失败:', err);
    }
  };

  useEffect(() => {
    fetchDuckDBTables();
  }, []);

  // 执行SQL查询
  const executeSQL = async () => {
    if (!sqlQuery.trim()) {
      setError('请输入SQL查询语句');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await executeDuckDBSQL(sqlQuery, saveAsTable || null);

      if (response.success) {
        onResultsReceived({
          data: response.data,
          columns: response.columns,
          sqlQuery: sqlQuery,
          executionTime: response.execution_time,
          rowCount: response.row_count
        });

        if (saveAsTable) {
          setSuccess(`查询执行成功，结果已保存为表: ${saveAsTable}`);
          fetchDuckDBTables();
          // 通知全局数据源状态更新
          if (onDataSourceSaved) {
            onDataSourceSaved({
              id: saveAsTable,
              type: 'duckdb',
              name: `DuckDB表: ${saveAsTable}`,
              row_count: response.row_count,
              columns: response.columns
            });
          }
        } else {
          setSuccess('查询执行成功');
        }
      }
    } catch (err) {
      setError(err.message || '查询执行失败');
    } finally {
      setLoading(false);
    }
  };

  // 异步执行SQL查询
  const executeAsyncSQL = async () => {
    if (!sqlQuery.trim()) {
      setError('请输入SQL查询语句');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await submitAsyncQuery(sqlQuery);

      if (response.success) {
        setSuccess(`异步任务已提交，任务ID: ${response.task_id.substring(0, 8)}...。请前往"异步任务"页面查看进度。`);
      } else {
        setError(response.message || '提交异步任务失败');
      }
    } catch (err) {
      setError(err.message || '提交异步任务失败');
    } finally {
      setLoading(false);
    }
  };

  // 处理文件上传
  const handleFileUpload = async () => {
    if (!selectedFile) {
      setError('请选择文件');
      return;
    }

    if (!tableAlias.trim()) {
      setError('请输入表别名');
      return;
    }

    setLoading(true);
    setError('');
    setUploadProgress(0);

    try {
      const response = await uploadFileToDuckDB(selectedFile, tableAlias);

      if (response.success) {
        setSuccess(`文件上传成功，已创建表: ${tableAlias}`);
        fetchDuckDBTables();
        // 通知全局数据源状态更新
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: tableAlias,
            type: 'duckdb',
            name: `DuckDB表: ${tableAlias}`,
            row_count: response.row_count,
            columns: response.columns
          });
        }
        setSelectedFile(null);
        setTableAlias('');
      }
    } catch (err) {
      setError(err.message || '文件上传失败');
    } finally {
      setLoading(false);
      setUploadProgress(0);
    }
  };

  // 删除表
  const handleDeleteTable = async (tableName) => {
    try {
      await deleteDuckDBTableEnhanced(tableName);
      setSuccess(`表 ${tableName} 已删除`);
      fetchDuckDBTables();
      // 通知全局数据源状态更新
      if (onDataSourceSaved) {
        onDataSourceSaved();
      }
    } catch (err) {
      setError(`删除表失败: ${err.message}`);
    }
  };

  // 处理URL读取
  const handleUrlRead = async () => {
    if (!fileUrl.trim()) {
      setError('请输入文件URL');
      return;
    }

    if (!tableAlias.trim()) {
      setError('请输入表别名');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await readFromUrl(fileUrl, tableAlias);

      if (result.success) {
        setSuccess(`成功从URL读取文件并创建表: ${result.table_name}`);
        fetchDuckDBTables();

        // 清空输入
        setFileUrl('');
        setTableAlias('');
      } else {
        setError('URL读取失败');
      }
    } catch (err) {
      setError(`URL读取失败: ${err.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 600, color: '#1976d2' }}>
        🚀 增强SQL执行器
      </Typography>

      <Grid container spacing={3}>
        {/* 左侧：数据源管理 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: 'fit-content' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                📁 数据源管理
              </Typography>

              <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 2 }}>
                <Tab label="文件上传" />
                <Tab label="URL读取" />
              </Tabs>

              {activeTab === 0 && (
                <Box>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,.json,.parquet,.pq"
                    onChange={(e) => setSelectedFile(e.target.files[0])}
                    style={{ display: 'none' }}
                    id="file-upload"
                  />
                  <label htmlFor="file-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      startIcon={<CloudUpload />}
                      fullWidth
                      sx={{ mb: 2 }}
                    >
                      选择文件
                    </Button>
                  </label>
                  
                  {selectedFile && (
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      已选择: {selectedFile.name}
                    </Typography>
                  )}

                  <TextField
                    label="表别名"
                    value={tableAlias}
                    onChange={(e) => setTableAlias(e.target.value)}
                    fullWidth
                    sx={{ mb: 2 }}
                    placeholder="例如: my_data"
                  />

                  {uploadProgress > 0 && (
                    <LinearProgress variant="determinate" value={uploadProgress} sx={{ mb: 2 }} />
                  )}

                  <Button
                    variant="contained"
                    onClick={handleFileUpload}
                    disabled={loading || !selectedFile || !tableAlias}
                    fullWidth
                  >
                    上传并创建表
                  </Button>
                </Box>
              )}

              {activeTab === 1 && (
                <Box>
                  <TextField
                    label="文件URL"
                    value={fileUrl}
                    onChange={(e) => setFileUrl(e.target.value)}
                    fullWidth
                    sx={{ mb: 1 }}
                    placeholder="https://example.com/data.csv"
                  />

                  <Box sx={{ mb: 2, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      💡 <strong>支持的URL格式：</strong><br />
                      • 直接文件链接：https://example.com/data.csv<br />
                      • GitHub文件：https://github.com/user/repo/blob/main/data.csv (自动转换)<br />
                      • 支持格式：CSV, JSON, Parquet, Excel
                    </Typography>
                  </Box>

                  <TextField
                    label="表别名"
                    value={tableAlias}
                    onChange={(e) => setTableAlias(e.target.value)}
                    fullWidth
                    sx={{ mb: 2 }}
                    placeholder="例如: remote_data"
                  />

                  <Button
                    variant="contained"
                    disabled={loading || !fileUrl || !tableAlias}
                    startIcon={<Link />}
                    fullWidth
                    onClick={handleUrlRead}
                  >
                    读取远程文件
                  </Button>
                </Box>
              )}

              {/* DuckDB表管理 */}
              <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">🗃️ DuckDB表</Typography>
                  <Button
                    size="small"
                    onClick={() => setTableManagerOpen(true)}
                    startIcon={<TableChart />}
                  >
                    管理
                  </Button>
                </Box>

                <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                  {duckdbTables.map((table) => (
                    <Chip
                      key={table}
                      label={table}
                      size="small"
                      sx={{ m: 0.5 }}
                      onClick={() => setSqlQuery(`SELECT * FROM "${table}" LIMIT 100`)}
                    />
                  ))}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* 右侧：SQL查询 */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                ⚡ SQL查询执行器
              </Typography>

              <TextField
                label="SQL查询"
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                multiline
                rows={8}
                fullWidth
                sx={{ mb: 2 }}
                placeholder="输入您的SQL查询语句..."
              />

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mb: 2 }}>
                提示：界面查询默认限制10,000行。如需完整结果，请使用异步任务功能。
              </Typography>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="保存结果为表 (可选)"
                    value={saveAsTable}
                    onChange={(e) => setSaveAsTable(e.target.value)}
                    fullWidth
                    placeholder="例如: query_result"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Button
                    variant="contained"
                    onClick={executeSQL}
                    disabled={loading || !sqlQuery.trim()}
                    startIcon={loading ? <CircularProgress size={20} /> : <PlayArrow />}
                    fullWidth
                    sx={{ height: '56px' }}
                  >
                    执行预览
                  </Button>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Button
                    variant="outlined"
                    onClick={executeAsyncSQL}
                    disabled={loading || !sqlQuery.trim()}
                    startIcon={<PlayArrow />}
                    fullWidth
                    sx={{ height: '56px' }}
                  >
                    作为异步任务运行
                  </Button>
                </Grid>
              </Grid>

              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
              {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 表管理对话框 */}
      <Dialog open={tableManagerOpen} onClose={() => setTableManagerOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>🗃️ DuckDB表管理</DialogTitle>
        <DialogContent>
          <List>
            {duckdbTables.map((table) => (
              <ListItem key={table}>
                <ListItemText primary={table} />
                <IconButton onClick={() => setSqlQuery(`SELECT * FROM "${table}" LIMIT 100`)}>
                  <Visibility />
                </IconButton>
                <IconButton onClick={() => handleDeleteTable(table)} color="error">
                  <Delete />
                </IconButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTableManagerOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EnhancedSQLExecutor;
