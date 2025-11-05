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
import { Parser } from 'node-sql-parser';
import React, { useEffect, useState } from 'react';

const DIALECT_MAP = {
    mysql: 'mysql',
    mariadb: 'mariadb',
    postgres: 'postgresql',
    postgresql: 'postgresql',
    redshift: 'postgresql',
    sqlite: 'sqlite',
    snowflake: 'snowflake',
    bigquery: 'bigquery',
    hive: 'hive',
    trino: 'trino',
    duckdb: 'trino',
    default: 'trino'
};

const SQLValidator = ({ sqlQuery, tables = [], onValidationChange, databaseType = 'MySQL' }) => {
    const [errors, setErrors] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        // 添加防抖，避免频繁验证
        const timer = setTimeout(() => {
            validateSQL();
        }, 500); // 500ms 延迟

        return () => clearTimeout(timer);
    }, [sqlQuery, tables]);

    const validateSQL = () => {
        const newErrors = [];
        const newWarnings = [];
        const newSuggestions = [];

        if (!sqlQuery.trim()) {
            setErrors([]);
            setWarnings([]);
            setSuggestions([]);
            if (onValidationChange) {
                onValidationChange({
                    hasErrors: false,
                    hasWarnings: false,
                    errorCount: 0,
                    warningCount: 0,
                    suggestionCount: 0
                });
            }
            return;
        }

        const query = sqlQuery.trim();

        // 使用 node-sql-parser 进行真正的SQL语法解析
        const parser = new Parser();
        const normalizedType = (databaseType || '').toLowerCase();
        const targetDialect = DIALECT_MAP[normalizedType] || DIALECT_MAP.default;
        const fallbackDialects = normalizedType === 'duckdb' || (!databaseType && targetDialect === DIALECT_MAP.default)
            ? [DIALECT_MAP.trino]
            : [];

        try {
            parser.astify(query, { database: targetDialect });
        } catch (primaryError) {
            let parsed = false;

            for (const fallback of fallbackDialects) {
                try {
                    parser.astify(query, { database: fallback });
                    parsed = true;
                    break;
                } catch (fallbackError) {
                    // 继续尝试下一个备用方言
                }
            }

            if (!parsed) {
                const errorMessage = primaryError.message || '未知的SQL语法错误';
                newErrors.push({
                    type: 'syntax',
                    message: errorMessage,
                    position: 0,
                    suggestion: '请检查SQL语法是否正确'
                });
            }
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

    // 只有在用户输入了SQL查询且没有语法错误时才显示成功提示
    if (totalIssues === 0 && sqlQuery.trim()) {
        return (
            <Box sx={{ mt: 2 }}>
                <Alert
                    severity="success"
                    icon={<CheckCircleIcon />}
                    sx={{
                        backgroundColor: 'var(--dq-status-success-bg)',
                        color: 'var(--dq-status-success-fg)',
                        border: '1px solid color-mix(in oklab, var(--dq-status-success-fg) 42%, transparent)',
                        boxShadow: 'none',
                        alignItems: 'center',
                        '& .MuiAlert-icon': {
                            color: 'var(--dq-status-success-fg)'
                        }
                    }}
                >
                    <Typography variant="body2">
                        SQL 语法检查通过
                    </Typography>
                </Alert>
            </Box>
        );
    }

    // 如果没有输入内容或没有问题，不显示任何内容
    if (!sqlQuery.trim() || totalIssues === 0) {
        return null;
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
                            <Typography variant="subtitle2" color="var(--dq-text-primary)" sx={{ mb: 1 }}>
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
                            <Typography variant="subtitle2" color="var(--dq-text-primary)" sx={{ mb: 1 }}>
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
