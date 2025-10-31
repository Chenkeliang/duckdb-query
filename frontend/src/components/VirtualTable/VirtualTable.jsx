import {
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  useTheme
} from '@mui/material';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Filter } from 'lucide-react';

const VirtualTable = ({
  data = [],
  columns = [],
  height = 400,
  rowHeight = 52,
  onRowClick,
  loading = false,
  autoRowHeight = true, // 新增自适应行高选项
  columnValueFilters = {},
  onOpenColumnFilterMenu
}) => {
  const theme = useTheme();
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1200);

  // 检测容器宽度
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        setContainerWidth(width);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // 计算列宽 - 简化但更有效的自适应算法
  const columnWidths = useMemo(() => {
    if (!columns.length) return [];

    return columns.map((col, index) => {
      const headerText = col.headerName || col.field || '';
      const headerWidth = Math.max(headerText.length * 12 + 60, 100); // 表头宽度

      // 计算内容最大宽度
      let maxContentWidth = 120;

      if (data.length > 0) {
        // 找到该列中最长的内容和对应的宽度
        let maxContentLength = 0;
        let maxCalculatedWidth = 0;

        data.forEach(row => {
          const content = String(row[col.field] || '');
          if (content.length > 0) {
            // 计算中文和英文字符数量
            const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
            const englishChars = content.length - chineseChars;

            // 计算该内容的显示宽度
            const calculatedWidth = chineseChars * 20 + englishChars * 12 + 40;

            if (calculatedWidth > maxCalculatedWidth) {
              maxCalculatedWidth = calculatedWidth;
              maxContentLength = content.length;
            }
          }
        });

        maxContentWidth = Math.max(maxCalculatedWidth, 150); // 设置最小宽度
      }

      // 最终列宽：取表头宽度和内容宽度的最大值
      const finalWidth = Math.max(headerWidth, maxContentWidth, 100);


      return finalWidth;
    });
  }, [columns, data]);

  // 计算容器宽度和列宽分配
  const calculateTableWidth = useCallback(() => {
    const calculatedTotalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    // 如果计算出的总宽度小于容器宽度，则按比例扩展列宽以铺满容器
    if (calculatedTotalWidth < containerWidth) {
      const ratio = containerWidth / calculatedTotalWidth;
      const expandedWidths = columnWidths.map(width => Math.floor(width * ratio));


      return {
        columnWidths: expandedWidths,
        totalWidth: containerWidth
      };
    }

    return {
      columnWidths: columnWidths,
      totalWidth: calculatedTotalWidth
    };
  }, [columnWidths, containerWidth]);

  // 使用铺满容器的宽度设置
  const { columnWidths: finalColumnWidths, totalWidth } = calculateTableWidth();

  // 计算动态行高
  const dynamicRowHeight = useMemo(() => {
    if (!autoRowHeight || !data.length) return rowHeight;

    // 计算每行内容的最大高度
    const maxContentHeight = Math.max(
      ...data.slice(0, 50).map(row => { // 只检查前50行以提高性能
        const maxCellHeight = Math.max(
          ...columns.map(col => {
            const content = String(row[col.field] || '');
            // 估算内容高度：每行约20px，考虑换行
            const lines = Math.ceil(content.length / 50); // 假设每行50个字符
            return Math.max(lines * 20, 20);
          })
        );
        return maxCellHeight + 16; // 加上padding
      })
    );

    return Math.max(maxContentHeight, rowHeight);
  }, [data, columns, rowHeight, autoRowHeight]);

  // 格式化单元格值 - 改进显示逻辑
  const formatCellValue = useCallback((value, type) => {
    if (value === null || value === undefined) {
      return <Chip label="NULL" size="small" variant="outlined" color="default" />;
    }

    if (type === 'number' && typeof value === 'number') {
      return value.toLocaleString();
    }

    if (type === 'date' && value) {
      return new Date(value).toLocaleDateString();
    }

    const stringValue = String(value);

    // 不再进行固定长度截断，让CSS的text-overflow: ellipsis处理
    // 这样可以根据实际列宽动态截断
    return (
      <Box
        component="span"
        title={stringValue}
        sx={{
          display: 'block',
          width: '100%',
          cursor: 'help',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)',
            borderRadius: '4px',
            padding: '2px 4px'
          }
        }}
      >
        {stringValue}
      </Box>
    );
  }, []);

  // 渲染行组件
  const Row = useCallback(({ index, style }) => {
    const row = data[index];
    if (!row) return null;

    return (
      <div style={style}>
        <TableRow
          hover
          onClick={() => onRowClick?.(row, index)}
          sx={{
            cursor: onRowClick ? 'pointer' : 'default',
            '&:hover': {
              backgroundColor: 'rgba(0, 0, 0, 0.04)'
            },
            display: 'flex',
            width: totalWidth
          }}
        >
          {columns.map((column, colIndex) => (
            <TableCell
              key={column.field}
              sx={{
                width: finalColumnWidths[colIndex],
                minWidth: finalColumnWidths[colIndex],
                maxWidth: finalColumnWidths[colIndex],
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                borderBottom: '1px solid rgba(224, 224, 224, 1)',
                flex: '0 0 auto',
                padding: '8px 12px',
                verticalAlign: 'top',
                // 改进内容显示
                '&:hover': {
                  backgroundColor: 'rgba(0, 0, 0, 0.02)',
                }
              }}
            >
              {formatCellValue(row[column.field], column.type || 'string')}
            </TableCell>
          ))}
        </TableRow>
      </div>
    );
  }, [data, columns, finalColumnWidths, onRowClick, totalWidth, formatCellValue]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography>加载中...</Typography>
      </Box>
    );
  }

  if (!data.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography color="text.secondary">暂无数据</Typography>
      </Box>
    );
  }

  return (
    <TableContainer
      ref={containerRef}
      component={Paper}
      sx={{
        height,
        width: '100%',
        overflow: 'auto',
        overflowX: 'auto',
        overflowY: 'hidden',
        // 防止触控板手势导致的页面导航
        overscrollBehavior: 'contain',
        touchAction: 'pan-x pan-y',
        // 自定义滚动条样式
        '&::-webkit-scrollbar': {
          width: '12px',
          height: '12px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'var(--dq-surface-alt)',
          borderRadius: '6px',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#888',
          borderRadius: '6px',
          '&:hover': {
            background: '#555',
          },
        },
      }}
    >
      <Table stickyHeader sx={{ minWidth: totalWidth }}>
        <TableHead>
          <TableRow sx={{ display: 'flex', width: totalWidth }}>
            {columns.map((column, index) => (
              <TableCell
                key={column.field}
                sx={{
                  width: finalColumnWidths[index],
                  minWidth: finalColumnWidths[index],
                  maxWidth: finalColumnWidths[index],
                  fontWeight: 'bold',
                  backgroundColor: columnValueFilters?.[column.field] ? 'var(--dq-surface-card-active)' : 'rgba(0, 0, 0, 0.04)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  flex: '0 0 auto',
                  padding: '12px 12px',
                  verticalAlign: 'top',
                  borderBottom: '2px solid rgba(0, 0, 0, 0.12)'
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {column.headerName || column.field}
                    </Typography>
                    {column.type && (
                      <Chip
                        label={column.type}
                        size="small"
                        variant="outlined"
                        color="primary"
                      />
                    )}
                  </Box>
                  <Tooltip title="列筛选">
                    <IconButton
                      size="small"
                      color={columnValueFilters?.[column.field] ? 'primary' : 'default'}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenColumnFilterMenu?.(column.field, event.currentTarget);
                      }}
                    >
                      <Filter size={16} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
      </Table>

      <Box sx={{ width: totalWidth }}>
        <List
          height={height - 56} // 减去表头高度
          itemCount={data.length}
          itemSize={dynamicRowHeight}
          width={totalWidth}
        >
          {Row}
        </List>
      </Box>
    </TableContainer>
  );
};

export default VirtualTable;
