import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Chip,
  IconButton,
  Stack,
  Divider,
  Alert,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Autocomplete,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  PlayArrow as ExecuteIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Link as JoinIcon,
  TableChart as TableIcon,
  FilterList as FilterIcon,
  Sort as SortIcon,
  Download as ExportIcon,
  Code as SqlIcon,
  Visibility as PreviewIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from '@mui/icons-material';

const ModernQueryBuilder = ({
  dataSources = [],
  onExecuteQuery,
  onExportResults,
  loading = false,
}) => {
  const theme = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedSources, setSelectedSources] = useState([]);
  const [joins, setJoins] = useState([]);
  const [filters, setFilters] = useState([]);
  const [sorting, setSorting] = useState([]);
  const [sqlPreview, setSqlPreview] = useState('');
  const [showSqlPreview, setShowSqlPreview] = useState(false);

  const steps = [
    {
      label: '选择数据源',
      description: '选择要查询的数据表或文件',
      icon: <TableIcon />,
    },
    {
      label: '配置关联',
      description: '设置表之间的JOIN关系',
      icon: <JoinIcon />,
    },
    {
      label: '添加筛选',
      description: '设置WHERE条件过滤数据',
      icon: <FilterIcon />,
    },
    {
      label: '排序设置',
      description: '配置结果排序规则',
      icon: <SortIcon />,
    },
  ];

  const joinTypes = [
    { value: 'inner', label: 'INNER JOIN', description: '内连接 - 返回两表匹配的记录' },
    { value: 'left', label: 'LEFT JOIN', description: '左连接 - 返回左表所有记录' },
    { value: 'right', label: 'RIGHT JOIN', description: '右连接 - 返回右表所有记录' },
    { value: 'full_outer', label: 'FULL OUTER JOIN', description: '全外连接 - 返回两表所有记录' },
  ];

  const operators = [
    { value: '=', label: '等于 (=)' },
    { value: '!=', label: '不等于 (!=)' },
    { value: '>', label: '大于 (>)' },
    { value: '<', label: '小于 (<)' },
    { value: '>=', label: '大于等于 (>=)' },
    { value: '<=', label: '小于等于 (<=)' },
    { value: 'LIKE', label: '包含 (LIKE)' },
    { value: 'IN', label: '在列表中 (IN)' },
  ];

  // 生成SQL预览
  useEffect(() => {
    generateSqlPreview();
  }, [selectedSources, joins, filters, sorting]);

  const generateSqlPreview = () => {
    if (selectedSources.length === 0) {
      setSqlPreview('-- 请先选择数据源');
      return;
    }

    let sql = 'SELECT *\n';
    sql += `FROM ${selectedSources[0].id}`;

    // 添加JOIN
    joins.forEach(join => {
      sql += `
${(join.type || '').toUpperCase().replace('_', ' ')} ${join.rightTable}`;
      sql += `\n  ON ${join.leftTable}.${join.leftColumn} = ${join.rightTable}.${join.rightColumn}`;
    });

    // 添加WHERE条件
    if (filters.length > 0) {
      sql += '\nWHERE ';
      sql += filters.map(filter => 
        `${filter.column} ${filter.operator} ${filter.value}`
      ).join('\n  AND ');
    }

    // 添加ORDER BY
    if (sorting.length > 0) {
      sql += '\nORDER BY ';
      sql += sorting.map(sort => 
        `${sort.column} ${sort.direction}`
      ).join(', ');
    }

    sql += '\nLIMIT 1000;';
    setSqlPreview(sql);
  };

  const handleSourceToggle = (source) => {
    const isSelected = selectedSources.some(s => s.id === source.id);
    if (isSelected) {
      setSelectedSources(selectedSources.filter(s => s.id !== source.id));
      // 移除相关的JOIN
      setJoins(joins.filter(j => j.leftTable !== source.id && j.rightTable !== source.id));
    } else {
      setSelectedSources([...selectedSources, source]);
    }
  };

  const handleAddJoin = () => {
    if (selectedSources.length < 2) return;
    
    setJoins([...joins, {
      id: Date.now(),
      leftTable: selectedSources[0].id,
      rightTable: selectedSources[1].id,
      leftColumn: '',
      rightColumn: '',
      type: 'inner',
    }]);
  };

  const handleAddFilter = () => {
    setFilters([...filters, {
      id: Date.now(),
      column: '',
      operator: '=',
      value: '',
    }]);
  };

  const handleAddSort = () => {
    setSorting([...sorting, {
      id: Date.now(),
      column: '',
      direction: 'ASC',
    }]);
  };

  const getAvailableColumns = (tableId) => {
    const source = selectedSources.find(s => s.id === tableId);
    return source?.columns || [];
  };

  const getAllColumns = () => {
    return selectedSources.flatMap(source => 
      source.columns?.map(col => ({ table: source.id, column: col })) || []
    );
  };

  const canProceedToNext = () => {
    switch (activeStep) {
      case 0:
        return selectedSources.length > 0;
      case 1:
        return selectedSources.length === 1 || joins.length > 0;
      default:
        return true;
    }
  };

  const StepContent1 = () => (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        从下方选择要查询的数据源，支持多表关联查询
      </Typography>
      
      <Stack spacing={1}>
        {[...dataSources]
          .sort((a, b) => {
            // 按创建时间倒序排序（最新的在上面）
            // 如果createdAt为null，将其放在最后
            if (!a.createdAt && !b.createdAt) return 0;
            if (!a.createdAt) return 1;
            if (!b.createdAt) return -1;
            const timeA = new Date(a.createdAt).getTime();
            const timeB = new Date(b.createdAt).getTime();
            return timeB - timeA; // 时间大的（新的）排在前面
          })
          .map((source) => (
          <Card
            key={source.id}
            variant="outlined"
            sx={{
              cursor: 'pointer',
              transition: 'all 0.2s',
              border: selectedSources.some(s => s.id === source.id) 
                ? `2px solid ${theme.palette.primary.main}` 
                : '1px solid',
              '&:hover': {
                boxShadow: theme.shadows[2],
                transform: 'translateY(-1px)',
              },
            }}
            onClick={() => handleSourceToggle(source)}
          >
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <TableIcon color={selectedSources.some(s => s.id === source.id) ? 'primary' : 'action'} />
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {source.id}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(source.type || '').toUpperCase()} • {source.columns?.length || 0} 列
                    </Typography>
                  </Box>
                </Box>
                {selectedSources.some(s => s.id === source.id) && (
                  <Chip label="已选择" color="primary" size="small" />
                )}
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );

  const StepContent2 = () => (
    <Box>
      {selectedSources.length < 2 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          单表查询无需配置关联关系，可直接进入下一步
        </Alert>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              配置表之间的关联关系
            </Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddJoin}
              size="small"
              variant="outlined"
            >
              添加关联
            </Button>
          </Box>

          <Stack spacing={2}>
            {joins.map((join, index) => (
              <Card key={join.id} variant="outlined">
                <CardContent sx={{ py: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel>左表</InputLabel>
                      <Select
                        value={join.leftTable}
                        label="左表"
                        onChange={(e) => {
                          const newJoins = [...joins];
                          newJoins[index].leftTable = e.target.value;
                          setJoins(newJoins);
                        }}
                      >
                        {selectedSources.map(source => (
                          <MenuItem key={source.id} value={source.id}>
                            {source.id}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel>左表字段</InputLabel>
                      <Select
                        value={join.leftColumn}
                        label="左表字段"
                        onChange={(e) => {
                          const newJoins = [...joins];
                          newJoins[index].leftColumn = e.target.value;
                          setJoins(newJoins);
                        }}
                      >
                        {getAvailableColumns(join.leftTable).map(col => (
                          <MenuItem key={col} value={col}>{col}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>关联类型</InputLabel>
                      <Select
                        value={join.type}
                        label="关联类型"
                        onChange={(e) => {
                          const newJoins = [...joins];
                          newJoins[index].type = e.target.value;
                          setJoins(newJoins);
                        }}
                      >
                        {joinTypes.map(type => (
                          <MenuItem key={type.value} value={type.value}>
                            <Tooltip title={type.description} placement="top">
                              <span>{type.label}</span>
                            </Tooltip>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel>右表</InputLabel>
                      <Select
                        value={join.rightTable}
                        label="右表"
                        onChange={(e) => {
                          const newJoins = [...joins];
                          newJoins[index].rightTable = e.target.value;
                          setJoins(newJoins);
                        }}
                      >
                        {selectedSources.map(source => (
                          <MenuItem key={source.id} value={source.id}>
                            {source.id}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <InputLabel>右表字段</InputLabel>
                      <Select
                        value={join.rightColumn}
                        label="右表字段"
                        onChange={(e) => {
                          const newJoins = [...joins];
                          newJoins[index].rightColumn = e.target.value;
                          setJoins(newJoins);
                        }}
                      >
                        {getAvailableColumns(join.rightTable).map(col => (
                          <MenuItem key={col} value={col}>{col}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <IconButton
                      color="error"
                      size="small"
                      onClick={() => setJoins(joins.filter((_, i) => i !== index))}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );

  return (
    <Box sx={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      // 防止触控板手势导致的页面导航
      overscrollBehavior: 'contain',
      touchAction: 'pan-x pan-y'
    }}>
      {/* 头部 */}
      <Card sx={{
        mb: 3,
        // 防止触控板手势导致的页面导航
        overscrollBehavior: 'contain',
        touchAction: 'pan-x pan-y'
      }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              查询构建器
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<SqlIcon />}
                variant="outlined"
                size="small"
                onClick={() => setShowSqlPreview(!showSqlPreview)}
              >
                {showSqlPreview ? '隐藏' : '预览'} SQL
              </Button>
              <Button
                startIcon={<ExecuteIcon />}
                variant="contained"
                onClick={() => onExecuteQuery?.({ selectedSources, joins, filters, sorting })}
                disabled={!canProceedToNext() || loading}
              >
                执行查询
              </Button>
            </Stack>
          </Box>

          <Collapse in={showSqlPreview}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                backgroundColor: theme.palette.grey[50],
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                whiteSpace: 'pre-wrap',
                overflow: 'auto',
                maxHeight: 200,
              }}
            >
              {sqlPreview}
            </Paper>
          </Collapse>
        </CardContent>
      </Card>

      {/* 步骤器 */}
      <Card sx={{ flex: 1 }}>
        <CardContent>
          <Stepper activeStep={activeStep} orientation="vertical">
            {steps.map((step, index) => (
              <Step key={step.label}>
                <StepLabel
                  icon={step.icon}
                  onClick={() => setActiveStep(index)}
                  sx={{ cursor: 'pointer' }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {step.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {step.description}
                  </Typography>
                </StepLabel>
                <StepContent>
                  {index === 0 && <StepContent1 />}
                  {index === 1 && <StepContent2 />}
                  {/* 其他步骤内容... */}
                  
                  <Box sx={{ mt: 2 }}>
                    <Button
                      variant="contained"
                      onClick={() => setActiveStep(activeStep + 1)}
                      disabled={!canProceedToNext()}
                      sx={{ mr: 1 }}
                    >
                      {activeStep === steps.length - 1 ? '完成' : '下一步'}
                    </Button>
                    <Button
                      disabled={activeStep === 0}
                      onClick={() => setActiveStep(activeStep - 1)}
                    >
                      上一步
                    </Button>
                  </Box>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ModernQueryBuilder;
