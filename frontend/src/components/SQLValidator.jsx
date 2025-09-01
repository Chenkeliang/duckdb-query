import {
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    ExpandLess as ExpandLessIcon,
    ExpandMore as ExpandMoreIcon,
    Info as InfoIcon,
    Warning as WarningIcon
} from '@mui/icons-material';
import {
    Alert,
    Box,
    Collapse,
    IconButton,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Typography
} from '@mui/material';
import React, { useEffect, useState } from 'react';

const SQLValidator = ({ sqlQuery, tables = [], onValidationChange }) => {
    const [errors, setErrors] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        validateSQL();
    }, [sqlQuery, tables]);

    const validateSQL = () => {
        const newErrors = [];
        const newWarnings = [];
        const newSuggestions = [];

        if (!sqlQuery.trim()) {
            return;
        }

        const query = sqlQuery.trim();
        const upperQuery = query.toUpperCase();

        // 只检查最基本的语法错误，不显示任何建议或警告

        // 检查 SELECT 语句
        if (upperQuery.includes('SELECT')) {
            if (!upperQuery.includes('FROM')) {
                newErrors.push({
                    type: 'syntax',
                    message: 'SELECT语句缺少FROM子句',
                    position: upperQuery.indexOf('SELECT'),
                    suggestion: '添加 FROM table_name'
                });
            }
        }

        // 检查 WHERE 条件
        if (upperQuery.includes('WHERE')) {
            const whereIndex = upperQuery.indexOf('WHERE');
            const afterWhere = upperQuery.substring(whereIndex + 5).trim();

            if (!afterWhere || afterWhere.startsWith(';')) {
                newErrors.push({
                    type: 'syntax',
                    message: 'WHERE子句缺少条件',
                    position: whereIndex + 5,
                    suggestion: '添加具体的WHERE条件'
                });
            }
        }

        // 检查 JOIN 语句
        if (upperQuery.includes('JOIN') && !upperQuery.includes('ON')) {
            newErrors.push({
                type: 'syntax',
                message: 'JOIN语句缺少ON条件',
                position: upperQuery.indexOf('JOIN'),
                suggestion: '添加 ON table1.column = table2.column'
            });
        }

        // 检查 GROUP BY
        if (upperQuery.includes('GROUP BY')) {
            const groupByIndex = upperQuery.indexOf('GROUP BY');
            const afterGroupBy = upperQuery.substring(groupByIndex + 8).trim();

            if (!afterGroupBy || afterGroupBy.startsWith(';')) {
                newErrors.push({
                    type: 'syntax',
                    message: 'GROUP BY子句缺少列名',
                    position: groupByIndex + 8,
                    suggestion: '添加列名，例如: GROUP BY column_name'
                });
            }
        }

        // 检查 HAVING
        if (upperQuery.includes('HAVING') && !upperQuery.includes('GROUP BY')) {
            newErrors.push({
                type: 'logic',
                message: 'HAVING子句通常与GROUP BY一起使用',
                position: upperQuery.indexOf('HAVING'),
                suggestion: '考虑添加 GROUP BY 子句'
            });
        }

        setErrors(newErrors);
        setWarnings(newWarnings);
        setSuggestions(newSuggestions);

        // 通知父组件验证结果
        if (onValidationChange) {
            onValidationChange({
                hasErrors: newErrors.length > 0,
                hasWarnings: newWarnings.length > 0,
                errorCount: newErrors.length,
                warningCount: newWarnings.length,
                suggestionCount: newSuggestions.length
            });
        }
    };

    const getSeverityIcon = (type) => {
        switch (type) {
            case 'error':
                return <ErrorIcon color="error" />;
            case 'warning':
                return <WarningIcon color="warning" />;
            case 'suggestion':
                return <InfoIcon color="info" />;
            default:
                return <InfoIcon />;
        }
    };

    const getSeverityColor = (type) => {
        switch (type) {
            case 'error':
                return 'error';
            case 'warning':
                return 'warning';
            case 'suggestion':
                return 'info';
            default:
                return 'default';
        }
    };

    const totalIssues = errors.length + warnings.length + suggestions.length;

    if (totalIssues === 0) {
        return (
            <Box sx={{ mt: 2 }}>
                <Alert severity="success" icon={<CheckCircleIcon />}>
                    <Typography variant="body2">
                        SQL 语法检查通过 ✅
                    </Typography>
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ mt: 2 }}>
            <Alert
                severity={errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'info'}
                action={
                    <IconButton
                        size="small"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                }
            >
                <Typography variant="body2">
                    SQL 语法检查发现 {totalIssues} 个问题
                    {errors.length > 0 && ` (${errors.length} 个错误)`}
                    {warnings.length > 0 && ` (${warnings.length} 个警告)`}
                    {suggestions.length > 0 && ` (${suggestions.length} 个建议)`}
                </Typography>
            </Alert>

            <Collapse in={expanded}>
                <Box sx={{ mt: 1 }}>
                    {errors.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="error" sx={{ mb: 1 }}>
                                错误 ({errors.length})
                            </Typography>
                            <List dense>
                                {errors.map((error, index) => (
                                    <ListItem key={index} sx={{ py: 0.5 }}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                            {getSeverityIcon('error')}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={error.message}
                                            secondary={
                                                <Box sx={{ mt: 0.5 }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        建议: {error.suggestion}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}

                    {warnings.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="subtitle2" color="warning.main" sx={{ mb: 1 }}>
                                警告 ({warnings.length})
                            </Typography>
                            <List dense>
                                {warnings.map((warning, index) => (
                                    <ListItem key={index} sx={{ py: 0.5 }}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                            {getSeverityIcon('warning')}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={warning.message}
                                            secondary={
                                                <Box sx={{ mt: 0.5 }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        建议: {warning.suggestion}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}

                    {suggestions.length > 0 && (
                        <Box>
                            <Typography variant="subtitle2" color="info.main" sx={{ mb: 1 }}>
                                建议 ({suggestions.length})
                            </Typography>
                            <List dense>
                                {suggestions.map((suggestion, index) => (
                                    <ListItem key={index} sx={{ py: 0.5 }}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                            {getSeverityIcon('suggestion')}
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={suggestion.message}
                                            secondary={
                                                <Box sx={{ mt: 0.5 }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        提示: {suggestion.suggestion}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Box>
    );
};

export default SQLValidator;
