import {
    Add,
    Delete,
    Edit,
    Visibility
} from '@mui/icons-material';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    List,
    ListItem,
    MenuItem,
    Paper,
    Select,
    TextField,
    Typography
} from '@mui/material';
import { BarChart3 } from 'lucide-react';
import React, { useEffect, useState } from 'react';

const MultiTableSelector = ({
    availableTables = [],
    selectedTables = [],
    onTablesChange,
    showColumnSelection = true,
    showAlias = true
}) => {
    const [tables, setTables] = useState(selectedTables);
    const [columnDialog, setColumnDialog] = useState({
        open: false,
        tableIndex: -1,
        tableName: '',
        availableColumns: [],
        selectedColumns: []
    });

    // 同步外部状态
    useEffect(() => {
        setTables(selectedTables);
    }, [selectedTables]);

    // 通知父组件变化
    useEffect(() => {
        if (onTablesChange) {
            onTablesChange(tables);
        }
    }, [tables, onTablesChange]);

    // 添加表
    const handleAddTable = () => {
        const newTable = {
            table_name: '',
            selected_columns: [],
            alias: '',
            use_all_columns: true
        };
        setTables(prev => [...prev, newTable]);
    };

    // 删除表
    const handleRemoveTable = (index) => {
        setTables(prev => prev.filter((_, i) => i !== index));
    };

    // 更新表配置
    const handleTableChange = (index, field, value) => {
        setTables(prev => prev.map((table, i) =>
            i === index ? { ...table, [field]: value } : table
        ));
    };

    // 打开列选择对话框
    const handleOpenColumnDialog = (index) => {
        const table = tables[index];
        setColumnDialog({
            open: true,
            tableIndex: index,
            tableName: table.table_name,
            availableColumns: getTableColumns(table.table_name),
            selectedColumns: table.selected_columns || []
        });
    };

    // 关闭列选择对话框
    const handleCloseColumnDialog = () => {
        setColumnDialog({
            open: false,
            tableIndex: -1,
            tableName: '',
            availableColumns: [],
            selectedColumns: []
        });
    };

    // 保存列选择
    const handleSaveColumns = () => {
        const { tableIndex, selectedColumns } = columnDialog;
        handleTableChange(tableIndex, 'selected_columns', selectedColumns);
        handleTableChange(tableIndex, 'use_all_columns', selectedColumns.length === 0);
        handleCloseColumnDialog();
    };

    // 切换列选择
    const handleToggleColumn = (column) => {
        setColumnDialog(prev => ({
            ...prev,
            selectedColumns: prev.selectedColumns.includes(column)
                ? prev.selectedColumns.filter(c => c !== column)
                : [...prev.selectedColumns, column]
        }));
    };

    // 全选/取消全选列
    const handleToggleAllColumns = () => {
        setColumnDialog(prev => ({
            ...prev,
            selectedColumns: prev.selectedColumns.length === prev.availableColumns.length
                ? []
                : [...prev.availableColumns]
        }));
    };

    // 获取表列信息（模拟）
    const getTableColumns = (tableName) => {
        // 这里应该调用API获取表的列信息
        // 暂时返回模拟数据
        const mockColumns = {
            'users': ['id', 'name', 'email', 'created_at'],
            'orders': ['id', 'user_id', 'product_id', 'amount', 'order_date'],
            'products': ['id', 'name', 'price', 'category', 'stock'],
            'categories': ['id', 'name', 'description']
        };
        return mockColumns[tableName] || ['id', 'name', 'value'];
    };

    // 验证表配置
    const validateTables = () => {
        const errors = [];
        const warnings = [];

        tables.forEach((table, index) => {
            if (!table.table_name) {
                errors.push(`表 ${index + 1} 未选择表名`);
            }

            if (showColumnSelection && !table.use_all_columns && (!table.selected_columns || table.selected_columns.length === 0)) {
                errors.push(`表 ${table.table_name} 未选择任何列`);
            }

            if (table.alias && tables.filter(t => t.alias === table.alias).length > 1) {
                errors.push(`表别名 "${table.alias}" 重复`);
            }
        });

        if (tables.length < 2) {
            errors.push('至少需要选择两个表');
        }

        if (tables.length > 10) {
            warnings.push('表数量较多，查询性能可能较慢');
        }

        return { errors, warnings };
    };

    const { errors, warnings } = validateTables();

    return (
        <Box>
            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">
                            <BarChart3 size={20} style={{ marginRight: '8px' }} />
                            多表选择器
                        </Typography>
                        <Button
                            variant="outlined"
                            startIcon={<Add />}
                            onClick={handleAddTable}
                            size="small"
                        >
                            添加表
                        </Button>
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        选择参与集合操作的表，配置列选择和别名
                    </Typography>

                    {/* 表列表 */}
                    {tables.map((table, index) => (
                        <Paper key={index} sx={{ p: 2, mb: 2 }}>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} md={3}>
                                    <FormControl fullWidth>
                                        <InputLabel>表名</InputLabel>
                                        <Select
                                            value={table.table_name}
                                            label="表名"
                                            onChange={(e) => handleTableChange(index, 'table_name', e.target.value)}
                                        >
                                            {availableTables.map(tableName => (
                                                <MenuItem key={tableName} value={tableName}>
                                                    {tableName}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>

                                {showAlias && (
                                    <Grid item xs={12} md={2}>
                                        <TextField
                                            fullWidth
                                            label="别名"
                                            value={table.alias || ''}
                                            onChange={(e) => handleTableChange(index, 'alias', e.target.value)}
                                            placeholder="可选"
                                            size="small"
                                        />
                                    </Grid>
                                )}

                                {showColumnSelection && (
                                    <Grid item xs={12} md={4}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={table.use_all_columns}
                                                        onChange={(e) => {
                                                            handleTableChange(index, 'use_all_columns', e.target.checked);
                                                            if (e.target.checked) {
                                                                handleTableChange(index, 'selected_columns', []);
                                                            }
                                                        }}
                                                    />
                                                }
                                                label="使用所有列"
                                            />
                                            {!table.use_all_columns && (
                                                <Button
                                                    size="small"
                                                    startIcon={<Edit />}
                                                    onClick={() => handleOpenColumnDialog(index)}
                                                >
                                                    选择列 ({table.selected_columns?.length || 0})
                                                </Button>
                                            )}
                                        </Box>
                                    </Grid>
                                )}

                                <Grid item xs={12} md={3}>
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleOpenColumnDialog(index)}
                                            disabled={!table.table_name}
                                        >
                                            <Visibility />
                                        </IconButton>
                                        <IconButton
                                            color="error"
                                            size="small"
                                            onClick={() => handleRemoveTable(index)}
                                        >
                                            <Delete />
                                        </IconButton>
                                    </Box>
                                </Grid>
                            </Grid>

                            {/* 表信息显示 */}
                            {table.table_name && (
                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        表: {table.table_name}
                                        {table.alias && ` (别名: ${table.alias})`}
                                        {showColumnSelection && (
                                            table.use_all_columns
                                                ? ' - 使用所有列'
                                                : ` - 选择 ${table.selected_columns?.length || 0} 列`
                                        )}
                                    </Typography>
                                </Box>
                            )}
                        </Paper>
                    ))}

                    {/* 验证结果 */}
                    {errors.length > 0 && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                配置错误:
                            </Typography>
                            {errors.map((error, index) => (
                                <Typography key={index} variant="body2">
                                    • {error}
                                </Typography>
                            ))}
                        </Alert>
                    )}

                    {warnings.length > 0 && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                警告:
                            </Typography>
                            {warnings.map((warning, index) => (
                                <Typography key={index} variant="body2">
                                    • {warning}
                                </Typography>
                            ))}
                        </Alert>
                    )}

                    {/* 统计信息 */}
                    {tables.length > 0 && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                            <Typography variant="subtitle2" gutterBottom>
                                配置统计:
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <Chip label={`${tables.length} 个表`} size="small" />
                                <Chip
                                    label={`${tables.filter(t => t.table_name).length} 个已配置`}
                                    size="small"
                                    color="primary"
                                />
                                {showColumnSelection && (
                                    <Chip
                                        label={`${tables.filter(t => t.use_all_columns).length} 个使用所有列`}
                                        size="small"
                                        color="secondary"
                                    />
                                )}
                            </Box>
                        </Box>
                    )}
                </CardContent>
            </Card>

            {/* 列选择对话框 */}
            <Dialog
                open={columnDialog.open}
                onClose={handleCloseColumnDialog}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    选择列 - {columnDialog.tableName}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mb: 2 }}>
                        <Button
                            variant="outlined"
                            onClick={handleToggleAllColumns}
                            size="small"
                        >
                            {columnDialog.selectedColumns.length === columnDialog.availableColumns.length
                                ? '取消全选'
                                : '全选'
                            }
                        </Button>
                        <Typography variant="caption" sx={{ ml: 2 }}>
                            已选择 {columnDialog.selectedColumns.length} / {columnDialog.availableColumns.length} 列
                        </Typography>
                    </Box>

                    <Divider sx={{ mb: 2 }} />

                    <List dense>
                        {columnDialog.availableColumns.map((column) => (
                            <ListItem key={column} dense>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={columnDialog.selectedColumns.includes(column)}
                                            onChange={() => handleToggleColumn(column)}
                                        />
                                    }
                                    label={column}
                                />
                            </ListItem>
                        ))}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseColumnDialog}>取消</Button>
                    <Button onClick={handleSaveColumns} variant="contained">
                        保存
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default MultiTableSelector;
