import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SaveIcon from '@mui/icons-material/Save';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fade,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Code, Play, Star } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { executeSQL, saveQueryToDuckDB } from '../../services/apiClient';
import DuckDBSQLEditor from '../DuckDBSQLEditor';
import AddSQLFavoriteDialog from '../SQLFavorites/AddSQLFavoriteDialog';
import SQLFavoritesSelect from '../SQLFavorites/SQLFavoritesSelect';

// 智能LIMIT处理函数
const applyDisplayLimit = (sql, maxRows = 10000) => {
  const sqlTrimmed = sql.trim().replace(/;$/, '');

  // 检查是否已有LIMIT
  const limitMatch = sqlTrimmed.match(/\bLIMIT\s+(\d+)(\s+OFFSET\s+\d+)?\s*$/i);

  if (limitMatch) {
    const userLimit = parseInt(limitMatch[1]);
    if (userLimit > maxRows) {
      // 用户LIMIT > 10000，前端显示限制为10000，但保存时使用用户原始LIMIT
      const displaySql = sqlTrimmed.replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*$/i, `LIMIT ${maxRows}`);
      return {
        displaySql: displaySql,
        originalSql: sqlTrimmed  // 保留用户原始LIMIT
      };
    } else {
      // 用户LIMIT ≤ 10000，前端和保存都使用用户LIMIT
      return {
        displaySql: sqlTrimmed,
        originalSql: sqlTrimmed
      };
    }
  } else {
    // 用户无LIMIT，前端添加LIMIT 10000，保存时无LIMIT
    return {
      displaySql: `${sqlTrimmed} LIMIT ${maxRows}`,
      originalSql: sqlTrimmed  // 保留用户原始SQL（无LIMIT）
    };
  }
};

const SqlExecutor = ({ databaseConnections = [], onDataSourceSaved, onResultsReceived }) => {
  const [sqlQuery, setSqlQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [results, setResults] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [editorTheme, setEditorTheme] = useState("github-light");

  // SQL编辑器引用
  const sqlEditorRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);

  // 收藏相关状态
  const [addFavoriteDialogOpen, setAddFavoriteDialogOpen] = useState(false);

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
    // 从编辑器获取最新的SQL内容
    const currentQuery = sqlEditorRef.current ? sqlEditorRef.current.getValue() : sqlQuery;

    if (!currentQuery.trim()) {
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

      // 智能处理SQL：前端显示限制为10000条，保存时使用原始SQL
      const { displaySql, originalSql } = applyDisplayLimit(currentQuery);

      // 调用API执行SQL查询（使用显示SQL）
      const result = await executeSQL(displaySql, dataSource);

      if (result) {
        const resultData = {
          columns: result.columns || [],
          data: result.data || [],
          canSaveToDuckDB: result.can_save_to_duckdb || false,
          sourceType: result.source_type || 'unknown',
          sqlQuery: originalSql,  // 保存原始SQL用于保存功能
          originalDatasource: dataSource  // 添加数据源信息用于保存功能
        };
        setResults(resultData);

        // 通知父组件查询结果
        if (onResultsReceived) {
          onResultsReceived(resultData);
        }

        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError('查询未返回结果');
      }
    } catch (err) {
      setError(`执行失败: ${err.message || '未知错误'}`);
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

    // 从编辑器获取最新的SQL内容
    const currentQuery = sqlEditorRef.current ? sqlEditorRef.current.getValue() : sqlQuery;

    if (!currentQuery.trim()) {
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
        currentQuery,
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

  // 处理收藏SQL
  const handleAddFavorite = () => {
    const currentQuery = sqlEditorRef.current ? sqlEditorRef.current.getValue() : sqlQuery;
    if (!currentQuery.trim()) {
      setError('请先输入SQL查询语句');
      return;
    }
    setAddFavoriteDialogOpen(true);
  };

  // 处理选择收藏的SQL
  const handleSelectFavorite = (favorite) => {
    // 使用 setTimeout 确保编辑器已经渲染完成
    setTimeout(() => {
      if (sqlEditorRef.current && sqlEditorRef.current.setValue) {
        sqlEditorRef.current.setValue(favorite.sql);
      } else {
        setSqlQuery(favorite.sql);
      }
    }, 100);
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
            <Code size={20} style={{ marginRight: '8px', color: '#1976d2' }} />
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

          {/* SQL收藏选择 */}
          <SQLFavoritesSelect
            onSelectFavorite={handleSelectFavorite}
            placeholder="选择收藏的SQL"
            filterType="mysql"
          />

          {/* 编辑器工具栏 */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
              SQL查询编辑器
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleAddFavorite}
                startIcon={<Star size={16} />}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  px: 2.5,
                  py: 0.5,
                  borderRadius: 2,
                  borderColor: '#e0e0e0',
                  color: '#666',
                  height: '40px',
                  '&:hover': {
                    borderColor: '#ff9800',
                    color: '#ff9800',
                    backgroundColor: 'rgba(255, 152, 0, 0.04)'
                  }
                }}
              >
                收藏SQL
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => sqlEditorRef.current?.formatSQL()}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  px: 2.5,
                  py: 0.5,
                  borderRadius: 2,
                  borderColor: '#e0e0e0',
                  color: '#666',
                  height: '40px',
                  '&:hover': {
                    borderColor: '#1976d2',
                    color: '#1976d2',
                    backgroundColor: 'rgba(25, 118, 210, 0.04)'
                  }
                }}
              >
                格式化SQL
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => sqlEditorRef.current?.toggleFullscreen()}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  px: 2.5,
                  py: 0.5,
                  borderRadius: 2,
                  borderColor: '#e0e0e0',
                  color: '#666',
                  height: '40px',
                  '&:hover': {
                    borderColor: '#1976d2',
                    color: '#1976d2',
                    backgroundColor: 'rgba(25, 118, 210, 0.04)'
                  }
                }}
              >
                全屏编辑
              </Button>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <Select
                  value={editorTheme}
                  displayEmpty
                  onChange={(e) => setEditorTheme(e.target.value)}
                  sx={{ height: '40px' }}
                >
                  <MenuItem value="dark">Dark</MenuItem>
                  <MenuItem value="github-light">GitHub Light</MenuItem>
                  <MenuItem value="solarized-light">Solarized Light</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          <DuckDBSQLEditor
            ref={sqlEditorRef}
            height="200px"
            placeholder="输入SQL查询语句..."
            theme={editorTheme}
            showLineNumbers={true}
            showGutter={true}
          />

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
            <Button
              variant="contained"
              startIcon={<Play size={20} />}
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

          {false && results && results.data && results.data.length > 0 && !onResultsReceived && (
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

          {false && results && results.data && results.data.length === 0 && !onResultsReceived && (
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

      {/* 添加收藏对话框 */}
      <AddSQLFavoriteDialog
        open={addFavoriteDialogOpen}
        onClose={() => setAddFavoriteDialogOpen(false)}
        sqlContent={sqlEditorRef.current ? sqlEditorRef.current.getValue() : sqlQuery}
        sqlType="mysql"
        onSuccess={() => {
          // 触发收藏列表刷新
          window.dispatchEvent(new CustomEvent('sqlFavoritesUpdated'));
        }}
      />
    </Box>
  );
};

export default SqlExecutor;