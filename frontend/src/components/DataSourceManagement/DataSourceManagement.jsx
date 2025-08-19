import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Alert,
  Snackbar
} from '@mui/material';
import FileUploadSection from './FileUploadSection';
import UrlImportSection from './UrlImportSection';
import DataSourceList from './DataSourceList';
import { getDuckDBTablesEnhanced } from '../../services/apiClient';

const DataSourceManagement = ({ onDataSaved }) => {
  const [activeTab, setActiveTab] = useState(0);
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
            📁 数据源管理
          </Typography>
          
          <Tabs 
            value={activeTab} 
            onChange={(e, newValue) => setActiveTab(newValue)}
            sx={{ mb: 2 }}
          >
            <Tab label="文件上传" />
            <Tab label="URL导入" />
          </Tabs>

          {activeTab === 0 && (
            <FileUploadSection 
              onDataSourceSaved={handleDataSourceSaved}
              showNotification={showNotification}
            />
          )}

          {activeTab === 1 && (
            <UrlImportSection 
              onDataSourceSaved={handleDataSourceSaved}
              showNotification={showNotification}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            🗃️ 已上传数据源
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