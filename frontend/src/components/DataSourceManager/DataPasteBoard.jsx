import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Divider,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch
} from '@mui/material';
import { useToast } from '../../contexts/ToastContext';
import {
  ContentPaste as PasteIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
  Clear as ClearIcon,
  AutoFixHigh as AutoDetectIcon
} from '@mui/icons-material';

const DataPasteBoard = ({ onDataSaved }) => {
  const { showSuccess, showError } = useToast();
  const [pastedData, setPastedData] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [tableName, setTableName] = useState('');
  const [columnNames, setColumnNames] = useState([]);
  const [columnTypes, setColumnTypes] = useState([]);
  const [delimiter, setDelimiter] = useState(',');
  const [hasHeader, setHasHeader] = useState(false);
  const [unifyAsString, setUnifyAsString] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 数据类型选项
  const dataTypes = [
    { value: 'VARCHAR', label: '文本' },
    { value: 'INTEGER', label: '整数' },
    { value: 'DOUBLE', label: '小数' },
    { value: 'DATE', label: '日期' },
    { value: 'BOOLEAN', label: '布尔值' }
  ];

  // 自动检测分隔符
  const detectDelimiter = (text) => {
    const delimiters = [',', '\t', '|', ';', ' '];
    const lines = text.trim().split('\n').slice(0, 5); // 检查前5行
    
    let bestDelimiter = ',';
    let maxConsistency = 0;
    
    for (const delim of delimiters) {
      const columnCounts = lines.map(line => line.split(delim).length);
      const avgCount = columnCounts.reduce((a, b) => a + b, 0) / columnCounts.length;
      const consistency = columnCounts.filter(count => count === Math.round(avgCount)).length / columnCounts.length;
      
      if (consistency > maxConsistency && avgCount > 1) {
        maxConsistency = consistency;
        bestDelimiter = delim;
      }
    }
    
    return bestDelimiter;
  };

  // 自动检测数据类型
  const detectDataType = (values) => {
    const nonEmptyValues = values.filter(v => v && v.toString().trim() !== '');
    if (nonEmptyValues.length === 0) return 'VARCHAR';
    
    // 检查是否为整数
    const isInteger = nonEmptyValues.every(v => /^\d+$/.test(v.toString().trim()));
    if (isInteger) return 'INTEGER';
    
    // 检查是否为小数
    const isFloat = nonEmptyValues.every(v => /^\d*\.?\d+$/.test(v.toString().trim()));
    if (isFloat) return 'DOUBLE';
    
    // 检查是否为日期
    const isDate = nonEmptyValues.every(v => !isNaN(Date.parse(v.toString().trim())));
    if (isDate) return 'DATE';
    
    // 检查是否为布尔值
    const isBool = nonEmptyValues.every(v => 
      ['true', 'false', '1', '0', 'yes', 'no'].includes(v.toString().toLowerCase().trim())
    );
    if (isBool) return 'BOOLEAN';
    
    return 'VARCHAR';
  };

  // 清理单元格数据（去除引号和空格）
  const cleanCellData = (cell) => {
    if (!cell) return '';

    let cleaned = cell.toString().trim();

    // 处理引号包裹的情况
    if (cleaned.length >= 2) {
      // 处理双引号包裹: "content"
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1);
      }
      // 处理单引号包裹: 'content'
      else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
        cleaned = cleaned.slice(1, -1);
      }
    }

    // 再次去除内部可能的首尾空格
    return cleaned.trim();
  };

  // 解析粘贴的数据
  const parseData = () => {
    if (!pastedData.trim()) {
      setError('请粘贴数据内容');
      return;
    }

    try {
      setError('');

      // 自动检测分隔符
      const detectedDelimiter = detectDelimiter(pastedData);
      setDelimiter(detectedDelimiter);

      const lines = pastedData.trim().split('\n');
      const rows = lines.map(line => {
        const cells = line.split(detectedDelimiter).map(cell => cleanCellData(cell));
        // 如果最后一个单元格是空的（由末尾逗号导致），则移除它
        if (cells.length > 1 && cells[cells.length - 1] === '') {
          cells.pop();
        }
        return cells;
      });

      if (rows.length === 0) {
        setError('没有检测到有效数据');
        return;
      }

      // 检查列数一致性（改进版）
      const columnCounts = rows.map(row => row.length);
      const uniqueColumnCounts = [...new Set(columnCounts)];

      // 如果有多种列数，选择最常见的作为标准
      let standardColumnCount;
      if (uniqueColumnCounts.length === 1) {
        standardColumnCount = uniqueColumnCounts[0];
      } else {
        // 找出最常见的列数
        const countFrequency = {};
        columnCounts.forEach(count => {
          countFrequency[count] = (countFrequency[count] || 0) + 1;
        });
        standardColumnCount = parseInt(Object.keys(countFrequency).reduce((a, b) =>
          countFrequency[a] > countFrequency[b] ? a : b
        ));

        // 过滤掉列数不一致的行，但给出警告
        const inconsistentRows = rows.filter(row => row.length !== standardColumnCount);
        if (inconsistentRows.length > 0) {
          console.warn(`发现 ${inconsistentRows.length} 行数据列数不一致，已自动过滤`);
          // 只保留列数一致的行
          const filteredRows = rows.filter(row => row.length === standardColumnCount);
          if (filteredRows.length === 0) {
            setError('没有找到格式一致的数据行');
            return;
          }
          rows.splice(0, rows.length, ...filteredRows);
        }
      }

      const columnCount = standardColumnCount;
      
      // 生成默认列名
      const defaultColumnNames = Array.from({ length: columnCount }, (_, i) => `column_${i + 1}`);
      setColumnNames(defaultColumnNames);
      
      // 自动检测数据类型或统一为文本类型
      let detectedTypes;
      if (unifyAsString) {
        detectedTypes = Array.from({ length: columnCount }, () => 'VARCHAR');
      } else {
        detectedTypes = Array.from({ length: columnCount }, (_, colIndex) => {
          const columnValues = rows.map(row => row[colIndex]);
          return detectDataType(columnValues);
        });
      }
      setColumnTypes(detectedTypes);

      // 生成更友好的默认表名
      const timestamp = new Date().toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '_');
      setTableName(`粘贴数据_${timestamp}`);
      
      setParsedData({
        rows,
        columnCount,
        rowCount: rows.length
      });
      
      showSuccess(`成功解析 ${rows.length} 行 ${columnCount} 列数据`);

    } catch (err) {
      showError(`数据解析失败: ${err.message}`);
    }
  };

  // 保存数据到DuckDB
  const saveToDatabase = async () => {
    if (!parsedData || !tableName.trim()) {
      showError('请先解析数据并设置表名');
      return;
    }

    if (columnNames.some(name => !name.trim())) {
      showError('所有列名都必须填写');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/paste-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          table_name: tableName.trim(),
          column_names: columnNames,
          column_types: columnTypes,
          data_rows: parsedData.rows,
          delimiter: delimiter,
          has_header: hasHeader
        }),
      });

      const result = await response.json();

      console.log('保存结果:', result);

      if (result.success) {
        console.log('调用showSuccess:', `数据已成功保存到表: ${tableName}`);
        showSuccess(`数据已成功保存到表: ${tableName}`);
        if (onDataSaved) {
          onDataSaved({
            id: tableName,
            name: tableName,
            type: 'DUCKDB',
            columns: columnNames.length,
            rows: parsedData.rowCount
          });
        }
        // 清空表单
        clearForm();
      } else {
        console.log('调用showError:', result.error || '数据保存失败');
        showError(result.error || '数据保存失败');
      }
    } catch (err) {
      showError(`数据保存失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 清空表单
  const clearForm = () => {
    setPastedData('');
    setParsedData(null);
    setTableName('');
    setColumnNames([]);
    setColumnTypes([]);
    setError('');
    setSuccess('');
  };

  // 更新列名
  const updateColumnName = (index, value) => {
    const newNames = [...columnNames];
    newNames[index] = value;
    setColumnNames(newNames);
  };

  // 更新列类型
  const updateColumnType = (index, value) => {
    const newTypes = [...columnTypes];
    newTypes[index] = value;
    setColumnTypes(newTypes);
  };

  // 处理统一为文本类型的切换
  const handleUnifyAsStringChange = (event) => {
    const checked = event.target.checked;
    setUnifyAsString(checked);

    if (checked && columnTypes.length > 0) {
      // 将所有列类型设置为VARCHAR
      const newTypes = Array.from({ length: columnTypes.length }, () => 'VARCHAR');
      setColumnTypes(newTypes);
    } else if (!checked && parsedData) {
      // 重新自动检测数据类型
      const detectedTypes = Array.from({ length: columnTypes.length }, (_, colIndex) => {
        const columnValues = parsedData.rows.map(row => row[colIndex]);
        return detectDataType(columnValues);
      });
      setColumnTypes(detectedTypes);
    }
  };

  return (
    <Box>
      {/* 移除重复的标题，因为外层已经有了 */}

      {/* 数据输入区域 - 现代化设计 */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          multiline
          rows={6}
          placeholder="✨ 在此粘贴您的数据...&#10;&#10;💡 支持格式：&#10;• CSV: 23,ali70744,健康学习圈连续包月,39.00&#10;• TSV: 23	ali70744	健康学习圈连续包月	39.00&#10;• 带引号: &quot;23&quot;,&quot;ali70744&quot;,&quot;健康学习圈连续包月&quot;,&quot;39.00&quot;&#10;&#10;🚀 系统将自动识别分隔符和数据类型"
          value={pastedData}
          onChange={(e) => setPastedData(e.target.value)}
          sx={{
            mb: 2,
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              backgroundColor: '#f8fafc',
              border: '2px dashed #cbd5e0',
              transition: 'all 0.3s ease',
              '&:hover': {
                borderColor: '#667eea',
                backgroundColor: '#f1f5f9'
              },
              '&.Mui-focused': {
                borderColor: '#667eea',
                backgroundColor: 'white',
                borderStyle: 'solid',
                boxShadow: '0 0 0 3px rgba(102, 126, 234, 0.1)'
              }
            },
            '& .MuiInputBase-input': {
              fontSize: '0.9rem',
              lineHeight: 1.6,
              fontFamily: 'Monaco, Consolas, "Courier New", monospace'
            }
          }}
        />

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button
            variant="contained"
            startIcon={<AutoDetectIcon />}
            onClick={parseData}
            disabled={!pastedData.trim()}
            sx={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: 2,
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: 'none',
              boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                boxShadow: '0 6px 20px rgba(102, 126, 234, 0.4)',
                transform: 'translateY(-1px)'
              },
              '&:disabled': {
                background: '#e2e8f0',
                color: '#a0aec0',
                boxShadow: 'none'
              }
            }}
          >
            🔍 智能解析
          </Button>

          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={clearForm}
            sx={{
              borderRadius: 2,
              borderColor: '#e2e8f0',
              color: '#718096',
              textTransform: 'none',
              '&:hover': {
                borderColor: '#cbd5e0',
                backgroundColor: '#f7fafc'
              }
            }}
          >
            清空
          </Button>

          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel sx={{ color: '#718096' }}>分隔符</InputLabel>
            <Select
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              label="分隔符"
              sx={{
                borderRadius: 2,
                '& .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#e2e8f0'
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: '#cbd5e0'
                }
              }}
            >
              <MenuItem value=",">逗号 (,)</MenuItem>
              <MenuItem value="\t">制表符 (Tab)</MenuItem>
              <MenuItem value="|">竖线 (|)</MenuItem>
              <MenuItem value=";">分号 (;)</MenuItem>
              <MenuItem value=" ">空格</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {/* 错误和成功提示 */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* 数据预览和配置 - 美化设计 */}
      {parsedData && (
        <Box
          sx={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
            borderRadius: 3,
            p: 3,
            mb: 3,
            border: '1px solid #e2e8f0'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Box
              sx={{
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                borderRadius: '50%',
                p: 1,
                mr: 2,
                color: 'white'
              }}
            >
              <PreviewIcon />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#2d3748' }}>
              数据预览和配置
            </Typography>
          </Box>

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="表名"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="例如：产品价格表、用户数据、订单信息等"
                required
                helperText="建议使用有意义的中文名称，便于后续查询和管理"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: 'white',
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#667eea'
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: '#667eea'
                    }
                  }
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                <Chip
                  label={`${parsedData.rowCount} 行`}
                  sx={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    fontWeight: 600,
                    '& .MuiChip-label': { px: 2 }
                  }}
                />
                <Chip
                  label={`${parsedData.columnCount} 列`}
                  sx={{
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    color: 'white',
                    fontWeight: 600,
                    '& .MuiChip-label': { px: 2 }
                  }}
                />
              </Box>
            </Grid>
          </Grid>

          {/* 数据类型选项 */}
          <Box sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={unifyAsString}
                  onChange={handleUnifyAsStringChange}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    统一为文本类型 (推荐用于关联查询)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    将所有列设置为文本类型，避免数据类型不匹配导致的关联查询问题
                  </Typography>
                </Box>
              }
            />
          </Box>

          {/* 列配置 */}
          <Typography variant="subtitle1" gutterBottom>
            列配置
          </Typography>
          
          <Grid container spacing={1} sx={{ mb: 2 }}>
            {columnNames.map((name, index) => (
              <Grid item xs={12} md={6} key={index}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    size="small"
                    label={`列 ${index + 1} 名称`}
                    value={name}
                    onChange={(e) => updateColumnName(index, e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <InputLabel>类型</InputLabel>
                    <Select
                      value={columnTypes[index] || 'VARCHAR'}
                      onChange={(e) => updateColumnType(index, e.target.value)}
                      label="类型"
                      disabled={unifyAsString}
                    >
                      {dataTypes.map(type => (
                        <MenuItem key={type.value} value={type.value}>
                          {type.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* 数据预览表格 */}
          <Typography variant="subtitle1" gutterBottom>
            数据预览 (前5行)
          </Typography>
          
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 2, maxHeight: 300 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {columnNames.map((name, index) => (
                    <TableCell key={index} sx={{ fontWeight: 'bold' }}>
                      {name || `列${index + 1}`}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {parsedData.rows.slice(0, 5).map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell key={cellIndex}>
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* 保存按钮 - 美化设计 */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={saveToDatabase}
              disabled={loading || !tableName.trim()}
              size="large"
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: 3,
                px: 4,
                py: 1.5,
                fontSize: '1.1rem',
                fontWeight: 600,
                textTransform: 'none',
                boxShadow: '0 8px 25px rgba(102, 126, 234, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%)',
                  boxShadow: '0 12px 35px rgba(102, 126, 234, 0.4)',
                  transform: 'translateY(-2px)'
                },
                '&:disabled': {
                  background: '#e2e8f0',
                  color: '#a0aec0',
                  boxShadow: 'none'
                }
              }}
            >
              {loading ? '🔄 保存中...' : '💾 保存到数据库'}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default DataPasteBoard;
