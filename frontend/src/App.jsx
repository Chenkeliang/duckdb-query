import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Grid, 
  Paper, 
  Typography, 
  Box, 
  AppBar, 
  Toolbar, 
  ThemeProvider, 
  createTheme, 
  Tab,
  Tabs,
  CssBaseline,
  IconButton,
  Button
} from '@mui/material';
import FileUploader from './components/DataSourceManager/FileUploader';
import DatabaseConnector from './components/DataSourceManager/DatabaseConnector';
import DataPasteBoard from './components/DataSourceManager/DataPasteBoard';
import DataGrid from './components/DataGrid';
import QueryBuilder from './components/QueryBuilder/QueryBuilder';
import { uploadFile, connectDatabase, deleteFile } from './services/apiClient';
import StorageIcon from '@mui/icons-material/Storage';
import DeleteIcon from '@mui/icons-material/Delete';
import { ToastProvider } from './contexts/ToastContext';

// 创建主题 - 简洁风格
const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f5f5f7',
      paper: '#ffffff',
    },
    text: {
      primary: '#333333',
      secondary: '#666666',
    }
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    h6: {
      fontWeight: 500,
      fontSize: '1rem',
    },
    body1: {
      fontSize: '0.875rem',
    },
    body2: {
      fontSize: '0.8125rem',
    }
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          border: '1px solid rgba(0, 0, 0, 0.05)',
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
        }
      }
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.875rem',
          minWidth: 100,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
        },
      },
    },
  }
});

function App() {
  const [dataSources, setDataSources] = useState([]);
  const [results, setResults] = useState({ columns: [], data: [] });
  const [dataSourceTab, setDataSourceTab] = useState(0);
  const [selectedSources, setSelectedSources] = useState([]);

  // 本地持久化数据源
  useEffect(() => {
    const saved = localStorage.getItem('dataSources');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // 过滤掉本地文件已不存在的数据源
        const filtered = parsed.filter(ds => {
          if (ds.type === 'file' && ds.params?.path) {
            try {
              // 用同步XHR检测文件是否存在（仅开发环境可用，生产建议后端API校验）
              const xhr = new XMLHttpRequest();
              xhr.open('HEAD', `/api/file_exists?path=${encodeURIComponent(ds.params.path)}`, false);
              xhr.send();
              return xhr.status === 200;
            } catch {
              return false;
            }
          }
          return true;
        });
        setDataSources(filtered);
      } catch {
        setDataSources([]);
      }
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('dataSources', JSON.stringify(dataSources));
  }, [dataSources]);

  // selectedSources 本地持久化，恢复时只保留 dataSources 里存在的 id
  useEffect(() => {
    const saved = localStorage.getItem('selectedSources');
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        setSelectedSources(arr.filter(sel => dataSources.some(ds => ds.id === sel.id)));
      } catch {
        setSelectedSources([]);
      }
    }
  }, [dataSources]);
  useEffect(() => {
    localStorage.setItem('selectedSources', JSON.stringify(selectedSources));
  }, [selectedSources]);

  const handleFileUpload = async (file) => {
    // 检查是否已存在同名数据源
    const fileId = file.name.split('.')[0];
    if (dataSources.some(ds => ds.id === fileId)) {
      alert(`已存在同名数据源：${fileId}，请勿重复上传。`);
      return;
    }
    try {
      const uploadResult = await uploadFile(file);
      // 添加上传的文件到数据源列表
      const newSource = {
        id: fileId,  // 使用原始文件名作为ID
        type: 'file',
        params: { path: uploadResult.file_id },
        columns: uploadResult.columns
      };
      setDataSources(prev => [...prev, newSource]);
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };
  
  const handleDatabaseConnect = async (connectionParams) => {
    try {
      const connectResult = await connectDatabase(connectionParams);
      
      if (connectResult.success) {
        // 添加数据库连接到数据源列表
        const newSource = {
          id: connectionParams.id,
          type: connectionParams.type,
          params: connectionParams.params,
          columns: connectResult.columns || []
        };
        
        setDataSources(prev => [...prev, newSource]);
        
        // 显示查询结果
        if (connectResult.data && connectResult.columns) {
          handleQueryResults({
            columns: connectResult.columns,
            data: connectResult.data
          });
        }
      }
      
      return connectResult;
    } catch (error) {
      console.error("Error connecting to database:", error);
      throw error;
    }
  };

  const handlePasteDataSaved = (dataSourceInfo) => {
    // 添加粘贴数据源到数据源列表
    const newSource = {
      id: dataSourceInfo.id,
      name: dataSourceInfo.name,
      type: 'DUCKDB',
      status: 'connected',
      columns: dataSourceInfo.columns,
      rows: dataSourceInfo.rows,
      source: 'paste'
    };

    const updatedSources = [...dataSources, newSource];
    setDataSources(updatedSources);
    localStorage.setItem('dataSources', JSON.stringify(updatedSources));
  };

  const handleQueryResults = (data) => {
    if (!data) return;
    
    try {
      console.log("接收到的查询结果数据:", data);
      
      // 处理 pandas DataFrame split 格式 (包含 columns, index, data)
      if (data.columns && Array.isArray(data.columns) && data.data && Array.isArray(data.data)) {
        // 转换数据格式为 ag-grid 所需的格式
        const rowData = [];
        // 确保data.data是二维数组形式，如果是，则进行正确的转换
        if (Array.isArray(data.data) && data.data.length > 0) {
          // 检查数据是否为二维数组
          if (Array.isArray(data.data[0])) {
            // 二维数组处理
            data.data.forEach((row, i) => {
              const rowObj = {};
              data.columns.forEach((col, j) => {
                rowObj[col] = row[j];
              });
              rowData.push(rowObj);
            });
          } else if (typeof data.data[0] === 'object') {
            // 已经是对象数组的情况
            rowData.push(...data.data);
          }
        }
        
        const columnDefs = data.columns.map(col => ({ 
          headerName: col, 
          field: col 
        }));

        console.log("转换为rowData的数据:", rowData);
        
        setResults({
          columns: columnDefs,
          data: rowData
        });
        
        console.log("转换后的数据结果:", { columns: columnDefs.length, rowCount: rowData.length, sample: rowData.slice(0, 2) });
      } 
      // 处理已经是对象数组格式的数据
      else if (Array.isArray(data)) {
        if (data.length > 0) {
          const columns = Object.keys(data[0]).map(key => ({
            headerName: key,
            field: key
          }));
          setResults({
            columns,
            data
          });
          console.log("处理对象数组格式:", { columns, rowCount: data.length });
        } else {
          setResults({ columns: [], data: [] });
          console.log("收到空数组数据");
        }
      }
      // 处理API直接返回的格式 {success: true, columns: [...], data: [...]}
      else if ((data.success || data.success === undefined) && data.columns && Array.isArray(data.columns) && data.data && Array.isArray(data.data)) {
        // 处理嵌套的data.data结构
        let processedData = data.data;
        
        // 如果数据是二维数组格式，需要转换为对象数组
        if (Array.isArray(data.data[0])) {
          processedData = data.data.map((row, i) => {
            const rowObj = {};
            data.columns.forEach((col, j) => {
              rowObj[col] = row[j];
            });
            return rowObj;
          });
        }
        
        setResults({
          columns: data.columns.map(col => ({ 
            headerName: col, 
            field: col 
          })),
          data: processedData
        });
        console.log("处理API直接返回格式:", { columns: data.columns, rowCount: processedData.length });
      }
      // 处理可能的错误或空结果
      else if (data.error || data.message) {
        console.error("API返回错误:", data.error || data.message);
        setResults({ columns: [], data: [] });
      }
      else {
        console.error("未知的数据格式:", data);
        // 尝试从未知格式中提取有用信息
        if (typeof data === 'object' && data !== null) {
          // 寻找可能的数据数组
          for (const key in data) {
            if (Array.isArray(data[key]) && data[key].length > 0) {
              if (typeof data[key][0] === 'object') {
                const columns = Object.keys(data[key][0]).map(col => ({
                  headerName: col,
                  field: col
                }));
                setResults({
                  columns,
                  data: data[key]
                });
                console.log("从未知格式中提取数据:", { key, columns, rowCount: data[key].length });
                return;
              }
            }
          }
        }
        // 实在无法处理时设置为空结果
        setResults({ columns: [], data: [] });
      }
    } catch (error) {
      console.error("处理查询结果时发生错误:", error);
      setResults({ columns: [], data: [] });
    }
  };

  // 删除数据源（含后端文件删除）
  const handleDeleteDataSource = async (source) => {
    if (window.confirm(`确定要删除数据源 ${source.id} 吗？`)) {
      if (source.type === 'file' && source.params?.path) {
        try {
          await deleteFile(source.params.path);
        } catch (e) {
          alert('文件删除失败：' + (e?.response?.data?.detail || e.message));
          return;
        }
      }
      setDataSources(prev => prev.filter(s => s.id !== source.id));
      // 删除后同步清除已选择的数据源中对应项
      setSelectedSources(prev => prev.filter(s => s.id !== source.id));
    }
  };

  // 页面加载时自动扫描 temp_files 目录下的所有文件，自动加载为可选数据源
  useEffect(() => {
    async function fetchFiles() {
      try {
        const resp = await fetch('/api/list_files');
        const files = await resp.json();
        // 只保留支持的文件类型
        const validFiles = files.filter(f => f.endsWith('.csv') || f.endsWith('.xlsx') || f.endsWith('.xls'));
        // 构建数据源对象
        const sources = await Promise.all(validFiles.map(async (fname) => {
          // 获取列信息
          let columns = [];
          try {
            const metaResp = await fetch(`/api/file_columns?filename=${encodeURIComponent(fname)}`);
            columns = await metaResp.json();
          } catch {}
          return {
            id: fname.split('.')[0],
            type: 'file',
            params: { path: `temp_files/${fname}` },
            columns
          };
        }));
        setDataSources(sources);
      } catch (e) {
        setDataSources([]);
      }
    }
    fetchFiles();
  }, []);

  return (
    <ToastProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: '1px solid rgba(0, 0, 0, 0.08)' }}>
          <Toolbar>
            <StorageIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6">
              交互式数据查询平台
            </Typography>
          </Toolbar>
        </AppBar>

        <Container maxWidth={false} sx={{ flexGrow: 1, py: 2 }}>
          <Grid container spacing={2}>
            {/* 左侧面板 */}
            <Grid item xs={12} md={4} lg={3}>
              <Paper sx={{ mb: 2, overflow: 'hidden' }}>
                <Tabs
                  value={dataSourceTab}
                  onChange={(e, newValue) => setDataSourceTab(newValue)}
                  variant="fullWidth"
                >
                  <Tab label="文件上传" />
                  <Tab label="数据库连接" />
                  <Tab label="数据粘贴板" />
                </Tabs>

                <Box sx={{ p: 2 }}>
                  {dataSourceTab === 0 && <FileUploader onUpload={handleFileUpload} />}
                  {dataSourceTab === 1 && <DatabaseConnector onConnect={handleDatabaseConnect} />}
                  {dataSourceTab === 2 && <DataPasteBoard onDataSaved={handlePasteDataSaved} />}
                </Box>
              </Paper>

              {dataSources.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontSize: '0.9rem', fontWeight: 500, mb: 1.5 }}>
                    已添加数据源 ({dataSources.length})
                  </Typography>
                  <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none', maxHeight: '150px', overflow: 'auto' }}>
                    {dataSources.map((source) => (
                      <Box 
                        component="li" 
                        key={source.id}
                        sx={{ 
                          py: 1, 
                          borderBottom: '1px solid rgba(0,0,0,0.06)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {source.id}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {source.columns?.length || 0} 列
                          </Typography>
                        </Box>
                        <IconButton size="small" color="error" onClick={() => handleDeleteDataSource(source)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              )}

              <QueryBuilder
                dataSources={dataSources}
                selectedSources={selectedSources}
                setSelectedSources={setSelectedSources}
                onResultsReceived={handleQueryResults}
              />
            </Grid>

            {/* 右侧数据展示区 */}
            <Grid item xs={12} md={8} lg={9}>
              <Paper sx={{ height: 'calc(100vh - 112px)', display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 500, fontSize: '0.9rem' }}>
                    查询结果
                  </Typography>
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={() => setResults({ columns: [], data: [] })}
                    sx={{ ml: 2, borderRadius: 2, minWidth: 80 }}
                  >
                    清空表格
                  </Button>
                </Box>
                
                <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
                  {results.data && results.data.length > 0 ? (
                    <DataGrid
                      rowData={results.data}
                      columnDefs={results.columns}
                    />
                  ) : (
                    <Box sx={{ 
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      p: 2
                    }}>
                      <Typography variant="body1" color="text.secondary" align="center">
                        无数据显示
                      </Typography>
                      <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
                        请执行查询获取结果
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>
      </ThemeProvider>
    </ToastProvider>
  );
}

export default App;
