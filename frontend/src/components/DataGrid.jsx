import React, { useEffect, useState, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { Box, CircularProgress, Typography, useTheme } from '@mui/material';
import SearchOffIcon from '@mui/icons-material/SearchOff';

const DataGrid = ({ rowData, columnDefs }) => {
  const gridRef = useRef(null);
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 根据数据自动调整列宽和loading状态
  useEffect(() => {
    // 当有数据时，立即停止loading状态
    if (rowData !== undefined) {
      setLoading(false);
    }

    // 如果grid API可用且有数据，调整列宽
    if (gridRef.current && gridRef.current.api && rowData && rowData.length > 0) {
      gridRef.current.api.sizeColumnsToFit();
    }
  }, [rowData, columnDefs]);

  // AG Grid 默认列定义
  const defaultColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100,
    flex: 1
  };

  // 定义自定义样式，匹配整体设计风格
  const gridStyle = {
    '--ag-font-family': theme.typography.fontFamily,
    '--ag-font-size': '13px',
    '--ag-header-background-color': 'rgba(247, 248, 250, 0.9)',
    '--ag-header-foreground-color': theme.palette.text.primary,
    '--ag-header-cell-hover-background-color': 'rgba(33, 150, 243, 0.1)',
    '--ag-row-hover-color': 'rgba(33, 150, 243, 0.04)',
    '--ag-selected-row-background-color': 'rgba(33, 150, 243, 0.08)',
    '--ag-odd-row-background-color': 'rgba(0, 0, 0, 0.01)',
    '--ag-border-color': 'rgba(0, 0, 0, 0.06)',
    '--ag-alpine-active-color': theme.palette.primary.main,
    borderRadius: theme.shape.borderRadius,
    overflow: 'hidden'
  };

  // 自定义空数据渲染
  const noRowsOverlayComponent = () => (
    <Box sx={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <SearchOffIcon sx={{ color: 'text.secondary', fontSize: 40, mb: 1 }} />
      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
        无数据
      </Typography>
    </Box>
  );

  if (error) {
    return (
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        p: 3,
        color: 'error.main'
      }}>
        <Typography variant="body1">{error}</Typography>
      </Box>
    );
  }

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
      
      <div 
        className="ag-theme-alpine"
        style={{ 
          height: '100%', 
          width: '100%',
          ...gridStyle 
        }}
      >
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          animateRows={true}
          pagination={true}
          paginationPageSize={20}
          paginationAutoPageSize={true}
          noRowsOverlayComponent={noRowsOverlayComponent}
          suppressCellFocus={true}
          enableCellTextSelection={true}
          onGridReady={(params) => {
            params.api.sizeColumnsToFit();
          }}
          onFirstDataRendered={(params) => {
            params.api.sizeColumnsToFit();
            setLoading(false);
          }}
        />
      </div>
    </Box>
  );
};

export default DataGrid;
