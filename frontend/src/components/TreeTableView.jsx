import {
    ContentCopy,
    ExpandLess,
    ExpandMore,
    Folder,
    FolderOpen,
    Schedule,
    Storage,
    TableChart,
    CloudUpload,
    QueryStats,
    History,
    ViewList,
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
import React, { useMemo, useState } from 'react';

const TreeTableView = ({ tables = [], onTableSelect }) => {
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    // 按类型和时间分组表格
    const groupedTables = useMemo(() => {
        const groups = {
            recent: [],
            async_results: [],
            query_results: [],
            uploads: [],
            others: []
        };

        tables.forEach(table => {
            const tableLower = table.toLowerCase();

            if (tableLower.startsWith('async_result_')) {
                groups.async_results.push(table);
            } else if (tableLower.startsWith('query_result_')) {
                groups.query_results.push(table);
            } else if (tableLower.includes('_2025') || tableLower.includes('upload') || tableLower.includes('粘贴数据')) {
                groups.uploads.push(table);
            } else {
                groups.others.push(table);
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
        const lower = tableName.toLowerCase();
        if (lower.startsWith('async_result_')) return <QueryStats sx={{ fontSize: 16, color: '#ff9800' }} />;
        if (lower.startsWith('query_result_')) return <TableChart sx={{ fontSize: 16, color: '#4caf50' }} />;
        if (lower.includes('upload') || lower.includes('粘贴')) return <CloudUpload sx={{ fontSize: 16, color: '#2196f3' }} />;
        return <ViewList sx={{ fontSize: 16, color: '#757575' }} />;
    };

    const getGroupInfo = (groupKey) => {
        const configs = {
            recent: {
                label: '最近使用',
                icon: History,
                color: '#1976d2',
                bgColor: '#e3f2fd',
                description: '最新的5个表'
            },
            async_results: {
                label: '异步查询结果',
                icon: QueryStats,
                color: '#ff9800',
                bgColor: '#fff3e0',
                description: `${groupedTables.async_results.length} 个表`
            },
            query_results: {
                label: '查询结果表',
                icon: TableChart,
                color: '#4caf50',
                bgColor: '#e8f5e8',
                description: `${groupedTables.query_results.length} 个表`
            },
            uploads: {
                label: '上传文件表',
                icon: CloudUpload,
                color: '#2196f3',
                bgColor: '#e3f2fd',
                description: `${groupedTables.uploads.length} 个表`
            },
            others: {
                label: '其他表',
                icon: ViewList,
                color: '#757575',
                bgColor: '#f5f5f5',
                description: `${groupedTables.others.length} 个表`
            }
        };
        return configs[groupKey] || configs.others;
    };

    const renderTableGroup = (groupKey, tables) => {
        if (tables.length === 0) return null;

        const groupInfo = getGroupInfo(groupKey);
        const isExpanded = expandedGroups.has(groupKey);
        const IconComponent = groupInfo.icon;

        return (
            <Box key={groupKey} sx={{ mb: 1 }}>
                <Card 
                    elevation={0}
                    sx={{ 
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 2,
                        overflow: 'hidden',
                        transition: 'all 0.2s ease-in-out',
                        '&:hover': {
                            borderColor: groupInfo.color,
                            boxShadow: `0 2px 8px ${alpha(groupInfo.color, 0.15)}`
                        }
                    }}
                >
                    <ListItem disablePadding>
                        <ListItemButton
                            onClick={() => handleGroupToggle(groupKey)}
                            sx={{
                                py: 1.5,
                                px: 2,
                                background: `linear-gradient(135deg, ${alpha(groupInfo.bgColor, 0.8)}, ${alpha(groupInfo.bgColor, 0.4)})`,
                                '&:hover': { 
                                    background: `linear-gradient(135deg, ${alpha(groupInfo.bgColor, 1)}, ${alpha(groupInfo.bgColor, 0.6)})`,
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
                                        backgroundColor: alpha(groupInfo.color, 0.1),
                                        transition: 'all 0.2s ease-in-out'
                                    }}
                                >
                                    <IconComponent sx={{ fontSize: 16, color: groupInfo.color }} />
                                </Box>
                            </ListItemIcon>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                                            {groupInfo.label}
                                        </Typography>
                                        <Chip
                                            label={tables.length}
                                            size="small"
                                            sx={{
                                                height: 22,
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                backgroundColor: groupInfo.color,
                                                color: 'white',
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
                                    <ExpandLess sx={{ color: groupInfo.color }} /> : 
                                    <ExpandMore sx={{ color: groupInfo.color }} />
                                }
                            </Box>
                        </ListItemButton>
                    </ListItem>

                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ backgroundColor: 'rgba(0, 0, 0, 0.01)' }}>
                            <List component="div" disablePadding>
                                {tables.map((table, index) => (
                                    <ListItem
                                        key={table}
                                        disablePadding
                                        sx={{
                                            borderTop: index === 0 ? '1px solid' : 'none',
                                            borderTopColor: 'divider',
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
                                                        backgroundColor: alpha(groupInfo.color, 0.05),
                                                        '&:hover': {
                                                            opacity: 1,
                                                            backgroundColor: alpha(groupInfo.color, 0.1),
                                                            transform: 'scale(1.1)'
                                                        },
                                                        transition: 'all 0.2s ease-in-out'
                                                    }}
                                                >
                                                    <ContentCopy sx={{ fontSize: 14, color: groupInfo.color }} />
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
                                                    backgroundColor: alpha(groupInfo.color, 0.08),
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
                                                        backgroundColor: alpha(groupInfo.color, 0.1),
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
                                                                color: 'text.primary',
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
            {renderTableGroup('query_results', groupedTables.query_results)}
            {renderTableGroup('uploads', groupedTables.uploads)}
            {renderTableGroup('others', groupedTables.others)}
        </Box>
    );
};

export default TreeTableView;
