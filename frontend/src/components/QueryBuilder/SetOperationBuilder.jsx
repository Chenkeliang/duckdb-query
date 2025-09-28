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

    const [errors, setErrors] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [validationResult, setValidationResult] = useState(null);
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
    };

    // 打开列映射对话框
    const handleOpenColumnMapping = (index) => {
        const table = config.tables[index];
        setColumnMappingDialog({
            open: true,
            tableIndex: index,
            tableName: table.table_name,
            columns: table.column_mappings || []
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

    // 保存列映射
    const handleSaveColumnMapping = () => {
        const { tableIndex, columns } = columnMappingDialog;
        handleTableChange(tableIndex, 'column_mappings', columns);
        handleCloseColumnMapping();
    };

    // 添加列映射
    const handleAddColumnMapping = () => {
        setColumnMappingDialog(prev => ({
            ...prev,
            columns: [...prev.columns, { source_column: '', target_column: '' }]
        }));
    };

    // 更新列映射
    const handleUpdateColumnMapping = (index, field, value) => {
        setColumnMappingDialog(prev => ({
            ...prev,
            columns: prev.columns.map((mapping, i) =>
                i === index ? { ...mapping, [field]: value } : mapping
            )
        }));
    };

    // 删除列映射
    const handleRemoveColumnMapping = (index) => {
        setColumnMappingDialog(prev => ({
            ...prev,
            columns: prev.columns.filter((_, i) => i !== index)
        }));
    };

    // 验证配置
    const validateConfig = () => {
        const newErrors = [];
        const newWarnings = [];

        // 检查表数量
        if (config.tables.length < 2) {
            newErrors.push('至少需要选择两个表');
        }

        // 检查表名
        config.tables.forEach((table, index) => {
            if (!table.table_name) {
                newErrors.push(`表 ${index + 1} 未选择表名`);
            }
        });

        // 检查BY NAME模式的列映射
        if (config.use_by_name) {
            config.tables.forEach((table, index) => {
                if (!table.column_mappings || table.column_mappings.length === 0) {
                    newErrors.push(`表 ${table.table_name} 在BY NAME模式下必须提供列映射`);
                }
            });
        }

        // 检查操作类型支持
        if (config.use_by_name && !['UNION', 'UNION ALL'].includes(config.operation_type)) {
            newErrors.push('只有UNION和UNION ALL支持BY NAME模式');
        }

        // 性能警告
        if (config.tables.length > 5) {
            newWarnings.push('表数量较多，查询性能可能较慢');
        }

        setErrors(newErrors);
        setWarnings(newWarnings);
        setValidationResult({
            is_valid: newErrors.length === 0,
            errors: newErrors,
            warnings: newWarnings
        });

        return newErrors.length === 0;
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

            <Divider sx={{ my: 2 }} />


            {/* 验证结果 */}
            {validationResult && (
                <Box sx={{ mt: 2 }}>
                    {validationResult.is_valid ? (
                        <Alert severity="success" icon={<CheckCircle />}>
                            配置验证通过
                        </Alert>
                    ) : (
                        <Alert severity="error" icon={<Error />}>
                            配置验证失败
                        </Alert>
                    )}

                    {errors.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                            {errors.map((error, index) => (
                                <Alert key={index} severity="error" sx={{ mb: 1 }}>
                                    {error}
                                </Alert>
                            ))}
                        </Box>
                    )}

                    {warnings.length > 0 && (
                        <Box sx={{ mt: 1 }}>
                            {warnings.map((warning, index) => (
                                <Alert key={index} severity="warning" sx={{ mb: 1 }}>
                                    {warning}
                                </Alert>
                            ))}
                        </Box>
                    )}
                </Box>
            )}

            {/* 操作按钮 */}
            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                <Button
                    variant="contained"
                    onClick={validateConfig}
                    startIcon={<CheckCircle />}
                >
                    验证配置
                </Button>
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
                    配置列映射 - {columnMappingDialog.tableName}
                </DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            配置源表列与目标列名的映射关系。目标列名将用于结果表的列名。
                        </Typography>
                    </Alert>

                    <Box sx={{ mb: 2 }}>
                        <Button
                            variant="outlined"
                            startIcon={<Add />}
                            onClick={handleAddColumnMapping}
                            size="small"
                        >
                            添加映射
                        </Button>
                    </Box>

                    {columnMappingDialog.columns.map((mapping, index) => (
                        <Paper key={index} sx={{ p: 2, mb: 2 }}>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={5}>
                                    <FormControl fullWidth>
                                        <InputLabel>源列名</InputLabel>
                                        <Select
                                            value={mapping.source_column}
                                            label="源列名"
                                            onChange={(e) => handleUpdateColumnMapping(index, 'source_column', e.target.value)}
                                        >
                                            {getTableColumns(columnMappingDialog.tableName).map(column => (
                                                <MenuItem key={column} value={column}>
                                                    {column}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={5}>
                                    <TextField
                                        fullWidth
                                        label="目标列名"
                                        value={mapping.target_column}
                                        onChange={(e) => handleUpdateColumnMapping(index, 'target_column', e.target.value)}
                                        placeholder="例如: user_id"
                                    />
                                </Grid>
                                <Grid item xs={2}>
                                    <IconButton
                                        color="error"
                                        onClick={() => handleRemoveColumnMapping(index)}
                                    >
                                        <Delete />
                                    </IconButton>
                                </Grid>
                            </Grid>
                        </Paper>
                    ))}
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
