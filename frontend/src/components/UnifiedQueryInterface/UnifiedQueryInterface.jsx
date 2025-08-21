import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Divider,
  Alert
} from '@mui/material';
import QueryBuilder from '../QueryBuilder/QueryBuilder';
import SqlEditor from '../DataSourceManager/SqlExecutor';
import EnhancedSQLExecutor from '../EnhancedSQLExecutor';

const UnifiedQueryInterface = ({ 
  dataSources = [], 
  databaseConnections = [],
  selectedSources = [], 
  setSelectedSources,
  onResultsReceived,
  onDataSourceSaved
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [queryBuilderResults, setQueryBuilderResults] = useState(null);
  const [sqlExecutorResults, setSqlExecutorResults] = useState(null);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // 处理查询构建器结果
  const handleQueryBuilderResults = (results) => {
    setQueryBuilderResults(results);
    if (onResultsReceived) {
      onResultsReceived(results);
    }
  };

  // 处理SQL执行器结果
  const handleSqlExecutorResults = (results) => {
    setSqlExecutorResults(results);
    if (onResultsReceived) {
      onResultsReceived(results);
    }
  };

  return (
    <Box>
      <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 0 }}>
          {/* 查询模式切换 */}
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
                label="图形化查询"
                value={0}
                sx={{ mr: 2 }}
              />
              <Tab
                label="SQL编辑器"
                value={1}
              />
            </Tabs>
          </Box>

          {/* 查询构建区域 */}
          <Box sx={{ p: 3 }}>
            {activeTab === 0 && (
              <QueryBuilder
                    dataSources={[...dataSources].filter(ds => ds.type === 'duckdb' || ds.sourceType === 'duckdb').sort((a, b) => {
                      const timeA = a.createdAt ? new Date(a.createdAt) : new Date(0);
                      const timeB = b.createdAt ? new Date(b.createdAt) : new Date(0);
                      // 如果createdAt为null，将其放在最后
                      if (!a.createdAt && !b.createdAt) return 0;
                      if (!a.createdAt) return 1;
                      if (!b.createdAt) return -1;
                      return timeB - timeA;
                    })}
                    selectedSources={selectedSources}
                    setSelectedSources={setSelectedSources}
                    onResultsReceived={handleQueryBuilderResults}
                  />
            )}

            {activeTab === 1 && (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  请选择SQL执行模式：
                </Alert>
                <EnhancedSQLExecutor
                  onResultsReceived={handleSqlExecutorResults}
                  onDataSourceSaved={onDataSourceSaved}
                  databaseConnections={databaseConnections}
                />
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default UnifiedQueryInterface;