import React, { useState, useEffect } from 'react';
import {
  Box,
  ThemeProvider,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Tabs,
  Tab,

} from '@mui/material';

import { modernTheme } from './theme/modernTheme';
import './styles/modern.css';
import { ToastProvider } from './contexts/ToastContext';
import { listDatabaseConnections, getDuckDBTables, listFiles, uploadFile } from './services/apiClient';

// 导入原有组件 - 确保包含所有必要的组件
import QueryBuilder from './components/QueryBuilder/QueryBuilder';
import DataGrid from './components/DataGrid';

import DatabaseConnector from './components/DataSourceManager/DatabaseConnector';
import DataPasteBoard from './components/DataSourceManager/DataPasteBoard';
import DataSourceList from './components/DataSourceManager/DataSourceList';
import DatabaseConnectionManager from './components/DataSourceManager/DatabaseConnectionManager';
import DuckDBQueryBuilder from './components/DuckDBQuery/DuckDBQueryBuilder';
import UnifiedSQLExecutor from './components/UnifiedSQLExecutor/UnifiedSQLExecutor';
import EnhancedFileUploader from './components/DataSourceManager/EnhancedFileUploader';
import ModernDataDisplay from './components/Results/ModernDataDisplay';
import DuckDBManagementPage from './components/DuckDBManager/DuckDBManagementPage';
import DatabaseTableManager from './components/DatabaseManager/DatabaseTableManager';

const ModernApp = () => {
  const [currentTab, setCurrentTab] = useState(0);
  const [queryResults, setQueryResults] = useState({ columns: [], data: [] });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dataSources, setDataSources] = useState([]);
  const [databaseConnections, setDatabaseConnections] = useState([]);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [selectedSources, setSelectedSources] = useState([]);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };

  // 触发数据源列表刷新（带防抖）
  const triggerRefresh = () => {
    const now = Date.now();
    const timeSinceLastTrigger = now - lastFetchTime;

    // 如果距离上次触发不足5秒，则跳过
    if (timeSinceLastTrigger < 5000) {
      console.log('ModernApp - 跳过刷新触发，距离上次不足5秒');
      return;
    }

    console.log('ModernApp - 触发数据刷新');
    setRefreshTrigger(prev => prev + 1);
  };

  // 获取数据源列表（带防抖）
  const fetchDataSources = async (force = false) => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime;

    // 如果不是强制刷新且距离上次请求不足5秒，则跳过
    if (!force && timeSinceLastFetch < 5000) {
      console.log('跳过数据源请求，距离上次请求不足5秒');
      return;
    }

    try {
      console.log('获取数据源列表...');
      setLastFetchTime(now);

      // 创建带超时的fetch函数
      const fetchWithTimeout = (url, options = {}, timeout = 15000) => {
        return Promise.race([
          fetch(url, options),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('请求超时')), timeout)
          )
        ]);
      };

      // 使用apiClient而不是直接fetch，避免绕过请求管理器
      const [dbResponse, duckdbResponse] = await Promise.all([
        listDatabaseConnections().catch(err => {
          console.warn('获取数据库连接失败:', err);
          return { connections: [] };
        }),
        getDuckDBTables().catch(err => {
          console.warn('获取DuckDB表失败:', err);
          return { tables: [] };
        })
      ]);

      console.log('API响应数据:', { dbResponse, duckdbResponse });
      const dbResult = dbResponse || { connections: [] };
      const duckdbResult = duckdbResponse || { tables: [] };
      console.log('API数据解析结果:', {
        dbResult: dbResult,
        dbConnections: dbResult.connections?.length || 0,
        duckdbTables: duckdbResult.tables?.length || 0
      });

      // 获取文件数据源
      let fileSources = [];
      try {
        const fileList = await listFiles();
        fileSources = (fileList || []).map(filename => ({
          id: filename,
          name: filename,
          type: 'file',
          sourceType: 'file'
        }));
      } catch (error) {
        console.warn('获取文件列表失败:', error);
        fileSources = [];
      }

      // 直接使用数据库连接数据，不获取列信息（避免API调用失败）
      const dbSources = (dbResult.connections || []).map((db) => {
        return {
          id: db.id,
          name: db.name || `${db.type} 连接`,
          type: db.type,
          connectionId: db.id,
          columns: [], // 列信息在需要时再获取
          params: db.params,
          status: db.status,
          sourceType: 'database'
        };
      });

      // 构建DuckDB数据源格式
      const duckdbSources = (duckdbResult.tables || []).map(table => ({
        id: table.table_name,
        name: `DuckDB表: ${table.table_name}`,
        type: 'duckdb',
        table_name: table.table_name,
        columns: table.columns || [],
        row_count: table.row_count || 0,
        column_count: table.column_count || 0,
        sourceType: 'duckdb' // 添加源类型标识
      }));

      // 约束：数据库连接只作为连接配置，不作为查询数据源
      // 数据查询与结果页面只显示FILE和DUCKDB数据源
      const queryDataSources = [...fileSources, ...duckdbSources];

      setDataSources(queryDataSources);
      setDatabaseConnections(dbResult.connections || []); // 使用原始数据库连接数据
      console.log('数据源列表更新完成 - 查询数据源:', queryDataSources.length, '(文件:', fileSources.length, ', DuckDB表:', duckdbSources.length, '), 数据库连接:', (dbResult.connections || []).length);
      console.log('数据库连接详情:', dbResult.connections);
    } catch (error) {
      console.error('获取数据源失败:', error);
    }
  };

  // 组件挂载时获取数据源（强制）
  useEffect(() => {
    fetchDataSources(true);

    // 移除所有可能干扰React的事件监听器
    // 只依赖CSS防护
    return () => {
      // 清理函数为空，因为我们不再添加事件监听器
    };
  }, []);

  // 响应刷新触发（使用防抖）
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchDataSources(true); // 手动刷新时强制获取
    }
  }, [refreshTrigger]);

  // 可选的自动刷新定时器
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    const interval = setInterval(() => {
      console.log('自动刷新数据源...');
      fetchDataSources(false); // 使用防抖逻辑
    }, 30000); // 30秒

    return () => clearInterval(interval);
  }, [autoRefreshEnabled]); // 移除lastFetchTime依赖，避免定时器重复创建

  // 文件上传处理函数
  const handleFileUpload = async (file) => {
    try {
      const result = await uploadFile(file);
      console.log('文件上传成功:', result);

      // 触发数据源列表刷新
      triggerRefresh();
      return result;
    } catch (error) {
      console.error('文件上传错误:', error);
      throw error;
    }
  };

  // 处理粘贴数据保存
  const handlePasteDataSaved = (dataSourceInfo) => {
    console.log('粘贴数据已保存:', dataSourceInfo);
    // 触发数据源列表刷新
    triggerRefresh();
  };

  return (
    <ToastProvider>
      <ThemeProvider theme={modernTheme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        {/* 简洁顶部导航栏 */}
        <AppBar
          position="static"
          elevation={0}
          sx={{
            backgroundColor: '#2563eb',
            borderBottom: '1px solid #e2e8f0'
          }}
        >
          <Toolbar>
            <Typography
              variant="h6"
              component="div"
              sx={{
                flexGrow: 1,
                fontWeight: 600,
                color: 'white',
                fontFamily: 'Inter, sans-serif'
              }}
            >
              🚀 DataQuery Pro
            </Typography>

          </Toolbar>
        </AppBar>

        {/* 主要内容区域 */}
        <Container maxWidth="xl" sx={{ py: 3 }}>
          {/* 功能标签页 */}
          <Paper
            sx={{
              borderRadius: 3,
              mb: 3,
              border: '1px solid #e2e8f0'
            }}
          >
            <Tabs
              value={currentTab}
              onChange={handleTabChange}
              sx={{
                borderBottom: '1px solid #e2e8f0',
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '1rem'
                }
              }}
            >
              <Tab label="📁 数据源管理" value={0} />
              <Tab label="🔍 数据查询与结果" value={1} />
              <Tab label="💾 SQL执行器" value={2} />
              <Tab label="🗄️ DuckDB管理" value={3} />
              <Tab label="🗃️ 数据库表管理" value={4} />
            </Tabs>

            {/* 数据源管理页面 */}
            {currentTab === 0 && (
              <Box sx={{ p: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                  数据源管理
                </Typography>

                {/* 数据输入区域 - 重新设计布局 */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  {/* 主要功能：数据粘贴板 */}
                  <Grid item xs={12} lg={8}>
                    <Card
                      sx={{
                        borderRadius: 3,
                        border: 'none',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        boxShadow: '0 10px 30px rgba(102, 126, 234, 0.3)',
                        overflow: 'visible'
                      }}
                    >
                      <CardContent sx={{ p: 4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                          <Box
                            sx={{
                              background: 'rgba(255,255,255,0.2)',
                              borderRadius: '50%',
                              p: 1.5,
                              mr: 2,
                              backdropFilter: 'blur(10px)'
                            }}
                          >
                            📋
                          </Box>
                          <Typography variant="h5" sx={{ fontWeight: 700, fontSize: '1.5rem' }}>
                            智能数据粘贴板
                          </Typography>
                        </Box>
                        <Typography variant="body1" sx={{ mb: 3, opacity: 0.9, lineHeight: 1.6 }}>
                          从 DataGrip、Excel 或任何工具复制数据，一键智能解析并保存到 DuckDB
                        </Typography>
                        <Box
                          sx={{
                            background: 'rgba(255,255,255,0.95)',
                            borderRadius: 2,
                            p: 3,
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                          }}
                        >
                          <DataPasteBoard onDataSaved={handlePasteDataSaved} />
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* 辅助功能：文件上传和数据库连接 */}
                  <Grid item xs={12} lg={4}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {/* 文件上传 */}
                      <Card
                        sx={{
                          borderRadius: 2,
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: '0 8px 25px rgba(0,0,0,0.1)',
                            transform: 'translateY(-2px)'
                          }
                        }}
                      >
                        <CardContent sx={{ p: 3 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <Box
                              sx={{
                                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                borderRadius: '50%',
                                p: 1,
                                mr: 1.5,
                                color: 'white'
                              }}
                            >
                              📁
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 600, color: '#2d3748' }}>
                              文件上传
                            </Typography>
                          </Box>
                          <EnhancedFileUploader
                            onUpload={handleFileUpload}
                            onUploadComplete={(result) => {
                              console.log('文件上传完成:', result);
                              triggerRefresh();
                            }}
                          />
                        </CardContent>
                      </Card>

                      {/* 数据库连接 */}
                      <Box sx={{
                        '& .MuiCard-root': {
                          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            boxShadow: '0 8px 25px rgba(0,0,0,0.1)',
                            transform: 'translateY(-2px)'
                          }
                        }
                      }}>
                        <DatabaseConnectionManager onConnectionAdded={triggerRefresh} />
                      </Box>
                    </Box>
                  </Grid>
                </Grid>

                {/* 数据源列表区域 */}
                <DataSourceList
                  dataSources={dataSources}
                  databaseConnections={databaseConnections}
                  onRefresh={triggerRefresh}
                  refreshTrigger={refreshTrigger}
                />
              </Box>
            )}

            {/* 数据查询与结果页面 */}
            {currentTab === 1 && (
              <Box sx={{ p: 4 }}>
                {/* 查询构建器区域 */}
                <Card
                  sx={{
                    mb: 4,
                    borderRadius: 2,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)'
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Typography
                      variant="h6"
                      gutterBottom
                      sx={{
                        fontWeight: 600,
                        color: '#1e293b',
                        mb: 3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      🔍 查询构建器
                    </Typography>
                    <QueryBuilder
                      dataSources={dataSources.filter(ds => ds.sourceType === 'duckdb')}
                      selectedSources={selectedSources}
                      setSelectedSources={setSelectedSources}
                      onResultsReceived={setQueryResults}
                    />
                  </CardContent>
                </Card>

                {/* 查询结果区域 */}
                <Card
                  sx={{
                    borderRadius: 2,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)'
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Typography
                      variant="h6"
                      gutterBottom
                      sx={{
                        fontWeight: 600,
                        color: '#1e293b',
                        mb: 3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1
                      }}
                    >
                      📊 查询结果
                      {queryResults.data && queryResults.data.length > 0 && (
                        <Typography
                          variant="body2"
                          sx={{
                            ml: 2,
                            color: 'text.secondary',
                            backgroundColor: '#f1f5f9',
                            px: 2,
                            py: 0.5,
                            borderRadius: 1
                          }}
                        >
                          {queryResults.data.length} 条记录
                        </Typography>
                      )}
                    </Typography>

                    {/* 结果展示区域 */}
                    <ModernDataDisplay
                      data={queryResults.data || []}
                      columns={queryResults.columns ? queryResults.columns.map(col => ({
                        field: col,
                        headerName: col,
                        sortable: true,
                        filter: true,
                        resizable: true
                      })) : []}
                      loading={false}
                      title="查询结果"
                      sqlQuery={queryResults.sqlQuery || queryResults.sql || ''}
                      originalDatasource={queryResults.originalDatasource}
                      onRefresh={() => {
                        // 可以添加刷新逻辑
                      }}
                      onDataSourceSaved={triggerRefresh}
                    />
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* 统一SQL执行器页面 */}
            {currentTab === 2 && (
              <Box sx={{ p: 4 }}>
                <UnifiedSQLExecutor
                  databaseConnections={databaseConnections}
                  onDataSourceSaved={(newDataSource) => {
                    triggerRefresh();
                    console.log('新数据源已保存:', newDataSource);
                  }}
                  onResultsReceived={setQueryResults}
                />

                {/* 查询结果显示 */}
                {queryResults && queryResults.data && queryResults.data.length > 0 && (
                  <Box sx={{ mt: 4 }}>
                    <ModernDataDisplay
                      data={queryResults.data}
                      columns={queryResults.columns}
                      title="查询结果"
                      sqlQuery={queryResults.sqlQuery || queryResults.sql || ''}
                      originalDatasource={queryResults.originalDatasource}
                      onRefresh={() => console.log('刷新查询结果')}
                      onDataSourceSaved={triggerRefresh}
                    />
                  </Box>
                )}
              </Box>
            )}

            {/* DuckDB管理页面 */}
            {currentTab === 3 && (
              <DuckDBManagementPage onDataSourceChange={triggerRefresh} />
            )}

            {/* 数据库表管理页面 */}
            {currentTab === 4 && (
              <DatabaseTableManager databaseConnections={databaseConnections} />
            )}


          </Paper>

          {/* 底部信息 */}
          <Box sx={{ mt: 6, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Powered by React + Material-UI + DuckDB • 现代化数据分析解决方案
            </Typography>
          </Box>
        </Container>
      </Box>
      </ThemeProvider>
    </ToastProvider>
  );
};

export default ModernApp;
