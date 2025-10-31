import { Box, Tab, Tabs, Typography } from '@mui/material';
import React, { useCallback, useState } from 'react';
import SqlExecutor from '../DataSourceManager/SqlExecutor';
import EnhancedSQLExecutor from '../EnhancedSQLExecutor';
import QueryBuilder from '../QueryBuilder/QueryBuilder';

const UnifiedQueryInterface = ({
  dataSources = [],
  databaseConnections = [],
  selectedSources = [],
  setSelectedSources,
  onResultsReceived,
  onDataSourceSaved,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState('visual');
  const [queryBuilderResults, setQueryBuilderResults] = useState(null);
  const [sqlExecutorResults, setSqlExecutorResults] = useState(null);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  // 处理查询构建器结果 - 使用useCallback稳定引用
  const handleQueryBuilderResults = useCallback((results) => {
    setQueryBuilderResults(results);
    if (onResultsReceived) {
      onResultsReceived(results);
    }
  }, [onResultsReceived]);

  // 处理SQL执行器结果 - 使用useCallback稳定引用
  const handleSqlExecutorResults = useCallback((results) => {
    setSqlExecutorResults(results);
    if (onResultsReceived) {
      onResultsReceived(results);
    }
  }, [onResultsReceived]);

  return (
    <div className="unified-query-shell">
      {/* 查询模式切换 */}
      <div className="unified-query-shell__tabs">
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          sx={{
            px: 3,
            pt: 2,
            '& .MuiTabs-indicator': {
              backgroundColor: 'var(--dq-accent-primary)',
              height: 2
            },
            '& .MuiTab-root': {
              color: 'var(--dq-text-tertiary)',
              fontSize: '18px',
              fontWeight: 600,
              textTransform: 'none',
              minHeight: 52
            },
            '& .MuiTab-root.Mui-selected': {
              color: 'var(--dq-text-primary)'
            }
          }}
        >
          <Tab label="图形化查询" value="visual" sx={{ mr: 2 }} />
          <Tab label="SQL编辑器 · 内部数据" value="duckdb" sx={{ mr: 2 }} />
          <Tab label="SQL编辑器 · 外部数据库" value="external" />
        </Tabs>
      </div>

      {/* 查询构建区域 */}
      <div className="unified-query-shell__content">
        {activeTab === 'visual' && (
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
            onRefresh={onRefresh}
          />
        )}

        {activeTab === 'duckdb' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              查询已上传的文件和保存的查询结果（DuckDB 内部数据）
            </Typography>
            <EnhancedSQLExecutor
              onResultsReceived={handleSqlExecutorResults}
              onDataSourceSaved={onDataSourceSaved}
            />
          </Box>
        )}

        {activeTab === 'external' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              查询您连接的外部数据库（当前支持 MySQL）
            </Typography>
            <SqlExecutor
              databaseConnections={databaseConnections}
              onDataSourceSaved={onDataSourceSaved}
              onResultsReceived={handleSqlExecutorResults}
            />
          </Box>
        )}
      </div>
    </div>
  );
};

export default UnifiedQueryInterface;
