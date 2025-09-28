import {
  Alert,
  Box,
  Card,
  CardContent,
  Snackbar,
  Typography
} from '@mui/material';
import { Database, FolderOpen } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getDuckDBTablesEnhanced } from '../../services/apiClient';
import DataSourceList from './DataSourceList';
import DataUploadSection from './DataUploadSection';

const DataSourceManagement = ({ onDataSaved }) => {
  const [duckdbTables, setDuckdbTables] = useState([]);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });

  // 获取DuckDB中的表列表
  const fetchDuckDBTables = async () => {
    try {
      const response = await getDuckDBTablesEnhanced();
      const tableNames = response.tables ? response.tables.map(table => table.table_name) : [];
      setDuckdbTables(tableNames);
    } catch (err) {
      console.error('获取表列表失败:', err);
      showNotification('获取数据源列表失败', 'error');
    }
  };

  useEffect(() => {
    fetchDuckDBTables();
  }, []);

  const showNotification = (message, severity = 'success') => {
    setNotification({ open: true, message, severity });
  };

  const handleNotificationClose = () => {
    setNotification({ ...notification, open: false });
  };

  const handleDataSourceSaved = (newSource) => {
    fetchDuckDBTables();
    if (onDataSaved) {
      onDataSaved(newSource);
    }
    showNotification('数据源保存成功', 'success');
  };

  return (
    <Box>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <FolderOpen size={20} style={{ marginRight: '8px' }} />
            数据源管理
          </Typography>

          <DataUploadSection
            onDataSourceSaved={handleDataSourceSaved}
            showNotification={showNotification}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <Database size={20} style={{ marginRight: '8px' }} />
            已上传数据源
          </Typography>
          <DataSourceList
            duckdbTables={duckdbTables}
            onRefresh={fetchDuckDBTables}
            showNotification={showNotification}
          />
        </CardContent>
      </Card>

      <Snackbar
        open={notification.open}
        autoHideDuration={3000}
        onClose={handleNotificationClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={handleNotificationClose}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DataSourceManagement;