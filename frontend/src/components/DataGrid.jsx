import React, { useEffect, useState } from 'react';
import StableTable from './StableTable';
import { Box, CircularProgress } from '@mui/material';

const DataGrid = ({ rowData, columnDefs }) => {
  const [loading, setLoading] = useState(true);

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
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
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
      />
    </Box>
  );
};

export default DataGrid;
