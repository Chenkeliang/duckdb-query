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
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Filter } from 'lucide-react';

const VirtualTable = ({
  data = [],
  columns = [],
  height = 400,
  rowHeight = 52,
  onRowClick,
  loading = false,
  autoRowHeight = true, // 新增自适应行高选项
  columnValueFilters = {},
  onOpenColumnFilterMenu,
  onCopyColumnName = null
}) => {
  const theme = useTheme();
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [sortState, setSortState] = useState({ field: null, direction: null });

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

  const headerActionBaseSx = {
    color: 'var(--dq-text-secondary)',
    border: '1px solid var(--dq-border-card)',
    backgroundColor: 'var(--dq-surface)',
    borderRadius: '10px',
    padding: '4px',
    transition: 'all 0.18s ease',
    '&:hover': {
      color: 'var(--dq-accent-100)',
      borderColor: 'var(--dq-border-hover)',
      backgroundColor: 'var(--dq-surface-hover)'
    }
  };

  const headerActionActiveSx = {
    color: 'var(--dq-accent-100)',
    borderColor: 'color-mix(in oklab, var(--dq-accent-primary) 48%, transparent)',
    backgroundColor: 'var(--dq-accent-soft-bg)',
    '&:hover': {
      color: 'var(--dq-accent-100)',
      borderColor: 'color-mix(in oklab, var(--dq-accent-primary) 65%, transparent)',
      backgroundColor: 'color-mix(in oklab, var(--dq-accent-primary) 26%, transparent)'
    }
  };

  const handleSortToggle = useCallback((field) => {
    setSortState((prev) => {
      if (prev.field !== field) {
        return { field, direction: 'asc' };
      }

      if (prev.direction === 'asc') {
        return { field, direction: 'desc' };
      }

      return { field: null, direction: null };
    });
  }, []);

  const resolveSortIcon = useCallback((field) => {
    if (sortState.field !== field) {
      return <ArrowUpDown size={16} />;
    }

    if (sortState.direction === 'asc') {
      return <ArrowUp size={16} />;
    }

    if (sortState.direction === 'desc') {
      return <ArrowDown size={16} />;
    }

    return <ArrowUpDown size={16} />;
  }, [sortState]);

  const getSortTooltip = useCallback((field) => {
    if (sortState.field !== field || !sortState.direction) {
      return '排序 (点击切换升序)';
    }
    if (sortState.direction === 'asc') {
      return '升序 (点击切换降序)';
    }
    return '降序 (点击恢复默认)';
  }, [sortState]);

  const handleCopyColumnLabel = (label) => {
    const resolved = label || '';
    if (!resolved) return;
    if (onCopyColumnName) {
      onCopyColumnName(resolved);
      return;
    }
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(resolved).catch(() => {});
    }
  };

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

  const sortedData = useMemo(() => {
    if (!sortState.field || !sortState.direction) {
      return data;
    }

    const directionFactor = sortState.direction === 'asc' ? 1 : -1;
    const field = sortState.field;
    const sorted = [...data];

    sorted.sort((a, b) => {
      const aValue = a?.[field];
      const bValue = b?.[field];
      const aNullish = aValue === null || aValue === undefined;
      const bNullish = bValue === null || bValue === undefined;

      if (aNullish && bNullish) return 0;
      if (aNullish) return 1 * directionFactor;
      if (bNullish) return -1 * directionFactor;

      const aNumber = Number(aValue);
      const bNumber = Number(bValue);
      const bothNumbers = !Number.isNaN(aNumber) && !Number.isNaN(bNumber);
      if (bothNumbers) {
        if (aNumber === bNumber) return 0;
        return aNumber > bNumber ? directionFactor : -directionFactor;
      }

      const comparison = String(aValue).localeCompare(String(bValue), undefined, {
        numeric: true,
        sensitivity: 'base'
      });
      return comparison * directionFactor;
    });

    return sorted;
  }, [data, sortState]);

  const displayedData = sortedData;

  // 计算动态行高
  const dynamicRowHeight = useMemo(() => {
    if (!autoRowHeight || !displayedData.length) return rowHeight;

    // 计算每行内容的最大高度
    const maxContentHeight = Math.max(
      ...displayedData.slice(0, 50).map(row => { // 只检查前50行以提高性能
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
  }, [displayedData, columns, rowHeight, autoRowHeight]);

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
          borderRadius: '4px',
          padding: '2px 4px',
          '&:hover': {
            backgroundColor: 'var(--dq-surface-hover)'
          }
        }}
      >
        {stringValue}
      </Box>
    );
  }, []);

  // 渲染行组件
  const Row = useCallback(({ index, style }) => {
    const row = displayedData[index];
    if (!row) return null;

    return (
      <div style={style}>
        <TableRow
          hover
          onClick={() => onRowClick?.(row, index)}
          sx={{
            cursor: onRowClick ? 'pointer' : 'default',
            '&:hover': {
              backgroundColor: 'var(--dq-surface-hover)'
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
                borderBottom: '1px solid var(--dq-border-subtle)',
                flex: '0 0 auto',
                padding: '8px 12px',
                verticalAlign: 'top',
                // 改进内容显示
                '&:hover': {
                  backgroundColor: 'var(--dq-surface-hover)',
                }
              }}
            >
              {formatCellValue(row[column.field], column.type || 'string')}
            </TableCell>
          ))}
        </TableRow>
      </div>
    );
  }, [displayedData, columns, finalColumnWidths, onRowClick, totalWidth, formatCellValue]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography>加载中...</Typography>
      </Box>
    );
  }

  if (!displayedData.length) {
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
          background: 'var(--dq-border-subtle)',
          borderRadius: '6px',
          '&:hover': {
            background: 'var(--dq-border-hover)',
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
                  backgroundColor: columnValueFilters?.[column.field] ? 'var(--dq-surface-card-active)' : 'var(--dq-surface)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  flex: '0 0 auto',
                  padding: '12px 12px',
                  verticalAlign: 'top',
                  borderBottom: '2px solid var(--dq-border-subtle)',
                  color: 'var(--dq-text-primary)'
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
                        whiteSpace: 'nowrap',
                        userSelect: 'text',
                        cursor: 'text'
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
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Tooltip title={getSortTooltip(column.field)}>
                      <IconButton
                        size="small"
                        aria-label={`排序 ${column.headerName || column.field}`}
                        sx={{
                          ...headerActionBaseSx,
                          ...(sortState.field === column.field && sortState.direction
                            ? headerActionActiveSx
                            : {})
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSortToggle(column.field);
                        }}
                      >
                        {resolveSortIcon(column.field)}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="复制列名">
                      <IconButton
                        size="small"
                        aria-label={`复制列名 ${column.headerName || column.field}`}
                        sx={headerActionBaseSx}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCopyColumnLabel(column.headerName || column.field);
                        }}
                      >
                        <Copy size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="列筛选">
                      <IconButton
                        size="small"
                        aria-label={`列筛选 ${column.headerName || column.field}`}
                        sx={{
                          ...headerActionBaseSx,
                          ...(columnValueFilters?.[column.field] ? headerActionActiveSx : {})
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenColumnFilterMenu?.(column.field, event.currentTarget);
                        }}
                      >
                        <Filter size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
      </Table>

      <Box sx={{ width: totalWidth }}>
        <List
          height={height - 56} // 减去表头高度
          itemCount={displayedData.length}
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
