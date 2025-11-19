/* eslint-disable react/prop-types */
import {
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  ExpandLess,
  ExpandMore,
  Info as InfoIcon,
  QueryStats,
  TableChart as TableIcon,
  ViewList
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { Database, RotateCcw, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { deleteDuckDBTableEnhanced, getDuckDBTablesEnhanced } from '../../services/apiClient';

const DuckDBManagementPage = ({ onDataSourceChange }) => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedTable, setSelectedTable] = useState(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof document === 'undefined') {
      return false;
    }
    return document.documentElement.classList.contains('dark');
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({
    '查询结果表': true,
    '数据表': true
  });

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      if (typeof document === 'undefined') {
        return;
      }
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    const handleThemeChange = (event) => {
      if (event?.detail && typeof event.detail.isDark === 'boolean') {
        setIsDarkMode(event.detail.isDark);
      } else {
        syncTheme();
      }
    };
    window.addEventListener('duckquery-theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('duckquery-theme-change', handleThemeChange);
    };
  }, []);

  const loadTables = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getDuckDBTablesEnhanced();

      // 处理 /api/duckdb_tables 返回的数据格式: { success: true, tables: [...], total_tables: number }
      let tablesArray = [];
      if (data && data.success && Array.isArray(data.tables)) {
        tablesArray = data.tables;
      } else if (Array.isArray(data)) {
        // 如果直接返回数组
        tablesArray = data;
      } else if (data && Array.isArray(data.tables)) {
        // 其他格式的 tables 字段
        tablesArray = data.tables;
      }

      setTables(tablesArray);
    } catch (err) {
      setError(`加载表列表失败: ${err.message}`);
      setTables([]); // 确保设置为空数组
    } finally {
      setLoading(false);
    }
  };

  const handleShowInfo = (table) => {
    setSelectedTable(table);
    setInfoDialogOpen(true);
  };

  const handleDeleteTable = (table) => {
    setTableToDelete(table);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!tableToDelete) return;

    setDeleting(true);
    try {
      await deleteDuckDBTableEnhanced(tableToDelete.table_name);
      setSuccessMessage(`表 "${tableToDelete.table_name}" 已成功删除`);
      await loadTables();
      if (onDataSourceChange) {
        onDataSourceChange();
      }
    } catch (err) {
      setError(`删除表失败: ${err.message}`);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setTableToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setTableToDelete(null);
  };

  const formatNumber = (num) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const buildTypeInfo = (label, IconComponent, accentVar) => ({
    label,
    IconComponent,
    accent: accentVar,
    iconBackground: 'var(--dq-surface-card-active)',
    headerBackground: 'var(--dq-surface-card)',
    hoverBackground: 'var(--dq-surface-hover)',
    chipBackground: 'var(--dq-surface-card-active)',
  });

  // 获取表类型信息 - 重新设计的分类逻辑
  const getTableTypeInfo = (tableName) => {
    if (!tableName || typeof tableName !== 'string') {
      return buildTypeInfo('未知类型', Database, 'var(--dq-text-secondary)');
    }
    const lower = tableName.toLowerCase();

    if (lower.startsWith('system_')) {
      return buildTypeInfo('系统表', TableIcon, 'var(--dq-text-secondary)');
    }

    if (
      lower.startsWith('async_result_') ||
      lower.startsWith('query_result_') ||
      lower.startsWith('task_')
    ) {
      return buildTypeInfo('查询结果表', QueryStats, 'var(--dq-accent-100)');
    }

    return buildTypeInfo('数据表', ViewList, 'var(--dq-accent-primary)');
  };

  // 复制表名到剪贴板
  const handleCopyTableName = async (tableName, event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(tableName);
      setSuccessMessage(`表名 "${tableName}" 已复制到剪贴板`);
    } catch (err) {
      // 降级方案
      const textArea = document.createElement('textarea');
      textArea.value = tableName;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setSuccessMessage(`表名 "${tableName}" 已复制到剪贴板`);
    }
  };

  // 切换分组展开/折叠状态
  const toggleGroupExpanded = (groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // 过滤表格 - 添加安全检查
  const filteredTables = (Array.isArray(tables) ? tables : []).filter(table => {
    if (!table || !table.table_name) return false;
    const lower = table.table_name.toLowerCase();
    if (lower.startsWith('system_')) {
      return false;
    }
    return lower.includes(searchTerm.toLowerCase());
  });

  // 按类型分组表格
  const groupedTables = filteredTables.reduce((groups, table) => {
    if (!table || !table.table_name) return groups;
    const typeInfo = getTableTypeInfo(table.table_name);
    const groupKey = typeInfo.label;
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(table);
    return groups;
  }, {});

  return (
    <Box sx={{ p: 2, width: '100%' }}>
      {/* 工具栏 */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          placeholder="搜索表名..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={20} style={{ color: 'var(--dq-text-tertiary)' }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="outlined"
          startIcon={<RotateCcw size={20} />}
          onClick={loadTables}
          disabled={loading}
          size="small"
          sx={{
            textTransform: 'none',
            color: 'var(--dq-text-secondary)',
            borderColor: 'var(--dq-border-subtle)',
            '&:hover': {
              borderColor: 'var(--dq-accent-100)',
              color: 'var(--dq-accent-100)'
            }
          }}
        >
          刷新
        </Button>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
          <Chip
            label={`${filteredTables.length} 个表`}
            size="small"
            sx={{
              backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 12%, transparent)',
              color: 'var(--dq-accent-primary)',
              fontWeight: 600,
              borderRadius: '999px'
            }}
          />
          <Chip
            label={`${formatNumber(filteredTables.reduce((sum, table) => sum + (table && table.row_count ? table.row_count : 0), 0))} 行`}
            size="small"
            sx={{
              backgroundColor: 'color-mix(in oklab, var(--dq-accent-100) 12%, transparent)',
              color: 'var(--dq-accent-100)',
              fontWeight: 600,
              borderRadius: '999px'
            }}
          />
        </Box>
      </Box>

      {/* 错误提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* 树状结构表列表 */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <Typography variant="body1" sx={{ color: 'var(--dq-text-secondary)' }}>
            加载中...
          </Typography>
        </Box>
      ) : filteredTables.length === 0 ? (
        <Card
          elevation={0}
          sx={{
            border: '1px dashed',
            borderColor: 'var(--dq-border-subtle)',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            backgroundColor: 'color-mix(in oklab, var(--dq-text-tertiary) 4%, transparent)'
          }}
        >
          <Database size={48} style={{ marginBottom: '16px', color: 'var(--dq-text-tertiary)' }} />
          <Typography variant="h6" sx={{ fontWeight: 500, mb: 1, color: 'var(--dq-text-secondary)' }}>
            {searchTerm ? '没有找到匹配的表' : '暂无DuckDB表'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--dq-text-tertiary)' }}>
            {searchTerm ? '尝试调整搜索条件' : '执行SQL查询并保存结果后，表格将显示在这里'}
          </Typography>
        </Card>
      ) : (
        <Card
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            backgroundColor: 'var(--dq-surface-card)'
          }}
        >
          <List component="nav" disablePadding>
            {Object.entries(groupedTables).map(([groupName, groupTables], groupIndex) => {
              const typeInfo = getTableTypeInfo(groupTables[0].table_name);
              const IconComponent = typeInfo.IconComponent;
              const isExpanded = expandedGroups[groupName];

              return (
                <React.Fragment key={groupName}>
                  {/* 分组头部 */}
                  <ListItem disablePadding>
                    <ListItemButton
                      onClick={() => toggleGroupExpanded(groupName)}
                      sx={{
                        py: 1.5,
                        px: 2,
                        borderBottom: groupIndex < Object.keys(groupedTables).length - 1 ? '1px solid' : 'none',
                        borderColor: 'var(--dq-border-subtle)',
                        backgroundColor: typeInfo.headerBackground,
                        '&:hover': {
                          backgroundColor: typeInfo.hoverBackground
                        }
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            backgroundColor: typeInfo.iconBackground
                          }}
                        >
                          <IconComponent sx={{ fontSize: 16, color: typeInfo.accent }} />
                        </Box>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle1" fontWeight="600" sx={{ color: 'var(--dq-text-primary)' }}>
                              {groupName}
                            </Typography>
                            <Chip
                              label={groupTables.length}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '1rem',
                                fontWeight: 600,
                                backgroundColor: typeInfo.chipBackground,
                                color: typeInfo.accent
                              }}
                            />
                          </Box>
                        }
                      />
                      {isExpanded ? <ExpandLess /> : <ExpandMore />}
                    </ListItemButton>
                  </ListItem>

                  {/* 折叠的表列表 */}
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {groupTables.map((table, tableIndex) => (
                        <ListItem
                          key={table.table_name}
                          disablePadding
                          sx={{
                            borderBottom: tableIndex < groupTables.length - 1 ? '1px solid' : 'none',
                            borderColor: 'var(--dq-border-subtle)'
                          }}
                          secondaryAction={
                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                              <Tooltip title="复制表名">
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={(e) => handleCopyTableName(table.table_name, e)}
                                  sx={{
                                    width: 24,
                                    height: 24,
                                    backgroundColor: typeInfo.iconBackground,
                                    '&:hover': {
                                      backgroundColor: typeInfo.hoverBackground
                                    },
                                    '& svg': {
                                      color: typeInfo.accent
                                    }
                                  }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: 12 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="查看详细信息">
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={() => handleShowInfo(table)}
                                  sx={{
                                    width: 24,
                                    height: 24,
                                    backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 20%, transparent)',
                                    '&:hover': {
                                      backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 30%, transparent)'
                                    },
                                    '& svg': {
                                      color: 'var(--dq-accent-primary)'
                                    }
                                  }}
                                >
                                  <InfoIcon sx={{ fontSize: 12 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="删除表">
                                <IconButton
                                  edge="end"
                                  size="small"
                                  onClick={() => handleDeleteTable(table)}
                                  sx={{
                                    width: 24,
                                    height: 24,
                                    backgroundColor: 'color-mix(in oklab, var(--dq-status-error-fg) 22%, transparent)',
                                    '&:hover': {
                                      backgroundColor: 'color-mix(in oklab, var(--dq-status-error-fg) 32%, transparent)'
                                    },
                                    '& svg': {
                                      color: 'var(--dq-status-error-fg)'
                                    }
                                  }}
                                >
                                  <DeleteIcon sx={{ fontSize: 12 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          }
                        >
                          <ListItemButton
                            sx={{
                              pl: 4,
                              pr: 12, // 为操作按钮留出空间
                              py: 1,
                              '&:hover': {
                                backgroundColor: typeInfo.hoverBackground
                              }
                            }}
                            onClick={() => handleShowInfo(table)}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              <TableIcon sx={{ fontSize: 16, color: typeInfo.accent, opacity: 0.85 }} />
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Box>
                                  <Typography
                                    variant="body2"
                                    fontWeight="500"
                                    sx={{
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap'
                                    }}
                                  >
                                    {table.table_name}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: 'var(--dq-text-secondary)' }}>
                                    {formatNumber(table && typeof table.row_count === 'number' ? table.row_count : 0)} 行 · {table && typeof table.column_count === 'number' ? table.column_count : 0} 列
                                  </Typography>
                                </Box>
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </Collapse>
                </React.Fragment>
              );
            })}
          </List>
        </Card>
      )}

      {/* 表详细信息对话框 */}
      <Dialog
        open={infoDialogOpen}
        onClose={() => setInfoDialogOpen(false)}
        maxWidth="md"
        fullWidth
        className={`dq-dialog dq-theme ${isDarkMode ? 'dq-theme--dark' : 'dq-theme--light'}`}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TableIcon sx={{ color: 'var(--dq-text-primary)' }} />
            <Typography variant="h6" component="h2" fontWeight="bold">
              表详细信息
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedTable && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {selectedTable.table_name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 4, mb: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>行数</Typography>
                  <Typography variant="body1">{formatNumber(selectedTable.row_count || 0)}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--dq-text-secondary)' }}>列数</Typography>
                  <Typography variant="body1">{selectedTable.column_count || 0}</Typography>
                </Box>
              </Box>

              {selectedTable.columns && selectedTable.columns.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" gutterBottom>列信息</Typography>
                  <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>列名</TableCell>
                          <TableCell>数据类型</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedTable.columns.map((column, index) => (
                          <TableRow key={index}>
                            <TableCell>{typeof column === 'string' ? column : column.name}</TableCell>
                            <TableCell>{typeof column === 'string' ? 'VARCHAR' : column.type}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Paper>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoDialogOpen(false)}>关闭</Button>
        </DialogActions>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <DeleteIcon sx={{ color: 'var(--dq-text-primary)' }} />
            <Typography variant="h6" component="h2" fontWeight="bold">
              确认删除
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除表 <strong>{tableToDelete?.table_name}</strong> 吗？
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, color: 'var(--dq-text-secondary)' }}>
            此操作不可撤销，表中的所有数据将被永久删除。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            取消
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 成功消息 */}
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccessMessage('')}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DuckDBManagementPage;
