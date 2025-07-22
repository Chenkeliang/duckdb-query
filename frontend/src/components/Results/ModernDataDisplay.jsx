import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  IconButton,
  Chip,
  Stack,
  Divider,
  Menu,
  MenuItem,
  TextField,
  InputAdornment,
  Pagination,
  Select,
  FormControl,
  InputLabel,
  Tooltip,
  Alert,
  LinearProgress,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
} from '@mui/material';
import {
  Download as DownloadIcon,
  FilterList as FilterIcon,
  Search as SearchIcon,
  ViewColumn as ColumnsIcon,
  Refresh as RefreshIcon,
  MoreVert as MoreIcon,
  TableChart as TableIcon,
  BarChart as ChartIcon,
  Clear as ClearIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { saveQueryResultAsDatasource, saveQueryToDuckDB } from '../../services/apiClient';

const ModernDataDisplay = ({
  data = [],
  columns = [],
  loading = false,
  onExport,
  onRefresh,
  title = '查询结果',
  sqlQuery = '',
  originalDatasource = null,
  onDataSourceSaved,
}) => {
  const theme = useTheme();
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(new Set(columns.map(col => col.field)));
  const [sortModel, setSortModel] = useState([]);
  const [filterModel, setFilterModel] = useState({});

  // 保存为数据源相关状态
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [datasourceName, setDatasourceName] = useState('');
  const [tableAlias, setTableAlias] = useState('');
  const [saveMode, setSaveMode] = useState('duckdb'); // 'duckdb' 或 'legacy'
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  // 过滤和搜索数据
  const filteredData = useMemo(() => {
    if (!searchText) return data;
    
    return data.filter(row =>
      Object.values(row).some(value =>
        String(value).toLowerCase().includes(searchText.toLowerCase())
      )
    );
  }, [data, searchText]);

  // 分页数据
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredData.slice(startIndex, startIndex + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // AG-Grid列定义
  const columnDefs = useMemo(() => {
    return columns
      .filter(col => visibleColumns.has(col.field))
      .map(col => ({
        ...col,
        sortable: true,
        filter: true,
        resizable: true,
        cellStyle: {
          fontSize: '0.875rem',
          padding: '8px 12px',
        },
        headerClass: 'modern-header',
      }));
  }, [columns, visibleColumns]);

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: data.length,
      filtered: filteredData.length,
      columns: columns.length,
      visibleColumns: visibleColumns.size,
    };
  }, [data, filteredData, columns, visibleColumns]);

  const handleExportMenuOpen = (event) => {
    setExportMenuAnchor(event.currentTarget);
  };

  const handleExportMenuClose = () => {
    setExportMenuAnchor(null);
  };

  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };

  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };

  const handleExport = (format) => {
    onExport?.(format, filteredData);
    handleExportMenuClose();
  };

  const handleColumnToggle = (columnField) => {
    const newVisibleColumns = new Set(visibleColumns);
    if (newVisibleColumns.has(columnField)) {
      newVisibleColumns.delete(columnField);
    } else {
      newVisibleColumns.add(columnField);
    }
    setVisibleColumns(newVisibleColumns);
  };

  const handleClearSearch = () => {
    setSearchText('');
    setCurrentPage(1);
  };

  // 保存为数据源相关函数
  const handleSaveAsDataSource = () => {
    setSaveDialogOpen(true);
    const timestamp = new Date().toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/[\/\s:]/g, '');
    setDatasourceName(`查询结果_${timestamp}`);
    setTableAlias(`query_result_${timestamp}`);
  };

  const handleSaveDialogClose = () => {
    setSaveDialogOpen(false);
    setDatasourceName('');
    setTableAlias('');
    setSaveError('');
  };

  const handleSaveConfirm = async () => {
    if (saveMode === 'duckdb') {
      // 新架构：保存到DuckDB
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
        const result = await saveQueryToDuckDB(
          sqlQuery,
          originalDatasource,
          tableAlias.trim()
        );

        if (result.success) {
          setSaveSuccess(true);
          setSaveDialogOpen(false);
          setTableAlias('');
          setDatasourceName('');

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
    } else {
      // 旧架构：保存为数据源
      if (!datasourceName.trim()) {
        setSaveError('请输入数据源名称');
        return;
      }

      if (!sqlQuery.trim()) {
        setSaveError('没有可保存的查询结果');
        return;
      }

      setSaving(true);
      setSaveError('');

      try {
        const result = await saveQueryResultAsDatasource(
          sqlQuery,
          datasourceName.trim(),
          originalDatasource
        );

        if (result.success) {
          setSaveSuccess(true);
          setSaveDialogOpen(false);
          setDatasourceName('');

          // 通知父组件数据源已保存
          if (onDataSourceSaved) {
            onDataSourceSaved(result.datasource);
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
    }
  };

  const totalPages = Math.ceil(filteredData.length / pageSize);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部工具栏 */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <TableIcon color="primary" />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stats.filtered} / {stats.total} 行 • {stats.visibleColumns} / {stats.columns} 列
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={1}>
              <Tooltip title="刷新数据">
                <IconButton onClick={onRefresh} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>

              <Tooltip title="列设置">
                <IconButton onClick={handleColumnMenuOpen}>
                  <ColumnsIcon />
                </IconButton>
              </Tooltip>

              <Button
                startIcon={<SaveIcon />}
                variant="outlined"
                onClick={handleSaveAsDataSource}
                disabled={data.length === 0 || !sqlQuery}
                size="small"
                color="primary"
              >
                保存为数据源
              </Button>

              <Button
                startIcon={<DownloadIcon />}
                variant="outlined"
                onClick={handleExportMenuOpen}
                disabled={data.length === 0}
                size="small"
              >
                导出
              </Button>
            </Stack>
          </Box>

          {/* 搜索和筛选工具 */}
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              placeholder="搜索数据..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              sx={{ minWidth: 300 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: searchText && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleClearSearch}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>每页显示</InputLabel>
              <Select
                value={pageSize}
                label="每页显示"
                onChange={(e) => {
                  setPageSize(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <MenuItem value={25}>25 行</MenuItem>
                <MenuItem value={50}>50 行</MenuItem>
                <MenuItem value={100}>100 行</MenuItem>
                <MenuItem value={200}>200 行</MenuItem>
              </Select>
            </FormControl>

            {searchText && (
              <Chip
                label={`搜索: "${searchText}"`}
                onDelete={handleClearSearch}
                color="primary"
                variant="outlined"
                size="small"
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* 数据表格 */}
      <Card sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {loading && <LinearProgress />}
        
        <Box sx={{ flex: 1, position: 'relative' }}>
          {data.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'text.secondary',
              }}
            >
              <TableIcon sx={{ fontSize: 64, mb: 2, opacity: 0.5 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                暂无数据
              </Typography>
              <Typography variant="body2">
                执行查询以查看结果
              </Typography>
            </Box>
          ) : (
            <Box
              className="ag-theme-alpine"
              sx={{
                height: '100%',
                width: '100%',
                '& .modern-header': {
                  backgroundColor: theme.palette.grey[50],
                  fontWeight: 600,
                  fontSize: '0.875rem',
                },
                '& .ag-header-cell': {
                  borderRight: `1px solid ${theme.palette.divider}`,
                },
                '& .ag-cell': {
                  borderRight: `1px solid ${theme.palette.divider}`,
                  display: 'flex',
                  alignItems: 'center',
                },
                '& .ag-row:hover': {
                  backgroundColor: theme.palette.action.hover,
                },
              }}
            >
              <AgGridReact
                rowData={paginatedData}
                columnDefs={columnDefs}
                defaultColDef={{
                  flex: 1,
                  minWidth: 100,
                  sortable: true,
                  filter: true,
                  resizable: true,
                }}
                suppressPaginationPanel={true}
                suppressMenuHide={true}
                enableCellTextSelection={true}
                onSortChanged={(params) => setSortModel(params.api.getSortModel())}
                onFilterChanged={(params) => setFilterModel(params.api.getFilterModel())}
              />
            </Box>
          )}
        </Box>

        {/* 底部分页 */}
        {data.length > 0 && (
          <>
            <Divider />
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                显示第 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredData.length)} 条，
                共 {filteredData.length} 条记录
              </Typography>
              
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={(event, page) => setCurrentPage(page)}
                color="primary"
                size="small"
                showFirstButton
                showLastButton
              />
            </Box>
          </>
        )}
      </Card>

      {/* 导出菜单 */}
      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={handleExportMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={() => handleExport('csv')}>
          导出为 CSV
        </MenuItem>
        <MenuItem onClick={() => handleExport('excel')}>
          导出为 Excel
        </MenuItem>
        <MenuItem onClick={() => handleExport('json')}>
          导出为 JSON
        </MenuItem>
      </Menu>

      {/* 列设置菜单 */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={handleColumnMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: { maxHeight: 400, width: 250 },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
            显示列
          </Typography>
          <Stack spacing={1}>
            {columns.map((column) => (
              <Box
                key={column.field}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  p: 1,
                  borderRadius: 1,
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                }}
                onClick={() => handleColumnToggle(column.field)}
              >
                <Typography variant="body2">
                  {column.headerName || column.field}
                </Typography>
                <Chip
                  size="small"
                  label={visibleColumns.has(column.field) ? '显示' : '隐藏'}
                  color={visibleColumns.has(column.field) ? 'primary' : 'default'}
                  variant="outlined"
                />
              </Box>
            ))}
          </Stack>
        </Box>
      </Menu>

      {/* 保存为数据源对话框 */}
      <Dialog open={saveDialogOpen} onClose={handleSaveDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>保存查询结果</DialogTitle>
        <DialogContent>
          <FormControl component="fieldset" sx={{ mt: 2, mb: 2 }}>
            <FormLabel component="legend">保存方式</FormLabel>
            <RadioGroup
              value={saveMode}
              onChange={(e) => setSaveMode(e.target.value)}
              row
            >
              <FormControlLabel
                value="duckdb"
                control={<Radio />}
                label="保存到DuckDB (推荐)"
              />
              <FormControlLabel
                value="legacy"
                control={<Radio />}
                label="传统方式"
              />
            </RadioGroup>
          </FormControl>

          {saveMode === 'duckdb' ? (
            <TextField
              autoFocus
              margin="dense"
              label="DuckDB表别名"
              fullWidth
              variant="outlined"
              value={tableAlias}
              onChange={(e) => setTableAlias(e.target.value)}
              placeholder="请输入表别名，如: finished_orders"
              helperText="表别名将作为DuckDB中的表名，可用于后续关联查询"
            />
          ) : (
            <TextField
              autoFocus
              margin="dense"
              label="数据源名称"
              fullWidth
              variant="outlined"
              value={datasourceName}
              onChange={(e) => setDatasourceName(e.target.value)}
              placeholder="请输入数据源名称"
            />
          )}

          {saveError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {saveError}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {saveMode === 'duckdb'
              ? '将查询结果保存为DuckDB表，支持高效的关联查询和数据分析。'
              : '使用传统方式保存为数据源，兼容旧版本功能。'
            }
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSaveDialogClose} disabled={saving}>
            取消
          </Button>
          <Button
            onClick={handleSaveConfirm}
            variant="contained"
            disabled={saving || (saveMode === 'duckdb' ? !tableAlias.trim() : !datasourceName.trim())}
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
          查询结果已成功保存为数据源！
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ModernDataDisplay;
