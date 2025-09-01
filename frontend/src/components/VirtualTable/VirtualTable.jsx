import {
  Box,
  Chip,
  Paper,
  Table,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme
} from '@mui/material';
import React, { useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

const VirtualTable = ({
  data = [],
  columns = [],
  height = 400,
  rowHeight = 52,
  onRowClick,
  loading = false
}) => {
  const theme = useTheme();

  // 计算列宽
  const columnWidths = useMemo(() => {
    if (!columns.length) return [];

    return columns.map(col => {
      const headerWidth = (col.headerName || col.field)?.length * 8 + 40;
      const maxContentWidth = data.length > 0 ? Math.max(
        ...data.slice(0, 100).map(row =>
          String(row[col.field] || '').length * 7 + 20
        )
      ) : 120;
      return Math.min(Math.max(headerWidth, maxContentWidth, 120), 300);
    });
  }, [columns, data]);

  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

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
            }
          }}
        >
          {columns.map((column, colIndex) => (
            <TableCell
              key={column.field}
              sx={{
                width: columnWidths[colIndex],
                minWidth: columnWidths[colIndex],
                maxWidth: columnWidths[colIndex],
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                borderBottom: '1px solid rgba(224, 224, 224, 1)'
              }}
            >
              {formatCellValue(row[column.field], column.type || 'string')}
            </TableCell>
          ))}
        </TableRow>
      </div>
    );
  }, [data, columns, columnWidths, onRowClick]);

  // 格式化单元格值
  const formatCellValue = (value, type) => {
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
    if (stringValue.length > 50) {
      return (
        <Box component="span" title={stringValue}>
          {stringValue.substring(0, 47)}...
        </Box>
      );
    }

    return stringValue;
  };

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
      component={Paper}
      sx={{
        height,
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
          background: '#f1f1f1',
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
          <TableRow>
            {columns.map((column, index) => (
              <TableCell
                key={column.field}
                sx={{
                  width: columnWidths[index],
                  minWidth: columnWidths[index],
                  maxWidth: columnWidths[index],
                  fontWeight: 'bold',
                  backgroundColor: 'rgba(0, 0, 0, 0.04)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {column.headerName || column.field}
                  {column.type && (
                    <Chip
                      label={column.type}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  )}
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
          itemSize={rowHeight}
          width={totalWidth}
        >
          {Row}
        </List>
      </Box>
    </TableContainer>
  );
};

export default VirtualTable;
