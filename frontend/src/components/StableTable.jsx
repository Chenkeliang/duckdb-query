import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Paper,
  Chip,
  Box,
  Typography,
  Pagination,
  useTheme
} from '@mui/material';

const StableTable = ({ 
  data = [], 
  columns = [], 
  pageSize = 20,
  height = 600 
}) => {
  const theme = useTheme();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  // 排序逻辑
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  // 分页逻辑
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedData.slice(startIndex, startIndex + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedData.length / pageSize);

  // 处理排序
  const handleSort = (columnKey) => {
    setSortConfig(prev => ({
      key: columnKey,
      direction: prev.key === columnKey && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // 渲染关联结果列
  const renderJoinResultCell = (value) => {
    const getChipProps = (val) => {
      switch (val) {
        case 'both':
        case '匹配':
          return { label: '匹配', color: 'success' };
        case 'left':
        case '仅左表':
          return { label: '仅左表', color: 'warning' };
        case 'right':
        case '仅右表':
          return { label: '仅右表', color: 'info' };
        default:
          return { label: '无匹配', color: 'default' };
      }
    };

    const chipProps = getChipProps(value);
    return (
      <Chip
        {...chipProps}
        size="small"
        sx={{
          fontSize: '0.75rem',
          height: '24px',
          fontWeight: 500,
        }}
      />
    );
  };

  // 渲染单元格内容
  const renderCellContent = (value, column) => {
    if (column.field === 'join_result' || column.headerName === '关联结果') {
      return renderJoinResultCell(value);
    }
    
    if (value === null || value === undefined) {
      return <span style={{ color: '#999', fontStyle: 'italic' }}>NULL</span>;
    }
    
    return String(value);
  };

  return (
    <Box>
      {/* 滚动提示 */}
      <Box sx={{ 
        mb: 2, 
        p: 1.5, 
        backgroundColor: '#e3f2fd', 
        borderRadius: 1,
        fontSize: '0.875rem',
        color: '#1976d2',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: '1px solid #bbdefb'
      }}>
        <span>💡</span>
        <span>提示：使用表格底部和右侧的滚动条来浏览更多列和行，稳定的原生表格组件</span>
      </Box>

      {/* 表格容器 */}
      <TableContainer 
        component={Paper} 
        sx={{ 
          height: height,
          border: '2px solid #e0e0e0',
          borderRadius: 2,
          // 强制显示滚动条
          overflow: 'auto',
          overflowX: 'scroll',
          overflowY: 'auto',
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
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.field}
                  sx={{
                    backgroundColor: theme.palette.grey[50],
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    borderBottom: `2px solid ${theme.palette.divider}`,
                    minWidth: column.minWidth || 120,
                    cursor: 'pointer',
                    userSelect: 'none',
                    '&:hover': {
                      backgroundColor: theme.palette.grey[100],
                    }
                  }}
                  onClick={() => handleSort(column.field)}
                >
                  <TableSortLabel
                    active={sortConfig.key === column.field}
                    direction={sortConfig.key === column.field ? sortConfig.direction : 'asc'}
                  >
                    {column.headerName || column.field}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, index) => (
              <TableRow
                key={index}
                sx={{
                  '&:nth-of-type(odd)': {
                    backgroundColor: theme.palette.action.hover,
                  },
                  '&:hover': {
                    backgroundColor: theme.palette.action.selected,
                  },
                }}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.field}
                    sx={{
                      fontSize: '0.875rem',
                      padding: '8px 16px',
                      borderBottom: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {renderCellContent(row[column.field], column)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 分页控件 */}
      {totalPages > 1 && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mt: 2,
          p: 1
        }}>
          <Typography variant="body2" color="text.secondary">
            显示第 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedData.length)} 条，
            共 {sortedData.length} 条记录
          </Typography>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={(event, page) => setCurrentPage(page)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
    </Box>
  );
};

export default StableTable;
