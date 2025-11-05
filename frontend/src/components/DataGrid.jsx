import React, { useCallback, useEffect, useState } from 'react';
import StableTable from './StableTable';
import { Box, CircularProgress } from '@mui/material';
import { useToast } from '../contexts/ToastContext';

const DataGrid = ({ rowData, columnDefs }) => {
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useToast();

  const handleCopyColumnName = useCallback(async (label) => {
    const resolved = typeof label === 'string' ? label.trim() : '';
    if (!resolved) {
      showError('无法复制空列名');
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(resolved);
        showSuccess(`已复制列名「${resolved}」`);
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch (error) {
      showError('复制列名失败，请手动复制');
    }
  }, [showError, showSuccess]);

  // 模拟数据加载
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [rowData]);

  return (
    <Box sx={{ height: '100%', width: '100%', position: 'relative' }}>
      {loading && (
        <Box sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'color-mix(in oklab, var(--dq-surface) 70%, transparent)',
          zIndex: 10
        }}>
          <CircularProgress size={40} />
        </Box>
      )}
      
      <StableTable
        data={rowData}
        columns={columnDefs}
        pageSize={20}
        height={400}
        onCopyColumnName={handleCopyColumnName}
      />
    </Box>
  );
};

export default DataGrid;
