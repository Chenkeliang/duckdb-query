import {
    ContentCopy as CopyIcon,
    ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Box,
    Card,
    CardContent,
    Chip,
    Grid,
    IconButton,
    Tooltip,
    Typography
} from '@mui/material';
import { BarChart3, FileText, Link, Rocket, Search } from 'lucide-react';
import React from 'react';

const SQLTemplates = ({ onTemplateSelect, tables = [] }) => {
    const templates = [
        {
            category: '基础查询',
            icon: <Search size={20} />,
            items: [
                {
                    name: '查看所有数据',
                    sql: 'SELECT * FROM table_name LIMIT 100',
                    description: '查看表中的前100行数据',
                    difficulty: '简单',
                    tags: ['基础', '查看数据']
                },
                {
                    name: '数据统计',
                    sql: 'SELECT COUNT(*) as total_count FROM table_name',
                    description: '统计表中的总行数',
                    difficulty: '简单',
                    tags: ['基础', '统计']
                },
                {
                    name: '去重查询',
                    sql: 'SELECT DISTINCT column_name FROM table_name',
                    description: '查询唯一值，去除重复数据',
                    difficulty: '简单',
                    tags: ['基础', '去重']
                },
                {
                    name: '条件过滤',
                    sql: 'SELECT * FROM table_name WHERE column_name > 100',
                    description: '根据条件过滤数据',
                    difficulty: '简单',
                    tags: ['基础', '过滤']
                }
            ]
        },
        {
            category: '数据分析',
            icon: <BarChart3 size={20} />,
            items: [
                {
                    name: '分组统计',
                    sql: 'SELECT category, COUNT(*) as count FROM table_name GROUP BY category',
                    description: '按类别分组统计数量',
                    difficulty: '中等',
                    tags: ['分析', '分组']
                },
                {
                    name: '排序查询',
                    sql: 'SELECT * FROM table_name ORDER BY column_name DESC LIMIT 10',
                    description: '按列排序并取前10名',
                    difficulty: '简单',
                    tags: ['分析', '排序']
                },
                {
                    name: '聚合计算',
                    sql: 'SELECT AVG(price) as avg_price, MAX(price) as max_price, MIN(price) as min_price FROM table_name',
                    description: '计算平均值、最大值、最小值',
                    difficulty: '中等',
                    tags: ['分析', '聚合']
                },
                {
                    name: '窗口函数',
                    sql: 'SELECT *, ROW_NUMBER() OVER (ORDER BY column_name) as row_num FROM table_name',
                    description: '使用窗口函数为每行分配序号',
                    difficulty: '高级',
                    tags: ['分析', '窗口函数']
                }
            ]
        },
        {
            category: 'DuckDB 特有功能',
            icon: '🦆',
            items: [
                {
                    name: '读取 CSV 文件',
                    sql: 'SELECT * FROM read_csv(\'data.csv\') LIMIT 10',
                    description: '直接读取 CSV 文件进行查询',
                    difficulty: '简单',
                    tags: ['DuckDB', '文件读取']
                },
                {
                    name: '读取 Parquet 文件',
                    sql: 'SELECT * FROM read_parquet(\'data.parquet\') LIMIT 10',
                    description: '直接读取 Parquet 文件进行查询',
                    difficulty: '简单',
                    tags: ['DuckDB', '文件读取']
                },
                {
                    name: '读取 JSON 文件',
                    sql: 'SELECT * FROM read_json(\'data.json\') LIMIT 10',
                    description: '直接读取 JSON 文件进行查询',
                    difficulty: '简单',
                    tags: ['DuckDB', '文件读取']
                },
                {
                    name: '列表聚合',
                    sql: 'SELECT category, list_agg(item_name) as items FROM table_name GROUP BY category',
                    description: '将列值聚合为列表',
                    difficulty: '中等',
                    tags: ['DuckDB', '列表操作']
                },
                {
                    name: '展开列表',
                    sql: 'SELECT unnest(list_column) as item FROM table_name',
                    description: '展开列表列中的每个元素',
                    difficulty: '中等',
                    tags: ['DuckDB', '列表操作']
                },
                {
                    name: 'JSON 提取',
                    sql: 'SELECT json_extract(json_column, \'$.key\') as extracted_value FROM table_name',
                    description: '从 JSON 列中提取特定值',
                    difficulty: '中等',
                    tags: ['DuckDB', 'JSON操作']
                }
            ]
        },
        {
            category: '表关联',
            icon: <Link size={20} />,
            items: [
                {
                    name: '内连接',
                    sql: 'SELECT a.*, b.* FROM table1 a JOIN table2 b ON a.id = b.id',
                    description: '两个表的内连接查询',
                    difficulty: '中等',
                    tags: ['关联', '内连接']
                },
                {
                    name: '左连接',
                    sql: 'SELECT a.*, b.* FROM table1 a LEFT JOIN table2 b ON a.id = b.id',
                    description: '左表为主的外连接查询',
                    difficulty: '中等',
                    tags: ['关联', '左连接']
                },
                {
                    name: '多表关联',
                    sql: 'SELECT a.*, b.*, c.* FROM table1 a JOIN table2 b ON a.id = b.id JOIN table3 c ON b.id = c.id',
                    description: '关联多个表进行查询',
                    difficulty: '高级',
                    tags: ['关联', '多表']
                }
            ]
        },
        {
            category: '高级查询',
            icon: <Rocket size={20} />,
            items: [
                {
                    name: '子查询',
                    sql: 'SELECT * FROM table1 WHERE column1 IN (SELECT column1 FROM table2 WHERE condition)',
                    description: '使用子查询进行条件过滤',
                    difficulty: '高级',
                    tags: ['高级', '子查询']
                },
                {
                    name: 'CTE (公共表表达式)',
                    sql: 'WITH cte AS (SELECT * FROM table1 WHERE condition) SELECT * FROM cte',
                    description: '使用 CTE 简化复杂查询',
                    difficulty: '高级',
                    tags: ['高级', 'CTE']
                },
                {
                    name: '递归查询',
                    sql: 'WITH RECURSIVE cte AS (SELECT * FROM table1 WHERE id = 1 UNION ALL SELECT t.* FROM table1 t JOIN cte c ON t.parent_id = c.id) SELECT * FROM cte',
                    description: '递归查询层级数据',
                    difficulty: '高级',
                    tags: ['高级', '递归']
                },
                {
                    name: '透视表',
                    sql: 'SELECT * FROM table_name PIVOT (SUM(value) FOR category IN (\'A\', \'B\', \'C\'))',
                    description: '将行数据转换为列数据',
                    difficulty: '高级',
                    tags: ['高级', '透视表']
                }
            ]
        }
    ];

    const handleTemplateSelect = (template) => {
        if (onTemplateSelect) {
            onTemplateSelect(template.sql);
        }
    };



    const handleCopyTemplate = (template) => {
        navigator.clipboard.writeText(template.sql);
    };

    const getDifficultyColor = (difficulty) => {
        switch (difficulty) {
            case '简单': return 'success';
            case '中等': return 'warning';
            case '高级': return 'error';
            default: return 'default';
        }
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <FileText size={20} style={{ marginRight: '8px' }} />
                SQL 查询模板
                <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                    (点击模板可快速填充到编辑器)
                </Typography>
            </Typography>

            {templates.map((category, index) => (
                <Accordion key={index} defaultExpanded={index === 0}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                            <span style={{ marginRight: '8px' }}>{category.icon}</span>
                            {category.category}
                        </Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Grid container spacing={2}>
                            {category.items.map((template, templateIndex) => (
                                <Grid item xs={12} md={6} key={templateIndex}>
                                    <Card
                                        sx={{
                                            cursor: 'pointer',
                                            '&:hover': {
                                                boxShadow: 3,
                                                transform: 'translateY(-2px)',
                                                transition: 'all 0.2s ease-in-out'
                                            }
                                        }}
                                        onClick={() => handleTemplateSelect(template)}
                                    >
                                        <CardContent>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    {template.name}
                                                </Typography>
                                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                    <Tooltip title="复制到剪贴板">
                                                        <IconButton
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCopyTemplate(template);
                                                            }}
                                                        >
                                                            <CopyIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </Box>

                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                {template.description}
                                            </Typography>

                                            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                                                <Chip
                                                    label={template.difficulty}
                                                    size="small"
                                                    color={getDifficultyColor(template.difficulty)}
                                                />
                                                {template.tags.map((tag, tagIndex) => (
                                                    <Chip
                                                        key={tagIndex}
                                                        label={tag}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                ))}
                                            </Box>

                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontFamily: 'monospace',
                                                    backgroundColor: 'var(--dq-surface)',
                                                    p: 1,
                                                    borderRadius: 1,
                                                    fontSize: '1rem',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title={template.sql}
                                            >
                                                {template.sql}
                                            </Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    </AccordionDetails>
                </Accordion>
            ))}


        </Box>
    );
};

export default SQLTemplates;
