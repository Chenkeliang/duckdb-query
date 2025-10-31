import {
  Box,
  Chip,
  IconButton,
  Pagination,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
  useTheme
} from '@mui/material';
import React, { useMemo, useState } from 'react';
import { Filter } from 'lucide-react';

const StableTable = ({
  data = [],
  columns = [],
  pageSize = 20,
  height = 600,
  originalDatasource = null,
  columnValueFilters = {},
  onOpenColumnFilterMenu
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
          fontSize: '1rem',
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

      {/* 表格容器 */}
      <TableContainer
        component={Paper}
        sx={{
          height: height,
          border: '2px solid var(--dq-border-subtle)',
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
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((column) => {
                const hasActiveFilter = Boolean(columnValueFilters?.[column.field]);
                return (
                  <TableCell
                    key={column.field}
                    sx={{
                      backgroundColor: hasActiveFilter ? 'var(--dq-surface-card-active)' : 'var(--dq-surface-card-active)',
                      fontWeight: 600,
                      fontSize: '1rem',
                      borderBottom: `2px solid ${theme.palette.divider}`,
                      minWidth: column.minWidth || 120,
                      userSelect: 'none',
                      writingMode: 'horizontal-tb',
                      textOrientation: 'mixed',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      height: '40px',
                      lineHeight: '40px',
                      verticalAlign: 'middle',
                      paddingTop: '0px',
                      paddingBottom: '0px',
                      paddingLeft: '8px',
                      paddingRight: '4px',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <TableSortLabel
                        active={sortConfig.key === column.field}
                        direction={sortConfig.key === column.field ? sortConfig.direction : 'asc'}
                        onClick={() => handleSort(column.field)}
                        sx={{
                          '& .MuiTableSortLabel-icon': {
                            fontSize: '1rem',
                          }
                        }}
                      >
                        <span
                          title={column.headerName || column.field}
                          style={{
                            display: 'inline-block',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            verticalAlign: 'middle'
                          }}
                        >
                          {column.headerName || column.field}
                        </span>
                      </TableSortLabel>
                      <Tooltip title="列筛选">
                        <IconButton
                          size="small"
                          color={hasActiveFilter ? 'primary' : 'default'}
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
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, index) => (
              <TableRow
                key={index}
                sx={{
                  '&:nth-of-type(odd)': {
                    backgroundColor: 'var(--dq-surface-card-active)',
                  },
                  '&:hover': {
                    backgroundColor: 'var(--dq-surface-card-active)',
                  },
                }}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.field}
                    sx={{
                      fontSize: '1rem',
                      padding: '8px 16px',
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      // 处理单元格内容过长的问题
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: column.maxWidth || 200,
                      // 添加悬停提示
                      title: row[column.field],
                    }}
                  >
                    <span
                      title={row[column.field]}
                      style={{
                        // 限制显示宽度，超出部分用省略号表示
                        display: 'inline-block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {renderCellContent(row[column.field], column)}
                    </span>
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
