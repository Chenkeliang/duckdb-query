import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Switch,
    Typography
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';

const SetOperationBuilder = ({
    onOperationChange,
    availableTables = [],
    initialConfig = null,
    hideTableSelector = false,
    sources = []
}) => {
    const [config, setConfig] = useState({
        operation_type: 'UNION',
        tables: [],
        use_by_name: false
    });


    // 初始化配置和更新表列表
    useEffect(() => {
        if (initialConfig && initialConfig.tables && initialConfig.tables.length > 0) {
            // 处理初始配置中的空字符串别名
            const processedConfig = {
                ...initialConfig,
                tables: initialConfig.tables.map(table => ({
                    ...table,
                    alias: table.alias === '' ? null : table.alias
                }))
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

    // 将选择的列转换为列映射

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

        // 如果是BY NAME模式且选择了表名，不需要额外处理
        // 列信息会直接从sources中获取
    };





    // 获取表列信息
    const getTableColumns = (tableName) => {
        if (!tableName) return [];

        // 从sources中查找对应的表
        const source = sources.find(s => s.id === tableName);
        if (source && source.columns) {
            return source.columns;
        }
        return [];
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
                        <strong>BY NAME 模式：</strong><br />
                        • DuckDB 会自动按列名匹配所有列<br />
                        • 不需要列数相同，缺失的列会自动填充 NULL<br />
                        • 所有表的所有列都会包含在结果中
                    </Typography>
                </Alert>
            )}


            {/* BY NAME模式的表信息展示 */}
            {config.use_by_name && config.tables.length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 500 }}>
                        参与操作的表
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {config.tables.map((table, tableIndex) => (
                            <Paper
                                key={tableIndex}
                                elevation={0}
                                sx={{
                                    p: 2,
                                    border: '1px solid',
                                    borderColor: 'grey.200',
                                    borderRadius: 2,
                                    backgroundColor: 'grey.50',
                                    minWidth: 200
                                }}
                            >
                                <Typography variant="subtitle3" sx={{ mb: 1, fontWeight: 600 }}>
                                    {table.table_name}
                                </Typography>

                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    可用列：
                                </Typography>

                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {(() => {
                                        const columns = getTableColumns(table.table_name);
                                        return columns.length > 0 ? columns.map((column) => {
                                            const columnName = typeof column === 'string' ? column : column.name;
                                            return (
                                                <Chip
                                                    key={columnName}
                                                    label={columnName}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{
                                                        borderColor: 'primary.200',
                                                        color: 'primary.700',
                                                        backgroundColor: 'primary.50',
                                                        fontSize: '0.75rem'
                                                    }}
                                                />
                                            );
                                        }) : (
                                            <Typography variant="caption" color="text.secondary">
                                                暂无可用列
                                            </Typography>
                                        );
                                    })()}
                                </Box>
                            </Paper>
                        ))}
                    </Box>
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

        </Box>
    );
};

export default SetOperationBuilder;
