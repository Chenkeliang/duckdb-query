import {
    Add,
    CheckCircle,
    Delete,
    Error
} from '@mui/icons-material';
import {
    Alert,
    Box,
    Button,
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
    ListItemText,
    MenuItem,
    Paper,
    Select,
    Switch,
    TextField,
    Typography
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';

const SetOperationBuilder = ({
    onOperationChange,
    availableTables = [],
    initialConfig = null,
    hideTableSelector = false
}) => {
    const [config, setConfig] = useState({
        operation_type: 'UNION',
        tables: [],
        use_by_name: false
    });

    const [columnMappingDialog, setColumnMappingDialog] = useState({
        open: false,
        tableIndex: -1,
        tableName: '',
        columns: []
    });

    // 初始化配置和更新表列表
    useEffect(() => {
        if (initialConfig) {
            // 处理初始配置中的空字符串别名
            const processedConfig = {
                ...initialConfig,
                tables: initialConfig.tables?.map(table => ({
                    ...table,
                    alias: table.alias === '' ? null : table.alias
                })) || []
            };
            setConfig(processedConfig);
        } else if (hideTableSelector && availableTables.length > 0) {
            // 如果隐藏表选择器，自动使用可用表
            setConfig(prevConfig => ({
                ...prevConfig,
                operation_type: prevConfig.operation_type || 'UNION',
                tables: availableTables.map(tableName => ({
                    table_name: tableName,
                    selected_columns: [],
                    alias: null
                })),
                use_by_name: prevConfig.use_by_name || false
            }));
        }
    }, [initialConfig, hideTableSelector, availableTables]);

    // 通知父组件配置变化
    const notifyConfigChange = useCallback((newConfig) => {
        if (onOperationChange) {
            onOperationChange(newConfig);
        }
    }, [onOperationChange]);

    useEffect(() => {
        notifyConfigChange(config);
    }, [config, notifyConfigChange]);

    // 操作类型选项
    const operationTypes = [
        { value: 'UNION', label: '并集', description: '合并两个表，去除重复行' },
        { value: 'UNION ALL', label: '并集(保留重复)', description: '合并两个表，保留所有行' },
        { value: 'EXCEPT', label: '差集', description: '返回第一个表中不在第二个表中的行' },
        { value: 'INTERSECT', label: '交集', description: '返回两个表都存在的行' }
    ];

    // 处理操作类型变化
    const handleOperationTypeChange = (event) => {
        const newType = event.target.value;
        setConfig(prev => ({
            ...prev,
            operation_type: newType,
            use_by_name: false // 重置BY NAME模式
        }));
    };

    // 处理BY NAME模式切换
    const handleByNameToggle = (event) => {
        const useByName = event.target.checked;
        setConfig(prev => ({
            ...prev,
            use_by_name: useByName,
            tables: prev.tables.map(table => ({
                ...table,
                column_mappings: useByName ? [] : undefined
            }))
        }));
    };

    // 添加表
    const handleAddTable = () => {
        setConfig(prev => ({
            ...prev,
            tables: [...prev.tables, {
                table_name: '',
                selected_columns: [],
                column_mappings: config.use_by_name ? [] : undefined,
                alias: null  // 使用null而不是空字符串
            }]
        }));
    };

    // 删除表
    const handleRemoveTable = (index) => {
        setConfig(prev => ({
            ...prev,
            tables: prev.tables.filter((_, i) => i !== index)
        }));
    };

    // 更新表配置
    const handleTableChange = (index, field, value) => {
        setConfig(prev => ({
            ...prev,
            tables: prev.tables.map((table, i) => {
                if (i === index) {
                    const updatedTable = { ...table, [field]: value };
                    // 处理别名字段：空字符串转换为null
                    if (field === 'alias' && value === '') {
                        updatedTable.alias = null;
                    }
                    return updatedTable;
                }
                return table;
            })
        }));

        // 如果是BY NAME模式且选择了表名，自动打开列选择对话框
        if (field === 'table_name' && value && config.use_by_name) {
            handleOpenColumnMapping(index);
        }
    };

    // 打开列选择对话框
    const handleOpenColumnMapping = (index) => {
        const table = config.tables[index];
        setColumnMappingDialog({
            open: true,
            tableIndex: index,
            tableName: table.table_name,
            columns: table.selected_columns || []
        });
    };

    // 关闭列映射对话框
    const handleCloseColumnMapping = () => {
        setColumnMappingDialog({
            open: false,
            tableIndex: -1,
            tableName: '',
            columns: []
        });
    };

    // 保存列选择
    const handleSaveColumnMapping = () => {
        const { tableIndex, columns } = columnMappingDialog;
        handleTableChange(tableIndex, 'selected_columns', columns);
        handleCloseColumnMapping();
    };



    // 获取表列信息（模拟）
    const getTableColumns = (tableName) => {
        // 这里应该调用API获取表的列信息
        // 暂时返回模拟数据
        return ['id', 'name', 'value', 'created_at'];
    };

    return (
        <Box>

            {/* 操作类型选择 */}
            <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>操作类型</InputLabel>
                <Select
                    value={config.operation_type}
                    label="操作类型"
                    onChange={handleOperationTypeChange}
                >
                    {operationTypes.map(type => (
                        <MenuItem key={type.value} value={type.value}>
                            <Box>
                                <Typography variant="body1">{type.label}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {type.description}
                                </Typography>
                            </Box>
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>

            {/* BY NAME模式切换 */}
            <FormControlLabel
                control={
                    <Switch
                        checked={config.use_by_name}
                        onChange={handleByNameToggle}
                        disabled={!['UNION', 'UNION ALL'].includes(config.operation_type)}
                    />
                }
                label="使用BY NAME模式（按列名匹配）"
                sx={{ mb: 2 }}
            />

            {config.use_by_name && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                        BY NAME模式允许不同表结构的数据进行合并，通过列映射指定对应关系。
                    </Typography>
                </Alert>
            )}

            {/* 显示已选择的列 */}
            {config.use_by_name && config.tables.length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 500 }}>
                        已选择的列
                    </Typography>
                    {config.tables.map((table, index) => (
                        <Paper key={index} sx={{ p: 2, mb: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                                {table.table_name}
                            </Typography>
                            {table.selected_columns && table.selected_columns.length > 0 ? (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {table.selected_columns.map((column, colIndex) => (
                                        <Chip
                                            key={colIndex}
                                            label={column}
                                            size="small"
                                            variant="outlined"
                                        />
                                    ))}
                                </Box>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    未选择列
                                </Typography>
                            )}
                            <Button
                                size="small"
                                onClick={() => handleOpenColumnMapping(index)}
                                sx={{ mt: 1 }}
                            >
                                选择列
                            </Button>
                        </Paper>
                    ))}
                </Box>
            )}

            <Divider sx={{ my: 2 }} />



            {/* 操作按钮 */}
            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button
                    variant="outlined"
                    onClick={() => setConfig({
                        operation_type: 'UNION',
                        tables: [],
                        use_by_name: false
                    })}
                >
                    重置
                </Button>
            </Box>

            {/* 列映射对话框 */}
            <Dialog
                open={columnMappingDialog.open}
                onClose={handleCloseColumnMapping}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    选择列 - {columnMappingDialog.tableName}
                </DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            选择要包含在集合操作中的列。未选择的列将不会出现在结果中。
                        </Typography>
                    </Alert>

                    <FormControl fullWidth>
                        <InputLabel>选择列</InputLabel>
                        <Select
                            multiple
                            value={columnMappingDialog.columns}
                            label="选择列"
                            onChange={(e) => {
                                const selectedColumns = e.target.value;
                                setColumnMappingDialog(prev => ({
                                    ...prev,
                                    columns: selectedColumns
                                }));
                            }}
                            renderValue={(selected) => selected.join(', ')}
                        >
                            {getTableColumns(columnMappingDialog.tableName).map(column => (
                                <MenuItem key={column} value={column}>
                                    <Checkbox checked={columnMappingDialog.columns.indexOf(column) > -1} />
                                    <ListItemText primary={column} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseColumnMapping}>取消</Button>
                    <Button onClick={handleSaveColumnMapping} variant="contained">
                        保存
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SetOperationBuilder;
