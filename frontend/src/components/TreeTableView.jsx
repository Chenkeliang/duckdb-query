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
import { resolveColor, withOpacity } from '../utils/colorUtils';

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
            query_results: [],
            data_tables: []
        };

        tables.forEach(table => {
            if (!table || typeof table !== 'string') return;
            const tableLower = table.toLowerCase();

            // 内部系统表一律跳过
            if (tableLower.startsWith('systerm_')) {
                return;
            }

            if (
                tableLower.startsWith('async_result_') ||
                tableLower.startsWith('query_result_') ||
                tableLower.startsWith('task_')
            ) {
                groups.query_results.push(table);
            } else {
                groups.data_tables.push(table);
            }
        });

        groups.recent = tables
            .filter(table => typeof table === 'string' && !table.toLowerCase().startsWith('systerm_'))
            .slice(0, 5);

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
        const defaultColor = isDarkMode ? 'var(--dq-text-secondary)' : 'var(--dq-text-tertiary)';
        const asyncColor = isDarkMode ? 'var(--dq-status-warning-fg)' : 'var(--dq-status-warning-fg)';
        const uploadColor = isDarkMode ? 'color-mix(in oklab, var(--dq-accent-primary) 70%, white 30%)' : 'var(--dq-accent-primary)';
        if (!tableName || typeof tableName !== 'string') {
            return <ViewList sx={{ fontSize: 16, color: defaultColor }} />;
        }
        const lower = tableName.toLowerCase();
        if (lower.startsWith('async_result_') || lower.startsWith('query_result_') || lower.startsWith('task_')) {
            return <QueryStats sx={{ fontSize: 16, color: asyncColor }} />;
        }
        if (lower.includes('upload') || lower.includes('粘贴')) return <CloudUpload sx={{ fontSize: 16, color: uploadColor }} />;
        return <ViewList sx={{ fontSize: 16, color: defaultColor }} />;
    };

    const getGroupInfo = (groupKey) => {
        const configs = {
            recent: {
                label: '最近使用',
                icon: History,
                color: 'var(--dq-accent-primary)',
                lightBg: 'var(--dq-surface-card-active)',
                description: '最新的5个表'
            },
            query_results: {
                label: '查询结果表',
                icon: QueryStats,
                color: 'var(--dq-accent-100)',
                lightBg: 'color-mix(in oklab, var(--dq-status-warning-bg) 100%, transparent)',
                description: `${groupedTables.query_results.length} 个表`
            },
            data_tables: {
                label: '数据表',
                icon: ViewList,
                color: 'var(--dq-accent-primary-soft)',
                lightBg: 'var(--dq-surface-card-active)',
                description: `${groupedTables.data_tables.length} 个表`
            }
        };
        return configs[groupKey] || configs.data_tables;
    };

    const renderTableGroup = (groupKey, tables) => {
        if (tables.length === 0) return null;

        const groupInfo = getGroupInfo(groupKey);
        const isExpanded = expandedGroups.has(groupKey);
        const IconComponent = groupInfo.icon;
        const accentColor = groupInfo.color;
        const accentResolved =
            resolveColor(accentColor, isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)') ||
            (isDarkMode ? 'var(--dq-accent-100)' : 'var(--dq-accent-primary)');
        const accentOverlay = (amount) => withOpacity(accentColor, amount, accentResolved);
        const baseSurface = isDarkMode ? 'var(--dq-surface-alt)' : 'var(--dq-surface)';
        const headerBackground = baseSurface;
        const headerHoverBackground = isDarkMode ? 'var(--dq-surface-active)' : 'var(--dq-surface-hover)';
        const iconBackground = accentOverlay(isDarkMode ? 0.16 : 0.12);
        const chipBackground = isDarkMode ? accentOverlay(0.24) : accentResolved;
        const chipTextColor = 'var(--dq-text-on-primary)';
        const collapseBackground = isDarkMode ? 'var(--dq-surface)' : 'var(--dq-surface)';
        const listHoverBackground = accentOverlay(isDarkMode ? 0.16 : 0.08);
        const copyButtonBackground = accentOverlay(isDarkMode ? 0.16 : 0.05);
        const copyButtonHoverBackground = accentOverlay(isDarkMode ? 0.25 : 0.1);

        return (
            <Box key={groupKey} sx={{ mb: 1 }}>
                <Card
                    elevation={0}
                    sx={{
                        border: '1px solid',
                        borderColor: isDarkMode ? 'var(--dq-border)' : 'var(--dq-border-subtle)',
                        borderRadius: 2,
                        backgroundColor: isDarkMode ? 'var(--dq-surface)' : 'var(--dq-surface)',
                        overflow: 'hidden',
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                            borderColor: accentColor,
                            boxShadow: isDarkMode
                                ? `0 12px 32px -20px ${accentOverlay(0.6)}`
                                : `0 2px 8px ${accentOverlay(0.15)}`
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
                                boxShadow: isDarkMode ? 'none' : 'inset 0 1px 0 color-mix(in oklab, var(--dq-background) 60%, transparent)',
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
                                        ? `0 10px 24px -16px ${accentOverlay(0.45)}`
                                        : 'inset 0 1px 0 color-mix(in oklab, var(--dq-background) 70%, transparent)'
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
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: isDarkMode ? 'var(--dq-text-primary)' : 'var(--dq-text-primary)' }}>
                                            {groupInfo.label}
                                        </Typography>
                                        <Chip
                                            label={tables.length}
                                            size="small"
                                            sx={{
                                                height: 22,
                                                fontSize: '1rem',
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
                                                        backgroundColor: accentOverlay(isDarkMode ? 0.18 : 0.1),
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
                                                                fontSize: '1rem',
                                                                fontWeight: 500,
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                                color: isDarkMode ? 'var(--dq-text-primary)' : 'var(--dq-text-primary)',
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
                    borderColor: 'var(--dq-border-subtle)',
                    borderRadius: 2,
                    p: 4,
                    textAlign: 'center',
                    backgroundColor: 'var(--dq-surface)'
                }}
            >
                <ViewList sx={{ fontSize: 48, color: 'var(--dq-text-tertiary)', mb: 2 }} />
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
            {renderTableGroup('query_results', groupedTables.query_results)}
            {renderTableGroup('data_tables', groupedTables.data_tables)}
        </Box>
    );
};

export default TreeTableView;
