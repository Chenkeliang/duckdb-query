import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Grid,
  Chip
} from '@mui/material';
import {
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  ShowChart as LineChartIcon,
  TableChart as TableIcon
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ResponsiveContainer
} from 'recharts';

const QuickCharts = ({ data = [], columns = [] }) => {
  const [chartType, setChartType] = useState('bar');
  const [xAxis, setXAxis] = useState('');
  const [yAxis, setYAxis] = useState('');

  // 分析数据类型
  const columnAnalysis = useMemo(() => {
    if (!data.length || !columns.length) return { numeric: [], categorical: [], datetime: [] };

    const analysis = { numeric: [], categorical: [], datetime: [] };
    
    columns.forEach(col => {
      const sampleValues = data.slice(0, 100).map(row => row[col.field]).filter(v => v != null);
      
      if (sampleValues.length === 0) return;

      // 检查是否为数字类型
      const numericValues = sampleValues.filter(v => !isNaN(Number(v)) && Number(v) !== 0);
      const numericRatio = numericValues.length / sampleValues.length;

      // 检查是否为日期类型
      const dateValues = sampleValues.filter(v => !isNaN(Date.parse(v)));
      const dateRatio = dateValues.length / sampleValues.length;

      if (numericRatio > 0.8) {
        analysis.numeric.push(col);
      } else if (dateRatio > 0.8) {
        analysis.datetime.push(col);
      } else {
        analysis.categorical.push(col);
      }
    });

    return analysis;
  }, [data, columns]);

  // 准备图表数据
  const chartData = useMemo(() => {
    if (!data.length || !xAxis || !yAxis) return [];

    // 根据图表类型处理数据
    if (chartType === 'pie') {
      // 饼图：统计分类数据
      const counts = {};
      data.forEach(row => {
        const key = row[xAxis];
        counts[key] = (counts[key] || 0) + (Number(row[yAxis]) || 1);
      });

      return Object.entries(counts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10); // 只显示前10项
    } else {
      // 柱状图/折线图：聚合数据
      const aggregated = {};
      data.forEach(row => {
        const key = row[xAxis];
        if (!aggregated[key]) {
          aggregated[key] = { name: key, value: 0, count: 0 };
        }
        aggregated[key].value += Number(row[yAxis]) || 0;
        aggregated[key].count += 1;
      });

      return Object.values(aggregated)
        .map(item => ({
          name: item.name,
          value: item.value,
          average: item.value / item.count
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 20); // 只显示前20项
    }
  }, [data, xAxis, yAxis, chartType]);

  // 颜色配置
  const colors = [
    'var(--dq-chart-1)', 'var(--dq-chart-2)', 'var(--dq-chart-3)', 'var(--dq-chart-4)', 'var(--dq-chart-2)',
    'var(--dq-chart-1)', 'var(--dq-chart-7)', 'var(--dq-chart-6)', 'var(--dq-chart-7)', 'var(--dq-chart-3)'
  ];

  // 渲染图表
  const renderChart = () => {
    if (!chartData.length) {
      return (
        <Alert severity="info">
          请选择X轴和Y轴字段来生成图表
        </Alert>
      );
    }

    const commonProps = {
      width: '100%',
      height: 300,
      data: chartData
    };

    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer {...commonProps}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
              />
              <YAxis />
              <Tooltip formatter={(value) => [value.toLocaleString(), 'Value']} />
              <Legend />
              <Bar dataKey="value" fill="var(--dq-chart-1)" />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        return (
          <ResponsiveContainer {...commonProps}>
            <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis />
              <Tooltip formatter={(value) => [value.toLocaleString(), 'Value']} />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="var(--dq-chart-1)" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer {...commonProps}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="var(--dq-chart-1)"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [value.toLocaleString(), 'Value']} />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  // 获取推荐的字段组合
  const getRecommendations = () => {
    const recommendations = [];
    
    if (columnAnalysis.categorical.length > 0 && columnAnalysis.numeric.length > 0) {
      recommendations.push({
        x: columnAnalysis.categorical[0].field,
        y: columnAnalysis.numeric[0].field,
        type: 'bar',
        reason: '分类 vs 数值 - 适合柱状图'
      });
    }

    if (columnAnalysis.datetime.length > 0 && columnAnalysis.numeric.length > 0) {
      recommendations.push({
        x: columnAnalysis.datetime[0].field,
        y: columnAnalysis.numeric[0].field,
        type: 'line',
        reason: '时间 vs 数值 - 适合折线图'
      });
    }

    return recommendations;
  };

  const recommendations = getRecommendations();

  if (!data.length || !columns.length) {
    return (
      <Alert severity="info">
        暂无数据可用于可视化
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TableIcon color="primary" />
          数据可视化
          <Chip label={`${data.length.toLocaleString()} 条数据`} size="small" color="primary" variant="outlined" />
        </Typography>

        {/* 推荐配置 */}
        {recommendations.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              推荐配置：
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {recommendations.map((rec, index) => (
                <Chip
                  key={index}
                  label={rec.reason}
                  size="small"
                  clickable
                  onClick={() => {
                    setXAxis(rec.x);
                    setYAxis(rec.y);
                    setChartType(rec.type);
                  }}
                  color="secondary"
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}

        {/* 控制面板 */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <ToggleButtonGroup
              value={chartType}
              exclusive
              onChange={(e, value) => value && setChartType(value)}
              size="small"
              fullWidth
            >
              <ToggleButton value="bar">
                <BarChartIcon sx={{ mr: 1 }} />
                柱状图
              </ToggleButton>
              <ToggleButton value="line">
                <LineChartIcon sx={{ mr: 1 }} />
                折线图
              </ToggleButton>
              <ToggleButton value="pie">
                <PieChartIcon sx={{ mr: 1 }} />
                饼图
              </ToggleButton>
            </ToggleButtonGroup>
          </Grid>

          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>X轴字段</InputLabel>
              <Select
                value={xAxis}
                label="X轴字段"
                onChange={(e) => setXAxis(e.target.value)}
              >
                {columns.map(col => (
                  <MenuItem key={col.field} value={col.field}>
                    {col.label || col.field}
                    <Chip 
                      label={
                        columnAnalysis.numeric.includes(col) ? '数值' :
                        columnAnalysis.datetime.includes(col) ? '日期' : '分类'
                      }
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Y轴字段</InputLabel>
              <Select
                value={yAxis}
                label="Y轴字段"
                onChange={(e) => setYAxis(e.target.value)}
              >
                {columns.map(col => (
                  <MenuItem key={col.field} value={col.field}>
                    {col.label || col.field}
                    <Chip 
                      label={
                        columnAnalysis.numeric.includes(col) ? '数值' :
                        columnAnalysis.datetime.includes(col) ? '日期' : '分类'
                      }
                      size="small"
                      sx={{ ml: 1 }}
                    />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* 图表区域 */}
        <Box sx={{ height: 350, border: '1px solid var(--dq-border-subtle)', borderRadius: 1, p: 2 }}>
          {renderChart()}
        </Box>

        {/* 数据统计 */}
        {chartData.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip label={`数据点: ${chartData.length}`} size="small" />
            <Chip 
              label={`最大值: ${Math.max(...chartData.map(d => d.value)).toLocaleString()}`} 
              size="small" 
            />
            <Chip 
              label={`最小值: ${Math.min(...chartData.map(d => d.value)).toLocaleString()}`} 
              size="small" 
            />
            <Chip 
              label={`平均值: ${(chartData.reduce((sum, d) => sum + d.value, 0) / chartData.length).toLocaleString()}`} 
              size="small" 
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickCharts;
