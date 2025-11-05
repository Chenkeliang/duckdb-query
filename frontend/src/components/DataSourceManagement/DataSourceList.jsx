import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Paper,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { deleteDuckDBTableEnhanced } from '../../services/apiClient';

const DataSourceList = ({ duckdbTables = [], onRefresh, showNotification }) => {
  // 处理删除表
  const handleDeleteTable = async (tableName) => {
    if (!window.confirm(`确定要删除表 ${tableName} 吗？`)) {
      return;
    }

    try {
      await deleteDuckDBTableEnhanced(tableName);
      showNotification(`表 ${tableName} 已删除`, 'success');
      onRefresh();
    } catch (err) {
      showNotification(`删除表失败: ${err.message}`, 'error');
    }
  };

  if (duckdbTables.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <Typography color="text.secondary">
          暂无数据源，请先上传文件或导入URL
        </Typography>
      </Box>
    );
  }

  return (
    <Paper
      sx={{
        maxHeight: 300,
        overflow: 'auto',
        borderRadius: 'var(--dq-radius-card)',
        backgroundColor: 'var(--dq-surface)',
        border: '1px solid var(--dq-border-subtle)',
        boxShadow: 'var(--dq-shadow-soft)'
      }}
    >
      {duckdbTables.map((table) => (
        <Box
          key={table}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            borderBottom: '1px solid var(--dq-border-subtle)',
            '&:last-child': {
              borderBottom: 'none'
            },
            '&:hover': {
              backgroundColor: 'var(--dq-surface-hover)'
            }
          }}
        >
          <Box>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              {table}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              DuckDB表
            </Typography>
          </Box>
          <Box>
            <Tooltip title="预览数据">
              <IconButton 
                size="small"
                onClick={() => {
                  // 这里可以触发预览功能，暂时留空
                }}
              >
                <ViewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="删除">
              <IconButton 
                size="small" 
                color="error"
                onClick={() => handleDeleteTable(table)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      ))}
    </Paper>
  );
};

export default DataSourceList;
