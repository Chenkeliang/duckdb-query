import {
  Box,
  Card,
  CardContent,
  Tab,
  Tabs,
  Typography
} from '@mui/material';
import React, { useState } from 'react';
import SqlExecutor from '../DataSourceManager/SqlExecutor';
import EnhancedSQLExecutor from '../EnhancedSQLExecutor';
import QueryBuilder from '../QueryBuilder/QueryBuilder';

const UnifiedQueryInterface = ({
  dataSources = [],
  databaseConnections = [],
  selectedSources = [],
  setSelectedSources,
  onResultsReceived,
  onDataSourceSaved
}) => {
  const [activeTab, setActiveTab] = useState(0);
  const [sqlExecutorType, setSqlExecutorType] = useState('mysql'); // 'mysql' 或 'duckdb'
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
                {/* 查询目标Tab切换 */}
                <Box sx={{ mb: 3 }}>
                  <Tabs
                    value={sqlExecutorType === 'mysql' ? 0 : 1}
                    onChange={(e, newValue) => setSqlExecutorType(newValue === 0 ? 'mysql' : 'duckdb')}
                    sx={{ borderBottom: 1, borderColor: 'divider' }}
                  >
                    <Tab
                      label="外部数据库 (MySQL)"
                      sx={{ textTransform: 'none', fontWeight: 500 }}
                    />
                    <Tab
                      label="内部数据 (DuckDB)"
                      sx={{ textTransform: 'none', fontWeight: 500 }}
                    />
                  </Tabs>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    {sqlExecutorType === 'mysql'
                      ? '查询您连接的外部MySQL数据库'
                      : '查询已上传的文件和保存的查询结果'}
                  </Typography>
                </Box>

                {/* SQL执行器 */}
                {sqlExecutorType === 'mysql' ? (
                  <SqlExecutor
                    databaseConnections={databaseConnections}
                    onDataSourceSaved={onDataSourceSaved}
                    onResultsReceived={handleSqlExecutorResults}
                  />
                ) : (
                  <EnhancedSQLExecutor
                    onResultsReceived={handleSqlExecutorResults}
                    onDataSourceSaved={onDataSourceSaved}
                  />
                )}
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>


    </Box>
  );
};

export default UnifiedQueryInterface;