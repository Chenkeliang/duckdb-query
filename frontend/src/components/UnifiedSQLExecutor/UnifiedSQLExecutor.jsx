import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Divider
} from '@mui/material';
import SqlExecutor from '../DataSourceManager/SqlExecutor';
import EnhancedSQLExecutor from '../EnhancedSQLExecutor';

const UnifiedSQLExecutor = ({ 
  databaseConnections = [], 
  onDataSourceSaved, 
  onResultsReceived,
  previewQuery = "",
  onPreviewQueryUsed
}) => {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 0 }}>
          {/* 二级TAB导航 */}
          <Box sx={{ borderBottom: '1px solid #e2e8f0' }}>
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              sx={{
                px: 3,
                pt: 2,
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  minHeight: 48
                }
              }}
            >
              <Tab
                label="数据库查询"
                value={0}
                sx={{ mr: 2 }}
              />
              <Tab
                label="DuckDB增强"
                value={1}
              />
            </Tabs>
          </Box>

          {/* TAB内容区域 */}
          <Box sx={{ p: 3 }}>
            {activeTab === 0 && (
              <SqlExecutor
                databaseConnections={databaseConnections}
                onDataSourceSaved={onDataSourceSaved}
              />
            )}

            {activeTab === 1 && (
              <EnhancedSQLExecutor
                onResultsReceived={onResultsReceived}
                onDataSourceSaved={onDataSourceSaved}
              />
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default UnifiedSQLExecutor;
