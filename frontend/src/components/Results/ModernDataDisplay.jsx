import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Pagination,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { BarChart3, Download, Eye, EyeOff, List, RefreshCw, Save, Search, Table, X, Columns3, Scroll } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { quickExport } from '../../services/apiClient';
import QuickCharts from '../DataVisualization/QuickCharts';
import StableTable from '../StableTable';
import VirtualTable from '../VirtualTable/VirtualTable';

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
  // Visual query specific props
  isVisualQuery = false,
  visualConfig = null,
  generatedSQL = '',
  // Set operation specific props
  isSetOperation = false,
  setOperationConfig = null,
}) => {

  const theme = useTheme();
  const { showSuccess, showError } = useToast();
  const [searchText, setSearchText] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState(new Set());
  const [sortModel, setSortModel] = useState([]);
  const [filterModel, setFilterModel] = useState({});
  const [renderMode, setRenderMode] = useState('agGrid'); // 'agGrid' 或 'virtual'
  const [viewMode, setViewMode] = useState('table'); // 'table' 或 'chart'

  // 保存到表相关状态
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [datasourceName, setDatasourceName] = useState('');
  const [tableAlias, setTableAlias] = useState('');
  const [saveMode, setSaveMode] = useState('duckdb'); // 只支持 'duckdb' 模式
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // 标准化columns格式 - 支持字符串数组和对象数组
  const normalizedColumns = useMemo(() => {
    if (!columns || columns.length === 0) return [];

    // 如果是字符串数组，转换为对象数组
    if (typeof columns[0] === 'string') {
      return columns.map(col => ({
        field: String(col),
        headerName: String(col),
        sortable: true,
        filter: true,
        resizable: true,
      }));
    }

    // 如果已经是对象数组，安全地处理field字段
    return columns.map((col, index) => {
      // 安全地获取field值
      let fieldValue = '';
      if (typeof col === 'string') {
        fieldValue = col;
      } else if (col && typeof col === 'object') {
        fieldValue = col.field || col.name || '';
      }

      // 确保field是有效的字符串
      const safeField = fieldValue ? String(fieldValue) : `column_${index}`;

      return {
        ...col,
        field: safeField,
        headerName: col.headerName || col.name || safeField,
      };
    });
  }, [columns]);

  // 调试 normalizedColumns
  if (process.env.NODE_ENV === 'development') {
  }

  // 当columns变化时，更新visibleColumns
  React.useEffect(() => {
    if (normalizedColumns.length > 0) {
      setVisibleColumns(new Set(normalizedColumns.map(col => col.field)));
    }
  }, [normalizedColumns]);

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

  // 关联结果列的单元格渲染器
  const JoinResultCellRenderer = (params) => {
    const value = params.value;
    if (!value) return '';

    const getDisplayInfo = (joinResult) => {
      switch (joinResult) {
        case 'both':
          return {
            label: '匹配',
            backgroundColor: '#4caf50',
            color: 'white'
          };
        case 'left':
          return {
            label: '仅左表',
            backgroundColor: '#ff9800',
            color: 'white'
          };
        case 'right':
          return {
            label: '仅右表',
            backgroundColor: '#2196f3',
            color: 'white'
          };
        default:
          return {
            label: value,
            backgroundColor: '#e0e0e0',
            color: '#333'
          };
      }
    };

    const displayInfo = getDisplayInfo(value);

    // 创建DOM元素并返回
    const container = document.createElement('div');
    container.style.cssText = 'display: flex; justify-content: center; align-items: center; height: 100%; width: 100%;';

    const chip = document.createElement('span');
    chip.style.cssText = `
      background-color: ${displayInfo.backgroundColor};
      color: ${displayInfo.color};
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 500;
      text-align: center;
      min-width: 60px;
      display: inline-block;
      white-space: nowrap;
    `;
    chip.textContent = displayInfo.label;

    // 移除事件防护，避免React错误

    container.appendChild(chip);
    return container;
  };

  // AG-Grid列定义
  const columnDefs = useMemo(() => {
    return normalizedColumns
      .filter(col => visibleColumns.has(col.field))
      .map(col => {
        // 检查是否是关联结果列
        const isJoinResultColumn = col.field && typeof col.field === 'string' && col.field.startsWith('join_result_');

        const baseConfig = {
          ...col,
          sortable: true,
          filter: true,
          resizable: true,
          width: isJoinResultColumn ? 120 : 150, // 关联结果列稍窄
          minWidth: isJoinResultColumn ? 100 : 80,
          headerClass: isJoinResultColumn ? 'join-result-header' : 'modern-header',
        };

        if (isJoinResultColumn) {
          return {
            ...baseConfig,
            cellRenderer: JoinResultCellRenderer,
            cellStyle: {
              fontSize: '0.875rem',
              padding: '4px 8px',
              textAlign: 'center',
              backgroundColor: 'rgba(33, 150, 243, 0.02)',
            },
            headerName: col.headerName || col.field.replace('join_result_', '关联结果_'),
          };
        } else {
          return {
            ...baseConfig,
            cellStyle: {
              fontSize: '0.875rem',
              padding: '8px 12px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            },
          };
        }
      });
  }, [normalizedColumns, visibleColumns]);

  // 统计信息
  const stats = useMemo(() => {
    return {
      total: data.length,
      filtered: filteredData.length,
      columns: normalizedColumns.length,
      visibleColumns: visibleColumns.size,
    };
  }, [data, filteredData, normalizedColumns, visibleColumns]);

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

  const handleLegacyExport = async (format) => {
    try {
      handleExportMenuClose();

      // 如果有自定义导出函数，优先使用
      if (onExport) {
        onExport(format, filteredData);
        showSuccess(`数据导出为 ${(format || '').toUpperCase()} 格式成功`);
        return;
      }

      // 使用内置快速导出功能
      if (data.length === 0) {
        showError('没有数据可导出');
        return;
      }

      showSuccess('正在准备导出文件...');

      // 构建导出请求 - 使用SQL重新查询完整数据而非前端显示数据
      const exportRequest = {
        sql: sqlQuery,
        originalDatasource: originalDatasource,
        filename: `${title}_${new Date().toLocaleString('zh-CN').replace(/[\/\s:]/g, '_')}`,
        // 备用方案：如果没有SQL，则使用前端数据
        fallback_data: sqlQuery ? null : filteredData,
        fallback_columns: sqlQuery ? null : normalizedColumns.map(col => col.field)
      };

      // 调用快速导出API
      const response = await quickExport(exportRequest);

      if (response && response.data) {
        // 创建下载链接
        const blob = new Blob([response.data], {
          type: response.headers['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });

        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        // 从响应头获取文件名，或使用默认文件名
        const contentDisposition = response.headers['content-disposition'];
        let filename = exportRequest.filename + '.xlsx';
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
          }
        }

        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // 清理
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);

        showSuccess(`文件导出成功: ${filename}`);
      } else {
        throw new Error('导出响应无效');
      }

    } catch (error) {
      showError(`导出失败: ${error.message || '网络错误，请重试'}`);
    }
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

  // 统一导出函数 - 使用新的通用导出接口
  const handleUniversalExport = async (format) => {
    try {
      handleExportMenuClose();
      showSuccess('正在准备导出...');

      // 构建通用导出请求
      const exportRequest = {
        query_type: isSetOperation ? 'set_operation' : 'custom_sql',
        sql_query: sqlQuery || '',
        format: format,
        filename: null, // 让后端自动生成
        original_datasource: originalDatasource,
        set_operation_config: isSetOperation ? setOperationConfig : null,
        visual_analysis_config: null,
        fallback_data: data.length > 0 ? data : null,
        fallback_columns: columns.length > 0 ? columns : null
      };

      const response = await fetch('/api/export/universal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportRequest)
      });

      const result = await response.json();

      if (result.success) {
        if (result.export_type === 'async') {
          // 异步导出（集合操作）
          showSuccess(`导出任务已创建！任务ID: ${result.task_id}。请查看异步任务列表获取文件。`);
        } else {
          // 同步导出（其他查询）
          showSuccess('导出完成！文件正在下载...');
        }
      } else {
        showError(result.error || '导出失败');
      }
    } catch (error) {
      showError(`导出失败: ${error.message}`);
    }
  };

  // 旧版导出函数 - 重定向到新的统一导出
  const handleExport = async (format) => {
    return handleUniversalExport(format);
  };

  // 集合操作导出函数 - 重定向到新的统一导出
  const handleSetOperationExport = async (format) => {
    return handleUniversalExport(format);
  };

  // 保存到表相关函数
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
      let result;

      // 统一使用异步任务保存到表

      // 构建异步任务请求
      const asyncRequest = {
        sql: sqlQuery,
        format: 'parquet', // 保存到表不需要文件格式，但异步任务需要
        custom_table_name: tableAlias.trim(),
        task_type: 'save_to_table'
      };

      // 提交异步任务（设置超时，避免长时间等待）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      try {
        const response = await fetch('/api/async_query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asyncRequest),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || '提交异步任务失败');
        }

        result = await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('提交异步任务超时，请稍后查看异步任务列表');
        }
        throw error;
      }

      if (result.success) {
        setSaveDialogOpen(false);
        setTableAlias('');
        setDatasourceName('');

        const taskId = result.task_id;
        const tableName = tableAlias.trim();
        showSuccess(`异步任务已提交！任务ID: ${taskId}，表名: ${tableName}。系统将自动根据查询结果生成新表，请到异步任务列表查看进度。`);

        // 通知父组件数据源已保存（异步任务完成后会更新）
        if (onDataSourceSaved) {
          onDataSourceSaved({
            id: taskId,
            type: 'async_task',
            name: `异步任务: ${tableName}`,
            status: 'pending',
            task_id: taskId
          });
        }
      } else {
        const errorMsg = result.message || '提交异步任务失败';
        setSaveError(errorMsg);
        showError(errorMsg);
      }
    } catch (error) {
      const errorMsg = error.message || '保存失败，请重试';
      setSaveError(errorMsg);
      showError(errorMsg);
    } finally {
      setSaving(false);
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
              <Table size={20} color="#1976d2" />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  {title}
                  {isVisualQuery && (
                    <Chip
                      label="可视化查询"
                      size="small"
                      color="primary"
                      sx={{ ml: 1, fontSize: '0.75rem' }}
                    />
                  )}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stats.filtered} / {stats.total} 行 • {stats.visibleColumns} / {stats.columns} 列
                  {isVisualQuery && visualConfig && (
                    <>
                      {visualConfig.aggregations && visualConfig.aggregations.length > 0 && (
                        <> • {visualConfig.aggregations.length} 个聚合函数</>
                      )}
                      {visualConfig.filters && visualConfig.filters.length > 0 && (
                        <> • {visualConfig.filters.length} 个筛选条件</>
                      )}
                    </>
                  )}
                </Typography>
              </Box>
            </Box>

            <Stack direction="row" spacing={1}>
              <Tooltip title={viewMode === 'table' ? '切换到图表视图' : '切换到表格视图'}>
                <IconButton
                  onClick={() => setViewMode(viewMode === 'table' ? 'chart' : 'table')}
                  color={viewMode === 'chart' ? 'primary' : 'default'}
                >
                  {viewMode === 'chart' ? <BarChart3 size={20} /> : <Table size={20} />}
                </IconButton>
              </Tooltip>

              {viewMode === 'table' && (
                <Tooltip title={renderMode === 'agGrid' ? '切换到虚拟滚动模式（适合大数据量）' : '切换到标准表格模式（适合小数据量）'}>
                  <IconButton
                    onClick={() => setRenderMode(renderMode === 'agGrid' ? 'virtual' : 'agGrid')}
                    color={renderMode === 'virtual' ? 'primary' : 'default'}
                  >
                    {renderMode === 'virtual' ? <Scroll size={20} /> : <List size={20} />}
                  </IconButton>
                </Tooltip>
              )}

              <Tooltip title="刷新数据">
                <IconButton onClick={onRefresh} disabled={loading}>
                  <RefreshCw size={20} />
                </IconButton>
              </Tooltip>

              <Tooltip title="列设置（显示/隐藏列）">
                <IconButton onClick={handleColumnMenuOpen}>
                  <Columns3 size={20} />
                </IconButton>
              </Tooltip>

              <Button
                startIcon={<Save size={20} />}
                variant="outlined"
                onClick={handleSaveAsDataSource}
                disabled={data.length === 0 || !sqlQuery || loading}
                size="small"
                color="primary"
                sx={{
                  '&.Mui-disabled': {
                    backgroundColor: 'action.disabledBackground',
                    color: 'action.disabled',
                  },
                }}
                title={`调试信息: data.length=${data.length}, sqlQuery="${sqlQuery}", loading=${loading}, 禁用条件: ${data.length === 0 ? '数据为空' : !sqlQuery ? 'SQL查询为空' : loading ? '正在加载' : '无'}`}
              >
                提交异步任务
                {/* 临时调试信息 */}
                {process.env.NODE_ENV === 'development' && (
                  <Typography variant="caption" sx={{ ml: 1, fontSize: '10px', opacity: 0.7 }}>
                    [D:{data.length} S:{sqlQuery ? '✓' : '✗'} L:{loading ? '✓' : '✗'}]
                  </Typography>
                )}
              </Button>

              <Button
                startIcon={<Download size={20} />}
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
                    <Search size={20} color="#666" />
                  </InputAdornment>
                ),
                endAdornment: searchText && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={handleClearSearch}>
                      <X size={16} />
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
              <Table size={64} color="#999" style={{ marginBottom: '16px', opacity: 0.5 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                暂无数据
              </Typography>
              <Typography variant="body2">
                执行查询以查看结果
              </Typography>
            </Box>
          ) : viewMode === 'chart' ? (
            <QuickCharts
              data={filteredData}
              columns={columns}
            />
          ) : renderMode === 'virtual' ? (
            <VirtualTable
              data={filteredData}
              columns={normalizedColumns}
              height={600}
              loading={loading}
              autoRowHeight={true}
            />
          ) : (
            <StableTable
              data={paginatedData}
              columns={columnDefs}
              pageSize={pageSize}
              height={600}
              originalDatasource={originalDatasource}
            />
          )}
        </Box>

        {/* 底部分页 - 仅在AG-Grid模式下显示 */}
        {data.length > 0 && renderMode === 'agGrid' && (
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
        {/* 通用多格式导出菜单 */}
        <MenuItem onClick={() => handleUniversalExport('excel')}>
          导出为 Excel
        </MenuItem>
        <MenuItem onClick={() => handleUniversalExport('csv')}>
          导出为 CSV
        </MenuItem>
        <MenuItem onClick={() => handleUniversalExport('parquet')}>
          导出为 Parquet
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
            {normalizedColumns.map((column) => (
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {visibleColumns.has(column.field) ? (
                    <Eye size={16} color="#1976d2" />
                  ) : (
                    <EyeOff size={16} color="#666" />
                  )}
                  <Chip
                    size="small"
                    label={visibleColumns.has(column.field) ? '显示' : '隐藏'}
                    color={visibleColumns.has(column.field) ? 'primary' : 'default'}
                    variant="outlined"
                  />
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      </Menu>

      {/* 保存到表对话框 */}
      <Dialog open={saveDialogOpen} onClose={handleSaveDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>提交异步保存任务</DialogTitle>
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
            </RadioGroup>
          </FormControl>

          {saveMode === 'duckdb' ? (
            <TextField
              autoFocus
              margin="dense"
              label="表名"
              fullWidth
              variant="outlined"
              value={tableAlias}
              onChange={(e) => setTableAlias(e.target.value)}
              placeholder="请输入自定义表名，如: finished_orders"
              helperText="此表将作为异步任务创建，系统会自动根据查询结果生成新表，完成后可在异步任务列表中查看和下载"
              required
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
            {saving ? '提交中...' : '提交异步任务'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ModernDataDisplay;
