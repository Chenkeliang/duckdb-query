import {
    CloudUpload,
    ContentCopy,
    ExpandLess,
    ExpandMore,
    History,
    QueryStats,
    TableChart,
    ViewList
} from '@mui/icons-material';
import {
    Box,
    Card,
    Chip,
    Collapse,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Typography,
    alpha,
} from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';

const detectDarkMode = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

const TreeTableView = ({ tables = [], onTableSelect }) => {
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [isDarkMode, setIsDarkMode] = useState(detectDarkMode);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const sync = () => setIsDarkMode(detectDarkMode());
        const handleThemeChange = (event) => {
            if (event?.detail && typeof event.detail.isDark === 'boolean') {
                setIsDarkMode(event.detail.isDark);
            } else {
                sync();
            }
        };

        window.addEventListener('duckquery-theme-change', handleThemeChange);
        const observer = new MutationObserver(sync);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        sync();

        return () => {
            window.removeEventListener('duckquery-theme-change', handleThemeChange);
            observer.disconnect();
        };
    }, []);

    // 按类型和时间分组表格 - 重新设计的分类逻辑
    const groupedTables = useMemo(() => {
        const groups = {
            recent: [],
            async_results: [],
            data_tables: [],
            temp_tables: [],
            system_tables: []
        };

        tables.forEach(table => {
            if (!table || typeof table !== 'string') return;
            const tableLower = table.toLowerCase();

            // 1. 异步任务结果表
            if (tableLower.startsWith('async_result_') || tableLower.startsWith('task_')) {
                groups.async_results.push(table);
            }
            // 2. 临时表
            else if (tableLower.includes('temp') || tableLower.includes('临时')) {
                groups.temp_tables.push(table);
            }
            // 3. 数据表（用户自定义表名，不包含系统前缀）
            else if (!tableLower.startsWith('async_result_') &&
                !tableLower.startsWith('task_') &&
                !tableLower.startsWith('query_result_') &&
                !tableLower.includes('temp') &&
                !tableLower.includes('临时')) {
                groups.data_tables.push(table);
            }
            // 4. 系统表（兼容旧数据）
            else {
                groups.system_tables.push(table);
            }
        });

        // 最近的表格（最新的5个）
        groups.recent = tables.slice(0, 5);

        return groups;
    }, [tables]);

    const handleGroupToggle = (groupKey) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupKey)) {
            newExpanded.delete(groupKey);
        } else {
            newExpanded.add(groupKey);
        }
        setExpandedGroups(newExpanded);
    };

    const handleCopyTableName = async (tableName, event) => {
        // 阻止事件冒泡，避免触发表格选择
        event.stopPropagation();

        try {
            await navigator.clipboard.writeText(tableName);
            // 可以在这里添加成功提示，但为了简洁，暂时省略
        } catch (err) {
            // 降级方案：使用传统方法复制
            const textArea = document.createElement('textarea');
            textArea.value = tableName;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
    };

    const getTableIcon = (tableName) => {
        const defaultColor = isDarkMode ? '#9aa0ac' : '#757575';
        const asyncColor = isDarkMode ? '#f07335' : '#ff9800';
        const queryColor = isDarkMode ? '#5aa6ff' : '#4caf50';
        const uploadColor = isDarkMode ? '#7f9cff' : '#2196f3';
        if (!tableName || typeof tableName !== 'string') {
            return <ViewList sx={{ fontSize: 16, color: defaultColor }} />;
        }
        const lower = tableName.toLowerCase();
        if (lower.startsWith('async_result_')) return <QueryStats sx={{ fontSize: 16, color: asyncColor }} />;
        if (lower.startsWith('query_result_')) return <TableChart sx={{ fontSize: 16, color: queryColor }} />;
        if (lower.includes('upload') || lower.includes('粘贴')) return <CloudUpload sx={{ fontSize: 16, color: uploadColor }} />;
        return <ViewList sx={{ fontSize: 16, color: defaultColor }} />;
    };

    const getGroupInfo = (groupKey) => {
        const configs = {
            recent: {
                label: '最近使用',
                icon: History,
                color: '#4f8efc',
                lightBg: '#e3f2fd',
                description: '最新的5个表'
            },
            async_results: {
                label: '异步查询结果',
                icon: QueryStats,
                color: '#f07335',
                lightBg: '#fff3e0',
                description: `${groupedTables.async_results.length} 个表`
            },
            data_tables: {
                label: '数据表',
                icon: ViewList,
                color: '#5aa6ff',
                lightBg: '#e8f1ff',
                description: `${groupedTables.data_tables.length} 个表`
            },
            temp_tables: {
                label: '临时表',
                icon: History,
                color: '#ff7043',
                lightBg: '#fbe9e7',
                description: `${groupedTables.temp_tables.length} 个表`
            },
            system_tables: {
                label: '系统表',
                icon: TableChart,
                color: '#9aa0ac',
                lightBg: '#f5f5f5',
                description: `${groupedTables.system_tables.length} 个表`
            }
        };
        return configs[groupKey] || configs.system_tables;
    };

    const renderTableGroup = (groupKey, tables) => {
        if (tables.length === 0) return null;

        const groupInfo = getGroupInfo(groupKey);
        const isExpanded = expandedGroups.has(groupKey);
        const IconComponent = groupInfo.icon;
        const accentColor = groupInfo.color;
        const gradientBase = groupInfo.lightBg || '#f5f5f5';
        const baseSurface = isDarkMode ? 'var(--dq-surface-alt)' : alpha('#f8fafc', 0.9);
        const headerBackground = baseSurface;
        const headerHoverBackground = isDarkMode ? 'var(--dq-surface-active)' : '#eef2f6';
        const iconBackground = alpha(accentColor, isDarkMode ? 0.16 : 0.12);
        const chipBackground = isDarkMode ? alpha(accentColor, 0.24) : accentColor;
        const chipTextColor = isDarkMode ? 'var(--dq-background)' : 'white';
        const collapseBackground = isDarkMode ? 'var(--dq-surface)' : 'rgba(0, 0, 0, 0.01)';
        const listHoverBackground = alpha(accentColor, isDarkMode ? 0.16 : 0.08);
        const copyButtonBackground = alpha(accentColor, isDarkMode ? 0.16 : 0.05);
        const copyButtonHoverBackground = alpha(accentColor, isDarkMode ? 0.25 : 0.1);

        return (
            <Box key={groupKey} sx={{ mb: 1 }}>
                <Card
                    elevation={0}
                    sx={{
                        border: '1px solid',
                        borderColor: isDarkMode ? 'var(--dq-border)' : 'divider',
                        borderRadius: 2,
                        backgroundColor: isDarkMode ? 'var(--dq-surface)' : '#ffffff',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                            borderColor: accentColor,
                            boxShadow: isDarkMode
                                ? `0 12px 32px -20px ${alpha(accentColor, 0.6)}`
                                : `0 2px 8px ${alpha(accentColor, 0.15)}`
                        }
                    }}
                >
                    <ListItem disablePadding>
                        <ListItemButton
                            onClick={() => handleGroupToggle(groupKey)}
                            sx={{
                                py: 1.5,
                                pl: 2.75,
                                pr: 2,
                                position: 'relative',
                                backgroundColor: headerBackground,
                                borderBottom: isDarkMode ? '1px solid var(--dq-border-subtle)' : 'none',
                                transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                                boxShadow: isDarkMode ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.6)',
                                '&::before': {
                                    content: "''",
                                    position: 'absolute',
                                    left: 10,
                                    top: 10,
                                    bottom: 10,
                                    width: 3,
                                    borderRadius: 999,
                                    background: accentColor,
                                    opacity: isExpanded ? 1 : 0.6
                                },
                                '&:hover': {
                                    backgroundColor: headerHoverBackground,
                                    boxShadow: isDarkMode
                                        ? `0 10px 24px -16px ${alpha(accentColor, 0.45)}`
                                        : 'inset 0 1px 0 rgba(255,255,255,0.7)'
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
                                        backgroundColor: iconBackground,
                                        transition: 'all 0.2s ease-in-out'
                                    }}
                                >
                                    <IconComponent sx={{ fontSize: 16, color: accentColor }} />
                                </Box>
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isDarkMode ? 'var(--dq-text-primary)' : 'text.primary' }}>
                                            {groupInfo.label}
                                        </Typography>
                                        <Chip
                                            label={tables.length}
                                            size="small"
                                            sx={{
                                                height: 22,
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                backgroundColor: chipBackground,
                                                color: chipTextColor,
                                                '& .MuiChip-label': {
                                                    px: 1
                                                }
                                            }}
                                        />
                                    </Box>
                                }
                            />
                            <Box sx={{ ml: 1 }}>
                                {isExpanded ?
                                    <ExpandLess sx={{ color: accentColor }} /> :
                                    <ExpandMore sx={{ color: accentColor }} />
                                }
                            </Box>
                        </ListItemButton>
                    </ListItem>

                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ backgroundColor: collapseBackground }}>
                            <List component="div" disablePadding>
                                {tables.map((table, index) => (
                                    <ListItem
                                        key={table}
                                        disablePadding
                                        sx={{
                                            borderTop: index === 0 ? '1px solid' : 'none',
                                            borderTopColor: index === 0 ? (isDarkMode ? 'var(--dq-border-subtle)' : 'divider') : 'transparent',
                                        }}
                                        secondaryAction={
                                            <Tooltip title="复制表名" placement="left">
                                                <IconButton
                                                    edge="end"
                                                    size="small"
                                                    onClick={(e) => handleCopyTableName(table, e)}
                                                    sx={{
                                                        opacity: 0.5,
                                                        mr: 1,
                                                        width: 28,
                                                        height: 28,
                                                        backgroundColor: copyButtonBackground,
                                                        '&:hover': {
                                                            opacity: 1,
                                                            backgroundColor: copyButtonHoverBackground,
                                                            transform: 'scale(1.1)'
                                                        },
                                                        transition: 'all 0.2s ease-in-out'
                                                    }}
                                                >
                                                    <ContentCopy sx={{ fontSize: 14, color: accentColor }} />
                                                </IconButton>
                                            </Tooltip>
                                        }
                                    >
                                        <ListItemButton
                                            sx={{
                                                pl: 3,
                                                py: 1,
                                                pr: 7, // 为复制按钮留出空间
                                                minHeight: 44,
                                                '&:hover': {
                                                    backgroundColor: listHoverBackground,
                                                    transform: 'translateX(4px)'
                                                },
                                                transition: 'all 0.2s ease-in-out'
                                            }}
                                            onClick={() => onTableSelect(table)}
                                        >
                                            <ListItemIcon sx={{ minWidth: 32 }}>
                                                <Box
                                                    sx={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        width: 24,
                                                        height: 24,
                                                        borderRadius: 1,
                                                        backgroundColor: alpha(accentColor, isDarkMode ? 0.18 : 0.1),
                                                    }}
                                                >
                                                    {getTableIcon(table)}
                                                </Box>
                                            </ListItemIcon>
                                            <Tooltip title={table} placement="right" enterDelay={1000}>
                                                <ListItemText
                                                    primary={
                                                        <Typography
                                                            variant="body2"
                                                            sx={{
                                                                fontSize: '0.875rem',
                                                                fontWeight: 500,
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                color: isDarkMode ? 'var(--dq-text-primary)' : 'text.primary',
                                                                lineHeight: 1.2
                                                            }}
                                                        >
                                                            {table}
                                                        </Typography>
                                                    }
                                                />
                                            </Tooltip>
                                        </ListItemButton>
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    </Collapse>
                </Card>
            </Box>
        );
    };

    if (tables.length === 0) {
        return (
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
                <ViewList sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                    暂无可用表
                </Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
                    上传文件或执行查询后，表格将显示在这里
                </Typography>
            </Card>
        );
    }

    return (
        <Box sx={{ width: '100%', p: 2 }}>
            {renderTableGroup('recent', groupedTables.recent)}
            {renderTableGroup('async_results', groupedTables.async_results)}
            {renderTableGroup('data_tables', groupedTables.data_tables)}
            {renderTableGroup('temp_tables', groupedTables.temp_tables)}
            {renderTableGroup('system_tables', groupedTables.system_tables)}
        </Box>
    );
};

export default TreeTableView;
