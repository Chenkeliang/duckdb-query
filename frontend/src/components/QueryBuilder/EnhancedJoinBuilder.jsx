import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Link as LinkIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';

const EnhancedJoinBuilder = ({ dataSources = [], joins = [], onJoinsChange }) => {
  const [joinConditions, setJoinConditions] = useState([]);
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);

  useEffect(() => {
    // 初始化JOIN条件
    if (joins.length === 0 && dataSources.length >= 2) {
      addJoinCondition();
    } else {
      setJoinConditions(joins.map(join => ({
        id: Math.random().toString(36).substr(2, 9),
        leftSourceId: join.left_source_id || '',
        rightSourceId: join.right_source_id || '',
        joinType: join.join_type || 'inner',
        conditions: join.conditions || [{ left_column: '', right_column: '', operator: '=' }]
      })));
    }
  }, [joins, dataSources]);

  useEffect(() => {
    validateJoins();
  }, [joinConditions, dataSources]);

  const addJoinCondition = () => {
    const newJoin = {
      id: Math.random().toString(36).substr(2, 9),
      leftSourceId: '',
      rightSourceId: '',
      joinType: 'inner',
      conditions: [{ left_column: '', right_column: '', operator: '=' }]
    };
    
    const updatedJoins = [...joinConditions, newJoin];
    setJoinConditions(updatedJoins);
    updateParentJoins(updatedJoins);
  };

  const removeJoinCondition = (joinId) => {
    const updatedJoins = joinConditions.filter(join => join.id !== joinId);
    setJoinConditions(updatedJoins);
    updateParentJoins(updatedJoins);
  };

  const updateJoinCondition = (joinId, field, value) => {
    const updatedJoins = joinConditions.map(join => {
      if (join.id === joinId) {
        return { ...join, [field]: value };
      }
      return join;
    });
    
    setJoinConditions(updatedJoins);
    updateParentJoins(updatedJoins);
  };

  const addConditionToJoin = (joinId) => {
    const updatedJoins = joinConditions.map(join => {
      if (join.id === joinId) {
        return {
          ...join,
          conditions: [...join.conditions, { left_column: '', right_column: '', operator: '=' }]
        };
      }
      return join;
    });
    
    setJoinConditions(updatedJoins);
    updateParentJoins(updatedJoins);
  };

  const removeConditionFromJoin = (joinId, conditionIndex) => {
    const updatedJoins = joinConditions.map(join => {
      if (join.id === joinId) {
        const newConditions = join.conditions.filter((_, index) => index !== conditionIndex);
        return {
          ...join,
          conditions: newConditions.length > 0 ? newConditions : [{ left_column: '', right_column: '', operator: '=' }]
        };
      }
      return join;
    });
    
    setJoinConditions(updatedJoins);
    updateParentJoins(updatedJoins);
  };

  const updateJoinConditionField = (joinId, conditionIndex, field, value) => {
    const updatedJoins = joinConditions.map(join => {
      if (join.id === joinId) {
        const newConditions = join.conditions.map((condition, index) => {
          if (index === conditionIndex) {
            return { ...condition, [field]: value };
          }
          return condition;
        });
        return { ...join, conditions: newConditions };
      }
      return join;
    });
    
    setJoinConditions(updatedJoins);
    updateParentJoins(updatedJoins);
  };

  const updateParentJoins = (joins) => {
    const formattedJoins = joins.map(join => ({
      left_source_id: join.leftSourceId,
      right_source_id: join.rightSourceId,
      join_type: join.joinType,
      conditions: join.conditions.filter(cond => cond.left_column && cond.right_column)
    })).filter(join => join.left_source_id && join.right_source_id);
    
    onJoinsChange(formattedJoins);
  };

  const validateJoins = () => {
    const newErrors = [];
    const newWarnings = [];

    // 检查数据源数量
    if (dataSources.length < 2) {
      newWarnings.push('需要至少2个数据源才能进行JOIN操作');
    }

    // 检查JOIN条件
    joinConditions.forEach((join, index) => {
      if (!join.leftSourceId || !join.rightSourceId) {
        newErrors.push(`JOIN ${index + 1}: 请选择左右数据源`);
      }

      if (join.leftSourceId === join.rightSourceId) {
        newErrors.push(`JOIN ${index + 1}: 不能JOIN同一个数据源`);
      }

      join.conditions.forEach((condition, condIndex) => {
        if (!condition.left_column || !condition.right_column) {
          newWarnings.push(`JOIN ${index + 1} 条件 ${condIndex + 1}: 请选择JOIN字段`);
        }
      });
    });

    // 检查循环依赖
    const usedSources = new Set();
    joinConditions.forEach(join => {
      if (join.leftSourceId && join.rightSourceId) {
        usedSources.add(join.leftSourceId);
        usedSources.add(join.rightSourceId);
      }
    });

    setErrors(newErrors);
    setWarnings(newWarnings);
  };

  const getAvailableColumns = (sourceId) => {
    const source = dataSources.find(ds => ds.id === sourceId);
    return source?.columns || [];
  };

  const getJoinTypeLabel = (type) => {
    const labels = {
      inner: 'INNER JOIN',
      left: 'LEFT JOIN',
      right: 'RIGHT JOIN',
      full_outer: 'FULL OUTER JOIN',
      cross: 'CROSS JOIN'
    };
    return labels[type] || type;
  };

  const getJoinTypeColor = (type) => {
    const colors = {
      inner: 'primary',
      left: 'secondary',
      right: 'warning',
      full_outer: 'info',
      cross: 'error'
    };
    return colors[type] || 'default';
  };

  return (
    <Paper sx={{
      p: 3,
      borderRadius: 3,
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      // 防止触控板手势导致的页面导航
      overscrollBehavior: 'contain',
      touchAction: 'pan-x pan-y'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinkIcon color="primary" />
          高级JOIN构建器
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={addJoinCondition}
          disabled={dataSources.length < 2}
          sx={{ borderRadius: 20 }}
        >
          添加JOIN
        </Button>
      </Box>

      {/* 错误和警告提示 */}
      {errors.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>错误:</Typography>
          {errors.map((error, index) => (
            <Typography key={index} variant="body2">• {error}</Typography>
          ))}
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>警告:</Typography>
          {warnings.map((warning, index) => (
            <Typography key={index} variant="body2">• {warning}</Typography>
          ))}
        </Alert>
      )}

      {/* JOIN条件列表 */}
      {joinConditions.map((join, joinIndex) => (
        <Accordion key={join.id} sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <Typography variant="subtitle1">
                JOIN {joinIndex + 1}
              </Typography>
              <Chip
                label={getJoinTypeLabel(join.joinType)}
                color={getJoinTypeColor(join.joinType)}
                size="small"
              />
              {join.leftSourceId && join.rightSourceId && (
                <Typography variant="body2" color="textSecondary">
                  {join.leftSourceId} ⟷ {join.rightSourceId}
                </Typography>
              )}
              <Box sx={{ flexGrow: 1 }} />
              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  removeJoinCondition(join.id);
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          </AccordionSummary>
          
          <AccordionDetails>
            <Grid container spacing={2}>
              {/* 数据源选择 */}
              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>左数据源</InputLabel>
                  <Select
                    value={join.leftSourceId}
                    onChange={(e) => updateJoinCondition(join.id, 'leftSourceId', e.target.value)}
                    label="左数据源"
                  >
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
                      .map(source => (
                      <MenuItem key={source.id} value={source.id}>
                        {source.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>JOIN类型</InputLabel>
                  <Select
                    value={join.joinType}
                    onChange={(e) => updateJoinCondition(join.id, 'joinType', e.target.value)}
                    label="JOIN类型"
                  >
                    <MenuItem value="inner">INNER JOIN</MenuItem>
                    <MenuItem value="left">LEFT JOIN</MenuItem>
                    <MenuItem value="right">RIGHT JOIN</MenuItem>
                    <MenuItem value="full_outer">FULL OUTER JOIN</MenuItem>
                    <MenuItem value="cross">CROSS JOIN</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={4}>
                <FormControl fullWidth size="small">
                  <InputLabel>右数据源</InputLabel>
                  <Select
                    value={join.rightSourceId}
                    onChange={(e) => updateJoinCondition(join.id, 'rightSourceId', e.target.value)}
                    label="右数据源"
                  >
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
                      .map(source => (
                      <MenuItem key={source.id} value={source.id}>
                        {source.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* JOIN条件 */}
              <Grid item xs={12}>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle2" gutterBottom>
                  JOIN条件
                </Typography>
                
                {join.conditions.map((condition, conditionIndex) => (
                  <Box key={conditionIndex} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <InputLabel>左字段</InputLabel>
                      <Select
                        value={condition.left_column}
                        onChange={(e) => updateJoinConditionField(join.id, conditionIndex, 'left_column', e.target.value)}
                        label="左字段"
                      >
                        {getAvailableColumns(join.leftSourceId).map(col => (
                          <MenuItem key={col} value={col}>{col}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 80 }}>
                      <InputLabel>操作符</InputLabel>
                      <Select
                        value={condition.operator}
                        onChange={(e) => updateJoinConditionField(join.id, conditionIndex, 'operator', e.target.value)}
                        label="操作符"
                      >
                        <MenuItem value="=">=</MenuItem>
                        <MenuItem value="!=">!=</MenuItem>
                        <MenuItem value="<">&lt;</MenuItem>
                        <MenuItem value=">">&gt;</MenuItem>
                        <MenuItem value="<=">&lt;=</MenuItem>
                        <MenuItem value=">=">&gt;=</MenuItem>
                      </Select>
                    </FormControl>

                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <InputLabel>右字段</InputLabel>
                      <Select
                        value={condition.right_column}
                        onChange={(e) => updateJoinConditionField(join.id, conditionIndex, 'right_column', e.target.value)}
                        label="右字段"
                      >
                        {getAvailableColumns(join.rightSourceId).map(col => (
                          <MenuItem key={col} value={col}>{col}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => removeConditionFromJoin(join.id, conditionIndex)}
                      disabled={join.conditions.length === 1}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                ))}

                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => addConditionToJoin(join.id)}
                  sx={{ mt: 1 }}
                >
                  添加条件
                </Button>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}

      {joinConditions.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="textSecondary" gutterBottom>
            暂无JOIN条件
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {dataSources.length < 2 
              ? '请先选择至少2个数据源' 
              : '点击"添加JOIN"开始构建查询'
            }
          </Typography>
        </Box>
      )}

      {/* JOIN预览 */}
      {joinConditions.length > 0 && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            JOIN预览:
          </Typography>
          <Typography variant="body2" component="pre" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
            {joinConditions.map((join, index) => {
              if (!join.leftSourceId || !join.rightSourceId) return '';
              const conditions = join.conditions
                .filter(c => c.left_column && c.right_column)
                .map(c => `${join.leftSourceId}.${c.left_column} ${c.operator} ${join.rightSourceId}.${c.right_column}`)
                .join(' AND ');
              
              return `${getJoinTypeLabel(join.joinType)} ${join.rightSourceId} ON ${conditions || '(未设置条件)'}`;
            }).filter(Boolean).join('\n')}
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default EnhancedJoinBuilder;
