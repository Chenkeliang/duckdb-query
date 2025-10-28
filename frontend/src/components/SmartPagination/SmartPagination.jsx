import React, { useState, useEffect } from 'react';
import {
  Box,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Chip,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  FirstPage as FirstPageIcon,
  LastPage as LastPageIcon,
  Speed as SpeedIcon
} from '@mui/icons-material';

const SmartPagination = ({
  totalItems = 0,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  loading = false,
  showQuickJump = true,
  showPageSizeSelector = true,
  showStats = true
}) => {
  const [quickJumpPage, setQuickJumpPage] = useState('');
  
  const totalPages = Math.ceil(totalItems / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // 页面大小选项
  const pageSizeOptions = [10, 25, 50, 100, 200, 500];

  // 处理页面变化
  const handlePageChange = (event, page) => {
    if (page !== currentPage && !loading) {
      onPageChange?.(page);
    }
  };

  // 处理页面大小变化
  const handlePageSizeChange = (event) => {
    const newPageSize = event.target.value;
    onPageSizeChange?.(newPageSize);
    // 调整当前页面以保持大致相同的位置
    const newPage = Math.ceil(startItem / newPageSize);
    onPageChange?.(newPage);
  };

  // 快速跳转
  const handleQuickJump = () => {
    const page = parseInt(quickJumpPage);
    if (page >= 1 && page <= totalPages) {
      onPageChange?.(page);
      setQuickJumpPage('');
    }
  };

  // 跳转到第一页
  const handleFirstPage = () => {
    if (currentPage !== 1 && !loading) {
      onPageChange?.(1);
    }
  };

  // 跳转到最后一页
  const handleLastPage = () => {
    if (currentPage !== totalPages && !loading) {
      onPageChange?.(totalPages);
    }
  };

  // 获取性能提示
  const getPerformanceTip = () => {
    if (totalItems > 10000) {
      return {
        color: 'warning',
        message: '大数据量，建议使用筛选条件'
      };
    }
    if (totalItems > 1000) {
      return {
        color: 'info',
        message: '中等数据量，可考虑增加页面大小'
      };
    }
    return {
      color: 'success',
      message: '数据量适中'
    };
  };

  const performanceTip = getPerformanceTip();

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 2,
      p: 2,
      borderTop: '1px solid rgba(224, 224, 224, 1)'
    }}>
      {/* 左侧：统计信息 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {showStats && (
          <>
            <Typography variant="body2" color="text.secondary">
              显示 {startItem.toLocaleString()} - {endItem.toLocaleString()} 条，
              共 {totalItems.toLocaleString()} 条
            </Typography>
            
            <Tooltip title={performanceTip.message}>
              <Chip
                icon={<SpeedIcon />}
                label={`${totalPages} 页`}
                size="small"
                color={performanceTip.color}
                variant="outlined"
              />
            </Tooltip>
          </>
        )}
      </Box>

      {/* 中间：分页控件 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {/* 快速跳转到第一页/最后一页 */}
        <Tooltip title="第一页">
          <span>
            <IconButton
              size="small"
              onClick={handleFirstPage}
              disabled={currentPage === 1 || loading}
            >
              <FirstPageIcon />
            </IconButton>
          </span>
        </Tooltip>

        {/* 主分页组件 */}
        <Pagination
          count={totalPages}
          page={currentPage}
          onChange={handlePageChange}
          disabled={loading}
          showFirstButton={false}
          showLastButton={false}
          siblingCount={1}
          boundaryCount={1}
          size="small"
        />

        <Tooltip title="最后一页">
          <span>
            <IconButton
              size="small"
              onClick={handleLastPage}
              disabled={currentPage === totalPages || loading}
            >
              <LastPageIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* 右侧：页面大小选择和快速跳转 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {showPageSizeSelector && (
          <FormControl size="small" sx={{ minWidth: 80 }}>
            <InputLabel>每页</InputLabel>
            <Select
              value={pageSize}
              label="每页"
              onChange={handlePageSizeChange}
              disabled={loading}
            >
              {pageSizeOptions.map(size => (
                <MenuItem key={size} value={size}>
                  {size}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {showQuickJump && totalPages > 10 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              跳转到
            </Typography>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={quickJumpPage}
              onChange={(e) => setQuickJumpPage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleQuickJump()}
              style={{
                width: '60px',
                padding: '4px 8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '16px'
              }}
              placeholder="页码"
              disabled={loading}
            />
            <Typography variant="body2" color="text.secondary">
              页
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default SmartPagination;
