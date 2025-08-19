import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Alert,
  Fade,
  CircularProgress,
  IconButton,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Snackbar,
  Select,
  MenuItem,
  InputLabel
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CodeIcon from '@mui/icons-material/Code';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SaveIcon from '@mui/icons-material/Save';
import { executeSQL, saveQueryToDuckDB, getMySQLDataSources } from '../../services/apiClient';

const SqlExecutor = ({ databaseConnections = [], onDataSourceSaved }) => {
  const [sqlQuery, setSqlQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // 数据源相关状态
  const [selectedDataSource, setSelectedDataSource] = useState('');

  // 保存相关状态
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [tableAlias, setTableAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 使用传入的数据库连接列表
  useEffect(() => {
    if (databaseConnections && databaseConnections.length > 0) {
      // 默认选择第一个数据库连接
      setSelectedDataSource(databaseConnections[0].id);
    }
  }, [databaseConnections]);

  // 根据选择的数据源预填充示例查询
  React.useEffect(() => {
    if (selectedDataSource) {
      const selectedDS = databaseConnections.find(ds => ds.id === selectedDataSource);
      if (selectedDS) {
        // 根据数据库名称生成示例查询
        const dbName = selectedDS.params?.database || 'your_table';
        setSqlQuery(`SELECT * FROM ${dbName === 'store_order' ? 'yz_order' : 'your_table'} LIMIT 10`);
      }
    }
  }, [selectedDataSource, databaseConnections]);

  const handleExecuteSql = async () => {
    if (!sqlQuery.trim()) {
      setError('请输入SQL查询语句');
      return;
    }

    if (!selectedDataSource) {
      setError('请选择数据源');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      // 构建数据源对象
      const dataSource = {
        type: 'mysql',
        id: selectedDataSource
      };

      // 调用API执行SQL查询
      const result = await executeSQL(sqlQuery, dataSource);

      if (result) {
        setResults({
          columns: result.columns || [],
          data: result.data || [],
          canSaveToDuckDB: result.can_save_to_duckdb || false,
          sourceType: result.source_type || 'unknown'
        });
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('查询未返回结果');
      }
    } catch (err) {
      setError(`执行失败: ${err.message || '未知错误'}`);
      console.error("SQL执行错误:", err);
    } finally {
      setLoading(false);
    }
  };

  // 保存为DuckDB数据源
  const handleSaveAsDataSource = () => {
    setSaveDialogOpen(true);
    const timestamp = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/[\/\s:]/g, '');
    setTableAlias(`query_result_${timestamp}`);
  };

  const handleSaveDialogClose = () => {
    setSaveDialogOpen(false);
    setTableAlias('');
    setSaveError('');
  };

  const handleSaveConfirm = async () => {
    if (!tableAlias.trim()) {
      setSaveError('请输入DuckDB表别名');
      return;
    }

    if (!sqlQuery.trim()) {
      setSaveError('没有可保存的查询结果');
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      // 构建数据源对象
      const dataSource = {
        type: 'mysql',
        id: selectedDataSource
      };

      const result = await saveQueryToDuckDB(
        sqlQuery,
        dataSource,
        tableAlias.trim()
      );

      if (result.success) {
        setSaveSuccess(true);
        setSaveDialogOpen(false);
        setTableAlias('');

        // 通知父组件数据源已保存
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: result.table_alias,
            type: 'duckdb',
            name: `DuckDB表: ${result.table_alias}`,
            row_count: result.row_count,
            columns: result.columns
          });
        }

        // 3秒后隐藏成功提示
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setSaveError(result.message || '保存失败');
      }
    } catch (error) {
      setSaveError(error.message || '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 如果没有可用的数据库连接，显示提示
  if (databaseConnections.length === 0) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        没有可用的数据库连接，请先在数据源管理页面添加数据库连接。
      </Alert>
    );
  }

  return (
    <Box sx={{ mb: 3 }}>
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
            SQL查询执行成功
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
            <CodeIcon sx={{ mr: 1, fontSize: '1.2rem', color: '#1976d2' }} />
            <Typography sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
              SQL查询执行器 - {selectedDataSource ? databaseConnections.find(ds => ds.id === selectedDataSource)?.name || selectedDataSource : '请选择数据库连接'}
            </Typography>
          </Box>
        </AccordionSummary>
        
        <AccordionDetails sx={{ p: 2, pt: 2.5 }}>
          {/* 数据库连接选择器 */}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="datasource-select-label">选择数据库连接</InputLabel>
            <Select
              labelId="datasource-select-label"
              value={selectedDataSource}
              label="选择数据库连接"
              onChange={(e) => setSelectedDataSource(e.target.value)}
              size="small"
            >
              {databaseConnections.map((ds) => (
                <MenuItem key={ds.id} value={ds.id}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {ds.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(ds.type || '').toUpperCase()} - {ds.params?.database || '数据库'}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="SQL查询"
            variant="outlined"
            size="small"
            multiline
            rows={4}
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            fullWidth
            sx={{ 
              mb: 2,
              borderRadius: '4px', 
              '& textarea': { fontFamily: 'monospace', fontSize: '0.9rem' }
            }}
            placeholder="输入SQL查询语句..."
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mb: 2 }}>
            提示：界面查询默认限制10,000行。如需完整结果，请使用异步任务功能。
          </Typography>
          
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={handleExecuteSql}
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
              {loading ? <CircularProgress size={24} /> : '执行SQL'}
            </Button>

            {results && results.canSaveToDuckDB && (
              <Button
                variant="outlined"
                startIcon={<SaveIcon />}
                onClick={handleSaveAsDataSource}
                disabled={loading || saving}
                sx={{
                  borderRadius: '20px',
                  minWidth: '160px',
                  py: 0.75,
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                保存到DuckDB
              </Button>
            )}
          </Box>
          
          {results && results.data && results.data.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                查询结果 ({results.data.length} 条记录)
              </Typography>
              
              <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
                <TableContainer sx={{ maxHeight: 400 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        {results.columns.map((column, index) => (
                          <TableCell 
                            key={index}
                            sx={{ 
                              fontWeight: 'bold', 
                              backgroundColor: '#f5f5f5',
                              fontSize: '0.85rem'
                            }}
                          >
                            {column}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {results.data
                        .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                        .map((row, rowIndex) => (
                          <TableRow hover key={rowIndex}>
                            {results.columns.map((column, colIndex) => (
                              <TableCell 
                                key={colIndex}
                                sx={{ fontSize: '0.85rem' }}
                              >
                                {row[column] !== null && row[column] !== undefined 
                                  ? String(row[column]) 
                                  : <span style={{ color: '#999', fontStyle: 'italic' }}>null</span>}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                <TablePagination
                  rowsPerPageOptions={[10, 25, 50, 100]}
                  component="div"
                  count={results.data.length}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  labelRowsPerPage="每页行数:"
                  labelDisplayedRows={({ from, to, count }) => `${from}-${to} 共 ${count}`}
                />
              </Paper>
            </Box>
          )}
          
          {results && results.data && results.data.length === 0 && (
            <Alert 
              severity="info" 
              sx={{ mt: 3 }}
            >
              查询执行成功，但没有返回数据
            </Alert>
          )}
        </AccordionDetails>
      </Accordion>

      {/* 保存为DuckDB数据源对话框 */}
      <Dialog open={saveDialogOpen} onClose={handleSaveDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>保存查询结果到DuckDB</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="DuckDB表别名"
            fullWidth
            variant="outlined"
            value={tableAlias}
            onChange={(e) => setTableAlias(e.target.value)}
            placeholder="请输入表别名，如: query_result_0723"
            helperText="表别名将作为DuckDB中的表名，可用于后续关联查询"
            sx={{ mt: 2 }}
          />
          {saveError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {saveError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            将查询结果保存为DuckDB表，支持高效的关联查询和数据分析。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveDialogClose} disabled={saving}>
            取消
          </Button>
          <Button
            onClick={handleSaveConfirm}
            variant="contained"
            disabled={saving || !tableAlias.trim()}
          >
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 成功提示 */}
      <Snackbar
        open={saveSuccess}
        autoHideDuration={3000}
        onClose={() => setSaveSuccess(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSaveSuccess(false)}>
          查询结果已成功保存到DuckDB！
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default SqlExecutor;