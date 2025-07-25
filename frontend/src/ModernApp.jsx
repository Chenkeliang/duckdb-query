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
  IconButton,
  Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { modernTheme } from './theme/modernTheme';
import './styles/modern.css';

// 导入原有组件 - 确保包含所有必要的组件
import QueryBuilder from './components/QueryBuilder/QueryBuilder';
import DataGrid from './components/DataGrid';
import FileUploader from './components/DataSourceManager/FileUploader';
import DatabaseConnector from './components/DataSourceManager/DatabaseConnector';
import DataSourceList from './components/DataSourceManager/DataSourceList';
import DatabaseConnectionManager from './components/DataSourceManager/DatabaseConnectionManager';
import SqlExecutor from './components/DataSourceManager/SqlExecutor';
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

  // 触发数据源列表刷新
  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // 获取数据源列表（带防抖）
  const fetchDataSources = async (force = false) => {
    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime;

    // 如果不是强制刷新且距离上次请求不足30秒，则跳过
    if (!force && timeSinceLastFetch < 30000) {
      console.log('跳过数据源请求，距离上次请求不足30秒');
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

      const [dbResponse, duckdbResponse] = await Promise.all([
        fetchWithTimeout('/api/database_connections').catch(err => {
          console.warn('获取数据库连接失败:', err);
          return { ok: false, json: () => Promise.resolve({ connections: [] }) };
        }),
        fetchWithTimeout('/api/duckdb_tables').catch(err => {
          console.warn('获取DuckDB表失败:', err);
          return { ok: false, json: () => Promise.resolve({ tables: [] }) };
        })
      ]);

      const dbResult = dbResponse.ok ? await dbResponse.json() : { connections: [] };
      const duckdbResult = duckdbResponse.ok ? await duckdbResponse.json() : { tables: [] };

      // 获取文件数据源
      let fileSources = [];
      try {
        const fileResponse = await fetchWithTimeout('/api/list_files');
        if (fileResponse.ok) {
          const fileList = await fileResponse.json();
          fileSources = (fileList || []).map(filename => ({
            id: filename,
            name: filename,
            type: 'file',
            sourceType: 'file'
          }));
        }
      } catch (error) {
        console.warn('获取文件列表失败:', error);
        fileSources = [];
      }

      // 构建数据库数据源格式（获取列信息）
      const dbSources = await Promise.all((dbResult.connections || []).map(async (db) => {
        let columns = [];
        try {
          // 通过连接数据库来获取列信息（带超时）
          const connectResponse = await fetchWithTimeout('/api/connect_database', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              id: db.id,
              type: db.type,
              params: db.params
            })
          }, 10000); // 10秒超时

          if (connectResponse.ok) {
            const connectResult = await connectResponse.json();
            if (connectResult.success && connectResult.columns) {
              columns = connectResult.columns;
            }
          }
        } catch (error) {
          console.warn(`获取数据库 ${db.id} 列信息失败:`, error);
        }

        return {
          id: db.id,
          name: db.name || `${db.type} 连接`,
          type: db.type, // 使用实际的数据库类型（mysql, postgresql等）
          connectionId: db.id,
          columns: columns || [],
          params: db.params, // 保存连接参数
          sourceType: 'database' // 添加源类型标识
        };
      }));

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
      setDatabaseConnections(dbSources); // 单独保存数据库连接供SQL执行器使用
      console.log('数据源列表更新完成 - 查询数据源:', queryDataSources.length, '(文件:', fileSources.length, ', DuckDB表:', duckdbSources.length, '), 数据库连接:', dbSources.length);
    } catch (error) {
      console.error('获取数据源失败:', error);
    }
  };

  // 组件挂载时获取数据源（强制）
  useEffect(() => {
    fetchDataSources(true);
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
  }, [autoRefreshEnabled, lastFetchTime]);

  // 文件上传处理函数
  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status}`);
      }

      const result = await response.json();
      console.log('文件上传成功:', result);

      // 触发数据源列表刷新
      triggerRefresh();
      return result;
    } catch (error) {
      console.error('文件上传错误:', error);
      throw error;
    }
  };

  return (
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
            <Tooltip title="手动刷新数据源">
              <IconButton
                color="inherit"
                onClick={() => fetchDataSources(true)}
                sx={{ mr: 1 }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            <Button
              color="inherit"
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 500
              }}
            >
              用户中心
            </Button>
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

                {/* 上传和连接区域 */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  <Grid item xs={12} md={6}>
                    <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                      <CardContent>
                        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                          📁 文件上传
                        </Typography>
                        <FileUploader onUpload={handleFileUpload} />
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <DatabaseConnectionManager onConnectionAdded={triggerRefresh} />
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
                    <Box
                      sx={{
                        height: 400,
                        border: '1px solid #e2e8f0',
                        borderRadius: 2,
                        backgroundColor: '#fafafa'
                      }}
                    >
                      {queryResults.data && queryResults.data.length > 0 ? (
                        <DataGrid
                          rowData={queryResults.data}
                          columnDefs={queryResults.columns ? queryResults.columns.map(col => ({
                            field: col,
                            headerName: col,
                            sortable: true,
                            filter: true,
                            resizable: true
                          })) : []}
                        />
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 400,
                            color: 'text.secondary'
                          }}
                        >
                          <Typography variant="h6" sx={{ mb: 1, fontWeight: 500 }}>
                            暂无查询结果
                          </Typography>
                          <Typography variant="body2">
                            请在上方构建查询条件并执行查询
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* SQL执行器页面 */}
            {currentTab === 2 && (
              <Box sx={{ p: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
                  💾 SQL执行器
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  连接MySQL数据库，执行自定义SQL查询，并可将结果保存为DuckDB数据源
                </Typography>

                <Card sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
                  <CardContent>
                    <SqlExecutor
                      databaseConnections={databaseConnections}
                      onDataSourceSaved={(newDataSource) => {
                        // 当保存新数据源时，刷新数据源列表
                        triggerRefresh();
                        // 可以添加成功提示
                        console.log('新数据源已保存:', newDataSource);
                      }}
                    />
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* DuckDB管理页面 */}
            {currentTab === 3 && (
              <DuckDBManagementPage />
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
  );
};

export default ModernApp;
