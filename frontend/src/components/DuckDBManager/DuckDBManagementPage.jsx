import {
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  ExpandLess,
  ExpandMore,
  History,
  Info as InfoIcon,
  QueryStats,
  TableChart as TableIcon,
  ViewList
} from '@mui/icons-material';
import {
  Alert,
  alpha,
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
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({
    '异步查询结果': true,
    '数据表': true,
    '临时表': true,
    '系统表': true
  });

  useEffect(() => {
    loadTables();
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

  // 获取表类型信息 - 重新设计的分类逻辑
  const getTableTypeInfo = (tableName) => {
    if (!tableName || typeof tableName !== 'string') {
      return {
        label: '未知类型',
        color: '#9e9e9e',
        icon: <Database sx={{ fontSize: 16, color: '#9e9e9e' }} />,
        description: '无法识别的表类型'
      };
    }
    const lower = tableName.toLowerCase();

    // 1. 异步任务结果表（通过异步任务保存的表）
    if (lower.startsWith('async_result_') || lower.startsWith('task_')) {
      return {
        label: '异步查询结果',
        color: '#ff9800',
        bgColor: '#fff3e0',
        icon: QueryStats
      };
    }

    // 2. 用户自定义表名（通过异步任务保存，使用用户提供的表名）
    // 这些表名不包含系统前缀，是用户直接指定的
    if (!lower.startsWith('async_result_') &&
      !lower.startsWith('task_') &&
      !lower.startsWith('query_result_') &&
      !lower.includes('temp') &&
      !lower.includes('临时')) {
      return {
        label: '数据表',
        color: '#2196f3',
        bgColor: '#e3f2fd',
        icon: ViewList
      };
    }

    // 3. 临时表（系统生成的临时表）
    if (lower.includes('temp') || lower.includes('临时')) {
      return {
        label: '临时表',
        color: '#ff5722',
        bgColor: '#fbe9e7',
        icon: History
      };
    }

    // 4. 其他系统表（兼容旧数据）
    return {
      label: '系统表',
      color: '#757575',
      bgColor: '#f5f5f5',
      icon: TableIcon
    };
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
  const filteredTables = (Array.isArray(tables) ? tables : []).filter(table =>
    table && table.table_name && table.table_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                <Search size={20} color="#666" />
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
          sx={{ textTransform: 'none' }}
        >
          刷新
        </Button>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
          <Chip
            label={`${filteredTables.length} 个表`}
            color="primary"
            variant="outlined"
            size="small"
          />
          <Chip
            label={`${formatNumber(filteredTables.reduce((sum, table) => sum + (table && table.row_count ? table.row_count : 0), 0))} 行`}
            color="success"
            variant="outlined"
            size="small"
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
          <Typography variant="body1" color="text.secondary">
            加载中...
          </Typography>
        </Box>
      ) : filteredTables.length === 0 ? (
        <Card
          elevation={0}
          sx={{
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.02)'
          }}
        >
          <Database size={48} color="#999" style={{ marginBottom: '16px' }} />
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500, mb: 1 }}>
            {searchTerm ? '没有找到匹配的表' : '暂无DuckDB表'}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {searchTerm ? '尝试调整搜索条件' : '执行SQL查询并保存结果后，表格将显示在这里'}
          </Typography>
        </Card>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <List component="nav" disablePadding>
            {Object.entries(groupedTables).map(([groupName, groupTables], groupIndex) => {
              const typeInfo = getTableTypeInfo(groupTables[0].table_name);
              const IconComponent = typeInfo.icon;
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
                        borderColor: 'divider',
                        backgroundColor: alpha(typeInfo.color, 0.02),
                        '&:hover': {
                          backgroundColor: alpha(typeInfo.color, 0.05)
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
                            backgroundColor: alpha(typeInfo.color, 0.1)
                          }}
                        >
                          <IconComponent sx={{ fontSize: 16, color: typeInfo.color }} />
                        </Box>
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle1" fontWeight="600" color="text.primary">
                              {groupName}
                            </Typography>
                            <Chip
                              label={groupTables.length}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                backgroundColor: typeInfo.color,
                                color: 'white'
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
                            borderColor: alpha(typeInfo.color, 0.1)
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
                                    backgroundColor: alpha(typeInfo.color, 0.1),
                                    '&:hover': {
                                      backgroundColor: alpha(typeInfo.color, 0.2)
                                    }
                                  }}
                                >
                                  <ContentCopyIcon sx={{ fontSize: 12, color: typeInfo.color }} />
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
                                    backgroundColor: alpha('#2196f3', 0.1),
                                    '&:hover': {
                                      backgroundColor: alpha('#2196f3', 0.2)
                                    }
                                  }}
                                >
                                  <InfoIcon sx={{ fontSize: 12, color: '#2196f3' }} />
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
                                    backgroundColor: alpha('#f44336', 0.1),
                                    '&:hover': {
                                      backgroundColor: alpha('#f44336', 0.2)
                                    }
                                  }}
                                >
                                  <DeleteIcon sx={{ fontSize: 12, color: '#f44336' }} />
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
                                backgroundColor: alpha(typeInfo.color, 0.05)
                              }
                            }}
                            onClick={() => handleShowInfo(table)}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              <TableIcon sx={{ fontSize: 16, color: typeInfo.color, opacity: 0.8 }} />
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
                                  <Typography variant="caption" color="text.secondary">
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
      <Dialog open={infoDialogOpen} onClose={() => setInfoDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TableIcon sx={{ color: 'primary.main' }} />
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
                  <Typography variant="body2" color="text.secondary">行数</Typography>
                  <Typography variant="body1">{formatNumber(selectedTable.row_count || 0)}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" color="text.secondary">列数</Typography>
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
            <DeleteIcon sx={{ color: 'error.main' }} />
            <Typography variant="h6" component="h2" fontWeight="bold">
              确认删除
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography>
            确定要删除表 <strong>{tableToDelete?.table_name}</strong> 吗？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
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