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
import {
  ContentPaste as PasteIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
  Clear as ClearIcon,
  AutoFixHigh as AutoDetectIcon
} from '@mui/icons-material';

const DataPasteBoard = ({ onDataSaved }) => {
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
  const [success, setSuccess] = useState('');

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
      const rows = lines.map(line => 
        line.split(detectedDelimiter).map(cell => cell.trim())
      );
      
      if (rows.length === 0) {
        setError('没有检测到有效数据');
        return;
      }
      
      // 检查列数一致性
      const columnCount = rows[0].length;
      const inconsistentRows = rows.filter(row => row.length !== columnCount);
      
      if (inconsistentRows.length > 0) {
        setError(`检测到 ${inconsistentRows.length} 行数据列数不一致，请检查数据格式`);
        return;
      }
      
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
      
      setSuccess(`成功解析 ${rows.length} 行 ${columnCount} 列数据`);
      
    } catch (err) {
      setError(`数据解析失败: ${err.message}`);
    }
  };

  // 保存数据到DuckDB
  const saveToDatabase = async () => {
    if (!parsedData || !tableName.trim()) {
      setError('请先解析数据并设置表名');
      return;
    }

    if (columnNames.some(name => !name.trim())) {
      setError('所有列名都必须填写');
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
      
      if (result.success) {
        setSuccess(`数据已成功保存到表: ${tableName}`);
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
        setError(result.error || '保存失败');
      }
    } catch (err) {
      setError(`保存失败: ${err.message}`);
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
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PasteIcon />
        数据粘贴板
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        从DataGrip、Excel或其他工具复制数据，粘贴到下方文本框中，系统将自动识别格式并保存为DuckDB表
      </Typography>

      {/* 数据输入区域 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          multiline
          rows={8}
          placeholder="在此粘贴您的数据...&#10;&#10;示例：&#10;23,ali70744,健康学习圈连续包月,39.00&#10;22,ali70743,健康学习圈连续包年,399.00&#10;21,ali70742,职场学习圈连续包月,39.00"
          value={pastedData}
          onChange={(e) => setPastedData(e.target.value)}
          sx={{ mb: 2 }}
        />
        
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={<AutoDetectIcon />}
            onClick={parseData}
            disabled={!pastedData.trim()}
          >
            自动解析
          </Button>
          
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={clearForm}
          >
            清空
          </Button>
          
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>分隔符</InputLabel>
            <Select
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              label="分隔符"
            >
              <MenuItem value=",">逗号 (,)</MenuItem>
              <MenuItem value="\t">制表符 (Tab)</MenuItem>
              <MenuItem value="|">竖线 (|)</MenuItem>
              <MenuItem value=";">分号 (;)</MenuItem>
              <MenuItem value=" ">空格</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Paper>

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

      {/* 数据预览和配置 */}
      {parsedData && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PreviewIcon />
            数据预览和配置
          </Typography>
          
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={8}>
              <TextField
                fullWidth
                label="表名"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="例如：产品价格表、用户数据、订单信息等"
                required
                helperText="建议使用有意义的中文名称，便于后续查询和管理"
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, height: '100%' }}>
                <Chip
                  label={`${parsedData.rowCount} 行`}
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={`${parsedData.columnCount} 列`}
                  color="secondary"
                  variant="outlined"
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

          {/* 保存按钮 */}
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={saveToDatabase}
            disabled={loading || !tableName.trim()}
            size="large"
          >
            {loading ? '保存中...' : '保存到数据库'}
          </Button>
        </Paper>
      )}
    </Box>
  );
};

export default DataPasteBoard;
